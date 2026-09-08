export interface BoatLook {
  id: string;
  /** GLB url. */
  url: string;
  /** Target hull length in local units before BOAT_SCALE. */
  targetLength: number;
  /**
   * Fraction of the deck's half-length used to place the helm toward the
   * stern (0 = deck center, 1 = right at the stern edge). Defaults to 0.55
   * when omitted. Override per-hull when the deckhouse/bridge eats into the
   * generic deck box and the auto-computed spot lands inside a cabin wall
   * instead of the open deck.
   */
  helmZFactor?: number;
  /** Fraction of the deck's half-width used to offset the helm sideways (0 = centered). */
  helmXFactor?: number;
  /**
   * Extra up/down nudge for the helm/deck height, in local hull units
   * (same scale as targetLength), added on top of the auto-computed
   * deckYFactor position. Positive raises the character, negative lowers
   * it. Use this for fine adjustment instead of re-deriving deckYFactor.
   */
  helmYOffset?: number;
  /**
   * Fraction of total model height (from the very bottom of the hull) where
   * the walkable deck floor actually sits. Defaults to 0.14, which fits a
   * simple dinghy with no separate upper structure. Multi-level hulls with a
   * tall bridge/mast need a higher fraction or the character ends up
   * standing near the keel/waterline instead of on deck.
   */
  deckYFactor?: number;
  /**
   * Some source models have their bow pointing the opposite way along the
   * hull's long axis from what the auto-rotate logic assumes, which makes
   * the hull sail bow-backward (looks like it drives in reverse) and throws
   * off the helm-facing direction too. Set true to add a corrective 180°
   * turn on top of the automatic X/Z axis fix.
   */
  flipBow?: boolean;
}

export const DEFAULT_BOAT_ID = "wooden_dinghy";

export const BOAT_LOOKS: Record<string, BoatLook> = {
  wooden_dinghy: { id: "wooden_dinghy", url: "/models/boat-starter.glb", targetLength: 7.4 },
  minnow: {
    id: "minnow",
    url: "/models/boat-minnow.glb",
    targetLength: 17,
    helmZFactor: 0.8,
    helmXFactor: 0,
    helmYOffset: 2,
  },
  reef_runner: {
    id: "reef_runner",
    url: "/models/boat-reef-runner.glb",
    targetLength: 18,
    helmZFactor: 0.8,
    helmXFactor: 0,
    helmYOffset: 1.8,
  },
  bow_raider: {
    id: "bow_raider",
    url: "/models/boat-bow-raider.glb",
    targetLength: 14,
    helmZFactor: 1.2,
    helmXFactor: 0,
    helmYOffset: 1.5,
  },
  sea_marshal: {
    id: "sea_marshal",
    url: "/models/boat-sea-marshal-v2.glb",
    targetLength: 16,
    // model's tapered bow points the opposite way from what the generic
    // X/Z auto-rotate assumes — without this it sails backward and the
    // helm ends up facing the wrong way too.
    flipBow: true,
    // this hull's console/wheel sits in the forward cockpit, not toward the
    // stern like a simple dinghy — negative pulls the helm toward the bow.
    helmZFactor: -0.42,
    // wheel sits left of the boat's centerline.
    helmXFactor: -1.7,
    helmYOffset: 0,
  },
  // Bridge/cabin occupies the front ~60% of the hull, so the generic 0.55
  // stern factor lands the helm inside the cabin wall. Push it further aft
  // onto the open rear deck (between the two aft bollards), matching the
  // reference screenshot.
  vex_yacht: {
    id: "vex_yacht",
    url: "/models/boat-vex-yacht-v2.glb",
    targetLength: 25,
    helmZFactor: 1,
    helmXFactor: 0,
    helmYOffset: 0,
    // measured: main open deck sits ~30% up the hull's total height (rest is
    // the bridge cabin + mast above), not 14% like a simple dinghy.
    deckYFactor: 0.4,
  },
};

export function boatLook(id: string | null | undefined): BoatLook {
  return BOAT_LOOKS[id ?? ""] ?? BOAT_LOOKS[DEFAULT_BOAT_ID]!;
}