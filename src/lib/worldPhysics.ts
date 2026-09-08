import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

/**
 * Runtime collision registry for the player-placed world objects.
 *
 * Every object rendered by <WorldObjects /> registers its three.js group here.
 * - `walkable` objects are raycast against to find the ground height.
 * - `solid` objects push the player out of their (XZ) bounding box.
 *
 * Imported GLB/FBX models can carry hundreds of thousands of triangles, so a
 * naive `intersectObject(root, true)` several times per frame stalls the loop.
 * Every walkable mesh therefore gets a BVH built once (and rebuilt only when the
 * model itself changes), and ground queries are memoised on a coarse grid that
 * is invalidated whenever a transform changes.
 */

// Opt in to BVH-accelerated raycasting for meshes we prepare below.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
// three's own typings ship a slightly different BVH shape; the runtime is the
// same three-mesh-bvh implementation, so widen the assignment.
const geoProto = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>;
geoProto["computeBoundsTree"] = computeBoundsTree;
geoProto["disposeBoundsTree"] = disposeBoundsTree;

export interface Collider {
  id: string;
  obj: THREE.Object3D;
  walkable: boolean;
  solid: boolean;
  box: THREE.Box3;
  /** flattened list of meshes, so we skip a traverse on every query */
  meshes: THREE.Mesh[];
  /**
   * Subset of `meshes` actually used by groundAt(). Equal to `meshes` unless
   * the object sets `groundMaterials`, in which case only meshes whose
   * material name is in that list count as ground — lets a single compound
   * GLB (floor + decorative props baked together) expose just the floor to
   * the ground raycast instead of letting the player "climb" onto props.
   */
  groundMeshes: THREE.Mesh[];
  /**
   * Per-mesh world boxes used for solid collision. A single root box turns a
   * shop (roof + eaves included) into an impassable slab, so we block against
   * the individual parts and let the player walk into open fronts.
   */
  parts: THREE.Box3[];
  /** Same boxes keyed by XZ cell, when built from the occupancy grid. */
  grid: Map<string, THREE.Box3[]> | null;

}

/** Above this many parts we fall back to the cheap root box. */
const MAX_SOLID_PARTS = 400;
/** Geometry-occupancy grid: cell size (m) and triangle budget. */
const CELL = 0.7;
const MAX_TRIS = 900_000;
/** Vertical gap that separates two solid spans in the same cell. */
const SPAN_GAP = 0.6;

const cellKey = (cx: number, cz: number) => `${cx}|${cz}`;

/**
 * Build solid boxes from the actual triangles of a mesh instead of its bounding
 * box. Baked shop models are usually ONE merged mesh, so a per-mesh box turns
 * the whole building (roof overhang, open porch, front steps) into a solid
 * slab and the player is stopped a metre away from the door. Here we bin the
 * triangles onto a coarse XZ grid and keep, per cell, the vertical spans that
 * actually contain geometry — so floors, roofs and empty porch space no longer
 * block, only walls and posts do. The result stays keyed by cell so a collision
 * query only inspects the handful of cells around the player.
 */
