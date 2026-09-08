import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import { DEFAULT_ROD_ID, rodOrDefault, type RodTier } from "@/lib/fishRules";
import type { PlayerRod } from "@/lib/rods.functions";

interface RodStore {
  rods: PlayerRod[];
  loading: boolean;
  busyId: string | null;
  error: string | null;
  /** id of the rod the player currently uses */
  equippedId: string;
  refresh: () => Promise<void>;
  buy: (rodId: string) => Promise<void>;
  equip: (rodId: string) => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;

export const useRodStore = create<RodStore>((set, get) => ({
  rods: [],
  loading: false,
  busyId: null,
  error: null,
  equippedId: DEFAULT_ROD_ID,
  clear: () => set({ rods: [], error: null, equippedId: DEFAULT_ROD_ID }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ rods: [], loading: false, error: null, equippedId: DEFAULT_ROD_ID });
      return;
    }
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const { getPlayerRods } = await import("@/lib/rods.functions");
        const rods = (await getPlayerRods({ data: proof })) as PlayerRod[];
        const equipped = rods.find((r) => r.equipped && r.owned);
        set({
          rods,
          loading: false,
          error: null,
          equippedId: equipped?.rod_id ?? DEFAULT_ROD_ID,
        });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : "Could not load your rods." });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  buy: async (rodId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: rodId, error: null });
    try {
      const { buyRod } = await import("@/lib/rods.functions");
      const profile = await buyRod({ data: { proof, rodId } });
      if (profile) useProfileStore.getState().setProfile(profile as never);
      await get().refresh();
      // Buying a rod can advance quest progress (buy_rod requirements)
      // server-side — refresh the quest HUD so it isn't stale.
      const { useQuestStore } = await import("@/hooks/useQuestStore");
      void useQuestStore.getState().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "The purchase failed." });
    } finally {
      set({ busyId: null });
    }
  },
  equip: async (rodId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: rodId, error: null });
    try {
      const { equipRod } = await import("@/lib/rods.functions");
      await equipRod({ data: { proof, rodId } });
      await get().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not switch rods." });
    } finally {
      set({ busyId: null });
    }
  },
}));

/** Synchronous read for the render/game loop. */
export function equippedRod(): RodTier {
  return rodOrDefault(useRodStore.getState().equippedId);
}