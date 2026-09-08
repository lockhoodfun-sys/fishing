import { create } from "zustand";
import {
  getFishData,
  mult,
  rollMutation,
  type FishSpecies,
  type Rarity,
} from "@/lib/fishRules";
import { equippedRod } from "@/hooks/useRodStore";
import { equippedBait } from "@/hooks/useBaitStore";
import type { Profile } from "@/hooks/useProfileStore";

export type Phase = "idle" | "cast" | "waiting" | "bite" | "reel" | "caught";

export interface FishCatch {
  speciesId: string;
  name: string;
  mutationKey: string;
  mutationLabel: string;
  weight: number;
  color: string;
  rarity?: Rarity | null;
  isMonster?: boolean;
  /** "1 in N" drop odds for the species that was picked, client-preview only. */
  oddsOneIn?: number;
}

function rollWeight(s: FishSpecies) {
  return Number((s.min_weight_kg + Math.random() * (s.max_weight_kg - s.min_weight_kg)).toFixed(2));
}

function toCatch(s: FishSpecies): FishCatch {
  const m = rollMutation();
  return {
    speciesId: s.id,
    name: s.name,
    mutationKey: m.key,
    mutationLabel: m.label,
    color: s.color,
    weight: rollWeight(s),
    rarity: s.rarity,
    ...(s.is_monster ? { isMonster: true } : {}),
  };
}

/**
 * Data-driven roll: pool filtered by the active rod's weight cap, then
 * weighted by rarity × bait × weather. Monster species are NOT special
 * cased — they compete in the same weighted pool as everything else, so
 * they only ever surface once a rod's max_catch_weight_kg clears their
 * min_weight_kg (currently only the Mythic Rod clears Ancient Leviathan).
 * This mirrors record_catch()'s server-side pool exactly (see
 * drizzle/migrations/0006_fix_monster_roll_gating.sql) — previously this
 * function pre-rolled a flat 2% monster chance regardless of rod cap,
 * which meant even a Starter Rod would play the "monster bite" animation
 * ~2% of casts even though the server could never actually award it.
 *
 * IMPORTANT: this runs client-side and is PREVIEW-ONLY. It picks which
 * fish model bites, how long the bite window is, and drives the reel/fight
 * animation — but it is never trusted for scoring. The authoritative catch
 * (species/rarity/weight/mutation) is rolled independently on the server by
 * `record_catch` and is what actually gets saved. `landFish` reconciles the
 * two once the server responds — see the comment there.
 */
export function rollFish(weatherKind = "cerah"): FishCatch {
  const data = getFishData();
  const rod = equippedRod();
  const cap = rod.max_catch_weight_kg;
  const bait = equippedBait();
  // Luck raises the odds of the better rarities, it never guarantees them:
  // weather, species pool and base weights still scale the same numbers.
  const luck =
    (1 + Math.max(0, rod.luck_percent) / 100) * (1 + Math.max(0, bait.luck_percent) / 100);
  const weather = data.weather[weatherKind];

  const pool = data.species.filter((s) => s.min_weight_kg <= cap);
  if (pool.length === 0) return toCatch(data.species[0] as FishSpecies);

  const weights = pool.map((s) => {
    const r = s.rarity ?? "common";
    const base = data.rarityWeights[r] ?? 1;
    const luckBonus = r === "common" ? 1 : luck;
    return Math.max(
      0,
      base * luckBonus * mult(bait?.rarity_multiplier, r) * mult(weather?.rarity_multiplier, r),
    );
  });
  const total = weights.reduce((a, b) => a + b, 0);

  let pick = pool[pool.length - 1]!;
  let pickWeight = weights[weights.length - 1]!;
  if (total > 0) {
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        pick = pool[i]!;
        pickWeight = weights[i]!;
        break;
      }
    }
  }

  const oddsOneIn = pickWeight > 0 ? Math.max(1, Math.round(total / pickWeight)) : undefined;
  return { ...toCatch(pick), ...(oddsOneIn !== undefined ? { oddsOneIn } : {}) };
}

/**
 * Warms up every module the catch path lazily imports, so the reel -> caught
 * transition doesn't have to fetch/parse JS chunks on the exact frame the
 * catch animation starts (a visible hitch right as the fish is pulled in).
 * Safe to call repeatedly — dynamic imports are cached after the first call.
 */
export function prewarmCatchModules() {
  void import("@/hooks/useProfileStore");
  void import("@/lib/profile.functions");
  void import("@/hooks/useInventoryStore");
  void import("@/hooks/useQuestStore");
  void import("sonner");
}

/** How long the catch animation runs (Angler flips back to idle at ~1.9s).
 *  Secondary refreshes are held back until then so their re-renders don't
 *  land in the middle of the pull. */
const CATCH_ANIM_MS = 2000;

/**
 * Records the catch server-side and reconciles the store with the
 * authoritative result. `onSettled` receives the true catch (or null if the
 * save failed, e.g. no wallet proof or cooldown rejection) so the caller can
 * correct anything it displayed optimistically (score/weight/toast message).
 * Never throws — errors are surfaced via toast, and `onSettled(null)` still
 * fires so the caller can roll back its optimistic UI update.
 */
function syncCatchToProfile(weatherKind: string, onSettled: (result: FishCatch | null) => void) {
  void (async () => {
    try {
      const { useProfileStore } = await import("@/hooks/useProfileStore");
      const proof = useProfileStore.getState().proof;
      if (!proof) {
        const { toast } = await import("sonner");
        toast.error("Catch not saved — connect your wallet and sign to sync your profile.");
        onSettled(null);
        return;
      }
      const { recordCatch } = await import("@/lib/profile.functions");
      const result = await recordCatch({ data: { proof, weatherKind } });
      if (result.profile) {
        useProfileStore.getState().setProfile(result.profile as Profile);
      }
      // Inventory + quest refreshes re-render the whole HUD. Hold them back
      // until the catch animation is over so that work never lands in the
      // middle of the pull.
      setTimeout(() => {
        void (async () => {
          const { useInventoryStore } = await import("@/hooks/useInventoryStore");
          void useInventoryStore.getState().refresh();
          // Catching fish can advance quest progress (catch_count requirements)
          // server-side — refresh the quest HUD so it doesn't sit stale until
          // the player reopens the panel or reloads the page.
          const { useQuestStore } = await import("@/hooks/useQuestStore");
          void useQuestStore.getState().refresh();
        })();
      }, CATCH_ANIM_MS);
      onSettled({
        speciesId: result.speciesId,
        name: result.speciesName,
        mutationKey: result.mutationKey,
        mutationLabel: result.mutationLabel,
        weight: result.weightKg,
        color: result.color,
        rarity: result.rarity,
        isMonster: result.isMonster,
      });
    } catch (error) {
      const { toast } = await import("sonner");
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Could not save your catch: ${message}`);
      onSettled(null);
    }
  })();
}

interface GameStore {
  phase: Phase;
  message: string;
  score: number;
  totalWeight: number;
  last: FishCatch | null;
  /** The fish currently on the line, set the instant it bites and cleared
   *  when it gets away or the cycle resets — drives CatchPopup, which needs
   *  to show the reveal from the bite through the whole reel, not just once
   *  `landFish` confirms the catch. */
  current: FishCatch | null;
  /** true = rod stowed on back */
  rodStowed: boolean;
  bagOpen: boolean;
  setPhase: (p: Phase) => void;
  setMessage: (m: string) => void;
  setCurrent: (f: FishCatch | null) => void;
  setRodStowed: (v: boolean) => void;
  toggleRodStowed: () => void;
  setBagOpen: (v: boolean) => void;
  toggleBag: () => void;
  /**
   * `f` is the client's preview roll, used to update score/weight/last
   * immediately so the HUD feels instant. It is then reconciled against the
   * server's authoritative catch once `record_catch` responds — if the two
   * differ (independent rolls) or the save fails outright, the store is
   * corrected in place. `weatherKind` is advisory-only server-side.
   */
  landFish: (f: FishCatch, weatherKind?: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  phase: "idle",
  message: "Press SPACE to cast your line",
  score: 0,
  totalWeight: 0,
  last: null,
  current: null,
  rodStowed: false,
  bagOpen: false,
  setPhase: (phase) => set({ phase }),
  setMessage: (message) => set({ message }),
  setCurrent: (current) => set({ current }),
  setRodStowed: (rodStowed) => set({ rodStowed }),
  toggleRodStowed: () => set((s) => ({ rodStowed: !s.rodStowed })),
  setBagOpen: (bagOpen) => set({ bagOpen }),
  toggleBag: () => set((s) => ({ bagOpen: !s.bagOpen })),
  landFish: (f, weatherKind = "cerah") => {
    // Optimistic update from the client's preview roll — keeps the HUD
    // (score, weight, "Caught X" message) feeling instant.
    set((s) => ({
      score: s.score + 1,
      totalWeight: Number((s.totalWeight + f.weight).toFixed(2)),
      last: f,
    }));
    syncCatchToProfile(weatherKind, (result) => {
      if (result) {
        // Server truth may differ from the preview roll (independent RNG) —
        // swap the optimistic weight/last for the authoritative values.
        // Only fish actually persisted server-side ever affect the wallet
        // economy, so this is what must be shown as the "real" catch.
        set((s) => ({
          totalWeight: Number((s.totalWeight - f.weight + result.weight).toFixed(2)),
          last: result,
        }));
      } else {
        // Save failed (no proof, cooldown rejection, network error, etc.) —
        // roll back the optimistic score/weight bump entirely.
        set((s) => ({
          score: Math.max(0, s.score - 1),
          totalWeight: Number(Math.max(0, s.totalWeight - f.weight).toFixed(2)),
        }));
      }
    });
  },
}));