function gridParts(meshes: THREE.Mesh[]): Map<string, THREE.Box3[]> | null {
  let tris = 0;
  for (const m of meshes) {
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute("position");
    if (!pos) return null;
    tris += (g.index ? g.index.count : pos.count) / 3;
    if (tris > MAX_TRIS) return null;
  }
  const cells = new Map<string, Array<[number, number]>>();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    m.updateWorldMatrix(true, false);
    for (let i = 0; i + 2 < count; i += 3) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      const cx0 = Math.floor(minX / CELL);
      const cx1 = Math.floor(maxX / CELL);
      const cz0 = Math.floor(minZ / CELL);
      const cz1 = Math.floor(maxZ / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = cellKey(cx, cz);
          let spans = cells.get(key);
          if (!spans) cells.set(key, (spans = []));
          spans.push([minY, maxY]);
        }
      }
    }
  }
  if (cells.size === 0) return null;
  const grid = new Map<string, THREE.Box3[]>();
  for (const [key, spans] of cells) {
    const [cxs, czs] = key.split("|");
    const cx = Number(cxs);
    const cz = Number(czs);
    spans.sort((a, b) => a[0] - b[0]);
    const boxes: THREE.Box3[] = [];
    let lo = spans[0]![0];
    let hi = spans[0]![1];
    const push = () => {
      boxes.push(
        new THREE.Box3(
          new THREE.Vector3(cx * CELL, lo, cz * CELL),
          new THREE.Vector3((cx + 1) * CELL, hi, (cz + 1) * CELL),
        ),
      );
    };
    for (let i = 1; i < spans.length; i++) {
      const s = spans[i]!;
      if (s[0] <= hi + SPAN_GAP) {
        if (s[1] > hi) hi = s[1];
      } else {
        push();
        lo = s[0];
        hi = s[1];
      }
    }
    push();
    grid.set(key, boxes);
  }
  return grid;
}

function buildParts(
  obj: THREE.Object3D,
  meshes: THREE.Mesh[],
  root: THREE.Box3,
): { parts: THREE.Box3[]; grid: Map<string, THREE.Box3[]> | null } {
  if (meshes.length === 0) return { parts: [root], grid: null };
  obj.updateWorldMatrix(true, true);
  const grid = gridParts(meshes);
  if (grid) return { parts: [...grid.values()].flat(), grid };
  if (meshes.length > MAX_SOLID_PARTS) return { parts: [root], grid: null };
  const parts: THREE.Box3[] = [];
  for (const m of meshes) {
    const b = new THREE.Box3().setFromObject(m);
    if (b.isEmpty()) continue;
    parts.push(b);
  }
  return { parts: parts.length ? parts : [root], grid: null };
}




const colliders = new Map<string, Collider>();

/** Bumped on any registry/transform change so cached ground samples drop. */
let version = 0;
const groundCache = new Map<string, number | null>();

function invalidate() {
  version++;
  groundCache.clear();
}

function collectMeshes(obj: THREE.Object3D, walkable: boolean): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    if (!walkable) return;
    const geo = m.geometry as THREE.BufferGeometry & {
      boundsTree?: unknown;
      computeBoundsTree?: (o?: { maxLeafTris?: number }) => void;
    };
    if (geo && !geo.boundsTree) {
      try {
        geo.computeBoundsTree?.({ maxLeafTris: 8 });
      } catch {
        /* non-indexed / degenerate geometry: fall back to plain raycast */
      }
    }
  });
  return meshes;
}

/** Material name(s) applied to a mesh (handles multi-material meshes too). */
function meshMaterialNames(m: THREE.Mesh): string[] {
  const mat = m.material as THREE.Material | THREE.Material[] | undefined;
  if (!mat) return [];
  const list = Array.isArray(mat) ? mat : [mat];
  return list.map((x) => x?.name).filter((n): n is string => !!n);
}

function filterByMaterials(meshes: THREE.Mesh[], groundMaterials?: string[]): THREE.Mesh[] {
  if (!groundMaterials || groundMaterials.length === 0) return meshes;
  const allow = new Set(groundMaterials);
  return meshes.filter((m) => meshMaterialNames(m).some((n) => allow.has(n)));
}

/** id -> unique material names found on that object's meshes, for the editor UI. */
const materialsByObject = new Map<string, string[]>();

export function getObjectMaterials(id: string): string[] {
  return materialsByObject.get(id) ?? [];
}

