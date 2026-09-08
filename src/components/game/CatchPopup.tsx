import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore, type FishCatch } from "@/hooks/useGameStore";
import { useHookedFish } from "@/hooks/useHookedFish";
import { playCatchSuccessSound } from "@/lib/weatherAudio";
import { FishMesh } from "./Fish";
import { MonsterFishMesh } from "./MonsterFish";
import type { Rarity } from "@/lib/fishRules";

const RARITY_GLOW: Record<Rarity, string> = {
  common: "#cbd5e1",
  rare: "#38bdf8",
  epic: "#a78bfa",
  legendary: "#fb923c",
  mythic: "#fbbf24",
};

/** Slightly brighter chime for the rarer tiers — presentational only,
 *  never touches the actual roll/odds. */
const RARITY_BOOST: Record<Rarity, number> = {
  common: 1,
  rare: 1.1,
  epic: 1.25,
  legendary: 1.45,
  mythic: 1.6,
};

/** Static mount for the fish portrait — no auto-rotation, so the model
 *  always renders at its normalised, centered pose (front-on to the
 *  portrait camera) and can't drift off-centre inside its own frame. */
function Spinner({ children }: { children: React.ReactNode }) {
  return <group>{children}</group>;
}

/** World-unit body length FishModel normalises each rarity's GLB to (see
 *  SIZE_MULTIPLIER in fishModels.ts) — mythic (~45) is ~5x common (~9), so a
 *  fixed `scale` would either clip the big ones or shrink the small ones to
 *  a dot. Dividing the target on-screen length by this neutralises that. */
const MONSTER_LENGTH = 4;
const TARGET_LEN = 2.0;
const TARGET_LEN_MONSTER = 3.2;
/** Magnitude (px) of the facing-based centring correction applied to the
 *  portrait below — see the comment on the portrait div for why the sign
 *  is driven by the model's `facing` instead of being fixed. Tune this
 *  single number if fish still read slightly off-centre; it applies to
 *  every species the same amount, just mirrored by direction. */
const PORTRAIT_NUDGE_PX = 28;

/** Mini self-contained 3D viewport that renders the caught species as a
 *  floating "product shot" portrait — reuses the exact same GLB loader/
 *  normaliser as the rest of the game (FishMesh / MonsterFishMesh), just
 *  without any hook-position math since it's a screen-space UI card now. */
function FishPortrait({ isMonster }: { isMonster: boolean }) {
  const modelLength = useHookedFish((s) => s.model?.length);
  const scale = isMonster
    ? TARGET_LEN_MONSTER / MONSTER_LENGTH
    : TARGET_LEN / (modelLength ?? 9);

  return (
    <Canvas
      camera={{ position: [0, 0.3, isMonster ? 7 : 4.2], fov: 32 }}
      gl={{ alpha: true }}
      style={{ background: "transparent" }}
      // demand: this portrait is a static pose (animate={false} below), so
      // there's nothing changing frame-to-frame that needs a continuous
      // render loop — r3f auto-invalidates a frame whenever the scene
      // actually changes (new fish model, resize, etc). Combined with
      // mounting this <Canvas> ONCE for the whole session (see
      // CatchPopup below) instead of per catch, this avoids both the
      // per-frame cost of a second render loop AND the one-time hitch of
      // creating a fresh WebGL context (shader compilation etc) every
      // single time a fish is caught.
      frameloop="demand"
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} />
      <Suspense fallback={null}>
        <Spinner>
          {isMonster ? (
            <MonsterFishMesh scale={scale} wagSpeed={1.4} animate={false} />
          ) : (
            <FishMesh scale={scale} wagSpeed={10} animate={false} />
          )}
        </Spinner>
      </Suspense>
    </Canvas>
  );
}

// ---- catch-impact timeline (all values in ms, relative to the instant
// phase becomes "caught") -------------------------------------------------
// PULL (t=0, handled in Angler.tsx as a brief rod-tip glow) -> DELAY ->
// GLOW -> FLASH -> FISH POP -> "1 in X" -> NAME + WEIGHT -> FADE OUT.
const T_DELAY = 200; // nothing shown yet
const T_GLOW_START = T_DELAY; // 200
const T_GLOW_GROW = 200; // glow builds for 200ms
const T_FLASH_START = T_GLOW_START + T_GLOW_GROW; // 400
const T_FLASH_DUR = 70;
const T_RAYS_START = T_FLASH_START; // rays shoot out with the flash
const T_RAYS_DUR = 380;
const T_FISH_START = T_FLASH_START + 30; // fish pops right as the flash hits
const T_FISH_DUR = 280;
const T_ODDS_START = T_FISH_START + 150; // name+weight timing still keys off this offset
const T_NAME_START = T_ODDS_START + 80; // name+weight, 80ms after the fish pop
const T_NAME_DUR = 250;
const T_GLOW_FADE_DUR = 1300; // glow's own build+hold+fade, from T_GLOW_START
// Impact-layer DOM (glow/flash/rays/sparkles) is torn down after this —
// comfortably past every animation above, safely before Angler.tsx flips
// the phase back to "idle" at t=1.9s (which fades the whole popup out).
const IMPACT_FX_LIFETIME_MS = 1650;

