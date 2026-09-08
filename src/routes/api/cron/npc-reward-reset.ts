// Cron endpoint: generates the daily NPC reward event at 00:00 UTC.
// Auth follows the exact same pattern as every other scheduled job in this
// project (see src/integrations/supabase/cron-auth.ts) — a Bearer token
// checked with a timing-safe comparison against LOVABLE_CRON_SECRET(_PREVIOUS).
//
// NOTE: goldNpc.functions.ts's previewNpcClaim also lazily creates today's
// event on-demand if this cron is ever late/missed, so a player is never
// blocked — this endpoint just makes the "fresh at 00:00 UTC" behavior
// deterministic instead of relying on the first visitor of the day.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function generateTodayEvent() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  const existing = await supabaseAdmin
    .from("npc_reward_events")
    .select("id")
    .eq("event_date", dateKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { created: false, eventDate: dateKey };

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

  const created = await supabaseAdmin.from("npc_reward_events").insert({
    event_date: dateKey,
    base_requirement: baseRequirement,
    bonus_requirement: bonusRequirement,
    spawn_at: spawnAt.toISOString(),
    expire_at: expireAt.toISOString(),
  });
  if (created.error && created.error.code !== "23505") {
    throw new Error(created.error.message);
  }

  return { created: true, eventDate: dateKey, baseRequirement, bonusRequirement };
}

export const Route = createFileRoute("/api/cron/npc-reward-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        try {
          const result = await generateTodayEvent();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("[cron/npc-reward-reset]", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});