export function registerCollider(
  id: string,
  obj: THREE.Object3D,
  walkable: boolean,
  solid: boolean,
  groundMaterials?: string[],
) {
  obj.updateWorldMatrix(true, true);
  const meshes = collectMeshes(obj, walkable);
  materialsByObject.set(id, [...new Set(meshes.flatMap(meshMaterialNames))]);
  const groundMeshes = walkable ? filterByMaterials(meshes, groundMaterials) : [];
  const rootBox = new THREE.Box3().setFromObject(obj);
  const built = solid
    ? buildParts(obj, meshes, rootBox)
    : { parts: [rootBox], grid: null };
  colliders.set(id, {
    id,
    obj,
    walkable,
    solid,
    box: rootBox,
    meshes,
    groundMeshes,
    parts: built.parts,
    grid: built.grid,
  });
  invalidate();
}

export function unregisterCollider(id: string) {
  colliders.delete(id);
  materialsByObject.delete(id);
  invalidate();
}

function rebuild(c: Collider) {
  c.obj.updateWorldMatrix(true, true);
  c.box.setFromObject(c.obj);
  if (!c.solid) {
    c.parts = [c.box];
    c.grid = null;
    return;
  }
  const built = buildParts(c.obj, c.meshes, c.box);
  c.parts = built.parts;
  c.grid = built.grid;
}

/** Recompute the cached bounding boxes after a transform change. */
export function refreshCollider(id: string) {
  const c = colliders.get(id);
  if (!c) return;
  rebuild(c);
  invalidate();
}

export function refreshAllColliders() {
  for (const c of colliders.values()) {
    rebuild(c);
  }

  invalidate();
}

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();

/** Highest walkable surface under (x, z), or null when there is nothing there. */
export function groundAt(x: number, z: number, from = 500): number | null {
  // Quantise to a 10cm grid: the player moves far less than that per frame, so
  // consecutive queries in the same frame (water test, height, monster AI) hit
  // the cache instead of re-raycasting the whole world.
  const key = `${version}|${Math.round(x * 10)}|${Math.round(z * 10)}`;
  const hit = groundCache.get(key);
  if (hit !== undefined) return hit;

  let best: number | null = null;
  origin.set(x, from, z);
  raycaster.set(origin, DOWN);
  raycaster.far = from + 500;
  for (const c of colliders.values()) {
    if (!c.walkable) continue;
    // cheap reject with the cached bounds
    if (x < c.box.min.x - 0.1 || x > c.box.max.x + 0.1) continue;
    if (z < c.box.min.z - 0.1 || z > c.box.max.z + 0.1) continue;
    for (const m of c.groundMeshes) {
      const hits = raycaster.intersectObject(m, false);
      for (const h of hits) {
        if (best === null || h.point.y > best) best = h.point.y;
      }
    }
  }

  if (groundCache.size > 20000) groundCache.clear();
  groundCache.set(key, best);
  return best;
}

/**
 * Ground beneath the player's footprint rather than beneath one exact point.
 * Thin planks, seams between boards, and platform edges can miss a centre-only
 * ray even while most of the character is still supported.
 */
export function groundAround(x: number, z: number, radius = 0.35): number | null {
  const samples: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ];
  let best: number | null = null;
  for (const [offsetX, offsetZ] of samples) {
    const ground = groundAt(x + offsetX, z + offsetZ);
    if (ground !== null && (best === null || ground > best)) best = ground;
  }
  return best;
}

/** True when any walkable object covers (x, z) above the waterline. */
export function isOverLand(x: number, z: number, minY = -0.2): boolean {
  const g = groundAt(x, z);
  return g !== null && g > minY;
}

/** Scratch list reused by pushOutOfSolids so the query allocates nothing. */
const nearbyBoxes: THREE.Box3[] = [];

/**
 * Collect only the occupancy-grid boxes whose cell can reach (x, z) within
 * `margin`. The grid was always built for this; scanning the flattened
 * `parts` list instead meant every frame walked every wall cell of the whole
 * map. Same boxes, same collision result — just without the far-away ones
 * that can never overlap the player.
 */
