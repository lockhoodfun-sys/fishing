import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import type { NpcRewardStatus } from "@/lib/goldNpc.functions";

interface GoldNpcStore {
  status: NpcRewardStatus | null;
  loading: boolean;
  claiming: boolean;
  error: string | null;
  lastClaim: { goldEarned: number; basePackagesClaimed: number; bonusEarned: number } | null;
  refresh: () => Promise<void>;
  claim: () => Promise<boolean>;
  clear: () => void;
}

export const useGoldNpcStore = create<GoldNpcStore>((set, get) => ({
  status: null,
  loading: false,
  claiming: false,
  error: null,
  lastClaim: null,
  clear: () => set({ status: null, error: null, lastClaim: null }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ status: null, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const { previewNpcClaim } = await import("@/lib/goldNpc.functions");
      const status = await previewNpcClaim({ data: proof });
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Could not reach the reward NPC." });
    }
  },
  claim: async () => {
    const proof = useProfileStore.getState().proof;
    const eventId = get().status?.event?.id;
    if (!proof || !eventId) return false;
    set({ claiming: true, error: null });
    try {
      const { claimNpcReward } = await import("@/lib/goldNpc.functions");
      const result = await claimNpcReward({ data: { proof, eventId } });
      const { ensureProfile } = await import("@/lib/profile.functions");
      const profile = await ensureProfile({ data: proof });
      useProfileStore.getState().setProfile(profile);
      set({
        claiming: false,
        lastClaim: {
          goldEarned: result.goldEarned,
          basePackagesClaimed: result.basePackagesClaimed,
          bonusEarned: result.bonusEarned,
        },
      });
      await get().refresh();
      return true;
    } catch (e) {
      set({ claiming: false, error: e instanceof Error ? e.message : "The claim failed." });
      return false;
    }
  },
}));
