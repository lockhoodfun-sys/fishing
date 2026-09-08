import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Rarity } from "@/lib/fishRules";
import { GRAPHICS, useGraphics } from "@/hooks/useGraphics";


/**
 * Continuous underwater light VFX shown while a fish is being fought
 * ("reel" phase — both the regular fight and the monster fight). No fish
 * or monster geometry is rendered during this phase; instead the struggle
 * reads as a soft, colored light thrashing below the surface, its glow
 * flashing up through the water as the fish yanks the line.
 *
 * Everything here is texture-based (soft radial/gradient PNG-style blobs
 * baked at runtime onto a canvas), the same trick the boat's wake foam
 * already uses (see makeFoamTexture in Boat.tsx) — NOT raw solid geometry
 * (sphere/cone) with flat opacity. Solid additive geometry reads as a
 * hard opaque shape once enough of it overlaps (that was the bug in the
 * previous version); a soft falloff texture never does, no matter how
 * many layers stack.
 *
 * The group's own local origin (y = 0) is always the water SURFACE at the
 * fish's x/z — the caller repositions the group there every frame.
 *
 * IMPORTANT: every material here disables depthTest. Ocean's shader
 * writes full opaque alpha (1.0) despite being flagged `transparent`, so
 * anything sitting below the water's y with normal depth testing gets
 * fully culled by it — the underwater half of this effect (the actual
 * point of it) would simply never draw otherwise.
 */

/** Colour per rarity — mirrors CatchPopup's reveal glow so the fight and
 *  the reward feel like the same light. */
export const UNDERWATER_GLOW_COLOR: Record<Rarity, string> = {
  common: "#cbd5e1",
  rare: "#38bdf8",
  epic: "#a78bfa",
  legendary: "#fb923c",
  mythic: "#fbbf24",
};
/** Distinct accent for the ancient-leviathan fight, echoing MonsterBurst's
 *  green-cyan palette. */
export const MONSTER_GLOW_COLOR = "#5dffc4";

export const GLOW_MOTES = 12;
const BEAM_PLANES = 3;

/** Pengali ukuran efek cahaya bawah air, menyesuaikan dengan pilihan kualitas
 *  grafis. Menggunakan getState() agar fungsi animasi pure tidak subscribe
 *  seluruh komponen setiap frame. */
export function glowScale() {
  return fxPreset().glowScale;
}

/** Preset grafis aktif tanpa subscribe React (aman dipakai per frame). */
export function fxPreset() {
  return GRAPHICS[useGraphics.getState().tier ?? "high"];
}


/** Soft round blob: opaque white centre fading smoothly to fully
 *  transparent — used for every "glow" element (core, halo, surface
 *  flash, motes) so nothing ever reads as a hard-edged solid shape. */
function makeGlowTexture() {
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.75)");
  g.addColorStop(0.7, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical light-column strip: bright near one edge (the water,
 *  mapped to the plane's local bottom) fading smoothly to fully
 *  transparent at the other edge (mapped to the plane's local top),
 *  with the left/right edges also faded so a rotated cross of these
 *  planes reads as a soft column, never a rectangle silhouette. */
function makeBeamTexture() {
  const w = 64;
  const h = 256;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  const vg = ctx.createLinearGradient(0, h, 0, 0);
  vg.addColorStop(0, "rgba(255,255,255,1)");
  vg.addColorStop(0.35, "rgba(255,255,255,0.6)");
  vg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // soften the left/right edges so the plane never shows a hard border
  ctx.globalCompositeOperation = "destination-in";
  const hg = ctx.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, "rgba(255,255,255,0)");
  hg.addColorStop(0.5, "rgba(255,255,255,1)");
  hg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Same vertical gradient as makeBeamTexture but MIRRORED: bright at the
 *  TOP edge fading to fully transparent at the bottom (edges still soft).
 *  Used for the catch-ascension streak, where the bright end must track
 *  the rising fish (the "head") while the tail fades away below it —
 *  the opposite orientation from the reel-phase light column, which is
 *  brightest at the water and fades going up. */
function makeTrailTexture() {
  const w = 64;
  const h = 256;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  const vg = ctx.createLinearGradient(0, 0, 0, h);
  vg.addColorStop(0, "rgba(255,255,255,1)");
  vg.addColorStop(0.35, "rgba(255,255,255,0.6)");
  vg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  const hg = ctx.createLinearGradient(0, 0, w, 0);
  hg.addColorStop(0, "rgba(255,255,255,0)");
  hg.addColorStop(0.5, "rgba(255,255,255,1)");
  hg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Shared material recipe for every soft-glow element. */
function glowMat(map: THREE.Texture, color: string) {
  return (
    <meshBasicMaterial
      map={map}
      color={color}
      transparent
      opacity={0}
      depthWrite={false}
      depthTest={false}
      blending={THREE.AdditiveBlending}
      side={THREE.DoubleSide}
      toneMapped={false}
    />
  );
}

/** Ocean.tsx recenters its 1200×1200 plane under the camera every frame,
 *  which confuses Three's default distance-based transparent-sort — it can
 *  register the ocean as "close" and draw it AFTER these effects, and
 *  since the ocean shader writes full opaque alpha despite being flagged
 *  transparent, that fully overwrites (hides) the glow. `depthTest: false`
 *  alone doesn't fix this — it only stops the ocean's depth buffer from
 *  culling the glow, it says nothing about draw order. A high, explicit
 *  renderOrder on every mesh/sprite here (same trick MonsterBurst.tsx
 *  already uses) forces these to always draw after — and therefore always
 *  on top of — the ocean, regardless of the camera-distance sort.
 *  renderOrder must be set on each individual object; it does NOT
 *  propagate from a parent group to its children. */
const GLOW_RENDER_ORDER = 999;

export function UnderwaterFishGlowMesh() {
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const beamTex = useMemo(() => makeBeamTexture(), []);
  // canvas textures are GPU allocations — release them on unmount
  useEffect(
    () => () => {
      glowTex.dispose();
      beamTex.dispose();
    },
    [glowTex, beamTex],
  );

  return (
    <group renderOrder={GLOW_RENDER_ORDER}>
      {/* underwater light source: soft round glow, always faces the
          camera (a sprite, not a sphere) so it never reads as a solid
          ball */}
      <sprite name="coreSprite" renderOrder={GLOW_RENDER_ORDER}>
        <spriteMaterial
          map={glowTex}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite name="haloSprite" renderOrder={GLOW_RENDER_ORDER}>
        <spriteMaterial
          map={glowTex}
          color="#7fd8ff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* soft flat flash where the light hits the underside of the
          surface, lying flat on the water */}
      <mesh name="surfaceFlash" rotation={[-Math.PI / 2, 0, 0]} renderOrder={GLOW_RENDER_ORDER}>
        <planeGeometry args={[1, 1]} />
        {glowMat(glowTex, "#eafcff")}
      </mesh>
      {/* thin rippling ring around it */}
      <mesh name="surfaceRing" rotation={[-Math.PI / 2, 0, 0]} renderOrder={GLOW_RENDER_ORDER}>
        <ringGeometry args={[0.86, 1, 48]} />
        {glowMat(glowTex, "#eafcff")}
      </mesh>

      {/* cross-billboard light column: a few vertical planes fanned
          60° apart, each a soft gradient (bright at the water, fading
          up into the air) — this is what reads as a "beam bursting
          upward", never a solid shape, since every plane fades out at
          its own edges */}
      {Array.from({ length: BEAM_PLANES }, (_, i) => (
        <mesh
          key={i}
          name={`beam${i}`}
          rotation={[0, (Math.PI / BEAM_PLANES) * i, 0]}
          renderOrder={GLOW_RENDER_ORDER}
        >
          <planeGeometry args={[1, 1]} />
          {glowMat(beamTex, "#bdeeff")}
        </mesh>
      ))}

      {/* motes: small soft sparks drifting up out of the depths */}
      {Array.from({ length: GLOW_MOTES }, (_, i) => (
        <sprite key={i} name={`mote${i}`} renderOrder={GLOW_RENDER_ORDER}>
          <spriteMaterial
            map={glowTex}
            color="#eafcff"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
      {/* NOTE: the point light for this effect deliberately does NOT live
          here. Adding/removing a light from the scene (which happens every
          time this group is hidden/shown) changes Three's light count and
          forces EVERY material in the scene to recompile its shader —
          that was the big hitch on every cast/fight/catch. The light is
          mounted permanently by Angler.tsx and only its intensity is
          animated (0 = off, visually identical). */}
    </group>
  );
}

/**
 * Drives the glow every frame while phase === "reel".
 * @param g       the group returned by UnderwaterFishGlowMesh's ref
 * @param t       global clock time (for wobble/spin)
 * @param depth   how far below the surface (local y = 0) the fish sits, >= 0
 * @param jerk    -1..1 instantaneous struggle value, reuse whatever sin()
 *                already drives the bobber/rod jitter so the burst pulses
 *                in sync with the fight
 * @param color   rarity/monster tint
 */
type GlowRefs = {
  core: THREE.Sprite;
  halo: THREE.Sprite;
  flash: THREE.Mesh;
  ring: THREE.Mesh;
  beams: THREE.Mesh[];
  motes: THREE.Sprite[];
};

export function animateUnderwaterGlow(
  g: THREE.Group,
  t: number,
  depth: number,
  jerk: number,
  color: string,
  /** Permanently-mounted light (sibling of `g`, same parent space). */
  light?: THREE.PointLight | null,
) {
  // Cache scene-graph lookups once per group (same pattern as
  // MonsterBurst.tsx) — getObjectByName walks the whole subtree, and doing
  // that ~20x every frame is what made the fight phase stutter.
  let refs = g.userData["_glowRefs"] as GlowRefs | undefined;
  if (!refs) {
    refs = {
      core: g.getObjectByName("coreSprite") as THREE.Sprite,
      halo: g.getObjectByName("haloSprite") as THREE.Sprite,
      flash: g.getObjectByName("surfaceFlash") as THREE.Mesh,
      ring: g.getObjectByName("surfaceRing") as THREE.Mesh,
      beams: Array.from({ length: BEAM_PLANES }, (_, i) => g.getObjectByName(`beam${i}`) as THREE.Mesh),
      motes: Array.from({ length: GLOW_MOTES }, (_, i) => g.getObjectByName(`mote${i}`) as THREE.Sprite),
    };
    if (!refs.core || !refs.halo || !refs.flash || !refs.ring) return;
    g.userData["_glowRefs"] = refs;
  }

  const setOpacity = (
    o: THREE.Sprite | THREE.Mesh | undefined,
    op: number,
    tint?: string,
  ) => {
    if (!o) return;
    const mat = o.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, Math.min(1, op));
    if (tint) mat.color.set(tint);
  };

  const pulse = 0.55 + Math.abs(jerk) * 0.35 + Math.sin(t * 17) * 0.06; // ~0.2..1
  const d = Math.max(0.05, depth);
  // Sprite aditif yang menutupi hampir seluruh layar sangat mahal di GPU
  // terintegrasi (overdraw + bloom), jadi ukurannya dikecilkan dan diskalakan
  // lagi mengikuti pilihan kualitas grafis.
  const gfx = fxPreset();
  const gs = gfx.glowScale;

  // ---- underwater source: a soft round glow at the fish's own depth --
  const core = refs.core;
  core.position.y = -d;
  const coreS = (1.3 + pulse * 0.7) * gs;
  core.scale.set(coreS, coreS, 1);
  setOpacity(core, 0.8 * pulse, "#ffffff");

  const halo = refs.halo;
  halo.position.y = -d;
  const haloS = (2.1 + pulse * 1.2) * gs;
  halo.scale.set(haloS, haloS, 1);
  setOpacity(halo, 0.55 * pulse, color);

  // ---- surface flash + ring, right where the light meets the water --
  const flash = refs.flash;
  flash.position.y = 0.05;
  const flashS = (2.0 + pulse * 1.35) * gs;
  flash.scale.set(flashS, flashS, 1);
  setOpacity(flash, 0.55 * pulse, color);

  const ring = refs.ring;
  ring.position.y = 0.04;
  ring.scale.setScalar((1.7 + pulse * 1.6) * gs);
  setOpacity(ring, 0.4 * pulse, color);

  // ---- light column: starts a little below the surface (near it, not
  // deep down) and reaches well above — the "bursting upward through
  // the water" beat, built from soft fading planes rather than solid
  // geometry -----------------------------------------------------------
  const beamBottom = -Math.min(d, 0.5);
  const beamTop = (4.5 + pulse * 2.5) * gs;
  const beamLen = beamTop - beamBottom;
  const beamWidth = (1.1 + pulse * 0.6) * gs;

  for (let i = 0; i < BEAM_PLANES; i++) {
    const m = refs.beams[i];
    if (!m) continue;
    // Bidang aditif besar = overdraw berat: pakai sesuai jatah kualitas.
    if (i >= gfx.fxBeams) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    m.scale.set(beamWidth, beamLen, 1);
    m.position.set(0, beamBottom + beamLen / 2, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, Math.min(1, 0.42 * pulse));
    mat.color.set(color);
  }

  // ---- motes: bright soft specks spiralling up out of the depths,
  // popping just past the surface, looping continuously ----------------
  const moteCount = Math.max(3, Math.round(GLOW_MOTES * gfx.fxParticles));
  for (let i = 0; i < GLOW_MOTES; i++) {
    const m = refs.motes[i];
    if (!m) continue;
    if (i >= moteCount) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    const speed = 0.5 + (i % 4) * 0.14;
    const mk = (t * speed + i / GLOW_MOTES) % 1; // 0..1 loop
    const a = (i / GLOW_MOTES) * Math.PI * 2 + t * 0.4;
    const rad = 0.35 + mk * 1.6;
    const rise = -d + mk * (d + 2.2);
    m.position.set(Math.cos(a) * rad, rise, Math.sin(a) * rad);
    const sc = Math.max(0.02, (1 - mk) * 0.55);
    m.scale.set(sc, sc, 1);
    setOpacity(m, (1 - mk) * 0.85 * pulse, color);
  }

  // ---- light bleeding through the water and off the surface ---------
  // `light` is a permanent sibling of `g` (never mounted/unmounted, so the
  // scene's light count — and therefore every shader program — stays put).
  if (light) {
    light.color.set(color);
    light.position.set(g.position.x, g.position.y - d * 0.6, g.position.z);
    light.intensity = gfx.fxLights ? pulse * 12 : 0;
  }
}

const ASCEND_EMBERS = 8;

/**
 * The catch-ascension surge: the fish's own light bursting up out of the
 * water and racing along the line to the rod tip, replacing the old 3D
 * fish dangle for the moment the catch is pulled out. Deliberately NOT a
 * single static orb — it's a moving head of light with a streak trailing
 * behind it (so it visibly travels along the line's direction rather than
 * just sitting there), a one-shot shockwave ring the instant it breaches
 * the surface, and a scatter of embers flung off the head as it climbs.
 *
 * The group itself sits at the fixed water-entry point (x, surface, z) for
 * the whole ascent — every element below is positioned with a LOCAL y
 * offset `h` (the head's height relative to that surface: negative while
 * still underwater, 0 at the surface, positive once airborne climbing the
 * line), so the whole rig reads as one coherent shaft of light climbing
 * out of the water rather than separate independent parts.
 */
export function CatchAscendGlowMesh() {
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const trailTex = useMemo(() => makeTrailTexture(), []);
  useEffect(
    () => () => {
      glowTex.dispose();
      trailTex.dispose();
    },
    [glowTex, trailTex],
  );

  return (
    <group renderOrder={GLOW_RENDER_ORDER}>
      {/* the head: bright core + softer rarity-tinted halo, both sprites
          so they always face the camera no matter the travel angle */}
      <sprite name="ascendCore" renderOrder={GLOW_RENDER_ORDER}>
        <spriteMaterial
          map={glowTex}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite name="ascendHalo" renderOrder={GLOW_RENDER_ORDER}>
        <spriteMaterial
          map={glowTex}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      {/* the streak: a fan of cross-billboard planes trailing below the
          head, bright where they meet the head and fading out below —
          this is what reads as "shooting up", not the sprites alone */}
      {Array.from({ length: 3 }, (_, i) => (
        <mesh
          key={i}
          name={`ascendTrail${i}`}
          rotation={[0, (Math.PI / 3) * i, 0]}
          renderOrder={GLOW_RENDER_ORDER}
        >
          <planeGeometry args={[1, 1]} />
          {glowMat(trailTex, "#ffffff")}
        </mesh>
      ))}

      {/* embers flung off the head mid-climb */}
      {Array.from({ length: ASCEND_EMBERS }, (_, i) => (
        <sprite key={i} name={`ember${i}`} renderOrder={GLOW_RENDER_ORDER}>
          <spriteMaterial
            map={glowTex}
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}

      {/* one-shot shockwave ring the instant the head breaches the
          surface — lying flat on the water like the reel-phase ring */}
      <mesh name="breachRing" rotation={[-Math.PI / 2, 0, 0]} renderOrder={GLOW_RENDER_ORDER}>
        <ringGeometry args={[0.82, 1, 48]} />
        {glowMat(glowTex, "#eafcff")}
      </mesh>

      {/* light lives permanently in Angler.tsx — see the note in
          UnderwaterFishGlowMesh above (keeps the light count constant so
          shaders never recompile mid-catch) */}
    </group>
  );
}

/**
 * Drives the catch-ascension surge every frame while a normal (non-monster)
 * catch is being pulled from the water to the rod tip.
 * @param g         the group returned by CatchAscendGlowMesh's ref — its
 *                   own position must already be pinned to the fixed
 *                   (x, surface, z) water-entry point by the caller
 * @param t          global clock time (for shimmer/embers)
 * @param h          head height relative to the surface: negative
 *                   underwater, 0 at the surface, positive once airborne
 * @param progress   0 at the instant of the catch, 1 once the whole
 *                   "caught" sequence ends — drives the fade in/out
 *                   envelope (stays at full strength for most of it,
 *                   only easing out right near the end)
 * @param color      rarity tint
 */
type AscendRefs = {
  core: THREE.Sprite;
  halo: THREE.Sprite;
  trails: THREE.Mesh[];
  embers: THREE.Sprite[];
  ring: THREE.Mesh;
};

export function animateCatchAscend(
  g: THREE.Group,
  t: number,
  h: number,
  progress: number,
  color: string,
  /** Permanently-mounted light (sibling of `g`, same parent space). */
  light?: THREE.PointLight | null,
) {
  // Cache scene-graph lookups once per group (same pattern as
  // MonsterBurst.tsx) — getObjectByName walks the whole subtree, and doing
  // that ~20x every frame is what made catches stutter.
  let refs = g.userData["_ascendRefs"] as AscendRefs | undefined;
  if (!refs) {
    refs = {
      core: g.getObjectByName("ascendCore") as THREE.Sprite,
      halo: g.getObjectByName("ascendHalo") as THREE.Sprite,
      trails: Array.from({ length: 3 }, (_, i) => g.getObjectByName(`ascendTrail${i}`) as THREE.Mesh),
      embers: Array.from(
        { length: ASCEND_EMBERS },
        (_, i) => g.getObjectByName(`ember${i}`) as THREE.Sprite,
      ),
      ring: g.getObjectByName("breachRing") as THREE.Mesh,
    };
    if (!refs.core || !refs.halo || !refs.ring) return;
    g.userData["_ascendRefs"] = refs;
  }

  const setOpacity = (
    o: THREE.Sprite | THREE.Mesh | undefined,
    op: number,
    tint?: string,
  ) => {
    if (!o) return;
    const mat = o.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, Math.min(1, op));
    if (tint) mat.color.set(tint);
  };

  // quick attack, then holds at full strength for nearly the whole
  // sequence, only easing out right at the very end so the finish reads
  // as a smooth handoff rather than an abrupt cut
  const fadeIn = Math.min(progress / 0.1, 1);
  const fadeOut = 1 - Math.max(0, (progress - 0.88) / 0.12);
  const strength = Math.max(0, Math.min(1, fadeIn * fadeOut));
  const shimmer = 0.75 + Math.sin(t * 24) * 0.25;
  const gfx = fxPreset();
  const gs = gfx.glowScale;


  const core = refs.core;
  core.position.y = h;
  const cs = (1.0 + shimmer * 0.5) * gs;
  core.scale.set(cs, cs, 1);
  setOpacity(core, 0.9 * strength * shimmer, "#ffffff");

  const halo = refs.halo;
  halo.position.y = h;
  const hs = (2.2 + shimmer * 1.1) * gs;
  halo.scale.set(hs, hs, 1);
  setOpacity(halo, 0.55 * strength * shimmer, color);

  // ---- streak trailing behind (below) the head -----------------------
  const trailLen = (1.6 + shimmer * 1.0) * gs;
  const trailWidth = (0.55 + strength * 0.35) * gs;

  for (let i = 0; i < refs.trails.length; i++) {
    const m = refs.trails[i];
    if (!m) continue;
    if (i >= gfx.fxBeams) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    m.scale.set(trailWidth, trailLen, 1);
    m.position.set(0, h - trailLen / 2, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.5 * strength * shimmer;
    mat.color.set(color);
  }

  // ---- embers flung off the climbing head ----------------------------
  const emberCount = Math.max(3, Math.round(ASCEND_EMBERS * gfx.fxParticles));
  for (let i = 0; i < ASCEND_EMBERS; i++) {
    const m = refs.embers[i];
    if (!m) continue;
    if (i >= emberCount) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    const speed = 1.1 + (i % 4) * 0.35;
    const mk = (t * speed + i / ASCEND_EMBERS) % 1; // 0..1 loop
    const a = (i / ASCEND_EMBERS) * Math.PI * 2 + i * 1.7;
    const rad = mk * 1.4;
    const fall = mk * mk * 0.9;
    m.position.set(Math.cos(a) * rad, h + 0.15 - fall, Math.sin(a) * rad);
    const sc = Math.max(0.02, (1 - mk) * 0.4);
    m.scale.set(sc, sc, 1);
    setOpacity(m, (1 - mk) * 0.8 * strength, color);
  }

  // ---- one-shot breach ring the instant h crosses the surface --------
  const prevH = (g.userData["prevH"] as number | undefined) ?? h;
  if (prevH < 0 && h >= 0) g.userData["breachAt"] = t;
  g.userData["prevH"] = h;

  const ring = refs.ring;
  const at = g.userData["breachAt"] as number | undefined;
  const rk = at !== undefined ? (t - at) / 0.5 : 1;
  ring.visible = rk < 1;
  if (rk < 1) {
    ring.position.y = 0.05;
    const s = 1.2 + rk * 3.2;
    ring.scale.setScalar(s);
    const mat = ring.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - rk) * 0.7 * strength;
    mat.color.set(color);
  }

  // ---- light bleeding off the climbing head --------------------------
  if (light) {
    light.color.set(color);
    light.position.set(g.position.x, g.position.y + h, g.position.z);
    light.intensity = gfx.fxLights ? strength * shimmer * 10 : 0;
  }
}