function collectNearby(grid: Map<string, THREE.Box3[]>, x: number, z: number, margin: number) {
  nearbyBoxes.length = 0;
  const cx0 = Math.floor((x - margin) / CELL);
  const cx1 = Math.floor((x + margin) / CELL);
  const cz0 = Math.floor((z - margin) / CELL);
  const cz1 = Math.floor((z + margin) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const boxes = grid.get(cellKey(cx, cz));
      if (!boxes) continue;
      for (const b of boxes) nearbyBoxes.push(b);
    }
  }
  return nearbyBoxes;
}

/**
 * Push (x, z) out of every solid object's XZ bounding box, along the axis with
 * the smallest penetration. Boxes come from the geometry-occupancy grid, so a
 * shop's roof, porch floor and steps stay passable — only walls block.
 */
export function pushOutOfSolids(
  x: number,
  z: number,
  radius = 0.9,
  playerY = 0,
): [number, number] {
  let px = x;
  let pz = z;
  // Fine grid boxes hug the real walls, so they only need a slim skin; a fat
  // radius would seal doorways and porch gaps again.
  const pad = Math.min(radius, 0.3);
  for (const c of colliders.values()) {
    if (!c.solid) continue;
    const fine = c.parts.length > 4;
    const r = fine ? pad : radius;
    // Cheap whole-object reject before touching any part box.
    if (px < c.box.min.x - r || px > c.box.max.x + r) continue;
    if (pz < c.box.min.z - r || pz > c.box.max.z + r) continue;
    // A push can only ever move the point by one cell, so widen the lookup by
    // CELL to keep the exact same boxes in play as the old full scan.
    const boxes = c.grid ? collectNearby(c.grid, px, pz, r + CELL) : c.parts;
    for (const box of boxes) {
      // Skip parts above the player's head — awnings and roofs should not
      // block the entrance below them.
      if (playerY > 0 && box.min.y > playerY + 1.6) continue;
      // Skip floors, decks and low steps the player simply walks onto.
      if (fine && playerY > 0 && box.max.y < playerY + 0.5) continue;
      const minX = box.min.x - r;
      const maxX = box.max.x + r;
      const minZ = box.min.z - r;
      const maxZ = box.max.z + r;
      if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;

      const left = px - minX;
      const right = maxX - px;
      const back = pz - minZ;
      const front = maxZ - pz;
      const m = Math.min(left, right, back, front);
      if (m === left) px = minX;
      else if (m === right) px = maxX;
      else if (m === back) pz = minZ;
      else pz = maxZ;
    }
  }
  return [px, pz];
}


// Dev aid: inspect the live solid boxes from the console.
if (typeof window !== "undefined") {
  const w = window as unknown as {
    __solids?: () => unknown[];
    __solidPartsAt?: (x: number, z: number, r?: number) => unknown[];
  };
  w.__solids = () =>
    [...colliders.values()]
      .filter((c) => c.solid)
      .map((c) => ({
        id: c.id,
        parts: c.parts.length,
        meshes: c.meshes.length,
        min: [+c.box.min.x.toFixed(1), +c.box.min.y.toFixed(1), +c.box.min.z.toFixed(1)],
        max: [+c.box.max.x.toFixed(1), +c.box.max.y.toFixed(1), +c.box.max.z.toFixed(1)],
      }));
  w.__solidPartsAt = (x, z, r = 1.5) => {
    const out: unknown[] = [];
    for (const c of colliders.values()) {
      if (!c.solid) continue;
      c.parts.forEach((b, i) => {
        if (x < b.min.x - r || x > b.max.x + r) return;
        if (z < b.min.z - r || z > b.max.z + r) return;
        out.push({
          id: `${c.id}#${i}`,
          min: [+b.min.x.toFixed(2), +b.min.y.toFixed(2), +b.min.z.toFixed(2)],
          max: [+b.max.x.toFixed(2), +b.max.y.toFixed(2), +b.max.z.toFixed(2)],
        });
      });
    }
    return out;
  };
}