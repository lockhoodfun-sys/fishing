import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHARACTER_ID } from "@/lib/characterLooks";

/**
 * Which avatar preset the player picked. Purely cosmetic, so it lives in
 * localStorage keyed by wallet address — no schema change, no server call, and
 * nothing else in the game reads or depends on it.
 */
interface CharacterStore {
  /** address (lowercase) -> character id */
  byAddress: Record<string, string>;
  selectOpen: boolean;
  setSelectOpen: (open: boolean) => void;
  choose: (address: string | null, id: string) => void;
  chosenFor: (address: string | null) => string | null;
}

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get) => ({
      byAddress: {},
      selectOpen: false,
      setSelectOpen: (selectOpen) => set({ selectOpen }),
      choose: (address, id) =>
        set((s) => ({
          byAddress: { ...s.byAddress, [(address ?? "guest").toLowerCase()]: id },
          selectOpen: false,
        })),
      chosenFor: (address) => get().byAddress[(address ?? "guest").toLowerCase()] ?? null,
    }),
    { name: "koleo-character", partialize: (s) => ({ byAddress: s.byAddress }) },
  ),
);

/** Reactive helper: the preset id in play right now (falls back to default). */
export function useActiveCharacterId(address: string | null) {
  return (
    useCharacterStore((s) => s.byAddress[(address ?? "guest").toLowerCase()]) ??
    DEFAULT_CHARACTER_ID
  );
}
