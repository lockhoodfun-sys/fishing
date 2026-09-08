import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Ocean } from "./Ocean";
import { WorldObjects } from "./WorldObjects";
import { WorldEditor } from "./WorldEditor";
import { Boat } from "./Boat";
import { FishSchool } from "./Fish";
import { Angler } from "./Angler";
import { HUD } from "./HUD";
import { CatchPopup } from "./CatchPopup";
import { Hotbar } from "./Hotbar";
import { LoadingScreen } from "./LoadingScreen";
import { StartGate } from "./StartGate";

import { Weather } from "./Weather";
import { RainImpacts } from "./RainImpacts";
import { WeatherCycleController } from "./WeatherCycleController";
import { WEATHER, useWeather } from "@/hooks/useWeather";
import { useDayNight, dayNightAt, TINT_WEIGHT } from "@/hooks/useDayNight";
import { useFishData } from "@/hooks/useFishData";
import { GRAPHICS, useGraphics } from "@/hooks/useGraphics";
import { PerfMonitor } from "@/lib/perfMonitor";


import { player } from "@/hooks/usePlayer";
import { resumeWeatherAudio } from "@/lib/weatherAudio";
import { WalletButton } from "../wallet/WalletButton";
import { ProfilePanel } from "../profile/ProfilePanel";
import { GoldPanel } from "../gold/GoldPanel";
import { QuestPanel } from "../quest/QuestPanel";
import { QuestTracker } from "../quest/QuestTracker";
import { GraphicsButton } from "./GraphicsButton";
import { DocsPanel } from "./DocsPanel";
import { ExternalLinks } from "./ExternalLinks";
import { CharacterSelect } from "./CharacterSelect";

import { Npcs } from "./Npcs";
import { NpcDialog } from "./NpcDialog";
import { LeaderboardPanel } from "../leaderboard/LeaderboardPanel";
import { ChatBox } from "../chat/ChatBox";

/**
 * Page backdrop colour (weather + time of day).
 *
 * This used to be computed inside GameCanvas from `useDayNight().hour`, which
 * ticks every ~1.5s — every tick re-rendered the whole game tree (Canvas
 * subtree + every HUD panel) just to change one CSS colour. It now lives in
 * this leaf component, which owns the subscription and writes the style
 * straight onto the host element, so nothing else re-renders.
 */
function Backdrop({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const kind = useWeather((s) => s.kind);
  const hour = useDayNight((s) => s.hour);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.style.backgroundColor = new THREE.Color(WEATHER[kind].backdrop)
      .lerp(dayNightAt(hour).tint, TINT_WEIGHT)
      .getStyle();
  }, [kind, hour, host]);
  return null;
}

/**
 * Compiles every material in the scene once, right after the world mounts.
 *
 * Without this the first cast/fight/catch pays for shader compilation while
 * the player is mid-action (visible as `getProgramInfoLog` spikes in the
 * profiler). Doing it up front, during the loading screen, keeps gameplay
 * free of compile hitches.
 */
function ShaderWarmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        gl.compile(scene, camera);
      } catch {
        /* compilation is best-effort */
      }
      // Every program is built by now. Three's per-program error check calls
      // getProgramInfoLog, which forces a GPU sync stall; turning it off after
      // warmup removes that cost without changing what is rendered.
      if (gl.debug) gl.debug.checkShaderErrors = false;
    }, 800);
    return () => window.clearTimeout(id);
  }, [gl, scene, camera]);

  return null;
}

/**
 * Dev aid: `window.__perf()` still reports an instantaneous snapshot of the
 * last rendered frame's draw calls / triangles (cheap sanity check, e.g. for
 * "did shadows turn off"), but it is NOT a benchmark result — it's one
 * sample of unknown frame cost. Use `window.__perfSession.start()` /
 * `.stop()` for anything you intend to compare before/after: it runs a full
 * rAF-based session and reports frame-time percentiles, long tasks and
 * draw-call/triangle percentiles across the whole run. See
 * docs/PERF_PLAN.md for the measurement protocol.
 */
function PerfProbe() {
  const { gl } = useThree();
  useEffect(() => {
    const w = window as unknown as {
      __perf?: () => unknown;
      __perfSession?: { start: () => void; stop: () => unknown };
    };
    w.__perf = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    const monitor = new PerfMonitor(
      () => ({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
      }),
      () => gl.getPixelRatio(),
    );
    w.__perfSession = {
      start: () => monitor.start(),
      stop: () => {
        const report = monitor.stop();
        // eslint-disable-next-line no-console
        console.table({
          fpsAvg: report.fpsAvg.toFixed(1),
          "frameMs p50": report.frameMs.p50.toFixed(2),
          "frameMs p95": report.frameMs.p95.toFixed(2),
          "frameMs p99": report.frameMs.p99.toFixed(2),
          "frameMs max": report.frameMs.max.toFixed(2),
          "janky frames %": report.jankyPct.toFixed(1),
          longTaskCount: report.longTasks.count,
          longTaskTotalMs: report.longTasks.totalMs.toFixed(1),
          drawCallsP50: report.drawCalls.p50,
          trianglesP50: report.triangles.p50,
          dpr: report.dpr,
        });
        return report;
      },
    };
    return () => {
      delete w.__perf;
      delete w.__perfSession;
    };
  }, [gl]);
  return null;
}


