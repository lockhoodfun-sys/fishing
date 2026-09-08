import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import { DEFAULT_BAIT_ID, baitOrDefault, type BaitTier } from "@/lib/fishRules";
import type { PlayerBait } from "@/lib/baits.functions";

interface BaitStore {
  baits: PlayerBait[];
  loading: boolean;
  busyId: string | null;
  error: string | null;
  /** id of the bait the player currently uses */
  equippedId: string;
  refresh: () => Promise<void>;
  buy: (baitId: string) => Promise<void>;
  equip: (baitId: string) => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;

export const useBaitStore = create<BaitStore>((set, get) => ({
  baits: [],
  loading: false,
  busyId: null,
  error: null,
  equippedId: DEFAULT_BAIT_ID,
  clear: () => set({ baits: [], error: null, equippedId: DEFAULT_BAIT_ID }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ baits: [], loading: false, error: null, equippedId: DEFAULT_BAIT_ID });
      return;
    }
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const { getPlayerBaits } = await import("@/lib/baits.functions");
        const baits = (await getPlayerBaits({ data: proof })) as PlayerBait[];
        const equipped = baits.find((b) => b.equipped && b.owned);
        set({
          baits,
          loading: false,
          error: null,
          equippedId: equipped?.bait_id ?? DEFAULT_BAIT_ID,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Could not load your bait.",
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  buy: async (baitId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: baitId, error: null });
    try {
      const { buyBait } = await import("@/lib/baits.functions");
      const profile = await buyBait({ data: { proof, baitId } });
      if (profile) useProfileStore.getState().setProfile(profile as never);
      await get().refresh();
      // Buying bait can advance quest progress (buy_bait requirements)
      // server-side — refresh the quest HUD so it isn't stale.
      const { useQuestStore } = await import("@/hooks/useQuestStore");
      void useQuestStore.getState().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "The purchase failed." });
    } finally {
      set({ busyId: null });
    }
  },
  equip: async (baitId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: baitId, error: null });
    try {
      const { equipBait } = await import("@/lib/baits.functions");
      await equipBait({ data: { proof, baitId } });
      await get().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not switch bait." });
    } finally {
      set({ busyId: null });
    }
  },
}));

/** Synchronous read for the render/game loop. */
export function equippedBait(): BaitTier {
  return baitOrDefault(useBaitStore.getState().equippedId);
}