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

/** Hardcoded admin wallet per the approved plan (§0.4) — env var, checked
 * server-side via the same sign-message proof every player uses. There is no
 * separate admin login/session system. */
function getAdminWallet(): string {
  const wallet = process.env["ADMIN_WALLET_ADDRESS"];
  if (!wallet) throw new Error("ADMIN_WALLET_ADDRESS is not configured.");
  return wallet.toLowerCase();
}

async function requireAdmin(proof: z.infer<typeof proofSchema>): Promise<string> {
  const { verifyWalletProof } = await import("./walletProof.server");
  const wallet = await verifyWalletProof(proof);
  if (wallet !== getAdminWallet()) {
    throw new Error("Not authorized.");
  }
  return wallet;
}

/** All pending withdrawal requests, oldest first, for the admin queue. */
export const adminListWithdrawals = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }): Promise<WithdrawalRequest[]> => {
    await requireAdmin(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const res = await supabaseAdmin
      .from("withdrawal_requests")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return res.data as WithdrawalRequest[];
  });

const markSchema = z.object({
  proof: proofSchema,
  withdrawalId: z.string().uuid(),
  approve: z.boolean(),
  txHash: z.string().optional(),
});

/** Approves (paid + tx hash) or rejects (gold refunded) a pending withdrawal. */
export const adminMarkWithdrawal = createServerFn({ method: "POST" })
  .validator((input: unknown) => markSchema.parse(input))
  .handler(async ({ data }): Promise<WithdrawalRequest> => {
    const admin = await requireAdmin(data.proof);

    if (data.approve && !data.txHash) {
      throw new Error("txHash is required to mark a withdrawal as paid.");
    }

    const res = await rpc<WithdrawalRequest>("admin_mark_withdrawal", {
      _admin_wallet: admin,
      _withdrawal_id: data.withdrawalId,
      _tx_hash: data.txHash ?? null,
      _approve: data.approve,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data as WithdrawalRequest;
  });