/** Keeps the orbit pivot glued to the character so the camera follows them. */
function FollowTarget({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const k = 1 - Math.exp(-8 * dt);
    const nx = t.x + (player.pos.x - t.x) * k;
    const ny = t.y + (player.pos.y + 3 - t.y) * k;
    const nz = t.z + (player.pos.z - t.z) * k;
    // Move the camera by the same delta so it travels with the character
    // instead of only re-aiming at them.
    state.camera.position.x += nx - t.x;
    state.camera.position.y += ny - t.y;
    state.camera.position.z += nz - t.z;
    t.set(nx, ny, nz);
    c.update();
  });

  return null;
}

export function GameCanvas() {
  const controls = useRef<OrbitControlsImpl>(null);
  const host = useRef<HTMLDivElement>(null);
  useFishData();
  const tier = useGraphics((s) => s.tier);
  const gfx = GRAPHICS[tier];


  // Browsers may suspend WebAudio after focus/background transitions. Resume
  // on every relevant gesture, in capture phase so gameplay handlers always
  // see an initialized context, and again whenever the page becomes active.
  useEffect(() => {
    const start = () => resumeWeatherAudio();
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
    };
    window.addEventListener("pointerdown", start, { capture: true });
    window.addEventListener("touchstart", start, { capture: true, passive: true });
    window.addEventListener("keydown", start, { capture: true });
    window.addEventListener("focus", start);
    window.addEventListener("pageshow", start);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", start, { capture: true });
      window.removeEventListener("touchstart", start, { capture: true });
      window.removeEventListener("keydown", start, { capture: true });
      window.removeEventListener("focus", start);
      window.removeEventListener("pageshow", start);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      ref={host}
      className="fixed inset-0 transition-colors duration-700"
      style={{ backgroundColor: WEATHER.cerah.backdrop }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Backdrop host={host} />
      <Canvas
        // Opsi WebGL (antialias) dan shadow map tidak reaktif, jadi ganti
        // kualitas = remount kanvas sekali lewat key.
        key={tier}
        shadows={gfx.shadows}
        dpr={gfx.dpr}
        camera={{ position: [-1.5, 8.6, 25.5], fov: 55, near: 0.1, far: 5000 }}
        // antialias native hanya dipakai kalau EffectComposer tidak aktif.
        // Kalau dua-duanya nyala, scene di-resolve MSAA dua kali per frame
        // (fill-rate dobel) tanpa tambahan kualitas visual yang kentara.
        gl={{ antialias: !gfx.bloom && tier !== "low" }}
      >

        <Weather />
        <WeatherCycleController />

        <Environment>
          <Lightformer intensity={1.6} position={[0, 12, 0]} scale={[24, 24, 1]} color="#ffffff" />
          <Lightformer
            intensity={0.9}
            color="#7fc8e8"
            position={[-14, 2, -6]}
            rotation-y={Math.PI / 2}
            scale={[40, 4, 1]}
          />
        </Environment>

        <Ocean />
        <RainImpacts />
        <WorldObjects />
        <Boat />
        <FishSchool />
        <Angler />
        <ShaderWarmup />
        <PerfProbe />


        <OrbitControls
          ref={controls}
          makeDefault
          target={[0, 3.66, 12]}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          zoomSpeed={0.9}
          minDistance={6}
          maxDistance={70}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.15}
          mouseButtons={{
            LEFT: -1 as unknown as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
        />
        <FollowTarget controls={controls} />
        <Npcs />

        {gfx.bloom ? (
          <EffectComposer multisampling={gfx.multisampling}>
            <Bloom
              intensity={0.5}
              luminanceThreshold={1.5}
              luminanceSmoothing={0.1}
              mipmapBlur={false}
              radius={0.35}
            />
          </EffectComposer>
        ) : null}

      </Canvas>
      <HUD />
      <CatchPopup />
      <Hotbar />
      <WorldEditor />
      <LoadingScreen />
      <StartGate />

      <div className="pointer-events-none fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <WalletButton />
        <div className="flex items-center gap-2">
          <DocsPanel />
          <ExternalLinks />
          <GraphicsButton />
        </div>
        <QuestTracker />

      </div>
      <ProfilePanel />
      <CharacterSelect />
      <GoldPanel />
      <QuestPanel />
      <NpcDialog />
      <LeaderboardPanel />
      <ChatBox />
    </div>
  );
}
