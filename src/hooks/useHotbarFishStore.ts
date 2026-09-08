import { create } from "zustand";
import type { InventoryItem } from "@/hooks/useInventoryStore";

/** Max number of caught fish that can sit in the hotbar at once. */
export const MAX_HOTBAR_FISH = 3;

interface HotbarFishStore {
  /** Fish currently loaded into the hotbar (slots 3..3+MAX_HOTBAR_FISH). */
  slots: InventoryItem[];
  /** The inventory item id the character is currently holding overhead, or
   *  null if no fish is being held. Only one fish can be held at a time. */
  heldId: string | null;
  /** Adds a fish from the Bag to the hotbar. No-op if already present or if
   *  the hotbar is full — returns a reason string on failure so the caller
   *  can surface a message, or null on success. */
  addToHotbar: (item: InventoryItem) => "duplicate" | "full" | null;
  /** Removes a fish from the hotbar (the "X" button). Lowers it first if it
   *  was the one currently held. */
  removeFromHotbar: (id: string) => void;
  /** Toggles whether the given hotbar fish is held/raised. Raising a
   *  different fish automatically lowers whichever one was held before. */
  toggleHold: (id: string) => void;
  /** Lowers whichever fish is currently held, if any. */
  lower: () => void;
  clear: () => void;
}

export const useHotbarFishStore = create<HotbarFishStore>((set, get) => ({
  slots: [],
  heldId: null,
  addToHotbar: (item) => {
    const { slots } = get();
    if (slots.some((s) => s.id === item.id)) return "duplicate";
    if (slots.length >= MAX_HOTBAR_FISH) return "full";
    set({ slots: [...slots, item] });
    return null;
  },
  removeFromHotbar: (id) => {
    set((s) => ({
      slots: s.slots.filter((it) => it.id !== id),
      heldId: s.heldId === id ? null : s.heldId,
    }));
  },
  toggleHold: (id) => {
    set((s) => ({ heldId: s.heldId === id ? null : id }));
  },
  lower: () => set({ heldId: null }),
  clear: () => set({ slots: [], heldId: null }),
}));