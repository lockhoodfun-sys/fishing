import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { waterHeight } from "./Ocean";
import {
  boat,
  boatDeckWorld,
  boatSeatWorld,
  nearHelm,
  resetDeckOffset,
  snapSeatToDeck,
  boatHullRef,
  BOAT_SCALE,
  BOAT_SEAT,
} from "@/hooks/useBoat";
import { isInWater, player } from "@/hooks/usePlayer";
import { useGameStore } from "@/hooks/useGameStore";
import { useBoatStore } from "@/hooks/useBoatStore";
import { boatLook } from "@/lib/boatModels";
import { prepareHullBVH } from "@/lib/hullBVH";

/** Equipped hull, auto-centred, auto-scaled and laid bow-forward (+z). */
function BoatModel({
  url,
  targetLength,
  helmZFactor = 0.55,
  helmXFactor = 0,
  helmYOffset = 0,
  deckYFactor = 0.14,
  flipBow = false,
}: {
  url: string;
  targetLength: number;
  helmZFactor?: number | undefined;
  helmXFactor?: number | undefined;
  helmYOffset?: number | undefined;
  deckYFactor?: number | undefined;
  flipBow?: boolean | undefined;
}) {
  const { scene } = useGLTF(url, "/draco/");
  const model = useMemo(() => {
    const TARGET_LENGTH = targetLength;
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // the hull is a single-sided shell (no separate interior floor mesh) —
        // double-side the material so the inside of the hull renders instead
        // of culling to reveal the ocean plane behind it (looked like water
        // sitting inside the boat).
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat) (mat as THREE.Material).side = THREE.DoubleSide;
        }
        // Deck walking raycasts against this hull several times per frame.
        // Build a BVH once (same treatment the island terrain already gets
        // in worldPhysics) so those probes stop brute-forcing every triangle.
        prepareHullBVH(mesh.geometry);
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // longest horizontal axis becomes the hull axis (+z)
    const alongX = size.x > size.z;
    const length = alongX ? size.x : size.z;
    const s = TARGET_LENGTH / (length || 1);

    const inner = new THREE.Group();
    root.position.set(-center.x, -box.min.y, -center.z);
    inner.add(root);
    inner.scale.setScalar(s);

    const wrapper = new THREE.Group();
    if (alongX) wrapper.rotation.y = Math.PI / 2;
    if (flipBow) wrapper.rotation.y += Math.PI;
    wrapper.add(inner);
    // keep the hull bottom just above the waterline so the sea never shows inside
    wrapper.position.y = 0;
    // seat the rider on the interior floor
    const deckY = wrapper.position.y + size.y * s * deckYFactor + helmYOffset;
    BOAT_SEAT.y = deckY;
    // walkable deck box measured from the hull footprint (keep clear of the rails)
    const beam = (alongX ? size.z : size.x) * s;
    const hullLen = TARGET_LENGTH;
    boat.deck.halfX = Math.max(0.5, (beam / 2) * 0.55) / BOAT_SCALE;
    boat.deck.halfZ = Math.max(0.9, (hullLen / 2) * 0.6) / BOAT_SCALE;
    boat.deck.y = deckY;
    // helm sits toward the stern; keep it inside the deck box
    BOAT_SEAT.z = -boat.deck.halfZ * helmZFactor;
    BOAT_SEAT.x = boat.deck.halfX * helmXFactor;
    // expose the real hull geometry for deck raycasts, then snap the
    // helm/boarding spot onto the actual deck surface (not a guessed box)
    boatHullRef.current = wrapper;
    snapSeatToDeck();
    return wrapper;
  }, [scene, targetLength, helmZFactor, helmXFactor, helmYOffset, deckYFactor, flipBow]);

  return <primitive object={model} />;
}


/** Jarak lambung di atas puncak ombak lokal (mencegah air masuk ke dek). */
const FREEBOARD = 0.35;

