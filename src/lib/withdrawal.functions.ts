import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rpc } from "./rpc";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

type WithdrawalRequest = Tables<"withdrawal_requests">;

export interface HoldTierView {
  id: string;
  min_usd_value: number;
  generation_cap_gold: number | null;
  wd_min: number | null;
  wd_max: number | null;
  wd_per_day: number;
}

export interface HoldStatusView {
  usdValue: number;
  tier: HoldTierView | null;
}

/** Live on-chain hold value + resolved tier, so the Gold panel can show
 * withdraw min/max/frequency and validate an amount BEFORE the player
 * submits — request_withdrawal (SQL) re-checks all of this again anyway,
 * this is purely for UX. */
export const getHoldStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<HoldStatusView> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const { resolveHoldStatus } = await import("./onchain.server");
    const wallet = await verifyWalletProof(data);
    const hold = await resolveHoldStatus(wallet);
    return { usdValue: hold.usdValue, tier: hold.tier };
  });

const requestSchema = z.object({ proof: proofSchema, amount: z.number().positive() });

/** Requests a gold withdrawal. Tier (min/max/frequency) is resolved live
 * on-chain server-side — never trust a client-supplied tier. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }): Promise<WithdrawalRequest> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const { resolveHoldStatus } = await import("./onchain.server");

    const wallet = await verifyWalletProof(data.proof);
    const hold = await resolveHoldStatus(wallet);
    if (!hold.tier) throw new Error("Not eligible to withdraw.");

    const res = await rpc<WithdrawalRequest>("request_withdrawal", {
      _wallet: wallet,
      _amount: data.amount,
      _tier_id: hold.tier.id,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data as WithdrawalRequest;
  });

/** The caller's own withdrawal history, most recent first. */
export const getMyWithdrawals = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<WithdrawalRequest[]> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const wallet = await verifyWalletProof(data);

    const res = await supabaseAdmin
      .from("withdrawal_requests")
      .select("*")
      .eq("wallet_address", wallet)
      .order("requested_at", { ascending: false })
      .limit(50);
    if (res.error) throw new Error(res.error.message);
    return res.data as WithdrawalRequest[];
  });

const cancelSchema = z.object({ proof: proofSchema, withdrawalId: z.string().uuid() });

/** Player self-cancel of their own still-pending withdrawal request — gold
 * is refunded immediately, no need to wait for the auto-expire cron or an
 * admin. cancel_withdrawal (SQL) re-checks ownership and status regardless
 * of what the client sends. */
export const cancelWithdrawal = createServerFn({ method: "POST" })
  .validator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data }): Promise<WithdrawalRequest> => {
    const { verifyWalletProof } = await import("./walletProof.server");
    const wallet = await verifyWalletProof(data.proof);

    const res = await rpc<WithdrawalRequest>("cancel_withdrawal", {
      _wallet: wallet,
      _withdrawal_id: data.withdrawalId,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data as WithdrawalRequest;
  });