import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import type { Tables } from "@/integrations/supabase/types";
import type { HoldStatusView } from "@/lib/withdrawal.functions";

type WithdrawalRequest = Tables<"withdrawal_requests">;

interface GoldStore {
  panelOpen: boolean;
  hold: HoldStatusView | null;
  holdLoading: boolean;
  withdrawals: WithdrawalRequest[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  setPanelOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  requestWithdrawal: (amount: number) => Promise<boolean>;
  cancelWithdrawal: (withdrawalId: string) => Promise<boolean>;
}

export const useGoldStore = create<GoldStore>((set, get) => ({
  panelOpen: false,
  hold: null,
  holdLoading: false,
  withdrawals: [],
  loading: false,
  submitting: false,
  error: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ hold: null, withdrawals: [], loading: false, holdLoading: false });
      return;
    }
    set({ loading: true, holdLoading: true, error: null });
    try {
      const { getHoldStatus } = await import("@/lib/withdrawal.functions");
      const { getMyWithdrawals } = await import("@/lib/withdrawal.functions");
      const [hold, withdrawals] = await Promise.all([
        getHoldStatus({ data: proof }),
        getMyWithdrawals({ data: proof }),
      ]);
      set({ hold, withdrawals, loading: false, holdLoading: false });
    } catch (e) {
      set({
        loading: false,
        holdLoading: false,
        error: e instanceof Error ? e.message : "Could not load your gold status.",
      });
    }
  },
  requestWithdrawal: async (amount) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return false;
    set({ submitting: true, error: null });
    try {
      const { requestWithdrawal: requestWithdrawalFn } = await import("@/lib/withdrawal.functions");
      await requestWithdrawalFn({ data: { proof, amount } });
      // Gold balance moved — pull the fresh profile too, same as any other
      // gold-earning/spending action in the game.
      const { ensureProfile } = await import("@/lib/profile.functions");
      const profile = await ensureProfile({ data: proof });
      useProfileStore.getState().setProfile(profile);
      await get().refresh();
      set({ submitting: false });
      return true;
    } catch (e) {
      set({
        submitting: false,
        error: e instanceof Error ? e.message : "The withdrawal request failed.",
      });
      return false;
    }
  },
  cancelWithdrawal: async (withdrawalId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return false;
    set({ submitting: true, error: null });
    try {
      const { cancelWithdrawal: cancelWithdrawalFn } = await import("@/lib/withdrawal.functions");
      await cancelWithdrawalFn({ data: { proof, withdrawalId } });
      // Gold balance moved back — pull the fresh profile too, same as
      // requestWithdrawal does on the way out.
      const { ensureProfile } = await import("@/lib/profile.functions");
      const profile = await ensureProfile({ data: proof });
      useProfileStore.getState().setProfile(profile);
      await get().refresh();
      set({ submitting: false });
      return true;
    } catch (e) {
      set({
        submitting: false,
        error: e instanceof Error ? e.message : "Could not cancel the withdrawal.",
      });
      return false;
    }
  },
}));