const ACCEL = 16; // throttle acceleration
const REVERSE = 8;
const MAX_SPEED = 17;
const MAX_REVERSE = 5;
const DRAG = 1.1; // exponential water drag coefficient
const TURN_RATE = 1.5; // rad/s at cruising speed
const BOARD_DIST = 7;

const damp = (cur: number, target: number, k: number, dt: number) =>
  THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-k * dt));




/* ------------------------------------------------------------------ */
/* Wake: trailing foam rings + bow spray droplets                      */
/* ------------------------------------------------------------------ */

const FOAM_COUNT = 150;
const SPRAY_COUNT = 90;

/** Soft elongated blob texture used for the long jet-like wake streaks. */
function makeFoamTexture() {
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Foam {
  x: number;
  z: number;
  /** heading at spawn: the streak stretches along this direction */
  yaw: number;
  life: number;
  ttl: number;
  w0: number;
  side: number;
}

interface Spray {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  ttl: number;
}

function Wake() {
  const foamMesh = useRef<THREE.InstancedMesh>(null);
  const sprayMesh = useRef<THREE.InstancedMesh>(null);
  const foam = useRef<Foam[]>([]);
  /** Fixed particle pool — reused forever, so a moving boat allocates
   *  nothing per frame (this used to create 8 Vector3 per spawn tick plus
   *  two fresh arrays per frame via .filter, feeding constant GC churn). */
  const spray = useRef<Spray[]>(
    Array.from({ length: SPRAY_COUNT }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      life: 0,
      ttl: 0,
    })),
  );
  const sprayCursor = useRef(0);
  const acc = useRef(0);
  const sprayAcc = useRef(0);
  /** true while instance buffers still hold particles that must be cleared */
  const foamDirty = useRef(false);
  const sprayDirty = useRef(false);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const flat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    [],
  );
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const qy = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const col = useMemo(() => new THREE.Color(), []);
  const foamTex = useMemo(() => makeFoamTexture(), []);
  // canvas textures are GPU resources: release on unmount
  useEffect(() => () => foamTex.dispose(), [foamTex]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = performance.now() / 1000;
    const spd = Math.abs(boat.speed);

    // --- spawn foam along the stern while moving ---
    acc.current += dt;
    const interval = 0.035 + 0.05 * Math.exp(-spd * 0.35);
    if (spd > 0.35 && acc.current > interval) {
      acc.current = 0;
      const s = Math.sin(boat.yaw);
      const c = Math.cos(boat.yaw);
      for (const side of [-1, 0, 1]) {
        const lx = side * 1.1;
        const lz = -7.9; // well behind the stern, never inside the hull
        foam.current.push({
          x: boat.pos.x + lx * c + lz * s,
          z: boat.pos.z - lx * s + lz * c,
          yaw: boat.yaw,
          life: 0,
          ttl: 2.6 + Math.random() * 1.2,
          w0: 0.9 + Math.random() * 0.5,
          side,
        });
      }

      if (foam.current.length > FOAM_COUNT) foam.current.splice(0, foam.current.length - FOAM_COUNT);
    }

    // --- spawn bow spray at speed (recycles pool slots) ---
    sprayAcc.current += dt;
    if (spd > 3 && sprayAcc.current > 0.03) {
      sprayAcc.current = 0;
      const s = Math.sin(boat.yaw);
      const c = Math.cos(boat.yaw);
      const dir = Math.sign(boat.speed) || 1;
      const lz = 7.9 * dir; // ahead of the bow / behind the stern, outside the hull
      const bx = boat.pos.x + lz * s;
      const bz = boat.pos.z + lz * c;
      for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const d = spray.current[sprayCursor.current]!;
        sprayCursor.current = (sprayCursor.current + 1) % SPRAY_COUNT;
        d.p.set(bx + side * 1.6 * c, boat.pos.y + 0.1, bz - side * 1.6 * s);
        d.v.set(
          side * (2.0 + Math.random() * 1.6) * c + s * spd * 0.4,
          3.4 + Math.random() * 2.6,
          -side * (2.0 + Math.random() * 1.6) * s + c * spd * 0.4,
        );
        d.life = 0;
        d.ttl = 0.6 + Math.random() * 0.4;
      }
    }

    // --- update + write foam streaks ---
    const fm = foamMesh.current;
    if (fm && (foam.current.length > 0 || foamDirty.current)) {
      let i = 0;
      let alive = 0;
      const list = foam.current;
      for (let n = 0; n < list.length; n++) {
        const f = list[n]!;
        f.life += dt;
        const k = f.life / f.ttl;
        if (k >= 1) continue;
        // compact in place instead of allocating a new array with .filter
        list[alive++] = f;
        // the streak keeps sliding backwards and spreads out only slightly
        const s = Math.sin(f.yaw);
        const c = Math.cos(f.yaw);
        const back = 3.2 * dt;
        f.x -= s * back - f.side * 0.35 * dt * c;
        f.z -= c * back + f.side * 0.35 * dt * s;
        const len = 7 + k * 22; // long jet-like trail
        const wid = f.w0 * (1.8 + k * 3.0);
        // boosted past 1.0 so the additive foam reads clearly over bright water
        const alpha = Math.min(1, k * 8) * (1 - k) * 2.2;
        if (i < FOAM_COUNT) {
          v.set(f.x, waterHeight(f.x, f.z, t) + 0.45, f.z);
          qy.setFromAxisAngle(up, f.yaw);
          q.copy(qy).multiply(flat);
          sc.set(wid, len, 1);
          m.compose(v, q, sc);
          fm.setMatrixAt(i, m);
          col.setScalar(alpha);
          fm.setColorAt(i, col);
          i++;
        }
      }
      list.length = alive;
      for (let j = i; j < FOAM_COUNT; j++) {
        m.compose(v.set(0, -900, 0), flat, sc.set(0.001, 0.001, 0.001));
        fm.setMatrixAt(j, m);
        col.setScalar(0);
        fm.setColorAt(j, col);
      }
      fm.instanceMatrix.needsUpdate = true;
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
      foamDirty.current = i > 0;
    }


    // --- update + write spray instances ---
    const sm = sprayMesh.current;
    if (sm) {
      let i = 0;
      const pool = spray.current;
      for (let n = 0; n < SPRAY_COUNT; n++) {
        const d = pool[n]!;
        if (d.ttl <= 0 || d.life >= d.ttl) continue;
        d.life += dt;
        if (d.life >= d.ttl) {
          d.ttl = 0;
          continue;
        }
        d.v.y -= 11 * dt;
        d.p.addScaledVector(d.v, dt);
        const k = d.life / d.ttl;
        const scale = 0.3 * (1 - k * 0.5);
        q.identity();
        m.compose(d.p, q, sc.set(scale, scale, scale));
        sm.setMatrixAt(i, m);
        i++;
      }
      if (i > 0 || sprayDirty.current) {
        for (let j = i; j < SPRAY_COUNT; j++) {
          q.identity();
          m.compose(v.set(0, -900, 0), q, sc.set(0.001, 0.001, 0.001));
          sm.setMatrixAt(j, m);
        }
        sm.instanceMatrix.needsUpdate = true;
      }
      sprayDirty.current = i > 0;
    }
  });

  return (
    <>
      <instancedMesh
        ref={foamMesh}
        args={[undefined, undefined, FOAM_COUNT]}
        frustumCulled={false}
        renderOrder={30}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={foamTex}
          color="#ffffff"
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={sprayMesh}
        args={[undefined, undefined, SPRAY_COUNT]}
        frustumCulled={false}
        renderOrder={31}
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Boat                                                                */
/* ------------------------------------------------------------------ */

export function Boat() {
  const group = useRef<THREE.Group>(null);

  const keys = useRef<Record<string, boolean>>({});
  const seat = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();
  const setMessage = useGameStore((s) => s.setMessage);
  const [prompt, setPrompt] = useState(false);
  const equippedBoatId = useBoatStore((st) => st.equippedId);
  const look = boatLook(equippedBoatId);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.repeat) return;

      // F = take / release the helm while aboard
      if (e.code === "KeyF" && boat.riding) {
        e.preventDefault();
        if (boat.driving) {
          boat.driving = false;
          setMessage("Helm released. Walk the deck with W/A/S/D, F to steer again.");
        } else if (nearHelm()) {
          boat.driving = true;
          setMessage("At the helm. W/S = throttle & reverse, A/D = steer, F to let go.");
        } else {
          setMessage("Walk back to the helm (stern of the boat) and press F.");
        }
        return;
      }

      if (e.code !== "KeyE") return;
      e.preventDefault();
      if (boat.riding) {
        // step off onto the port side of the hull
        boat.riding = false;
        boat.driving = false;
        boat.speed = 0;
        const s = Math.sin(boat.yaw);
        const c = Math.cos(boat.yaw);
        player.pos.x = boat.pos.x + 3.2 * c;
        player.pos.z = boat.pos.z - 3.2 * s;
        setMessage("Left the boat. Press E near the boat to board again.");
      } else if (boat.near) {
        boat.riding = true;
        boat.driving = false;
        resetDeckOffset();
        setMessage("Aboard! W/A/S/D walks the deck, F takes the helm, E to leave.");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const clear = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, [setMessage]);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = state.clock.elapsedTime;
    const k = keys.current;

    boatSeatWorld(seat);
    boat.near =
      !boat.riding &&
      Math.hypot(player.pos.x - seat.x, player.pos.z - seat.z) < BOARD_DIST;
    if (boat.near !== prompt) setPrompt(boat.near);

    // ---- steering (only with hands on the helm) -------------------------
    if (boat.driving) {
      const throttle =
        (k["KeyW"] || k["ArrowUp"] ? 1 : 0) - (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
      const steer = (k["KeyA"] || k["ArrowLeft"] ? 1 : 0) - (k["KeyD"] || k["ArrowRight"] ? 1 : 0);

      if (throttle > 0) boat.speed += ACCEL * dt;
      else if (throttle < 0) boat.speed -= REVERSE * dt;
      boat.speed *= Math.exp(-DRAG * dt);
      boat.speed = THREE.MathUtils.clamp(
        boat.speed,
        -MAX_REVERSE * boat.speedFactor,
        MAX_SPEED * boat.speedFactor,
      );

      // rudder authority scales with headway, like a real boat
      const authority = THREE.MathUtils.clamp(Math.abs(boat.speed) / 6, 0.15, 1);
      const wantTurn = steer * TURN_RATE * authority * Math.sign(boat.speed || 1);
      // steering re-centres quickly so the boat tracks straight when A/D released
      boat.turn = damp(boat.turn, wantTurn, steer === 0 ? 12 : 6, dt);
      if (steer === 0 && Math.abs(boat.turn) < 0.01) boat.turn = 0;
      boat.yaw += boat.turn * dt;


      boat.pos.x += Math.sin(boat.yaw) * boat.speed * dt;
      boat.pos.z += Math.cos(boat.yaw) * boat.speed * dt;

      // the hull cannot climb onto land — bounce it back into the water
      if (!isInWater(boat.pos.x, boat.pos.z)) {
        boat.pos.x -= Math.sin(boat.yaw) * boat.speed * dt * 1.05;
        boat.pos.z -= Math.cos(boat.yaw) * boat.speed * dt * 1.05;
        boat.speed *= -0.25;
      }
    } else {
      boat.speed *= Math.exp(-2.4 * dt);
      boat.turn = damp(boat.turn, 0, 4, dt);
      boat.yaw += boat.turn * dt;
      boat.pos.x += Math.sin(boat.yaw) * boat.speed * dt;
      boat.pos.z += Math.cos(boat.yaw) * boat.speed * dt;
    }

    // ---- float on the swell -------------------------------------------
    // Agar air tidak menembus lambung pada boat mana pun, kita sampel tinggi
    // ombak di seluruh jejak lambung sungguhan (bukan hanya kotak dek yang
    // lebih kecil), ambil yang TERTINGGI, lalu tambah freeboard. Lambung
    // (bottom di y=0 lokal) selalu di atas puncak ombak → air tak pernah
    // masuk ke dalam boat.
    const sy = Math.sin(boat.yaw);
    const cy = Math.cos(boat.yaw);
    // boat.deck.halfX/Z is 0.55 / 0.60 of the real hull footprint — convert
    // back to the true hull half-extents in world units.
    const halfLen = (boat.deck.halfZ * BOAT_SCALE) / 0.6;
    const halfBeam = (boat.deck.halfX * BOAT_SCALE) / 0.55;
    const h = waterHeight(boat.pos.x, boat.pos.z, t);
    const hb = waterHeight(boat.pos.x + sy * halfLen, boat.pos.z + cy * halfLen, t);
    const hst = waterHeight(boat.pos.x - sy * halfLen, boat.pos.z - cy * halfLen, t);
    const hs = waterHeight(boat.pos.x + cy * halfBeam, boat.pos.z - sy * halfBeam, t);
    const hp = waterHeight(boat.pos.x - cy * halfBeam, boat.pos.z + sy * halfBeam, t);
    const hMax = Math.max(h, hb, hst, hs, hp);
    // FREEBOARD keeps the keel above the highest crest sampled across the
    // full hull, so no wave can overtop the gunwale into the boat.
    const target = hMax + FREEBOARD;
    // naik cepat (agar tak kelelep), turun lebih lembut
    boat.pos.y = damp(boat.pos.y, target, boat.pos.y < target ? 22 : 6, dt);

    const g = group.current;
    if (g) {
      (window as unknown as { __boatGroup?: THREE.Group }).__boatGroup = g;
      g.position.copy(boat.pos);
      g.rotation.y = boat.yaw;
      // ikuti kemiringan permukaan penuh supaya lambung sejajar ombak (bukan
      // menembus di salah satu ujung)
      const pitch = THREE.MathUtils.clamp(
        Math.atan2(hb - hst, 2 * halfLen),
        -0.18,
        0.18,
      ) - boat.speed * 0.003;
      const roll = THREE.MathUtils.clamp(
        Math.atan2(hs - hp, 2 * halfBeam),
        -0.15,
        0.15,
      ) + boat.turn * 0.06;
      g.rotation.x = damp(g.rotation.x, pitch, 5, dt);
      g.rotation.z = damp(g.rotation.z, roll, 5, dt);
    }



    // ---- carry the rider ------------------------------------------------
    if (boat.riding) {
      if (boat.driving) {
        // hands on the wheel: locked to the helm, facing the bow
        resetDeckOffset();
        boatSeatWorld(seat);
        player.pos.copy(seat);
        player.yaw = boat.yaw;
        player.moving = false;
      } else {
        // free on deck: Angler writes boat.offset, the hull carries it
        boatDeckWorld(seat);
        player.pos.copy(seat);
      }
      player.swimming = false;
      void camera;
    }
  });

  return (
    <group>
      <group ref={group} scale={BOAT_SCALE}>
        <Suspense fallback={null}>
          <BoatModel
            key={look.id}
            url={look.url}
            targetLength={look.targetLength}
            helmZFactor={look.helmZFactor}
            helmXFactor={look.helmXFactor}
            helmYOffset={look.helmYOffset}
            deckYFactor={look.deckYFactor}
            flipBow={look.flipBow}
          />
        </Suspense>



        {prompt && (
          <Html position={[0, 1.9, 0]} center distanceFactor={8} zIndexRange={[10, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full border-[3px] border-white/40 bg-slate-900/70 px-6 py-2.5 text-2xl font-bold text-slate-50 shadow-lg backdrop-blur-sm">
              Press E to board the boat
            </div>
          </Html>
        )}
      </group>
      <Wake />
    </group>
  );
}