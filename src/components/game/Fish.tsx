import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useHookedFish } from "@/hooks/useHookedFish";
import { GRAPHICS, useGraphics } from "@/hooks/useGraphics";
import {
  ALL_FISH_MODEL_URLS,
  pickFishModel,
  weightScale,
  type FishModelDef,
} from "@/lib/fishModels";
import type { Rarity } from "@/lib/fishRules";

/** Loads one GLB, centres it, and normalises it to the requested length. */
function FishModel({
  def,
  size,
  animate = true,
  anchorBottom = false,
}: {
  def: FishModelDef;
  size: number;
  /** Set false for a static "product shot" pose (e.g. the catch popup
   *  portrait) — skips the idle swim wag so the silhouette doesn't drift
   *  off its normalised centre as it rotates. Defaults true so every
   *  existing caller (the line-hanging fish) keeps swimming as before. */
  animate?: boolean;
  /** When true, the model's local origin sits at the BOTTOM of its bounding
   *  box instead of its centre, so a parent group positioned at some world
   *  height gets a fish resting on top of that point rather than one that's
   *  centred on it (and therefore hangs halfway below it). Used for the
   *  hotbar "held overhead" pose so a giant fish never droops down over the
   *  character's body. Defaults false to keep every existing caller
   *  (line-hanging fish, catch popup) centred as before. */
  anchorBottom?: boolean;
}) {
  const { scene } = useGLTF(def.url, "/draco/");
  const fishShadows = useGraphics((s) => GRAPHICS[s.tier].fishShadows);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        // Bayangan ikan hanya di tier tinggi: tiap ikan punya banyak submesh
        // sehingga biaya shadow-pass ikut berlipat.
        mesh.castShadow = fishShadows;
        mesh.receiveShadow = fishShadows;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const dim = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    root.position.sub(centre);
    if (anchorBottom) {
      // local y=0 becomes the model's lowest point instead of its centre
      root.position.y += dim.y / 2;
    }
    // longest axis = the body length; lay it along local +x like the old mesh
    const longest = Math.max(dim.x, dim.y, dim.z) || 1;
    const wrap = new THREE.Group();
    wrap.add(root);
    if (dim.z > dim.x && dim.z >= dim.y) wrap.rotation.y = Math.PI / 2;
    const s = def.length / longest;
    wrap.scale.setScalar(s);
    const holder = new THREE.Group();
    holder.add(wrap);
    return holder;
  }, [scene, def.length, def.url, anchorBottom, fishShadows]);

  const swim = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!animate || !swim.current) return;
    const t = state.clock.elapsedTime;
    swim.current.rotation.z = Math.sin(t * 9) * 0.14;
    swim.current.rotation.y = Math.sin(t * 6) * 0.1;
  });

  return (
    <group ref={swim} scale={size}>
      <primitive object={model} />
    </group>
  );
}

/**
 * The fish hanging on the line. Uses the rarity model locked in when the fish
 * bit; falls back to the procedural mesh until the GLB is decoded.
 */
export function FishMesh({
  color = "#e8a04a",
  scale = 1,
  wagSpeed = 18,
  animate = true,
}: {
  color?: string;
  scale?: number;
  wagSpeed?: number;
  /** Set false for a static, non-swimming pose (see FishModel). */
  animate?: boolean;
}) {
  const model = useHookedFish((s) => s.model);
  const rarity = useHookedFish((s) => s.rarity);
  const weight = useHookedFish((s) => s.weight);
  const def = model ?? pickFishModel(rarity);
  const size = scale * weightScale(weight, rarity);

  return (
    <Suspense fallback={null}>
      <FishModel def={def} size={size} animate={animate} />
    </Suspense>
  );
}

/**
 * A specific caught fish (from a bag/hotbar slot), independent of whatever
 * is currently on the line. The model variant is picked once and memoised
 * per `modelKey` so it doesn't re-roll (and pop to a different GLB) on
 * every render — pass something stable like the inventory item's id.
 */
export function RarityFishMesh({
  rarity,
  weightKg,
  modelKey,
  scale = 1,
  animate = true,
  anchorBottom = false,
}: {
  rarity: Rarity | null | undefined;
  weightKg: number;
  /** Stable key (e.g. inventory item id) so the random model variant for
   *  rarities with multiple GLBs doesn't change every frame. */
  modelKey: string;
  scale?: number;
  animate?: boolean;
  /** See FishModel — true rests the fish on top of this component's anchor
   *  point instead of centring it there. */
  anchorBottom?: boolean;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- modelKey is the intended memo key
  const def = useMemo(() => pickFishModel(rarity), [modelKey]);
  const size = scale * weightScale(weightKg, rarity);
  return (
    <Suspense fallback={null}>
      <FishModel def={def} size={size} animate={animate} anchorBottom={anchorBottom} />
    </Suspense>
  );
}

ALL_FISH_MODEL_URLS.forEach((u) => useGLTF.preload(u, "/draco/"));

/** Ambient surface fish removed — no fish may leap out of the water. */
export function FishSchool() {
  return null;
}