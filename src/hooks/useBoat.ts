import * as THREE from "three";

/**
 * Shared, mutable boat transform. Lives outside React (like `player`) so the
 * scene, the angler and the wake effect can all read it every frame without
 * re-rendering.
 */
export const BOAT_MOORING = new THREE.Vector3(10, 0, 113);

export const boat = {
  pos: BOAT_MOORING.clone(),
  yaw: 1.4,
  /** forward speed along the hull axis (units/s) */
  speed: 0,
  /** turn rate, used to bank the hull into the turn */
  turn: 0,
  /** true while the character is aboard (walking the deck or steering) */
  riding: false,
  /** true only while the character actually holds the helm */
  driving: false,
  /** true when the player stands close enough to press E */
  near: false,
  /** speed multiplier of the equipped hull (1 = wooden dinghy) */
  speedFactor: 1,
  /**
   * Walkable deck box in hull-local units (before BOAT_SCALE), measured from
   * the model bounding box once it loads.
   */
  deck: { halfX: 1.0, halfZ: 2.4, y: 0.02 },
  /** Character position on the deck, in hull-local units. */
  offset: new THREE.Vector3(0, 0.02, -0.9),
};

/** Return the hull to its fixed berth beside the boardwalk. */
export function returnBoatToMooring() {
  boat.pos.copy(BOAT_MOORING);
  boat.yaw = 1.4;
  boat.speed = 0;
  boat.turn = 0;
  boat.riding = false;
  boat.driving = false;
  boat.near = false;
  resetDeckOffset();
}

/** Seat position in hull-local space (character sits just behind the mast). */
export const BOAT_SEAT = new THREE.Vector3(0, 0.02, -0.9);

/** Uniform scale of the hull model so the dinghy reads bigger than the angler. */
export const BOAT_SCALE = 1.85;

/** Convert a hull-local offset into world space, written into `out`. */
export function boatLocalToWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(boat.yaw);
  const c = Math.cos(boat.yaw);
  const x = local.x * BOAT_SCALE;
  const z = local.z * BOAT_SCALE;
  return out.set(
    boat.pos.x + x * c + z * s,
    boat.pos.y + local.y * BOAT_SCALE,
    boat.pos.z - x * s + z * c,
  );
}

/** World position of the helm seat, written into `out`. */
export function boatSeatWorld(out: THREE.Vector3): THREE.Vector3 {
  return boatLocalToWorld(BOAT_SEAT, out);
}

/** World position of the character's current spot on the deck. */
export function boatDeckWorld(out: THREE.Vector3): THREE.Vector3 {
  return boatLocalToWorld(boat.offset, out);
}

/** Put the character back on the deck at the helm. */
export function resetDeckOffset() {
  boat.offset.set(BOAT_SEAT.x, boat.deck.y, BOAT_SEAT.z);
}


/** True when the character stands close enough to the helm to take the wheel. */
export function nearHelm(): boolean {
  return Math.hypot(boat.offset.x - BOAT_SEAT.x, boat.offset.z - BOAT_SEAT.z) < 1.1;
}

/* ------------------------------------------------------------------ */
/* Real deck collision: raycast against the loaded hull model so the   */
/* character stands on the actual deck instead of a guessed rectangle. */
/* ------------------------------------------------------------------ */

/** Holder for the loaded hull model (set by BoatModel once the GLTF is ready). */
export const boatHullRef: { current: THREE.Object3D | null } = { current: null };

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();

/* Deck probes are the boat's per-frame raycast cost: walking fires 5-6 rays
 * a frame. The hull is a rigid body, so the surface height at a given
 * hull-local (x,z) barely changes between frames — cache the result keyed on
 * a quantised local position, stored relative to the hull origin, and expire
 * it quickly so hull pitch/roll still comes through. Combined with the BVH
 * built in `hullBVH.ts`, this drops the deck-walking cost to near nothing. */
const _probeCache = new Map<number, { y: number | null; at: number }>();
let _probeHull: THREE.Object3D | null = null;
/** cache lifetime in ms — short enough that pitch/roll stays smooth */
const PROBE_TTL = 100;

/** Discard cached deck probes (hull swapped, or geometry changed). */
export function clearDeckProbeCache() {
  _probeCache.clear();
}

/**
 * Cast a vertical ray at a hull-local (x,z) deck point and return the world
 * height of the real surface there (the deck floor), or `null` if that point
 * is off the hull / over a gap. Surfaces above head clearance (cabin roofs,
 * masts) are ignored so the rider never snaps onto them.
 */
