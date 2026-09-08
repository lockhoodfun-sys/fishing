import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

const rodSchema = z.object({ proof: proofSchema, rodId: z.string().min(1).max(40) });

type Profile = Tables<"profiles">;

export interface PlayerRod {
  rod_id: string;
  name: string;
  max_catch_weight_kg: number;
  luck_percent: number;
  speed_percent: number;
  price_coins: number;
  min_level: number;
  equipped: boolean;
  owned: boolean;
}

function normalize(rows: unknown): PlayerRod[] {
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  return list.map((r) => ({
    rod_id: String(r["rod_id"]),
    name: String(r["name"]),
    max_catch_weight_kg: Number(r["max_catch_weight_kg"] ?? 0),
    luck_percent: Number(r["luck_percent"] ?? 0),
    speed_percent: Number(r["speed_percent"] ?? 0),
    price_coins: Number(r["price_coins"] ?? 0),
    min_level: Number(r["min_level"] ?? 1),
    equipped: Boolean(r["equipped"]),
    owned: r["purchased_at"] != null,
  }));
}

/** Every rod tier plus whether the caller owns / equips it. */
export const getPlayerRods = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<PlayerRod[]> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data);
    const res = await rpc("get_player_rods", { _wallet: wallet });
    if (res.error) throw new Error(res.error.message);
    return normalize(res.data);
  });

/** Spends coins and adds the rod to the caller's collection. */
export const buyRod = createServerFn({ method: "POST" })
  .validator((input: unknown) => rodSchema.parse(input))
  .handler(async ({ data }): Promise<Profile> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc<Profile>("buy_rod", { _wallet: wallet, _rod_id: data.rodId });
    if (res.error) throw new Error(res.error.message);
    return res.data as Profile;
  });

/** Marks one owned rod as the active one. */
export const equipRod = createServerFn({ method: "POST" })
  .validator((input: unknown) => rodSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc("equip_rod", { _wallet: wallet, _rod_id: data.rodId });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });