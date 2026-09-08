import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { withDraco } from "@/lib/dracoLoader";
import { FISH_MODELS } from "@/lib/fishModels";
import type { Rarity } from "@/lib/fishRules";

/**
 * Renders each rarity's caught-fish GLB once into a small PNG so the bag can
 * show the real model instead of a hand-drawn icon. Browser only; the result
 * is cached in memory for the session.
 */

const SIZE = 128;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function fitCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.35;
  camera.position.set(center.x + dist * 0.15, center.y + dist * 0.28, center.z + dist);
  camera.lookAt(center);
  camera.near = dist / 100;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
}

async function render(url: string): Promise<string | null> {
  const loader = new GLTFLoader();
  withDraco(loader);
  const gltf = await loader.loadAsync(url);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  try {
    const scene = new THREE.Scene();
    const root = gltf.scene;
    // Side profile reads best for a fish silhouette.
    root.rotation.y = Math.PI * 0.5;
    scene.add(root);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.1);
    rim.position.set(-3, 1, -2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    fitCamera(camera, new THREE.Box3().setFromObject(root));
    renderer.render(scene, camera);
    const data = canvas.toDataURL("image/png");

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    return data;
  } finally {
    renderer.dispose();
  }
}

/** Cached PNG data URL of the model used for that rarity (null while loading). */
export function fishThumbnail(rarity: Rarity): string | null {
  return cache.get(rarity) ?? null;
}

export async function ensureFishThumbnail(rarity: Rarity): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const done = cache.get(rarity);
  if (done) return done;
  const running = pending.get(rarity);
  if (running) return running;

  const url = FISH_MODELS[rarity]?.[0]?.url;
  if (!url) return null;

  const job = render(url)
    .then((data) => {
      if (data) cache.set(rarity, data);
      return data;
    })
    .catch((e) => {
      console.error("[fishThumbnail] could not render", rarity, e);
      return null;
    })
    .finally(() => {
      pending.delete(rarity);
    });
  pending.set(rarity, job);
  return job;
}
