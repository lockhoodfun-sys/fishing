import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";

export interface InventoryItem {
  id: string;
  species_id: string;
  weight_kg: number;
  mutation_key: string;
  caught_at: string;
}

interface InventoryStore {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  /** Reloads the bucket from the server (single source of truth). */
  refresh: () => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;

export const useInventoryStore = create<InventoryStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  clear: () => set({ items: [], error: null }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ items: [], loading: false, error: null });
      return;
    }
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = (async () => {
      try {
        const { getInventory } = await import("@/lib/profile.functions");
        const items = (await getInventory({ data: proof })) as InventoryItem[];
        set({ items, loading: false, error: null });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : "Could not load your catch.",
        });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
}));