const RAY_COUNT = 12;
const SPARKLE_COUNT = 16;

interface Ray {
  angle: number;
  length: number;
  width: number;
  jitter: number;
}

interface Sparkle {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  duration: number;
  star: boolean;
}

/** Tiny deterministic PRNG so a given catch's burst is stable across
 *  re-renders within its lifetime, without needing to store the arrays. */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRays(seed: number): Ray[] {
  const rand = mulberry32(seed);
  return Array.from({ length: RAY_COUNT }, (_, i) => ({
    angle: (360 / RAY_COUNT) * i + (rand() - 0.5) * 12,
    length: 110 + rand() * 100,
    width: 3 + rand() * 3,
    jitter: rand() * 40,
  }));
}

function makeSparkles(seed: number): Sparkle[] {
  const rand = mulberry32(seed + 1);
  return Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
    angle: (360 / SPARKLE_COUNT) * i + (rand() - 0.5) * 26,
    distance: 45 + rand() * 85,
    size: rand() < 0.3 ? 9 + rand() * 5 : 3 + rand() * 3,
    // spread sparkle spawns across the glow build-up window so they trickle
    // out rather than all popping at once
    delay: T_GLOW_START + rand() * 260,
    duration: 700 + rand() * 500,
    star: rand() < 0.35,
  }));
}

/**
 * Catch-reveal overlay, screen-anchored above the character. Unlike the
 * old version, nothing here is shown during "bite"/"reel" — the fish and
 * its stats are the reward for landing the catch, so they only appear once
 * `phase` actually reaches "caught", and even then not all at once: a
 * short delay, then a small glow, a quick flash + radial rays, the fish
 * popping in, and finally the odds/name text staggered in behind it.
 */
