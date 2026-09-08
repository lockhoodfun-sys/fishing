import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildAuthMessage, SIGNATURE_MAX_AGE_MS } from "./walletAuth";

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

export type LeaderboardSort = "xp" | "coins" | "fish";

export interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  xp: number;
  coins: number;
  total_fish: number;
}

const requestSchema = z.object({
  proof: proofSchema,
  sortBy: z.enum(["xp", "coins", "fish"]).default("xp"),
});

const TOP_LIMIT = 50;

/**
 * Top players (by level/XP, coins, or total fish caught) plus the caller's
 * own rank, even when it falls outside the visible top list. Like every
 * other profile read in this app, this never lets the client query
 * `profiles` directly — see get_leaderboard / get_my_leaderboard_rank in
 * drizzle/migrations/0013_leaderboard_and_chat.sql.
 */
export const getLeaderboard = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(
    async ({ data }): Promise<{ entries: LeaderboardEntry[]; me: LeaderboardEntry | null }> => {
      const wallet = await verifyProof(data.proof);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const top = await supabaseAdmin.rpc("get_leaderboard", {
        _sort_by: data.sortBy,
        _limit: TOP_LIMIT,
      });
      if (top.error) throw new Error(top.error.message);

      const mine = await supabaseAdmin
        .rpc("get_my_leaderboard_rank", { _wallet: wallet, _sort_by: data.sortBy })
        .maybeSingle();
      if (mine.error) throw new Error(mine.error.message);

      return {
        entries: (top.data ?? []).map((row) => ({
          ...row,
          coins: Number(row.coins),
        })) as LeaderboardEntry[],
        me: mine.data
          ? ({ ...mine.data, coins: Number(mine.data.coins) } as LeaderboardEntry)
          : null,
      };
    },
  );
