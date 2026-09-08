import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

type Profile = Tables<"profiles">;

export interface HoldTierView {
  id: string;
  min_usd_value: number;
  generation_cap_gold: number | null;
  wd_min: number | null;
  wd_max: number | null;
  wd_per_day: number;
}

export interface NpcRewardStatus {
  eligible: boolean;
  reason: string | null; // human-readable reason when not eligible
  level: number;
  minLevel: number;
  usdValue: number;
  tier: HoldTierView | null;
  event: {
    id: string;
    baseRequirement: Array<{ rarity: string; qty: number }>;
    bonusRequirement: Array<{ rarity: string; qty: number; gold: number }>;
    expireAt: string;
  } | null;
  claimProgress: {
    basePackagesClaimed: number;
    bonusClaimed: boolean;
    totalGoldEarned: number;
  } | null;
}

/** Ensures today's npc_reward_events row exists (idempotent), returns it. */
async function ensureTodayEvent() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  const existing = await supabaseAdmin
    .from("npc_reward_events")
    .select("*")
    .eq("event_date", dateKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  // Not created by the cron yet for some reason (e.g. cron delay) — create it
  // on-demand so a player is never blocked. Random ranges come from
  // npc_reward_config, never hardcoded.
  const cfg = await supabaseAdmin.from("npc_reward_config").select("*");
  if (cfg.error) throw new Error(cfg.error.message);
  const cfgMap = new Map((cfg.data ?? []).map((r) => [r.key as string, Number(r.value)]));
  const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

  const baseRequirement = [
    { rarity: "common", qty: rand(cfgMap.get("common_min") ?? 100, cfgMap.get("common_max") ?? 200) },
    { rarity: "rare", qty: rand(cfgMap.get("rare_min") ?? 40, cfgMap.get("rare_max") ?? 100) },
    { rarity: "epic", qty: rand(cfgMap.get("epic_min") ?? 20, cfgMap.get("epic_max") ?? 60) },
  ];
  const bonusRequirement = [
    {
      rarity: "legendary",
      qty: cfgMap.get("bonus_legendary_qty") ?? 5,
      gold: cfgMap.get("bonus_legendary_gold") ?? 2,
    },
    { rarity: "mythic", qty: cfgMap.get("bonus_mythic_qty") ?? 1, gold: cfgMap.get("bonus_mythic_gold") ?? 3 },
  ];

  const spawnAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const expireAt = new Date(spawnAt.getTime() + 2 * 60 * 60 * 1000);

  const created = await supabaseAdmin
    .from("npc_reward_events")
    .insert({
      event_date: dateKey,
      base_requirement: baseRequirement,
      bonus_requirement: bonusRequirement,
      spawn_at: spawnAt.toISOString(),
      expire_at: expireAt.toISOString(),
    })
    .select("*")
    .single();
  if (created.error) {
    // Concurrent creation race — re-read.
    const race = await supabaseAdmin.from("npc_reward_events").select("*").eq("event_date", dateKey).maybeSingle();
    if (race.data) return race.data;
    throw new Error(created.error.message);
  }
  return created.data;
}

/** Full eligibility + today's requirement, for rendering the NPC dialog. */
export const previewNpcClaim = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<NpcRewardStatus> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const { resolveHoldStatus } = await import("./onchain.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wallet = await verifyWalletProof(data);

    const profileRes = await supabaseAdmin.from("profiles").select("level").eq("wallet_address", wallet).single();
    if (profileRes.error) throw new Error(profileRes.error.message);
    const level = profileRes.data.level as number;

    const minLevelRes = await supabaseAdmin.from("npc_reward_config").select("value").eq("key", "min_level").single();
    const minLevel = minLevelRes.data ? Number(minLevelRes.data.value) : 5;

    const hold = await resolveHoldStatus(wallet);
    const event = await ensureTodayEvent();

    const now = Date.now();
    const expireAt = new Date(event.expire_at as string).getTime();
    const spawnAt = new Date(event.spawn_at as string).getTime();
    const isOpen = now >= spawnAt && now < expireAt;

    let reason: string | null = null;
    if (level < minLevel) reason = `Requires level ${minLevel}+ (you're level ${level}).`;
    else if (!hold.tier) reason = "Requires holding at least $10 worth of the tracked token.";
    else if (!isOpen) reason = "The NPC isn't here right now — it appears daily at 00:00 UTC for 2 hours.";

    const claimRes = await supabaseAdmin
      .from("npc_reward_claims")
      .select("*")
      .eq("event_id", event.id)
      .eq("wallet_address", wallet)
      .maybeSingle();

    return {
      eligible: reason === null,
      reason,
      level,
      minLevel,
      usdValue: hold.usdValue,
      tier: hold.tier,
      event: isOpen
        ? {
            id: event.id as string,
            baseRequirement: event.base_requirement as Array<{ rarity: string; qty: number }>,
            bonusRequirement: event.bonus_requirement as Array<{ rarity: string; qty: number; gold: number }>,
            expireAt: event.expire_at as string,
          }
        : null,
      claimProgress: claimRes.data
        ? {
            basePackagesClaimed: claimRes.data.base_claims_count,
            bonusClaimed: claimRes.data.bonus_claimed,
            totalGoldEarned: Number(claimRes.data.total_gold_earned),
          }
        : null,
    };
  });

const claimSchema = z.object({ proof: proofSchema, eventId: z.string().uuid() });

export interface NpcClaimResult {
  goldEarned: number;
  basePackagesClaimed: number;
  bonusEarned: number;
  newGoldBalance: number;
}

/** Re-verifies eligibility server-side (never trusts the client's preview)
 * and performs the atomic claim. */
export const claimNpcReward = createServerFn({ method: "POST" })
  .validator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data }): Promise<NpcClaimResult> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const { resolveHoldStatus } = await import("./onchain.server");

    const wallet = await verifyWalletProof(data.proof);
    const hold = await resolveHoldStatus(wallet);
    if (!hold.tier) throw new Error("Not eligible: insufficient token hold value.");

    const res = await rpc<
      Array<{
        gold_earned: number;
        base_packages_claimed: number;
        bonus_earned: number;
        new_gold_balance: number;
        consumed: unknown;
      }>
    >("claim_npc_reward", { _wallet: wallet, _event_id: data.eventId, _tier_id: hold.tier.id });
    if (res.error) throw new Error(res.error.message);
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!row) throw new Error("Claim failed.");

    return {
      goldEarned: Number(row.gold_earned),
      basePackagesClaimed: Number(row.base_packages_claimed),
      bonusEarned: Number(row.bonus_earned),
      newGoldBalance: Number(row.new_gold_balance),
    };
  });