export function CatchPopup() {
  const phase = useGameStore((s) => s.phase);
  const current = useGameStore((s) => s.current);
  // Which way THIS fish's model faces after normalisation (see FishModelDef.facing
  // in fishModels.ts, already curated per-GLB from visual testing) — a torpedo-
  // shaped body puts more visual "weight" on the head side, so the silhouette's
  // apparent centre leans toward whichever way it's facing. Using this instead of
  // a single fixed direction is why the same popup can correct BOTH a fish that
  // leans left (facing -1, e.g. Mackerel) AND one that leans right (facing +1,
  // e.g. Scad) without needing a per-species special case.
  const facing = useHookedFish((s) => s.model?.facing ?? -1);
  const [catchKey, setCatchKey] = useState(0);
  const [impactAlive, setImpactAlive] = useState(false);
  const prevPhase = useRef(phase);
  const cleanupTimer = useRef<number | null>(null);
  const soundTimer = useRef<number | null>(null);

  // Fire the whole sequence exactly on the reel -> caught transition.
  // Re-keying restarts every CSS animation below from frame zero, including
  // on back-to-back catches.
  useEffect(() => {
    if (prevPhase.current !== "caught" && phase === "caught") {
      setCatchKey((k) => k + 1);
      setImpactAlive(true);

      if (cleanupTimer.current) window.clearTimeout(cleanupTimer.current);
      cleanupTimer.current = window.setTimeout(() => {
        setImpactAlive(false);
      }, IMPACT_FX_LIFETIME_MS);

      // Sync the chime to the actual impact (the flash), not the moment
      // the fish leaves the water.
      if (soundTimer.current) window.clearTimeout(soundTimer.current);
      const rarity = (current?.isMonster ? "mythic" : current?.rarity) as Rarity | undefined;
      soundTimer.current = window.setTimeout(() => {
        playCatchSuccessSound(rarity ? RARITY_BOOST[rarity] : 1);
      }, T_FLASH_START);
    }
    prevPhase.current = phase;
  }, [phase, current]);

  useEffect(() => {
    return () => {
      if (cleanupTimer.current) window.clearTimeout(cleanupTimer.current);
      if (soundTimer.current) window.clearTimeout(soundTimer.current);
    };
  }, []);

  const rays = useMemo(() => makeRays(catchKey), [catchKey]);
  const sparkles = useMemo(() => makeSparkles(catchKey), [catchKey]);

  // Only "caught" shows anything — no early reveal during bite/reel
  // anymore, so the notification can't feel like it "just appears".
  const visible = !!current && phase === "caught";

  // Mount the portrait's <Canvas> (a SECOND WebGL context) exactly ONCE
  // for the whole session, the first time there's ever a fish to show —
  // then never unmount it again. Creating a WebGL context (shader
  // compilation, GPU resource allocation) is one of the most expensive
  // single operations in three.js; mounting/unmounting it every single
  // catch (what an earlier version of this fix did, and what the
  // original code did from every "bite") turns that cost into a visible
  // hitch right at "perlawanan ikan"/"menarik ikan"/the popup appearing.
  // Keeping it permanently mounted (with frameloop="demand" on the
  // Canvas itself, see FishPortrait) means: the one-time context-creation
  // cost happens once ever, and after that the portrait just swaps which
  // GLTF it shows — with no per-frame render loop running while hidden.
  // Keep rendering the last known catch's name/weight/portrait even after
  // `current` clears back to null (between catches) instead of unmounting
  // — that's what keeps the portrait's <Canvas> (a second WebGL context)
  // mounted permanently after the first catch, rather than tearing down
  // and recreating it (expensive: shader compilation, GPU allocation)
  // every single fishing cycle. `visible` above still controls the CSS
  // opacity, so nothing is shown when there's nothing active.
  const lastCatchRef = useRef<FishCatch | null>(null);
  if (current) lastCatchRef.current = current;
  const displayCatch = current ?? lastCatchRef.current;

  if (!displayCatch) return null;

  const rarity = (displayCatch.isMonster ? "mythic" : displayCatch.rarity) as Rarity | undefined;
  const glow = rarity ? RARITY_GLOW[rarity] : "#facc15";

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[9%] z-30 flex -translate-x-1/2 flex-col items-center transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      {/* very subtle full-screen flash — barely there, timed to the impact */}
      {impactAlive && (
        <div
          key={`flash-${catchKey}`}
          className="pointer-events-none fixed inset-0 -z-20"
          style={{
            background: "#ffffff",
            opacity: 0,
            animation: `catchGlobalFlash ${T_FLASH_DUR + 20}ms ease-out ${T_FLASH_START}ms both`,
          }}
        />
      )}

      {/* micro screen-punch, timed to the impact rather than the pull */}
      <div
        className="absolute -z-10"
        style={{
          animation: impactAlive
            ? `catchScreenPunch 150ms ease-out ${T_FLASH_START}ms both`
            : undefined,
        }}
      />

      {/* ===== impact layer: glow / flash / rays / sparkles, all timed off catchKey ===== */}
      {impactAlive && (
        <div key={`impact-${catchKey}`} className="absolute -z-10 top-[20px]" aria-hidden="true">
          {/* small soft glow behind the fish, growing in then holding/fading */}
          <div
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 200,
              height: 200,
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, #ffffff 0%, ${glow}99 40%, transparent 72%)`,
              opacity: 0,
              animation: `catchGlowBuild ${T_GLOW_FADE_DUR}ms ease-out ${T_GLOW_START}ms both`,
            }}
          />
          {/* localized flash, brighter + much shorter than the soft glow */}
          <div
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 150,
              height: 150,
              transform: "translate(-50%, -50%)",
              background: "#ffffff",
              filter: "blur(2px)",
              opacity: 0,
              animation: `catchLocalFlash ${T_FLASH_DUR}ms ease-out ${T_FLASH_START}ms both`,
            }}
          />
          {/* radial rays, spreading out from behind the fish then gone */}
          {rays.map((r, i) => (
            <div
              key={i}
              className="absolute origin-bottom"
              style={
                {
                  left: "50%",
                  top: "50%",
                  width: r.width,
                  height: r.length,
                  background: `linear-gradient(180deg, ${glow}ee, ${glow}00)`,
                  transform: `translate(-50%, -100%) rotate(${r.angle}deg) scaleY(0.3)`,
                  opacity: 0,
                  animation: `catchRayShoot ${T_RAYS_DUR}ms ease-out ${T_RAYS_START + r.jitter}ms both`,
                } as React.CSSProperties
              }
            />
          ))}
          {/* sparkles trickling out during the glow build-up, then a brief
              linger before fading — kept few and small, not a shower */}
          {sparkles.map((p, i) => {
            const rad = (p.angle * Math.PI) / 180;
            const dx = Math.cos(rad) * p.distance;
            const dy = Math.sin(rad) * p.distance;
            return (
              <div
                key={i}
                className="absolute flex items-center justify-center"
                style={
                  {
                    left: "50%",
                    top: "50%",
                    width: p.size,
                    height: p.size,
                    opacity: 0,
                    color: p.star ? glow : undefined,
                    fontSize: p.star ? p.size * 2.2 : undefined,
                    lineHeight: p.star ? 1 : undefined,
                    borderRadius: p.star ? undefined : "9999px",
                    background: p.star ? undefined : "#ffffff",
                    boxShadow: p.star ? undefined : `0 0 5px 1px ${glow}aa`,
                    animation: `catchSparkle ${p.duration}ms ease-out ${p.delay}ms both`,
                    "--px": `${dx}px`,
                    "--py": `${dy}px`,
                  } as React.CSSProperties
                }
              >
                {p.star ? "✦" : null}
              </div>
            );
          })}
        </div>
      )}

      {/* fish portrait — the hero element, stays hidden until its pop.
          animate={false} is passed to FishMesh/MonsterFishMesh inside
          FishPortrait so the model holds its normalised, bounding-box-
          centred pose instead of continuously wagging. That still leaves
          a small residual bias: a fish's silhouette (bulky head, thin
          tail) reads as heavier toward whichever way it's facing, even
          though the bounding-box centre is geometrically correct.
          PORTRAIT_NUDGE_PX is a small, symmetric correction whose
          DIRECTION flips with the model's own `facing` (curated
          per-species in fishModels.ts) — not a fixed guess, so it
          self-corrects for both left-facing and right-facing species
          instead of only ever fixing one of them.
          IMPORTANT: this offset lives on its OWN wrapper div, separate
          from the one running the catchFishPop scale animation below —
          a CSS animation on `transform` fully overrides any static
          `transform` on that same element for as long as it applies
          (fill-mode both holds it before/after too), so putting the
          nudge on the animated div would have silently done nothing. */}
      <div
        key={`portrait-${catchKey}`}
        className="h-[170px] w-[260px]"
        style={{
          opacity: visible ? undefined : 0,
          transform: `translateX(${displayCatch.isMonster ? 0 : -facing * PORTRAIT_NUDGE_PX}px)`,
        }}
      >
        <div
          className="h-full w-full"
          style={{
            animation: visible
              ? `catchFishPop ${T_FISH_DUR}ms cubic-bezier(0.22, 1.2, 0.36, 1) ${T_FISH_START}ms both`
              : undefined,
          }}
        >
          <FishPortrait isMonster={!!displayCatch.isMonster} />
        </div>
      </div>

      <div
        key={`name-${catchKey}`}
        className="-mt-6 flex flex-col items-center text-white"
        style={{
          fontFamily: "'Fredoka', sans-serif",
          opacity: visible ? undefined : 0,
          animation: visible
            ? `catchTextReveal ${T_NAME_DUR}ms ease-out ${T_NAME_START}ms both`
            : undefined,
        }}
      >
        <p
          className="text-2xl leading-tight"
          style={{
            fontWeight: 700,
            WebkitTextStroke: "1.5px black",
            textShadow: "0 2px 0 rgba(0,0,0,0.6)",
          }}
        >
          {displayCatch.name}
        </p>
        <p
          className="text-lg leading-tight"
          style={{
            fontWeight: 600,
            WebkitTextStroke: "1px black",
            textShadow: "0 2px 0 rgba(0,0,0,0.6)",
          }}
        >
          {displayCatch.weight}kg
        </p>
      </div>

      <style>{`
        @keyframes catchScreenPunch {
          0% { transform: translateX(-50%) scale(1); }
          40% { transform: translateX(-50%) scale(1.012); }
          100% { transform: translateX(-50%) scale(1); }
        }
        @keyframes catchGlobalFlash {
          0% { opacity: 0; }
          30% { opacity: 0.09; }
          100% { opacity: 0; }
        }
        @keyframes catchGlowBuild {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          15% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
          55% { opacity: 0.55; transform: translate(-50%, -50%) scale(1.05); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes catchLocalFlash {
          0% { opacity: 0; }
          40% { opacity: 0.95; }
          100% { opacity: 0; }
        }
        @keyframes catchRayShoot {
          0% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.3); }
          25% { opacity: 0.8; }
          100% { opacity: 0; transform: translate(-50%, -100%) scaleY(1); }
        }
        @keyframes catchSparkle {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          15% { opacity: 1; transform: translate(calc(-50% + var(--px) * 0.6), calc(-50% + var(--py) * 0.6)) scale(1); }
          70% { opacity: 0.9; transform: translate(calc(-50% + var(--px)), calc(-50% + var(--py))) scale(0.9); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--px) * 1.1), calc(-50% + var(--py) * 1.1)) scale(0.6); }
        }
        @keyframes catchFishPop {
          0% { opacity: 0; transform: scale(0.7); }
          70% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes catchTextReveal {
          0% { opacity: 0; transform: translateY(8px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}