import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import { waterHeight } from "./Ocean";
import { MonsterFishMesh } from "./MonsterFish";
import { MonsterBurstMesh, animateBurst } from "./MonsterBurst";
import {
  UnderwaterFishGlowMesh,
  animateUnderwaterGlow,
  UNDERWATER_GLOW_COLOR,
  MONSTER_GLOW_COLOR,
  CatchAscendGlowMesh,
  animateCatchAscend,
} from "./UnderwaterFishGlow";
import {
  prewarmCatchModules,
  rollFish,
  useGameStore,
  type FishCatch,
} from "@/hooks/useGameStore";
import { equippedRod, useRodStore } from "@/hooks/useRodStore";
import { useHotbarFishStore } from "@/hooks/useHotbarFishStore";
import { RarityFishMesh } from "./Fish";

import { rodLook } from "@/lib/rodLooks";
import { characterLook } from "@/lib/characterLooks";
import { useActiveCharacterId } from "@/hooks/useCharacterStore";
import {
  CharacterArm,
  CharacterHead,
  CharacterLegs,
  CharacterTorso,
} from "./AnglerBody";
import { clampToWalkable, isInWater, player, resolvePlayerGround } from "@/hooks/usePlayer";
import { boat, boatDeckWorld, moveOnDeck } from "@/hooks/useBoat";
import { useWeather } from "@/hooks/useWeather";
import { biteWindowFor, getFishData, type Rarity } from "@/lib/fishRules";

import { useBaitStore } from "@/hooks/useBaitStore";
import { baitLook } from "@/lib/baitLooks";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useHookedFish } from "@/hooks/useHookedFish";
import {
  playBobberSplash,
  playCastWhizz,
  playFootstep,
  resumeWeatherAudio,
  startReelSound,
  stopReelSound,
} from "@/lib/weatherAudio";

const WALK_SPEED = 17;
const SWIM_SPEED = 10;
/** upward velocity imparted by a Space jump — tinggi & responsif (bukan slow-motion) */
const JUMP_VEL = 27;
const GRAVITY = 95;
const CAST_RANGE = 16;

/** swim pose: near-vertical while treading water in place, near-horizontal
 * (prone, "tengkurap") once actually swimming forward/back/sideways. */
const SWIM_PITCH_IDLE = 0.05;
const SWIM_PITCH_ACTIVE = 1.3;
/** local height (body-space) of the head, used to keep it near the surface
 * at any pitch — as the body tips from upright toward prone, less of its
 * local "up" axis stays vertical, so the swim depth below has to compensate. */
const SWIM_HEAD_LOCAL_Y = 4.25;
/** how far the head pokes above the water surface when floating upright */
const SWIM_SURFACE_EMERGE = 0.65;

const lerp = THREE.MathUtils.lerp;
const damp = (cur: number, target: number, k: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-k * dt));

/** Offset mulut monster relatif pusat model (lokal x≈1.6, y≈-0.05) × scale 9. */
const MONSTER_SCALE = 9;
const MONSTER_MOUTH = new THREE.Vector3(1.6, -0.05, 0).multiplyScalar(MONSTER_SCALE);

/** Roblox-style blocky avatar holding a fishing rod. */
export function Angler() {
  const { setPhase, setMessage, landFish, setCurrent } = useGameStore.getState();

  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const look = rodLook(useRodStore((s) => s.equippedId));
  const activeCharacterId = useActiveCharacterId(useProfileStore((s) => s.address));
  const heldFishId = useHotbarFishStore((s) => s.heldId);
  const hotbarFishSlots = useHotbarFishStore((s) => s.slots);
  const heldFishItem = heldFishId
    ? (hotbarFishSlots.find((it) => it.id === heldFishId) ?? null)
    : null;
  const heldFishRarity: Rarity =
    (heldFishItem &&
      (getFishData().species.find((sp) => sp.id === heldFishItem.species_id)?.rarity as
        Rarity | undefined)) ||
    "common";
  const heldFishAnchor = useRef<THREE.Group>(null);
  const rodBend = useRef<THREE.Group>(null);
  const rodTip = useRef<THREE.Object3D>(null);
  const bobber = useRef<THREE.Group>(null);
  const monster = useRef<THREE.Group>(null);
  const splash = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Group>(null);
  /** underwater light VFX standing in for the (hidden) fish while it's
   *  being reeled in — see UnderwaterFishGlow.tsx */
  const underGlow = useRef<THREE.Group>(null);
  /** the catch-ascension surge — the fish's light bursting up out of the
   *  water and racing along the line to the rod tip, replacing the old
   *  3D fish dangle for a normal (non-monster) catch — see
   *  CatchAscendGlowMesh in UnderwaterFishGlow.tsx */
  const ascendGlow = useRef<THREE.Group>(null);
  /** VFX lights kept permanently in the scene (see the JSX note at the
   *  bottom of this component) so the scene's light count never changes
   *  and materials never recompile mid-gameplay. */
  const burstLight = useRef<THREE.PointLight>(null);
  const underLight = useRef<THREE.PointLight>(null);
  const ascendLight = useRef<THREE.PointLight>(null);
  const reelCrank = useRef<THREE.Group>(null);
  /** brief warm glow at the rod tip/hands the instant a catch lands — see
   *  the "PULL" step of the catch-impact sequence (CatchPopup handles the
   *  screen-space flash/rays/text; this is the one bit of that sequence
   *  that has to live in-world since it's anchored to the rod). */
  const rodGlow = useRef<THREE.PointLight>(null);
  /** anchor di tangan kanan (joran dipegang) */
  const handAnchor = useRef<THREE.Group>(null);
  /** anchor di punggung (joran dilepas / disampirkan) */
  const backAnchor = useRef<THREE.Group>(null);
  const stowedNow = useRef(false);

  /** anchor senar di sepanjang batang: spool reel -> ring guide -> ujung joran */
  const guideRefs = useRef<Array<THREE.Object3D | null>>([]);
  const GUIDE_COUNT = 5; // 4 ring + spool; tip ditambahkan terpisah
  const CURVE_SEGS = 14;

  // line geometry (segmen batang + katenari ke pelampung)
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((GUIDE_COUNT + 1 + CURVE_SEGS) * 3), 3),
    );
    const mat = new THREE.LineBasicMaterial({ color: "#f4f7f8", transparent: true, opacity: 0.85 });
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    return l;
  }, []);

  const s = useRef({
    phase: "idle" as "idle" | "cast" | "waiting" | "bite" | "reel" | "caught",
    t: 0,
    biteAt: 3,
    bobber: new THREE.Vector3(player.pos.x, 0, player.pos.z + 1),
    walk: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    /** horizontal direction the current cast was aimed at */
    dir: new THREE.Vector3(0, 0, 1),
    fish: null as FishCatch | null,
    /** sisa waktu tampil monster raksasa setelah tertangkap (detik) */
    monsterT: 0,
    monsterDir: 0,
    /** posisi & rotasi pusat monster (dihitung di fase reel/caught) */
    monsterPos: new THREE.Vector3(),
    monsterRot: new THREE.Euler(),

    splashT: 99,
    whizzed: false,
    splashAt: new THREE.Vector3(),
    rodTarget: 0,
    lean: 0,
    /** fase siklus langkah terakhir yang sudah memicu suara footstep */
    stepPhase: 0,
    /** true selama masih di udara, untuk memicu suara mendarat */
    wasJumping: false,
  });

  const tipWorld = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tmp2 = useMemo(() => new THREE.Vector3(), []);
  const tmp3 = useMemo(() => new THREE.Vector3(), []);
  const { gl, camera } = useThree();

  const action = () => {
    // Keep gameplay audio unlocked even when this action is the browser's
    // very first user gesture. Sounds remain non-positional for multiplayer.
    resumeWeatherAudio();
    if (!useProfileStore.getState().profile) {
      toast.error("Connect your wallet to play");
      return;
    }
    const st = s.current;
    const store = useGameStore.getState();
    if (store.rodStowed) {
      // joran tersampir di punggung: harus di-klik dulu di hotbar slot 1
      setMessage("Your rod is on your back — click slot 1 (or press 1) to equip it.");
      return;
    }

    if (st.phase === "idle") {
      // Casting is locked to the avatar's visible forward axis, never the
      // orbit camera. Preserve the current visible yaw so starting a cast
      // cannot turn or snap the character after the camera has been rotated.
      const castYaw = body.current?.rotation.y ?? player.yaw;
      const dirX = Math.sin(castYaw);
      const dirZ = Math.cos(castYaw);
      const toX = player.pos.x + dirX * CAST_RANGE;
      const toZ = player.pos.z + dirZ * CAST_RANGE;
      // The bobber has to land in open sea, not on the island itself —
      // block casting toward land (e.g. facing inland toward the hills).
      if (!isInWater(toX, toZ)) {
        setMessage("Aim your cast toward the sea, not the island!");
        return;
      }
      player.yaw = castYaw;
      st.dir.set(dirX, 0, dirZ);
      st.to.set(toX, 0, toZ);
      st.phase = "cast";
      st.t = 0;
      st.whizzed = false;
      st.fish = null;
      useHookedFish.getState().clear();
      setCurrent(null);
      setPhase("cast");
      setMessage("Casting...");
    } else if (st.phase === "bite") {
      st.phase = "reel";
      st.t = 0;
      setPhase("reel");
      setMessage("Reeling in!");
      startReelSound();
    } else if (st.phase === "waiting") {
      st.phase = "idle";
      st.t = 0;
      setPhase("idle");
      setMessage("Line pulled in empty. ENTER / left click to cast again.");
    }
  };

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      const isMovement = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code);
      if (isMovement) {
        if (!e.repeat && !useProfileStore.getState().profile) {
          toast.error("Connect your wallet to play");
        }
        return;
      }
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        if (!useProfileStore.getState().profile) {
          toast.error("Connect your wallet to play");
          return;
        }
        // Space = selalu lompat saat di darat; lempar/tarik kail pakai ENTER / klik kiri.
        // Saat sedang memancing (fase bukan idle) Space tetap untuk aksi pancing.
        const st = s.current;
        const canJump =
          e.code === "Space" &&
          st.phase === "idle" &&
          !boat.riding &&
          !player.swimming &&
          !player.jumping;
        if (canJump) {
          player.vy = JUMP_VEL;
          player.jumping = true;
          return;
        }
        if (e.code === "Space" && st.phase === "idle") return; // di air/perahu: abaikan
        action();
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        const store = useGameStore.getState();
        // hanya boleh melepas/memasang joran saat tidak sedang memancing
        if (s.current.phase !== "idle") return;
        const next = !store.rodStowed;
        store.setRodStowed(next);
        setMessage(
          next
            ? "Rod stowed on your back. Press R to draw it again."
            : "Rod ready. Press ENTER / left click to cast.",
        );
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const clearKeys = () => {
      keys.current = {};
    };
    // left mouse button casts; right button is reserved for camera rotation
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) action();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      gl.domElement.removeEventListener("pointerdown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = state.clock.elapsedTime;
    const st = s.current;
    st.t += dt;

    // efek burst hanya aktif selama fase caught monster; reset tiap frame
    if (burst.current) burst.current.visible = false;
    // lampu VFX permanen: matikan lewat intensity (bukan visible/unmount)
    if (burstLight.current) burstLight.current.intensity = 0;
    // glow joran hanya aktif ~0.25s di awal fase caught (ikan biasa); reset tiap frame
    if (rodGlow.current) rodGlow.current.intensity = 0;

    // ---- WASD movement (camera-relative), only while not fishing --------
    const k = keys.current;
    const fwd = (k["KeyW"] || k["ArrowUp"] ? 1 : 0) - (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
    const side = (k["KeyD"] || k["ArrowRight"] ? 1 : 0) - (k["KeyA"] || k["ArrowLeft"] ? 1 : 0);
    const profileReady = useProfileStore.getState().profile !== null;
    const onDeck = boat.riding && !boat.driving;
    const canWalk = st.phase === "idle" && (!boat.riding || onDeck) && profileReady;
    let speed = 0;

    if (canWalk && onDeck && (fwd !== 0 || side !== 0)) {
      // walking the deck: the step is expressed in world space, then clamped
      // to the hull's deck box so the character rides along with the boat
      const camYaw = Math.atan2(
        state.camera.position.x - player.pos.x,
        state.camera.position.z - player.pos.z,
      );
      const dirX = -Math.sin(camYaw) * fwd + Math.cos(camYaw) * side;
      const dirZ = -Math.cos(camYaw) * fwd - Math.sin(camYaw) * side;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len;
      const nz = dirZ / len;
      const mv = WALK_SPEED * 0.75;
      moveOnDeck(nx * mv * dt, nz * mv * dt);
      boatDeckWorld(player.pos);
      player.yaw = Math.atan2(nx, nz);
      speed = 1;
    } else if (canWalk && (fwd !== 0 || side !== 0)) {
      // camera forward projected on the ground plane
      const camYaw = Math.atan2(
        state.camera.position.x - player.pos.x,
        state.camera.position.z - player.pos.z,
      );
      // W walks away from the camera, D walks to the camera-right
      const dirX = -Math.sin(camYaw) * fwd + Math.cos(camYaw) * side;
      const dirZ = -Math.cos(camYaw) * fwd - Math.sin(camYaw) * side;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len;
      const nz = dirZ / len;
      const mv = player.swimming ? SWIM_SPEED : WALK_SPEED;
      const [cx, cz] = clampToWalkable(player.pos.x + nx * mv * dt, player.pos.z + nz * mv * dt);
      player.pos.x = cx;
      player.pos.z = cz;
      player.yaw = Math.atan2(nx, nz);
      speed = 1;
    }
    player.moving = speed > 0;
    if (!boat.riding) {
      // ---- swim when off the island / off the dock ----------------------
      const groundContact = resolvePlayerGround(player.pos.x, player.pos.z, dt);
      player.swimming = groundContact.swimming;
      const targetY = player.swimming
        ? waterHeight(player.pos.x, player.pos.z, t) - 3.6 // tenggelam: cuma kepala di atas air
        : groundContact.groundY;
      if (player.jumping) {
        // ---- jump physics: ballistic arc until landing -------------------
        player.vy -= GRAVITY * dt;
        player.pos.y += player.vy * dt;
        if (player.pos.y <= targetY) {
          player.pos.y = targetY;
          player.vy = 0;
          player.jumping = false;
          // suara mendarat
          playFootstep(player.swimming ? "water" : "sand", 1.5);
          st.stepPhase = Math.floor(st.walk / Math.PI);
        }
      } else {
        player.pos.y = damp(player.pos.y, targetY, player.swimming ? 6 : 12, dt);
      }
    } else {
      player.jumping = false;
      player.vy = 0;
      // riding: the boat writes player.pos each frame (seated on the bench)
      player.swimming = false;
    }
    st.walk += dt * (speed > 0 ? 9 : 0);

    // ---- footstep sounds: satu bunyi tiap setengah siklus langkah --------
    if (speed > 0 && !player.jumping && !player.swimming) {
      const phase = Math.floor(st.walk / Math.PI);
      if (phase !== st.stepPhase) {
        st.stepPhase = phase;
        // di atas dermaga/papan (di atas permukaan air tapi tidak berenang) = kayu
        const onWood = isInWater(player.pos.x, player.pos.z);
        playFootstep(onWood ? "wood" : "sand", 0.9 + Math.random() * 0.2);
      }
    } else if (speed === 0) {
      st.stepPhase = Math.floor(st.walk / Math.PI);
    }

    // ---- body transform: stand at the player position -------------------
    if (body.current) {
      const bob = boat.driving
        ? 0
        : player.swimming
          ? Math.sin(t * 2.4) * 0.16
          : speed > 0
            ? Math.abs(Math.sin(st.walk)) * 0.09
            : Math.sin(t * 1.6) * 0.05;
      // pose renang: badan tetap tegak & tenggelam (hanya kepala di atas air),
      // sedikit condong ke depan saat bergerak — tidak diangkat/terapung
      const swimPitch = player.swimming && !boat.riding ? (speed > 0 ? 0.22 : 0.05) : 0;
      body.current.rotation.order = "YXZ";
      body.current.rotation.x = damp(body.current.rotation.x, swimPitch, 6, dt);
      body.current.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
      // shortest-path yaw smoothing
      let diff = player.yaw - body.current.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      body.current.rotation.y += diff * (1 - Math.exp(-12 * dt));
    }
    if (head.current) head.current.rotation.y = speed > 0 ? 0 : Math.sin(t * 0.42) * 0.18;

    // ---- walking legs ---------------------------------------------------
    // swimming: continuous flutter kick, slightly wider than the walk cycle
    st.walk += player.swimming ? dt * 7 : 0;
    const legSwing = player.swimming
      ? Math.sin(st.walk * 1.6) * 0.5
      : speed > 0
        ? Math.sin(st.walk) * 0.75
        : 0;
    // seated driver pose: thighs swing forward so the angler sits on the bench
    const seatSwing = boat.driving ? -1.45 : 0;
    const targetL = boat.driving ? seatSwing : legSwing;
    const targetR = boat.driving ? seatSwing : -legSwing;
    if (legL.current) legL.current.rotation.x = damp(legL.current.rotation.x, targetL, 12, dt);
    if (legR.current) legR.current.rotation.x = damp(legR.current.rotation.x, targetR, 12, dt);
    if (legL.current)
      legL.current.rotation.z = damp(legL.current.rotation.z, boat.driving ? 0.12 : 0, 12, dt);
    if (legR.current)
      legR.current.rotation.z = damp(legR.current.rotation.z, boat.driving ? -0.12 : 0, 12, dt);

    let armR = -0.35; // shoulder pitch (+ = arm swings back, - = forward)
    let armRZ = 0; // right shoulder roll (+ = moves the hand inward toward center)
    let armL = -0.15;
    let armLZ = 0; // left shoulder roll (negative = reaches in toward the rod)
    let crankAngle = 0; // reel handle spin
    // rodAbs = rod tilt in BODY space: 0 = straight up, + = tipped forward (+Z),
    // - = laid back over the shoulder. It is converted to a local rotation
    // relative to the arm and torso. The face is also modeled on +Z, so a
    // positive released/settled rodAbs can never point behind the avatar.
    let rodAbs = 0.5;
    let rodRoll = 0; // sideways tilt (used for the shoulder-carry pose)
    let bend = 0;
    let lean = 0;

    // ---- phase logic --------------------------------------------------
    // underwater glow only ever lights up during the "reel" branch below;
    // default it off so it can't linger into any other phase.
    if (underGlow.current) underGlow.current.visible = false;
    if (underLight.current) underLight.current.intensity = 0;
    // catch-ascension surge only ever lights up in the "caught" branch
    // below, and only for normal (non-monster) catches; default it off
    // so it can't linger into any other phase.
    if (ascendGlow.current) ascendGlow.current.visible = false;
    if (ascendLight.current) ascendLight.current.intensity = 0;

    if (st.phase === "cast") {
      const p = st.t;
      if (p < 0.3) {
        // 1) unstow from the shoulder into a vertical "ready" pose
        const k = p / 0.3;
        const e = k * k * (3 - 2 * k);
        armR = lerp(-1.35, -0.4, e);
        rodAbs = lerp(-1.15, 0.15, e);
        rodRoll = lerp(-0.35, 0, e);
        lean = lerp(0, 0.06, e);
      } else if (p < 0.5) {
        // 2) SHORT backswing: just a little past vertical, never into the arm
        const k = (p - 0.3) / 0.2;
        const e = k * k * (3 - 2 * k);
        armR = lerp(-0.4, -0.05, e);
        rodAbs = lerp(0.15, -0.4, e);
        bend = -e * 0.18;
        lean = lerp(0.06, 0.16, e);
      } else if (p < 0.78) {
        // 3) whip forward
        const k = (p - 0.5) / 0.28;
        const e = 1 - Math.pow(1 - k, 3);
        armR = lerp(-0.05, -1.0, e);
        rodAbs = lerp(-0.4, 1.05, e);
        bend = Math.sin(k * Math.PI) * 0.6;
        lean = lerp(0.16, -0.16, e);
      } else {
        // 3) settle: rod pointing out over the water
        const k = Math.min((p - 0.78) / 0.5, 1);
        armR = lerp(-1.0, -0.55, k);
        rodAbs = lerp(1.05, 0.55, k);
        lean = lerp(-0.16, 0, k);
      }
      // left hand joins the rod as the cast settles
      const grip = Math.min(Math.max((p - 0.7) / 0.3, 0), 1);
      armRZ = lerp(0, 0.38, grip);
      armL = lerp(-0.5, -1.15, grip);
      armLZ = lerp(-0.1, -0.55, grip);

      // bobber flight starts at the whip release
      if (p >= 0.66) {
        const fk = Math.min((p - 0.66) / 0.75, 1);

        if (!st.whizzed) {
          st.whizzed = true;
          playCastWhizz(0.75);
        }
        if (fk === 0) st.from.copy(st.bobber);
        st.bobber.lerpVectors(st.from, st.to, fk);
        st.bobber.y += Math.sin(fk * Math.PI) * 6.5;
        if (fk >= 1) {
          st.phase = "waiting";
          st.t = 0;
          st.biteAt = 2 + Math.random() * 4;
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
          setPhase("waiting");
          setMessage("Waiting for a bite...");
          playBobberSplash(1);
        }
      } else {
        // rod tip carries the bobber before release
        if (rodTip.current) {
          rodTip.current.getWorldPosition(tipWorld);
          st.bobber.copy(tipWorld);
          st.from.copy(tipWorld);
        }
      }
    } else if (st.phase === "waiting") {
      // after the cast: both hands on the rod, left hand resting on the reel
      armR = -0.55 + Math.sin(t * 1.2) * 0.02;
      armRZ = 0.38;
      rodAbs = 0.55;
      armL = -1.15;
      armLZ = -0.55;
      st.bobber.y = waterHeight(st.bobber.x, st.bobber.z, t) + 0.18 + Math.sin(t * 2.2) * 0.06;
      if (st.t > st.biteAt) {
        st.phase = "bite";
        st.t = 0;
        st.fish = rollFish(useWeather.getState().kind);
        useHookedFish.getState().hook(st.fish.rarity, st.fish.weight);
        // Load the catch-path chunks now, while the fight is still running —
        // otherwise they get fetched/parsed on the exact frame of the pull.
        prewarmCatchModules();
        setCurrent(st.fish);
        setPhase("bite");
        setMessage("FISH ON! Press SPACE / ENTER now!");
      }
    } else if (st.phase === "bite") {
      // bobber yanked under, rod tip loaded
      const dip = Math.abs(Math.sin(st.t * 9)) * 0.75;
      st.bobber.y = waterHeight(st.bobber.x, st.bobber.z, t) + 0.18 - dip;
      st.bobber.x += Math.sin(st.t * 11) * 0.02;
      bend = 0.18 + Math.sin(st.t * 9) * 0.12;
      armR = -0.45;
      armRZ = 0.38;
      rodAbs = 0.42;
      lean = -0.05;
      armL = -1.2;
      armLZ = -0.55;

      if (st.t > biteWindowFor(useWeather.getState().kind)) {
        st.phase = "idle";
        st.t = 0;
        st.fish = null;
        useHookedFish.getState().clear();
        setCurrent(null);
        setPhase("idle");
        setMessage("It got away! Cast again.");
      }
    } else if (st.phase === "reel") {
      const isMonsterFight = !!st.fish?.isMonster;
      // monster raksasa: perlawanan panjang sebelum bisa diangkat
      const speed = Math.min(90, Math.max(0, equippedRod().speed_percent));
      const reelDur = (isMonsterFight ? 5.5 : 1.5) * (1 - speed / 100);
      const k = Math.min(st.t / reelDur, 1);
      // fighting: rod high and bent, character leans back
      armR = lerp(-0.45, -1.1, Math.min(k * 2, 1));
      armRZ = 0.38;
      rodAbs = lerp(0.42, -0.55, Math.min(k * 2, 1)) + Math.sin(st.t * 7) * 0.08;

      bend = 0.75 - k * 0.2 + Math.sin(st.t * 8) * 0.1;
      lean = -0.28 + Math.sin(st.t * 6) * 0.05;
      // left hand cranks the reel: small circle traced by the shoulder joint
      const crank = st.t * 11;
      crankAngle = crank;
      armL = -1.15 + Math.sin(crank) * 0.16;
      armLZ = -0.55 + Math.cos(crank) * 0.14;

      if (isMonsterFight) {
        // ---- PERLAWANAN MONSTER: umpan TETAP di titik lemparan, monster
        // sepenuhnya tersembunyi di bawah air, mulut tepat di umpan ----
        const dirA = Math.atan2(st.to.z - player.pos.z, st.to.x - player.pos.x);
        const yaw = Math.PI - dirA; // kepala (+X lokal) menghadap pemain
        const surf = waterHeight(st.to.x, st.to.z, t);
        const jerk = Math.sin(st.t * 1.05); // sentakan maju-mundur
        st.bobber.set(
          st.to.x + Math.cos(dirA) * jerk * 0.6 + Math.sin(st.t * 9) * 0.25,
          surf - 0.9 - Math.abs(Math.sin(st.t * 5)) * 0.6,
          st.to.z + Math.sin(dirA) * jerk * 0.6 + Math.cos(st.t * 7) * 0.25,
        );
        st.monsterRot.set(0, yaw, 0.08 + Math.sin(st.t * 2.4) * 0.1);
        // pusat monster = umpan - offset mulut (monster di belakang umpan, menjauhi pemain)
        st.monsterPos
          .copy(MONSTER_MOUTH)
          .applyEuler(st.monsterRot)
          .multiplyScalar(-1)
          .add(st.bobber);
        st.monsterPos.y = surf - 12;
        // joran melengkung lebih ekstrem & badan tersentak saat monster surge
        bend = 0.95 + Math.sin(st.t * 3) * 0.18;
        lean = -0.35 + Math.sin(st.t * 2.6) * 0.09;
        rodAbs += Math.sin(st.t * 3.1) * 0.12;
        // getar layar selama perlawanan: mengikuti sentakan, memuncak di akhir
        if (camera) {
          const ramp = st.t > reelDur - 0.8 ? (st.t - (reelDur - 0.8)) / 0.8 : 0;
          const amp = 0.12 + 0.25 * Math.abs(jerk) + ramp * 0.35;
          camera.position.x += (Math.random() - 0.5) * amp;
          camera.position.y += (Math.random() - 0.5) * amp;
          camera.position.z += (Math.random() - 0.5) * amp;
        }
        // cipratan berulang di titik umpan
        if (st.splashT > 0.35) {
          st.splashT = 0;
          st.splashAt.set(st.to.x, surf, st.to.z);
        }

        // ---- underwater light VFX: stands in for the (hidden) monster
        // while it fights below the surface — no monster geometry is
        // shown until "caught" ----------------------------------------
        if (underGlow.current) {
          underGlow.current.visible = true;
          underGlow.current.position.set(st.to.x, surf, st.to.z);
          const glowDepth = 0.9 + Math.abs(Math.sin(st.t * 5)) * 0.6;
          animateUnderwaterGlow(
            underGlow.current,
            t,
            glowDepth,
            jerk,
            MONSTER_GLOW_COLOR,
            underLight.current,
          );
        }
      } else {
        // ikan melawan DI TEMPAT sambaran — tidak digeser mendekati pemain;
        // hanya bergejolak kecil di sekitar titik kail
        st.bobber.x = st.to.x + Math.sin(st.t * 14) * 0.45 * (1 - k * 0.5);
        st.bobber.z = st.to.z + Math.cos(st.t * 11) * 0.45 * (1 - k * 0.5);
        st.bobber.y = waterHeight(st.to.x, st.to.z, t) - 0.25 + Math.abs(Math.sin(st.t * 9)) * 0.35;
        // cipratan fight berulang di titik sambaran
        if (st.splashT > 0.45) {
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
        }

        // ---- underwater light VFX: stands in for the (hidden) fish
        // while it fights below the surface ------------------------
        if (underGlow.current) {
          const surf = waterHeight(st.to.x, st.to.z, t);
          underGlow.current.visible = true;
          underGlow.current.position.set(st.to.x, surf, st.to.z);
          const glowDepth = 0.7 + Math.abs(Math.sin(st.t * 9)) * 0.5;
          const jerkFight = Math.sin(st.t * 14);
          const rarity = (st.fish?.rarity ?? "common") as Rarity;
          animateUnderwaterGlow(
            underGlow.current,
            t,
            glowDepth,
            jerkFight,
            UNDERWATER_GLOW_COLOR[rarity] ?? UNDERWATER_GLOW_COLOR.common,
            underLight.current,
          );
        }
      }
      if (k >= 1) {
        st.phase = "caught";
        st.t = 0;
        st.splashT = 0;
        if (isMonsterFight) {
          // Mulai tarikan tepat dari permukaan di titik sambaran. Monster baru
          // ditampilkan pada fase caught, lalu langsung menerobos ke atas.
          const surface = waterHeight(st.to.x, st.to.z, t);
          st.from.set(st.to.x, surface, st.to.z);
          st.bobber.copy(st.from);
          st.splashAt.copy(st.from);
        } else {
          st.from.copy(st.bobber);
          st.splashAt.copy(st.bobber);
        }
        setPhase("caught");
        stopReelSound();
        playBobberSplash(1.6);
        if (st.fish) {
          // Preview message from the client roll — landFish() will correct
          // `last`/`totalWeight` in the store once the server confirms the
          // real catch, so the HUD updates again if the numbers differ.
          landFish(st.fish, useWeather.getState().kind);
          setMessage(`Caught ${st.fish.name} — ${st.fish.weight} kg!`);
        }
      }
    } else if (st.phase === "caught") {
      const isMonster = !!st.fish?.isMonster;
      if (isMonster) {
        // ---------- EPIC MONSTER LIFT ----------
        const dur = 1.5;
        const kk = Math.min(st.t / dur, 1);
        const e = 1 - Math.pow(1 - kk, 3); // fast-out, then hold

        // Tarikan awal lurus ke atas dari titik umpan, lalu melayang ke
        // DEPAN pemain (di antara titik umpan dan pemain) untuk pose kemenangan.
        const start = tmp.copy(st.from);
        const liftEnd = tmp2.set(start.x, start.y + 28, start.z);
        const finish = tmp3.set(
          lerp(player.pos.x, st.to.x, 0.6),
          player.pos.y + 18,
          lerp(player.pos.z, st.to.z, 0.6),
        );
        if (kk < 0.62) {
          const liftK = 1 - Math.pow(1 - kk / 0.62, 3);
          st.bobber.lerpVectors(start, liftEnd, liftK);
        } else {
          const triumphK = (kk - 0.62) / 0.38;
          st.bobber.lerpVectors(liftEnd, finish, triumphK);
        }

        // pusat monster ditempatkan dari mulut: mulut selalu di ujung senar
        {
          const dirA = Math.atan2(st.bobber.z - player.pos.z, st.bobber.x - player.pos.x);
          st.monsterRot.set(0, Math.PI - dirA, 0.15 + kk * 0.85 + Math.sin(t * 3) * 0.06);
          st.monsterPos
            .copy(MONSTER_MOUTH)
            .applyEuler(st.monsterRot)
            .multiplyScalar(-1)
            .add(st.bobber);
        }

        // efek cosmic burst di titik monster menembus permukaan air
        if (burst.current) {
          const kb = Math.min(st.t / 1.45, 1);
          burst.current.visible = kb < 1;
          burst.current.position.set(st.from.x, st.from.y + 0.25, st.from.z);
          animateBurst(burst.current, kb, t, burstLight.current);
        }

        // rod bent to the limit, character leans way back
        armR = lerp(-1.1, -2.0, Math.min(kk * 2.2, 1));
        armRZ = lerp(0.38, 0.1, Math.min(kk * 1.8, 1));
        rodAbs = lerp(-0.55, -1.35, Math.min(kk * 2.2, 1));
        bend = 1.05 - kk * 0.25 + Math.sin(t * 12) * 0.12;
        lean = lerp(-0.28, -0.6, Math.min(kk * 1.8, 1));
        armL = lerp(-1.0, -1.75, Math.min(kk * 1.8, 1));
        armLZ = lerp(-0.55, -0.05, Math.min(kk * 1.8, 1));

        // screen shake while the monster is in the air
        if (camera && kk < 0.92) {
          const shake = (1 - kk) * 0.55;
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake;
          camera.position.z += (Math.random() - 0.5) * shake;
        }

        // extra splash when the monster breaches the surface
        if (kk > 0.12 && kk < 0.18 && st.splashT > 0.4) {
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
        }

        if (kk >= 1) {
          st.phase = "idle";
          st.t = 0;
          setPhase("idle");
          setMessage("Ancient Leviathan caught! Press ENTER / left click to cast again.");
        }
      } else {
        // ---------- normal fish caught (unchanged) ----------
        const k = Math.min(st.t / 1.9, 1);
        // brief warm glow at the rod tip right as the catch lands — rises
        // and fades within the first ~0.25s, matching the "PULL" step of
        // the catch-impact sequence (screen-space burst/text lives in
        // CatchPopup, which starts its own sequence off the same phase
        // change so the two stay roughly in sync).
        if (rodGlow.current) {
          const glowT = Math.min(st.t / 0.25, 1);
          rodGlow.current.intensity = Math.sin(glowT * Math.PI) * 2.2;
        }
        // triumphant lift: rod raised, fish swings up in an arc
        armR = lerp(-1.1, -1.7, Math.min(k * 3, 1));
        armRZ = lerp(0.38, 0.18, Math.min(k * 2, 1));
        rodAbs = lerp(-0.55, -0.85, Math.min(k * 3, 1));

        bend = 0.45 * (1 - k * 0.5);
        lean = lerp(-0.28, 0.1, Math.min(k * 2, 1)) + Math.sin(t * 8) * 0.02 * (1 - k);
        armL = lerp(-1.0, -1.6, Math.min(k * 2, 1));
        armLZ = lerp(-0.55, -0.1, Math.min(k * 2, 1));

        if (rodTip.current) {
          rodTip.current.getWorldPosition(tipWorld);
          tmp.copy(tipWorld);
          tmp.y -= 1.6;
          if (st.t < 0.7) {
            // 1) tarik lurus ke atas: ikan terangkat vertikal dari air mengikuti
            //    senar, tanpa bergerak horizontal mendekati pemain
            const kk = st.t / 0.7;
            const e = 1 - Math.pow(1 - kk, 3);
            st.bobber.x = st.to.x;
            st.bobber.z = st.to.z;
            st.bobber.y = lerp(waterHeight(st.to.x, st.to.z, t) - 0.2, tmp.y, e);
          } else {
            // 2) ikan di udara mengikuti ujung joran yang diangkat
            st.bobber.lerp(tmp, 1 - Math.exp(-6 * dt));
          }
        }

        // ---- catch-ascension surge: the fish's own light bursting up
        // out of the water and racing up the line toward the rod tip,
        // standing in for the (now popup-only) fish model. Tracks
        // st.bobber's full path — including the later horizontal drift
        // toward the rod tip and the triumphant-lift hold — so the light
        // never detaches from where the "fish" actually is. Stays lit
        // for essentially the whole "caught" sequence, only fading in
        // the last stretch so the finish doesn't cut off abruptly. ----
        if (ascendGlow.current) {
          const surf = waterHeight(st.bobber.x, st.bobber.z, t);
          ascendGlow.current.visible = true;
          ascendGlow.current.position.set(st.bobber.x, surf, st.bobber.z);
          const h = st.bobber.y - surf;
          const ascendProgress = k; // spans the full 1.9s "caught" duration
          const rarity = (st.fish?.rarity ?? "common") as Rarity;
          animateCatchAscend(
            ascendGlow.current,
            t,
            h,
            ascendProgress,
            UNDERWATER_GLOW_COLOR[rarity] ?? UNDERWATER_GLOW_COLOR.common,
            ascendLight.current,
          );
        }

        if (k >= 1) {
          st.phase = "idle";
          st.t = 0;
          setPhase("idle");
          setMessage("Press ENTER / left click to cast again");
        }
      }
    } else {
      // idle: rod carried on the shoulder/back, line reeled in near the tip
      if (rodTip.current) {
        rodTip.current.getWorldPosition(tipWorld);
        tmp.copy(tipWorld);
        tmp.y -= 0.6;
        st.bobber.lerp(tmp, 1 - Math.exp(-5 * dt));
      }
      // hand raised to the shoulder, rod laid back diagonally behind the head
      armR = -1.35 + (speed > 0 ? 0 : Math.sin(t * 1.3) * 0.03);
      armL = -0.15;
      armLZ = 0;
      rodAbs = -1.15;
      rodRoll = -0.35;
    }

    // ---- lepas / pakai joran -------------------------------------------
    const stowed = useGameStore.getState().rodStowed && st.phase === "idle";
    if (rod.current && stowed !== stowedNow.current) {
      stowedNow.current = stowed;
      const target = stowed ? backAnchor.current : handAnchor.current;
      if (target && rod.current.parent !== target) target.add(rod.current);
      rod.current.position.set(0, 0, 0);
    }
    if (stowed) {
      // joran tersampir menyilang di punggung: lengan bebas seperti berjalan
      armR = -0.35 + (speed > 0 ? legSwing * 0.55 : Math.sin(t * 1.3) * 0.03);
      armRZ = 0;
      armL = -0.15;
      armLZ = 0;
      bend = 0;
    }

    // ---- ikan diangkat di atas kepala (hotbar) --------------------------
    // Butuh kedua tangan bebas, jadi hanya berlaku saat idle & joran sudah
    // tersampir (Hotbar.tsx menyampirkan joran otomatis sebelum set heldId).
    const holdingFish = !!useHotbarFishStore.getState().heldId && st.phase === "idle" && stowed;
    if (holdingFish) {
      armR = -2.9;
      armRZ = 0.05;
      armL = -2.75;
      armLZ = -0.05;
      bend = 0;
      lean = -0.08 + Math.sin(t * 1.6) * 0.015;
    }
    if (heldFishAnchor.current) heldFishAnchor.current.visible = holdingFish;

    // ---- apply pose (smoothed) ----------------------------------------
    if (speed > 0) {
      armL += -legSwing * 0.55;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, armR, 16, dt);
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, armRZ, 14, dt);
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, armL, 12, dt);
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, armLZ, 12, dt);
    }
    if (reelCrank.current) reelCrank.current.rotation.y = crankAngle;
    if (torso.current) torso.current.rotation.x = damp(torso.current.rotation.x, lean, 10, dt);
    if (rod.current) {
      if (stowed) {
        // pose joran ditentukan oleh anchor punggung
        rod.current.rotation.x = damp(rod.current.rotation.x, 0, 14, dt);
        rod.current.rotation.z = damp(rod.current.rotation.z, 0, 14, dt);
      } else {
        // convert torso-space rod tilt into a local rotation relative to the arm
        const shoulder = rightArm.current ? rightArm.current.rotation.x : armR;
        const spine = torso.current ? torso.current.rotation.x : lean;
        rod.current.rotation.x = damp(rod.current.rotation.x, rodAbs - shoulder - spine, 18, dt);
        // Counter-rotate the child rod so moving the right hand inward does not
        // alter the rod's established sideways angle.
        const shoulderRoll = rightArm.current ? rightArm.current.rotation.z : armRZ;
        rod.current.rotation.z = damp(rod.current.rotation.z, rodRoll - shoulderRoll, 16, dt);
      }
    }

    if (rodBend.current)
      rodBend.current.rotation.x = damp(rodBend.current.rotation.x, bend, 14, dt);

    // sembunyikan senar & pelampung saat joran dilepas
    lineObj.visible = !stowed;

    // ---- bobber ------------------------------------------------------
    if (bobber.current) {
      bobber.current.position.copy(st.bobber);
      bobber.current.visible = st.phase !== "caught" && !stowed;
    }
    const isMonster = !!st.fish?.isMonster;
    // NOTE: the regular hooked-fish 3D dangle (position/rotation matched to
    // the hook point) was removed in favour of CatchPopup — a 2D overlay
    // card that renders the caught species' GLB as a floating portrait with
    // odds/name/weight text, shown from the moment of the bite through to
    // the reveal. No more per-model facing/mouth-anchor math needed for
    // regular catches. The monster's own epic lift sequence below is
    // untouched — it's a distinct set-piece, not the "wrong position" bug.
    // ---- monster raksasa: diangkat epik mengikuti senar ----------
    if (monster.current) {
      // Selama perlawanan hanya senar dan cipratan yang terlihat. Monster
      // muncul tepat ketika fase angkat dimulai.
      const showM = st.phase === "caught" && isMonster;
      monster.current.visible = showM;
      if (showM) {
        // posisi & rotasi sudah dihitung di fase reel/caught agar mulut
        // selalu menempel tepat di ujung senar
        monster.current.position.copy(st.monsterPos);
        monster.current.rotation.copy(st.monsterRot);
      }
    }

    // ---- fishing line: spool -> guide rings -> rod tip -> catenary ke bobber
    // Saat joran disimpan senar tidak terlihat, jadi 19 titik kurva tidak
    // perlu dihitung & diunggah ke GPU setiap frame.
    if (rodTip.current && lineObj.visible) {
      rodTip.current.getWorldPosition(tipWorld);
      const pos = lineObj.geometry.getAttribute("position") as THREE.BufferAttribute;
      let idx = 0;
      // Segmen yang menempel di batang: ikut animasi lentur joran secara real-time
      for (let g = 0; g < GUIDE_COUNT; g++) {
        const node = guideRefs.current[g];
        if (node) {
          node.getWorldPosition(tmp);
          pos.setXYZ(idx, tmp.x, tmp.y, tmp.z);
        } else {
          pos.setXYZ(idx, tipWorld.x, tipWorld.y, tipWorld.z);
        }
        idx++;
      }
      pos.setXYZ(idx, tipWorld.x, tipWorld.y, tipWorld.z);
      idx++;
      const sag =
        st.phase === "reel" ||
        st.phase === "bite" ||
        (st.phase === "caught" && !!st.fish?.isMonster)
          ? 0.12
          : 0.8;
      for (let i = 0; i < CURVE_SEGS; i++) {
        const k = (i + 1) / CURVE_SEGS;
        const x = lerp(tipWorld.x, st.bobber.x, k);
        const y = lerp(tipWorld.y, st.bobber.y, k) - Math.sin(k * Math.PI) * sag;
        const z = lerp(tipWorld.z, st.bobber.z, k);
        pos.setXYZ(idx, x, y, z);
        idx++;
      }
      pos.needsUpdate = true;
    }

    // ---- splash particles ------------------------------------------------
    st.splashT += dt;
    if (splash.current) {
      const life = st.splashT / 0.85;
      splash.current.visible = life < 1;
      if (life < 1) {
        splash.current.position.set(st.splashAt.x, 0, st.splashAt.z);
        splash.current.children.forEach((c, i) => {
          const a = (i / splash.current!.children.length) * Math.PI * 2;
          const r = life * 1.9;
          c.position.set(
            Math.cos(a) * r,
            Math.sin(life * Math.PI) * 1.7 - life * 0.3,
            Math.sin(a) * r,
          );
          const sc = Math.max(0.001, (1 - life) * 0.3);
          c.scale.setScalar(sc);
        });
      }
    }
  });

  const charLook = characterLook(activeCharacterId);


  return (
    <group>
      <group ref={body} position={[player.pos.x, player.pos.y, player.pos.z]}>
        <group ref={torso}>
          {/* legs (hip-pivoted for the walk cycle) */}
          {[-0.52, 0.52].map((x) => (
            <group key={x} ref={x < 0 ? legL : legR} position={[x, 1.8, 0]}>
              <CharacterLegs look={charLook} side={x < 0 ? -1 : 1} />

            </group>
          ))}
          <CharacterTorso look={charLook} />


          {/* anchor punggung: joran menyilang di belakang badan saat dilepas */}
          <group ref={backAnchor} position={[-0.62, 1.85, -0.66]} rotation={[-0.2, 0, -0.5]} />

          {/* ikan hotbar yang sedang diangkat kedua tangan di atas kepala */}
          <group
            ref={heldFishAnchor}
            position={[0, 4.3, 0.35]}
            rotation={[0.08, 0, 0]}
            visible={false}
          >
            {heldFishItem && (
              <RarityFishMesh
                rarity={heldFishRarity}
                weightKg={heldFishItem.weight_kg}
                modelKey={heldFishItem.id}
                animate={false}
                anchorBottom
              />
            )}
          </group>
          {/* head */}
          <group ref={head} position={[0, 4.25, 0]}>
            <CharacterHead look={charLook} />

          </group>

          {/* left arm (character's left = +X side) */}
          <group ref={leftArm} position={[1.5, 3.5, 0]}>
            <CharacterArm look={charLook} />

          </group>

          {/* right arm + rod (character's right = -X side) */}
          <group ref={rightArm} position={[-1.5, 3.5, 0]}>
            <CharacterArm look={charLook} />


            <group ref={handAnchor} position={[0, -1.6, 0.2]}>
              <group ref={rod}>
                {/* grip — bentuk & ketebalan khas tiap tier */}
                <mesh position={[0, 0.35, 0]} castShadow>
                  {look.shape === "carved" || look.shape === "ornate" ? (
                    <cylinderGeometry
                      args={[look.gripRadius * 0.85, look.gripRadius * 1.15, 1.1, 6]}
                    />
                  ) : look.shape === "ethereal" ? (
                    <capsuleGeometry args={[look.gripRadius, 0.8, 4, 10]} />
                  ) : (
                    <cylinderGeometry
                      args={[
                        look.gripRadius * 0.9,
                        look.gripRadius,
                        1.1,
                        look.shape === "wood" ? 6 : 12,
                      ]}
                    />
                  )}
                  <meshStandardMaterial
                    color={look.grip}
                    roughness={look.shape === "wood" ? 1 : 0.55}
                    metalness={look.shape === "slim" || look.shape === "ethereal" ? 0.5 : 0.1}
                    emissive={look.accent}
                    emissiveIntensity={look.glow * 0.3}
                  />
                </mesh>
                {/* ornamen permata di sepanjang pegangan */}
                {Array.from({ length: look.gems }, (_, i) => (
                  <mesh
                    key={i}
                    position={[0, 0.05 + i * (0.55 / Math.max(1, look.gems)), look.gripRadius]}
                    castShadow
                  >
                    <octahedronGeometry args={[0.045 + look.glow * 0.02, 0]} />
                    <meshStandardMaterial
                      color={look.accent}
                      emissive={look.accent}
                      emissiveIntensity={0.4 + look.glow}
                      metalness={0.6}
                      roughness={0.2}
                    />
                  </mesh>
                ))}
                {/* sayap/ekor ornamen khas tier tinggi */}
                {(look.shape === "ornate" || look.shape === "ethereal") && (
                  <>
                    {[-1, 1].map((sgn) => (
                      <mesh
                        key={sgn}
                        position={[sgn * 0.16, 0.95, 0]}
                        rotation={[0, 0, sgn * 0.5]}
                        castShadow
                      >
                        <coneGeometry args={[0.07, 0.34, look.shape === "ethereal" ? 4 : 3]} />
                        <meshStandardMaterial
                          color={look.accent}
                          emissive={look.accent}
                          emissiveIntensity={look.glow}
                          metalness={0.7}
                          roughness={0.25}
                        />
                      </mesh>
                    ))}
                  </>
                )}
                {look.shape === "ethereal" && (
                  <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.3, 0.012, 6, 28]} />
                    <meshBasicMaterial color={look.accent} transparent opacity={0.6} />
                  </mesh>
                )}

                {/* reel */}
                <mesh position={[0.28, 0.75, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.24, 0.24, 0.28, 12]} />
                  <meshStandardMaterial
                    color={look.accent}
                    metalness={0.7}
                    roughness={0.3}
                    emissive={look.accent}
                    emissiveIntensity={look.glow}
                  />
                </mesh>
                {/* reel crank handle (spins while reeling) */}
                <group ref={reelCrank} position={[0.44, 0.75, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <mesh position={[0, 0, 0.18]} castShadow>
                    <boxGeometry args={[0.06, 0.06, 0.36]} />
                    <meshStandardMaterial color="#e0b64a" metalness={0.6} roughness={0.4} />
                  </mesh>
                  <mesh position={[0.1, 0, 0.34]} castShadow>
                    <cylinderGeometry args={[0.07, 0.07, 0.2, 8]} />
                    <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
                  </mesh>
                </group>
                {/* titik keluar senar dari spool reel */}
                <object3D ref={(o) => (guideRefs.current[0] = o)} position={[0.2, 0.9, 0]} />
                {/* flexible upper blank */}
                <group ref={rodBend} position={[0, 0.9, 0]}>
                  <mesh position={[0, 1.5, 0]} castShadow>
                    <cylinderGeometry
                      args={[
                        look.blankRadius[1],
                        look.blankRadius[0],
                        3,
                        look.shape === "wood" ? 6 : look.shape === "carved" ? 5 : 10,
                      ]}
                    />
                    <meshStandardMaterial
                      color={look.blank}
                      roughness={look.shape === "wood" ? 0.9 : 0.4}
                      metalness={look.shape === "slim" || look.shape === "ethereal" ? 0.55 : 0.1}
                      emissive={look.accent}
                      emissiveIntensity={look.glow * 0.5}
                    />
                  </mesh>
                  {/* lilitan/ukiran khas tier */}
                  {(look.shape === "fiber" || look.shape === "carved" || look.shape === "ornate") &&
                    [0.4, 1.1, 1.8, 2.5].map((y, i) => (
                      <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                        <torusGeometry args={[look.blankRadius[0] * 1.05, 0.014, 6, 12]} />
                        <meshStandardMaterial
                          color={look.accent}
                          metalness={0.6}
                          roughness={0.35}
                          emissive={look.accent}
                          emissiveIntensity={look.glow * 0.6}
                        />
                      </mesh>
                    ))}

                  {/* ring guide bawah */}
                  <group position={[0.12, 1.0, 0]}>
                    <object3D ref={(o) => (guideRefs.current[1] = o)} />
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <torusGeometry args={[0.055, 0.016, 6, 10]} />
                      <meshStandardMaterial color={look.accent} metalness={0.7} roughness={0.35} />
                    </mesh>
                  </group>
                  <group position={[0.1, 2.2, 0]}>
                    <object3D ref={(o) => (guideRefs.current[2] = o)} />
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <torusGeometry args={[0.048, 0.014, 6, 10]} />
                      <meshStandardMaterial color={look.accent} metalness={0.7} roughness={0.35} />
                    </mesh>
                  </group>
                  <group position={[0, 3, 0]} rotation-x={0.22}>
                    <mesh position={[0, 1.1, 0]} castShadow>
                      <cylinderGeometry args={[0.025, 0.055, 2.2, 8]} />
                      <meshStandardMaterial
                        color={look.tip}
                        roughness={0.5}
                        emissive={look.accent}
                        emissiveIntensity={look.glow * 0.7}
                      />
                    </mesh>
                    <group position={[0.08, 0.8, 0]}>
                      <object3D ref={(o) => (guideRefs.current[3] = o)} />
                      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                        <torusGeometry args={[0.04, 0.012, 6, 10]} />
                        <meshStandardMaterial
                          color={look.accent}
                          metalness={0.7}
                          roughness={0.35}
                        />
                      </mesh>
                    </group>
                    <group position={[0.06, 1.7, 0]}>
                      <object3D ref={(o) => (guideRefs.current[4] = o)} />
                      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                        <torusGeometry args={[0.034, 0.01, 6, 10]} />
                        <meshStandardMaterial
                          color={look.accent}
                          metalness={0.7}
                          roughness={0.35}
                        />
                      </mesh>
                    </group>

                    <object3D ref={rodTip} position={[0, 2.2, 0]} />
                    <pointLight
                      ref={rodGlow}
                      position={[0, 2.2, 0]}
                      color="#fff3c4"
                      intensity={0}
                      distance={5}
                      decay={2}
                    />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* line */}
      <primitive object={lineObj} />

      {/* bobber */}
      <group ref={bobber}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshStandardMaterial color="#e2402f" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.14, 0]}>
          <sphereGeometry args={[0.2, 12, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#f7f7f2" roughness={0.4} />
        </mesh>
        <BaitOrb3D />
      </group>

      {/* monster raksasa saat tertangkap */}
      <group ref={monster} visible={false}>
        <MonsterFishMesh scale={MONSTER_SCALE} wagSpeed={1.4} />
      </group>

      {/* splash */}
      <group ref={splash} visible={false}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color="#eaf7ff" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>

      {/* cosmic burst saat monster menerobos */}
      <group ref={burst} visible={false}>
        <MonsterBurstMesh />
      </group>

      {/* underwater light VFX while a fish/monster fights below the
          surface — no fish geometry is rendered during "reel" */}
      <group ref={underGlow} visible={false}>
        <UnderwaterFishGlowMesh />
      </group>

      {/* catch-ascension surge: the fish's light bursting up out of the
          water and racing up the line to the rod tip on a normal catch */}
      <group ref={ascendGlow} visible={false}>
        <CatchAscendGlowMesh />
      </group>

      {/* PERMANENT VFX lights.
          These used to live inside the three groups above, which are
          hidden/shown every fishing phase. In Three.js the number of
          lights in the scene is baked into every material's shader, so
          each show/hide forced a full recompile of EVERY material (ocean,
          sky, terrain, boat, character) — the big freeze + CPU spike on
          every cast/fight/catch, independent of graphics quality.
          Mounted once here and driven purely by `intensity` (0 = off),
          which is visually identical but costs nothing. */}
      <pointLight ref={burstLight} color="#7dffd2" intensity={0} distance={120} decay={1.6} />
      <pointLight ref={underLight} color="#7fd8ff" intensity={0} distance={18} decay={1.8} />
      <pointLight ref={ascendLight} color="#ffffff" intensity={0} distance={14} decay={1.8} />
    </group>
  );
}
/** Umpan yang menggantung di bawah pelampung — bentuknya khas per tingkat. */
function BaitOrb3D() {
  const baitId = useBaitStore((s) => s.equippedId);
  const look = baitLook(baitId);
  const s = look.size;
  const mat = (
    <meshStandardMaterial
      color={look.core}
      roughness={0.25}
      metalness={0.2}
      emissive={look.accent}
      emissiveIntensity={look.glow}
    />
  );
  return (
    <group position={[0, -0.42, 0]} scale={s}>
      {look.shape === "grub" && (
        <>
          <mesh castShadow rotation={[0, 0, 0.5]}>
            <capsuleGeometry args={[0.075, 0.14, 4, 10]} />
            {mat}
          </mesh>
          <mesh position={[0.06, 0.1, 0]} castShadow>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color={look.shell} roughness={0.6} />
          </mesh>
        </>
      )}
      {look.shape === "cluster" && (
        <>
          {[
            [0, 0.05, 0],
            [0.09, -0.04, 0.03],
            [-0.08, -0.05, -0.03],
            [0.01, -0.11, 0.06],
          ].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} castShadow>
              <sphereGeometry args={[0.068 - i * 0.006, 10, 10]} />
              {mat}
            </mesh>
          ))}
        </>
      )}
      {look.shape === "crystal" && (
        <>
          <mesh castShadow rotation={[0, 0.4, 0]}>
            <octahedronGeometry args={[0.15, 0]} />
            {mat}
          </mesh>
          <mesh position={[0.11, -0.08, 0]} rotation={[0, 0, -0.6]} castShadow>
            <octahedronGeometry args={[0.07, 0]} />
            <meshStandardMaterial
              color={look.shell}
              emissive={look.accent}
              emissiveIntensity={look.glow * 0.6}
            />
          </mesh>
        </>
      )}
      {look.shape === "rune" && (
        <>
          <mesh castShadow>
            <torusKnotGeometry args={[0.09, 0.028, 64, 10]} />
            {mat}
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.17, 0.012, 6, 24]} />
            <meshBasicMaterial color={look.accent} transparent opacity={0.7} />
          </mesh>
        </>
      )}
      {look.shape === "flame" && (
        <>
          <mesh castShadow>
            <coneGeometry args={[0.11, 0.3, 10]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.14, 0.22, 10, 1, true]} />
            <meshBasicMaterial color={look.accent} transparent opacity={0.35} side={2} />
          </mesh>
        </>
      )}
      {look.shape === "void" && (
        <>
          <mesh castShadow>
            <icosahedronGeometry args={[0.15, 0]} />
            <meshStandardMaterial
              color={look.shell}
              emissive={look.core}
              emissiveIntensity={look.glow}
              metalness={0.8}
              roughness={0.15}
            />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[i * 1.1, i * 0.7, i * 0.4]}>
              <torusGeometry args={[0.23 + i * 0.03, 0.009, 6, 28]} />
              <meshBasicMaterial color={look.core} transparent opacity={0.6} />
            </mesh>
          ))}
        </>
      )}
      {look.glow > 0 && (
        <mesh>
          <sphereGeometry args={[0.15 + look.glow * 0.1, 12, 12]} />
          <meshBasicMaterial color={look.core} transparent opacity={0.14 + look.glow * 0.12} />
        </mesh>
      )}
      <pointLight color={look.core} intensity={look.glow * 1.6} distance={2.5} />
    </group>
  );
}