export function probeDeck(localX: number, localZ: number): number | null {
  const hull = boatHullRef.current;
  if (!hull) return null;
  if (hull !== _probeHull) {
    _probeHull = hull;
    _probeCache.clear();
  }

  const now = performance.now();
  // quantise to 5 cm of hull-local space
  const qx = Math.round(localX * 20);
  const qz = Math.round(localZ * 20);
  const key = (qx + 4096) * 8192 + (qz + 4096);
  const hit = _probeCache.get(key);
  if (hit && now - hit.at < PROBE_TTL) {
    return hit.y === null ? null : hit.y + boat.pos.y;
  }

  const sx = localX * BOAT_SCALE;
  const sz = localZ * BOAT_SCALE;
  const s = Math.sin(boat.yaw);
  const c = Math.cos(boat.yaw);
  _origin.set(
    boat.pos.x + sx * c + sz * s,
    boat.pos.y + 3,
    boat.pos.z - sx * s + sz * c,
  );
  _ray.set(_origin, _down);
  _ray.far = 4;
  const hits = _ray.intersectObject(hull, true);
  // ceiling: a little above the known deck floor — anything higher is a roof
  const ceiling = boat.pos.y + boat.deck.y * BOAT_SCALE + 0.5;
  let best = -Infinity;
  for (const h of hits) {
    if (h.point.y > ceiling || h.point.y < boat.pos.y - 0.5) continue;
    if (h.point.y > best) best = h.point.y;
  }
  const world = best === -Infinity ? null : best;
  if (_probeCache.size > 4000) _probeCache.clear();
  _probeCache.set(key, { y: world === null ? null : world - boat.pos.y, at: now });
  return world;
}

/** Current deck-floor world height under the rider (falls back to the box). */
function currentDeckWorldY(): number {
  const probed = probeDeck(boat.offset.x, boat.offset.z);
  if (probed !== null) return probed;
  return boat.pos.y + boat.deck.y * BOAT_SCALE;
}

/** Max climbable step (world units) — anything higher is a wall/bulwark. */
const STEP_LIMIT = 0.6;

/**
 * Walk on the deck using real hull geometry. A world-space step is converted
 * into hull-local space; the candidate spot (and a few points around the body)
 * are probed — if any is off the deck or blocked by a wall, the step is refused.
 */
export function moveOnDeck(dxWorld: number, dzWorld: number) {
  if (!boatHullRef.current) {
    // model not loaded yet: fall back to the old box clamp
    const s = Math.sin(boat.yaw);
    const c = Math.cos(boat.yaw);
    const lx = (dxWorld * c - dzWorld * s) / BOAT_SCALE;
    const lz = (dxWorld * s + dzWorld * c) / BOAT_SCALE;
    boat.offset.x = THREE.MathUtils.clamp(boat.offset.x + lx, -boat.deck.halfX, boat.deck.halfX);
    boat.offset.z = THREE.MathUtils.clamp(boat.offset.z + lz, -boat.deck.halfZ, boat.deck.halfZ);
    boat.offset.y = boat.deck.y;
    return;
  }
  const s = Math.sin(boat.yaw);
  const c = Math.cos(boat.yaw);
  const lx = (dxWorld * c - dzWorld * s) / BOAT_SCALE;
  const lz = (dxWorld * s + dzWorld * c) / BOAT_SCALE;
  const nx = boat.offset.x + lx;
  const nz = boat.offset.z + lz;
  const curY = currentDeckWorldY();
  // probe candidate centre + body radius so we don't clip into rails/cabins
  const r = 0.18;
  const probes: Array<[number, number]> = [
    [nx, nz],
    [nx + r, nz],
    [nx - r, nz],
    [nx, nz + r],
    [nx, nz - r],
  ];
  let targetY = -Infinity;
  for (const [px, pz] of probes) {
    const y = probeDeck(px, pz);
    if (y === null) return; // off the deck or into a gap
    if (y - curY > STEP_LIMIT) return; // a wall / cabin side / bulwark
    if (y > targetY) targetY = y;
  }
  boat.offset.x = nx;
  boat.offset.z = nz;
  // settle onto the real floor (local-space y), eased so small bumps don't jitter
  const wantLocal = (targetY - boat.pos.y) / BOAT_SCALE;
  boat.offset.y = THREE.MathUtils.lerp(boat.offset.y, wantLocal, 0.35);
}

/**
 * Snap the helm/boarding spot to the nearest real deck point around the
 * auto-computed seat, so boarding never drops the rider into a cabin or keel.
 * Called by BoatModel after the hull loads.
 */
export function snapSeatToDeck() {
  if (!boatHullRef.current) {
    resetDeckOffset();
    return;
  }
  // try the designed seat first
  if (probeDeck(BOAT_SEAT.x, BOAT_SEAT.z) !== null) {
    resetDeckOffset();
    return;
  }
  // otherwise spiral outward for the nearest valid deck point
  const halfX = boat.deck.halfX;
  const halfZ = boat.deck.halfZ;
  let best: { x: number; z: number; d: number } | null = null;
  for (let i = 1; i <= 6; i++) {
    const rad = i * 0.18;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const x = THREE.MathUtils.clamp(BOAT_SEAT.x + Math.cos(a) * rad, -halfX, halfX);
      const z = THREE.MathUtils.clamp(BOAT_SEAT.z + Math.sin(a) * rad, -halfZ, halfZ);
      if (probeDeck(x, z) !== null) {
        const d = Math.hypot(x - BOAT_SEAT.x, z - BOAT_SEAT.z);
        if (!best || d < best.d) best = { x, z, d };
      }
    }
    if (best) break;
  }
  if (best) {
    BOAT_SEAT.x = best.x;
    BOAT_SEAT.z = best.z;
  }
  resetDeckOffset();
}

// Dev aid: expose the live boat state for quick inspection in the console.
if (typeof window !== "undefined") {
  (window as unknown as { __boat?: typeof boat }).__boat = boat;
}