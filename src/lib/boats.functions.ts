import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

const boatSchema = z.object({ proof: proofSchema, boatId: z.string().min(1).max(40) });

type Profile = Tables<"profiles">;

export interface PlayerBoat {
  boat_id: string;
  name: string;
  speed_percent: number;
  price_coins: number;
  min_level: number;
  equipped: boolean;
  owned: boolean;
}

function normalize(rows: unknown): PlayerBoat[] {
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  return list.map((r) => ({
    boat_id: String(r["boat_id"]),
    name: String(r["name"]),
    speed_percent: Number(r["speed_percent"] ?? 100),
    price_coins: Number(r["price_coins"] ?? 0),
    min_level: Number(r["min_level"] ?? 1),
    equipped: Boolean(r["equipped"]),
    owned: r["purchased_at"] != null,
  }));
}

/** Every boat tier plus whether the caller owns / uses it. */
export const getPlayerBoats = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<PlayerBoat[]> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data);
    const res = await rpc("get_player_boats", { _wallet: wallet });
    if (res.error) throw new Error(res.error.message);
    return normalize(res.data);
  });

/** Spends coins and adds the boat to the caller's fleet. */
export const buyBoat = createServerFn({ method: "POST" })
  .validator((input: unknown) => boatSchema.parse(input))
  .handler(async ({ data }): Promise<Profile> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc<Profile>("buy_boat", { _wallet: wallet, _boat_id: data.boatId });
    if (res.error) throw new Error(res.error.message);
    return res.data as Profile;
  });

/** Marks one owned boat as the active hull. */
export const equipBoat = createServerFn({ method: "POST" })
  .validator((input: unknown) => boatSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);
    const res = await rpc("equip_boat", { _wallet: wallet, _boat_id: data.boatId });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });