import type { Rarity } from "@/lib/fishRules";

export interface FishModelDef {
  /** public/ URL of the Draco-compressed GLB. */
  url: string;
  /** Target body length in world units once auto-normalised. */
  length: number;
  /**
   * Which local X direction the model's head faces after FishModel's
   * auto-centre/auto-rotate normalisation (see Fish.tsx). Not every GLB was
   * authored facing the same way, so this is set per-file from visual
   * testing rather than assumed globally. +1 = head at local +X (same
   * convention as the monster's dedicated asset), -1 = head at local -X.
   */
  facing: 1 | -1;
}

/**
 * Caught-fish models per rarity. Sizes follow the design brief:
 * mythic is huge, legendary slightly smaller, epic/rare medium, common small.
 * Every model is auto-centred and auto-scaled at runtime (see FishMesh), so
 * `length` is the only tuning knob needed here.
 */
/** Base body length before the per-rarity size multiplier below. */
const BASE_LENGTH = 0.9;

/** Requested size ladder: common 10x, epic 15x, rare 20x, legendary 30x, mythic 50x. */
export const SIZE_MULTIPLIER: Record<Rarity, number> = {
  common: 10,
  rare: 20,
  epic: 15,
  legendary: 30,
  mythic: 50,
};

const len = (rarity: Rarity) => BASE_LENGTH * SIZE_MULTIPLIER[rarity];

export const FISH_MODELS: Record<Rarity, FishModelDef[]> = {
  // Confirmed correct facing -X.
  common: [{ url: "/models/fish_common.glb", length: len("common"), facing: -1 }],
  rare: [{ url: "/models/fish_rare.glb", length: len("rare"), facing: -1 }],
  // Confirmed backward with -X -> these face +X instead (same convention
  // as the monster's dedicated asset).
  epic: [{ url: "/models/fish_epic.glb", length: len("epic"), facing: 1 }],
  legendary: [
    { url: "/models/fish_legendary_1.glb", length: len("legendary"), facing: 1 },
    { url: "/models/fish_legendary_2.glb", length: len("legendary"), facing: 1 },
  ],
  // fish_mythic_3.glb is intentionally NOT listed here: it's reserved
  // exclusively for MonsterFishMesh (the Ancient Leviathan). That model
  // is only ever positioned via the dedicated MONSTER_MOUTH anchor logic
  // in Angler.tsx (mouth-to-hook alignment, epic lift arc, giant scale).
  // The generic hooked-fish pose used for every other rarity assumes a
  // normal-sized fish and does NOT match this model's proportions —
  // if it's picked here for an ordinary mythic catch (Baby Tuna), it
  // renders through the wrong pipeline and ends up floating in the
  // wrong place/orientation near the dock instead of hanging properly.
  // Confirmed correct facing -X (only verified via whichever of the two
  // random variants surfaced during testing — flag the other one if it
  // still turns out backward).
  mythic: [
    { url: "/models/fish_mythic_1.glb", length: len("mythic"), facing: -1 },
    { url: "/models/fish_mythic_2.glb", length: len("mythic"), facing: -1 },
  ],
};

export const ALL_FISH_MODEL_URLS = Object.values(FISH_MODELS)
  .flat()
  .map((m) => m.url);

/** Pick one variant for a rarity (legendary/mythic have several). */
export function pickFishModel(rarity: Rarity | null | undefined): FishModelDef {
  const list = FISH_MODELS[(rarity ?? "common") as Rarity] ?? FISH_MODELS.common;
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!;
}

/** Extra size nudge so a heavy fish reads bigger than a light one. */
export function weightScale(weightKg: number, rarity: Rarity | null | undefined): number {
  const bands: Record<Rarity, [number, number]> = {
    common: [5, 40],
    rare: [35, 120],
    epic: [100, 300],
    legendary: [280, 650],
    mythic: [600, 1300],
  };
  const [lo, hi] = bands[(rarity ?? "common") as Rarity] ?? bands.common;
  const k = Math.max(0, Math.min(1, (weightKg - lo) / Math.max(1, hi - lo)));
  return 0.88 + k * 0.32;
}