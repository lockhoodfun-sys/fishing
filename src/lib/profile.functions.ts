import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildAuthMessage, SIGNATURE_MAX_AGE_MS } from "./walletAuth";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

type Proof = z.infer<typeof proofSchema>;

/** Verifies the wallet signature and returns the lowercase address it proves. */
async function verifyProof(proof: Proof): Promise<string> {
  const issued = Date.parse(proof.issuedAt);
  if (Number.isNaN(issued) || Math.abs(Date.now() - issued) > SIGNATURE_MAX_AGE_MS) {
    throw new Error("Signature expired. Please reconnect your wallet.");
  }
  const { verifyMessage } = await import("viem");
  const ok = await verifyMessage({
    address: proof.address as `0x${string}`,
    message: buildAuthMessage(proof.address, proof.issuedAt),
    signature: proof.signature as `0x${string}`,
  });
  if (!ok) throw new Error("Invalid wallet signature.");
  return proof.address.toLowerCase();
}

function shortId(address: string) {
  return address.slice(2, 8);
}

export const ensureProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      await rpc("ensure_starter_gear", { _wallet: wallet });
      return existing.data;
    }

    let username = `angler_${shortId(wallet)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await supabaseAdmin
        .from("profiles")
        .insert({
          wallet_address: wallet,
          username,
          display_name: `Angler ${shortId(wallet)}`,
        })
        .select("*")
        .single();
      if (!created.error) {
        await rpc("ensure_starter_gear", { _wallet: wallet });
        return created.data;
      }
      if (created.error.code !== "23505") throw new Error(created.error.message);

      // A concurrent request may have created this wallet's profile already.
      const race = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("wallet_address", wallet)
        .maybeSingle();
      if (race.data) {
        await rpc("ensure_starter_gear", { _wallet: wallet });
        return race.data;
      }

      username = `angler_${shortId(wallet)}${Math.floor(Math.random() * 100000)}`;
    }
    throw new Error("Could not create a profile. Please try again.");

  });

const updateSchema = z.object({
  proof: proofSchema,
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only."),
  displayName: z.string().trim().max(40, "Display name is too long."),
  avatarPath: z.string().nullable().optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const taken = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .ilike("username", data.username)
      .neq("wallet_address", wallet)
      .maybeSingle();
    if (taken.error) throw new Error(taken.error.message);
    if (taken.data) throw new Error("That username is already taken.");

    const patch: { username: string; display_name: string; avatar_url?: string | null } = {
      username: data.username,
      display_name: data.displayName,
    };
    if (data.avatarPath !== undefined) patch.avatar_url = data.avatarPath ?? null;

    const updated = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("wallet_address", wallet)
      .select("*")
      .single();
    if (updated.error) {
      if (updated.error.code === "23505") throw new Error("That username is already taken.");
      throw new Error(updated.error.message);
    }
    return updated.data;
  });

const uploadSchema = z.object({
  proof: proofSchema,
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** Base64 encoded image payload, without the data-URL prefix. */
  base64: z.string().min(1).max(8_000_000),
});

export const uploadAvatar = createServerFn({ method: "POST" })
  .validator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binary.byteLength > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5 MB.");

    const ext = data.contentType.split("/")[1] ?? "png";
    const path = `${wallet}/avatar-${Date.now()}.${ext}`;

    const uploaded = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, binary, { contentType: data.contentType, upsert: true });
    if (uploaded.error) throw new Error(uploaded.error.message);

    return { path };
  });

const recordCatchSchema = z.object({
  proof: proofSchema,
  // Advisory only — validated server-side against weather_effects and
  // silently falls back to "cerah" if it doesn't match a real row. This is
  // the ONLY gameplay input the client still supplies for a catch; species,
  // rarity, weight, and mutation are all rolled server-side now.
  weatherKind: z.string().min(1).max(40).optional(),
});

export interface RecordedCatch {
  speciesId: string;
  speciesName: string;
  color: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic";
  weightKg: number;
  mutationKey: string;
  mutationLabel: string;
  isMonster: boolean;
  xpGained: number;
  profile: Tables<"profiles">;
}

/**
 * Rolls and records a catch entirely server-side (species/rarity/weight/
 * mutation), enforces the cast cooldown, and increments the fish_{rarity}
 * counter + xp/level on the caller's profile — all atomically in one
 * SQL function. The client can no longer supply the roll result; see
 * drizzle/migrations/0005_security_fixes.sql for the SQL side.
 */
export const recordCatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => recordCatchSchema.parse(input))
  .handler(async ({ data }): Promise<RecordedCatch> => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const updated = await supabaseAdmin
      .rpc("record_catch", { _wallet: wallet, _weather_kind: data.weatherKind ?? "cerah" })
      .single();
    if (updated.error) throw new Error(updated.error.message);

    const row = updated.data as {
      out_species_id: string;
      out_species_name: string;
      out_color: string;
      out_rarity: RecordedCatch["rarity"];
      out_weight_kg: number;
      out_mutation_key: string;
      out_mutation_label: string;
      out_is_monster: boolean;
      out_xp_gained: number;
      out_profile: Tables<"profiles">;
    };

    // Quests are unrelated to level/XP gating (per approved plan §0.11) — this
    // only advances the current quest slot's progress counter, best-effort.
    // A failure here must never fail the catch itself.
    try {
      await (supabaseAdmin.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>)("advance_quest_progress", {
        _wallet: wallet,
        _event_type: "catch_count",
        _key: row.out_rarity,
        _qty: 1,
      });
    } catch (err) {
      console.error("[recordCatch] advance_quest_progress failed", err);
    }

    return {
      speciesId: row.out_species_id,
      speciesName: row.out_species_name,
      color: row.out_color,
      rarity: row.out_rarity,
      weightKg: Number(row.out_weight_kg),
      mutationKey: row.out_mutation_key,
      mutationLabel: row.out_mutation_label,
      isMonster: row.out_is_monster,
      xpGained: row.out_xp_gained,
      profile: row.out_profile,
    };
  });

// ---------------------------------------------------------------------------
// TEST-ONLY: grants free coins so shop purchases can be tested end-to-end.
// DELETE THIS ENTIRE BLOCK (and its button in ProfilePanel.tsx) BEFORE
// PUBLIC RELEASE — it is the same shape of issue as the grantDevCoins bug
// found in the last audit, just gated properly this time:
//   1. Server refuses unless ENABLE_TEST_COINS=true is set in the server's
//      own environment — never rely on the client to gate this.
//   2. Never set ENABLE_TEST_COINS=true in a production environment.
// Amount covers every item in the shop catalog (~8.1M coins total) with
// headroom, so one grant is enough to test every rod/bait/boat purchase.
// ---------------------------------------------------------------------------
const TEST_COINS_AMOUNT = 10_000_000;

export const grantTestCoins = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    if (process.env["ENABLE_TEST_COINS"] !== "true") {
      throw new Error("Test coins are disabled on this server.");
    }
    const wallet = await verifyProof(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updated = await supabaseAdmin
      .from("profiles")
      .update({ coins: TEST_COINS_AMOUNT, updated_at: new Date().toISOString() })
      .eq("wallet_address", wallet)
      .select()
      .single();
    if (updated.error) throw new Error(updated.error.message);
    return updated.data as Tables<"profiles">;
  });

/** Returns the caller's unsold fish, newest first. */
export const getInventory = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("fish_inventory_items")
      .select("id, species_id, weight_kg, mutation_key, caught_at")
      .eq("wallet_address", wallet)
      .order("caught_at", { ascending: false })
      .limit(500);
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []).map((r) => ({ ...r, weight_kg: Number(r.weight_kg) }));
  });

const sellSchema = z.object({
  proof: proofSchema,
  itemId: z.string().uuid().nullable().optional(),
  speciesId: z.string().min(1).max(60).nullable().optional(),
  sellAll: z.boolean().optional(),
});

/** Sells one fish, every fish of a species, or the whole bucket. */
export const sellFish = createServerFn({ method: "POST" })
  .validator((input: unknown) => sellSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The generated arg types are non-nullable, but the SQL function treats
    // NULL as "not filtering by this key".
    const res = await supabaseAdmin.rpc("sell_fish", {
      _wallet: wallet,
      _item_id: (data.itemId ?? null) as string,
      _species_id: (data.speciesId ?? null) as string,
      _sell_all: data.sellAll ?? false,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });