import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { withDraco } from "@/lib/dracoLoader";

/**
 * Renders each boat tier's hull GLB once into a small PNG so the bag can
 * show the real model instead of a hand-drawn icon — same pattern as
 * fishThumbnails.ts, generalized to take an explicit url per key since
 * boats (unlike fish, which are keyed by rarity) are keyed by boat_id.
 * Browser only; the result is cached in memory for the session.
 */

const SIZE = 128;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function fitCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  // Boats read best from a slightly higher three-quarter angle than the
  // fish portrait (which is a flat side profile) — a hull's silhouette is
  // mostly flat-on-water, so a straight side view loses the deck shape.
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.5;
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.42, center.z + dist * 0.55);
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
    scene.add(root);
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 4, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0);
    rim.position.set(-3, 1, -3);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
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

/** Cached PNG data URL for that boat tier (null while loading / not started). */
export function boatThumbnail(boatId: string): string | null {
  return cache.get(boatId) ?? null;
}

export async function ensureBoatThumbnail(boatId: string, url: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const done = cache.get(boatId);
  if (done) return done;
  const running = pending.get(boatId);
  if (running) return running;

  const job = render(url)
    .then((data) => {
      if (data) cache.set(boatId, data);
      return data;
    })
    .catch((e) => {
      console.error("[boatThumbnail] could not render", boatId, e);
      return null;
    })
    .finally(() => {
      pending.delete(boatId);
    });
  pending.set(boatId, job);
  return job;
}
