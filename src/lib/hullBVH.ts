import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

/**
 * BVH support for the boat hull.
 *
 * The island terrain already raycasts through three-mesh-bvh (see
 * `worldPhysics.ts`), but the boat deck did not: walking on deck fires 5-6
 * vertical rays per frame straight at the hull mesh, which without an
 * acceleration structure tests every triangle of the model each time. That
 * showed up as a steady CPU cost the whole time the player is aboard.
 *
 * Prototype patching is idempotent — assigning the same functions twice is
 * harmless, so this module is safe to import alongside `worldPhysics`.
 */
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const geoProto = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>;
geoProto["computeBoundsTree"] = computeBoundsTree;
geoProto["disposeBoundsTree"] = disposeBoundsTree;

type BVHGeometry = THREE.BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: (o?: { maxLeafTris?: number }) => void;
  disposeBoundsTree?: () => void;
};

/** Build the BVH for one hull mesh geometry (no-op if it already has one). */
export function prepareHullBVH(geometry: THREE.BufferGeometry) {
  const geo = geometry as BVHGeometry;
  if (!geo || geo.boundsTree) return;
  try {
    geo.computeBoundsTree?.({ maxLeafTris: 8 });
  } catch {
    /* degenerate geometry: fall back to brute-force raycasting */
  }
}
