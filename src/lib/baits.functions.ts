import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

const baitSchema = z.object({ proof: proofSchema, baitId: z.string().min(1).max(40) });

type Profile = Tables<"profiles">;

export interface PlayerBait {
  bait_id: string;
  name: string;
  luck_percent: number;
  price_coins: number;
  min_level: number;
  equipped: boolean;
  owned: boolean;
}

function normalize(rows: unknown): PlayerBait[] {
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  return list.map((b) => ({
    bait_id: String(b["bait_id"]),
    name: String(b["name"]),
    luck_percent: Number(b["luck_percent"] ?? 0),
    price_coins: Number(b["price_coins"] ?? 0),
    min_level: Number(b["min_level"] ?? 1),
    equipped: Boolean(b["equipped"]),
    owned: b["purchased_at"] != null,
  }));
}

/** Every bait tier plus whether the caller owns / equips it. */
export const getPlayerBaits = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<PlayerBait[]> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data);
    const res = await rpc("get_player_baits", { _wallet: wallet });
    if (res.error) throw new Error(res.error.message);
    return normalize(res.data);
  });

/** Spends coins and adds the bait to the caller's collection. */
export const buyBait = createServerFn({ method: "POST" })
  .validator((input: unknown) => baitSchema.parse(input))
  .handler(async ({ data }): Promise<Profile> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc<Profile>("buy_bait", { _wallet: wallet, _bait_id: data.baitId });
    if (res.error) throw new Error(res.error.message);
    return res.data as Profile;
  });

/** Marks one owned bait as the active one. */
export const equipBait = createServerFn({ method: "POST" })
  .validator((input: unknown) => baitSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc("equip_bait", { _wallet: wallet, _bait_id: data.baitId });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });