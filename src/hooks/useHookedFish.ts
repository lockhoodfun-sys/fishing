import { create } from "zustand";
import type { Rarity } from "@/lib/fishRules";
import { pickFishModel, type FishModelDef } from "@/lib/fishModels";

interface HookedFishStore {
  rarity: Rarity | null;
  weight: number;
  model: FishModelDef | null;
  /** Called once when a fish bites: locks the variant for the whole fight. */
  hook: (rarity: Rarity | null | undefined, weight: number) => void;
  clear: () => void;
}

/**
 * Which fish model the rod is currently holding. Kept apart from useGameStore
 * so catch/score logic stays untouched — this is purely visual state.
 */
export const useHookedFish = create<HookedFishStore>((set) => ({
  rarity: null,
  weight: 0,
  model: null,
  hook: (rarity, weight) =>
    set({ rarity: rarity ?? "common", weight, model: pickFishModel(rarity) }),
  clear: () => set({ rarity: null, weight: 0, model: null }),
}));
