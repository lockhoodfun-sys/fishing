import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import { boat, returnBoatToMooring } from "@/hooks/useBoat";
import { DEFAULT_BOAT_ID } from "@/lib/boatModels";
import type { PlayerBoat } from "@/lib/boats.functions";

interface BoatStore {
  boats: PlayerBoat[];
  loading: boolean;
  busyId: string | null;
  error: string | null;
  /** id of the hull the player currently sails */
  equippedId: string;
  refresh: () => Promise<void>;
  buy: (boatId: string) => Promise<void>;
  equip: (boatId: string) => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;

/** Keep the live boat physics in sync with the equipped hull. */
function applySpeed(boats: PlayerBoat[], equippedId: string) {
  const tier = boats.find((b) => b.boat_id === equippedId);
  boat.speedFactor = (tier ? Number(tier.speed_percent) : 100) / 100;
}

export const useBoatStore = create<BoatStore>((set, get) => ({
  boats: [],
  loading: false,
  busyId: null,
  error: null,
  equippedId: DEFAULT_BOAT_ID,
  clear: () => {
    boat.speedFactor = 1;
    set({ boats: [], error: null, equippedId: DEFAULT_BOAT_ID });
  },
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      boat.speedFactor = 1;
      set({ boats: [], loading: false, error: null, equippedId: DEFAULT_BOAT_ID });
      return;
    }
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const { getPlayerBoats } = await import("@/lib/boats.functions");
        const boats = (await getPlayerBoats({ data: proof })) as PlayerBoat[];
        const equipped = boats.find((b) => b.equipped && b.owned);
        const equippedId = equipped?.boat_id ?? DEFAULT_BOAT_ID;
        applySpeed(boats, equippedId);
        set({ boats, loading: false, error: null, equippedId });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Could not load your boats.",
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  buy: async (boatId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: boatId, error: null });
    try {
      const { buyBoat } = await import("@/lib/boats.functions");
      const profile = await buyBoat({ data: { proof, boatId } });
      if (profile) useProfileStore.getState().setProfile(profile as never);
      await get().refresh();
      // Buying a boat can advance quest progress (buy_boat requirements)
      // server-side — refresh the quest HUD so it isn't stale.
      const { useQuestStore } = await import("@/hooks/useQuestStore");
      void useQuestStore.getState().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "The purchase failed." });
    } finally {
      set({ busyId: null });
    }
  },
  equip: async (boatId) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return;
    set({ busyId: boatId, error: null });
    try {
      const { equipBoat } = await import("@/lib/boats.functions");
      await equipBoat({ data: { proof, boatId } });
      const boats = get().boats.map((candidate) => ({
        ...candidate,
        equipped: candidate.boat_id === boatId,
      }));
      applySpeed(boats, boatId);
      returnBoatToMooring();
      set({ boats, equippedId: boatId, error: null });
      await get().refresh();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not switch boats." });
    } finally {
      set({ busyId: null });
    }
  },
}));