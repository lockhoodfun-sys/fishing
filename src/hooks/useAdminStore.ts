import { create } from "zustand";
import type { Tables } from "@/integrations/supabase/types";
import type { WalletProof } from "@/lib/walletAuth";

type WithdrawalRequest = Tables<"withdrawal_requests">;

interface AdminStore {
  withdrawals: WithdrawalRequest[];
  loading: boolean;
  /** null = not checked yet, true/false = server told us definitively. The
   * real gate is always server-side (admin.functions.ts requireAdmin) — this
   * is only used to decide what the page shows. */
  authorized: boolean | null;
  busyId: string | null;
  error: string | null;
  refresh: (proof: WalletProof) => Promise<void>;
  markWithdrawal: (
    proof: WalletProof,
    withdrawalId: string,
    approve: boolean,
    txHash?: string,
  ) => Promise<boolean>;
}

export const useAdminStore = create<AdminStore>((set, get) => ({
  withdrawals: [],
  loading: false,
  authorized: null,
  busyId: null,
  error: null,
  refresh: async (proof) => {
    set({ loading: true, error: null });
    try {
      const { adminListWithdrawals } = await import("@/lib/admin.functions");
      const withdrawals = await adminListWithdrawals({ data: proof });
      set({ withdrawals, loading: false, authorized: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load withdrawals.";
      const notAuthorized = /not authorized/i.test(message);
      set({
        loading: false,
        authorized: notAuthorized ? false : get().authorized,
        error: notAuthorized ? null : message,
      });
    }
  },
  markWithdrawal: async (proof, withdrawalId, approve, txHash) => {
    set({ busyId: withdrawalId, error: null });
    try {
      const { adminMarkWithdrawal } = await import("@/lib/admin.functions");
      await adminMarkWithdrawal({ data: { proof, withdrawalId, approve, txHash } });
      await get().refresh(proof);
      set({ busyId: null });
      return true;
    } catch (e) {
      set({ busyId: null, error: e instanceof Error ? e.message : "Action failed." });
      return false;
    }
  },
}));
