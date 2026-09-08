# GoFish performance instrumentation audit & before/after measurement plan

## 1. What exists today (audit)

Grep of the whole `src/` tree for timing/profiling primitives
(`performance.now`, `PerformanceObserver`, `requestAnimationFrame`,
`stats.js`, any FPS counter) turns up exactly three hits, none of which is
a benchmark:

- `src/components/game/GameCanvas.tsx:98-114` (pre-change) — `PerfProbe`,
  which defines `window.__perf()`. It returns `gl.info.render.calls`,
  `gl.info.render.triangles`, `gl.info.programs.length`,
  `gl.info.memory.geometries/textures` **at the instant you call it**.
- `src/components/game/Boat.tsx:205` — `performance.now()` used only to
  seed a sine-wave phase for buoyancy animation, not for timing.
- `src/hooks/useBoat.ts:128` — same pattern, `performance.now()` as an
  animation clock input, not a measurement.

There is no FPS counter, no frame-time histogram, no long-task tracking, no
GPU timer query, no Playwright/CI benchmark harness, and no recorded
baseline numbers anywhere in the repo (`find . -iname "*perf*"` and
`*playwright*` outside `node_modules` return nothing). Graphics quality is
controlled by `src/hooks/useGraphics.ts:27-70` (`GRAPHICS.low/medium/high`
presets: dpr, shadows, bloom, multisampling, particle counts, NPC draw
distance) but no measurement ever confirmed what those presets actually
cost.

## 2. Why `window.__perf()` is invalid/misleading as a performance metric

1. **Single sample, arbitrary instant.** It reads whichever frame is "last
   rendered" when a human types the command in DevTools. Frame cost varies
   frame-to-frame (fish AI ticks, wave geometry updates in
   `Ocean.tsx:250`, weather particle updates in `Weather.tsx:99/184/255`
   aren't synchronized), so one sample tells you nothing about the
   distribution.
2. **No time dimension.** Draw calls/triangles say nothing about how long
   the frame took in ms — that's a function of GPU fill-rate, shader
   complexity and CPU submission overhead, not just call count. A tier with
   *fewer* draw calls can still run *slower* (e.g. bloom's extra
   `EffectComposer` passes, `GameCanvas.tsx:238-248`).
3. **Measured by hand, not scripted → not reproducible.** There's no
   recorded methodology for *when* during a session, *which* camera
   position, *which* weather (`Weather` presets change particle counts),
   or *how long after load* people ran it. Any two "before" and "after"
   numbers collected this way are not comparable.
4. **Ignores everything outside `gl.info`**: React re-renders, HUD/DOM
   updates, zustand subscriptions, physics (`worldPhysics.ts`,
   `hullBVH.ts`), and browser compositing/paint. A change that makes
   Three's draw call count go down while adding expensive React state
   updates would look like a win on `__perf()` and be a loss for the
   player.
5. **No JS/GPU split, no pacing, no jank.** It cannot distinguish "the CPU
   is busy building the scene graph" from "the GPU is fill-rate bound",
   and it says nothing about stutter (a session can average 60fps and
   still feel bad if 5% of frames spike to 100ms — mean/instant sampling
   hides exactly that).

**Conclusion: any prior claim of the form "optimization X reduced draw
calls from N to M" or "__perf() showed improvement" should be treated as
non-evidence of a frame-rate or smoothness improvement.** It may be true
and even causally related, but it was never actually measured.

## 3. What "trustworthy" requires

To separate JS frame time, GPU/draw cost, long tasks, frame pacing, draw
calls/triangles, DPR effects and shadow cost, and to compare Low vs High
tier honestly, a measurement needs:

- **A scripted, deterministic session** (same URL, same graphics tier set
  via `localStorage["gofish.gfx"]` — not the `hardwareConcurrency`
  auto-detect in `useGraphics.ts:79-90`, which is machine-dependent — same
  duration, same camera/scene state, same weather).
- **Real Chrome**, not just headless default Chromium, since GPU
  rasterization/compositing paths differ (Playwright's `channel: "chrome"`).
- **A warm-up period excluded from the sample window**, so shader
  compilation (`ShaderWarmup`, `GameCanvas.tsx:74-92`, 800 ms timeout) and
  asset loading (`LoadingScreen.tsx`, `MIN_VISIBLE_MS = 3200`) don't
  contaminate steady-state numbers.
- **Distribution statistics (p50/p95/p99/max), not a single average**, to
  see pacing/jank, not just throughput.
- **A JS-side timer independent of Three's own render loop** (rAF-based),
  so time spent in React/HUD/zustand outside `gl.render()` is counted too.
- **Long task tracking** (`PerformanceObserver({type:'longtask'})`) to
  catch main-thread stalls that don't manifest as one slow rAF callback
  (e.g. work split across microtasks/timers).
- **A Chrome trace** for the same window, to visually/quantitatively split
  Scripting vs Rendering vs Painting vs GPU time in the DevTools
  Performance panel — this is the only reliable way to separate "JS frame
  time" from "GPU/draw cost" without vendor-specific GPU timer extensions.
- **Renderer counters sampled every frame** (draw calls, triangles,
  geometries, textures) correlated with the frame-time series, not read
  once.
- **DPR and shadow cost isolated as independent variables**: run the same
  scene/tier with only `dpr` overridden, and only `shadows` toggled, to
  attribute cost correctly instead of conflating tier changes (tier bundles
  dpr + shadows + bloom + particle count + NPC distance all together, see
  `useGraphics.ts:27-70`).

## 4. What was built (this change)

### 4.1 `src/lib/perfMonitor.ts` — `PerfMonitor`
A rAF-driven session recorder, independent of R3F's internal loop:
- Per frame: wall-clock `frameMs` (via `performance.now()` deltas),
  `gl.info.render.{calls,triangles}`, `gl.info.memory.{geometries,textures}`,
  program count.
- `PerformanceObserver('longtask')` running in parallel, to catch >50ms
  main-thread blocking tasks anywhere (React, physics, audio, etc.), not
  just inside Three's render.
- `stop()` returns percentiles (p50/p75/p95/p99/max) for frame time, draw
  calls and triangles, plus `fpsAvg`, `jankyPct` (frames >25ms, i.e. worse
  than 40fps), and long-task count/total/longest.
- Zero cost until `start()` is called; drops the first sample (it measures
  "time since start()", not a frame) to avoid skewing p50 on short runs.

### 4.2 `src/components/game/GameCanvas.tsx`
`PerfProbe` now also exposes `window.__perfSession = { start(), stop() }`
wired to a `PerfMonitor` reading the same `gl` instance already available
via `useThree()`. `window.__perf()` (instant snapshot) is left in place for
quick manual sanity checks but is now documented as not a benchmark.
`stop()` prints a `console.table` summary and returns the full `PerfReport`
object (JSON-serializable, minus the raw per-frame array unless needed).

### 4.3 `scripts/perf-bench.mjs`
A Playwright driver for reproducible before/after runs in real Chrome:
- Launches `channel: "chrome"` with `--disable-frame-rate-limit` so the
  session isn't capped by vsync when comparing raw JS+GPU cost.
- Sets `localStorage["gofish.gfx"]` to a fixed tier before reload, so tier
  is a controlled variable rather than autodetected.
- Waits for `window.__perfSession` to exist and for load/shader-warmup
  settle time, then runs a fixed-duration session via
  `__perfSession.start()/stop()`.
- Simultaneously records a Chrome trace (`context.tracing`) covering the
  same window, saved as `<out>.trace.zip` for import into
  `chrome://tracing` or DevTools Performance (load profile) — this is
  where JS-vs-GPU/paint/raster time is actually visible.
- Writes a JSON result file with tier, duration, timestamp and the full
  `PerfReport` summary, suitable for diffing two runs programmatically.

`playwright` is not yet a project dependency — add it (`bun add -D
playwright`) and install the Chrome channel (`bunx playwright install
chrome`) before running the script.

## 5. Exact before/after protocol to run

For each of `{low, medium, high}` tier and for `{no shadows, shadows}` /
`{dpr=1, dpr=devicePixelRatio}` as isolated overrides:

```bash
node scripts/perf-bench.mjs --url http://localhost:5173 --tier high \
  --duration 20000 --out /mnt/documents/perf-high-before.json
# ...apply the code change under test...
node scripts/perf-bench.mjs --url http://localhost:5173 --tier high \
  --duration 20000 --out /mnt/documents/perf-high-after.json
```

Run each pair **3 times** and compare medians (single runs are noisy from
OS/browser scheduling); keep the machine idle otherwise, same window
size/focus state, same time of day in-game (day/night cycle changes
lighting cost via `useDayNight`).

Then diff, per tier:
- `frameMs.p50/p95/p99` and `jankyPct` → pacing/stutter (the metric users
  actually feel).
- `fpsAvg` → throughput, secondary to pacing.
- `longTasks.count/totalMs` → main-thread stalls outside the render loop.
- `drawCalls.p50/triangles.p50` → scene cost, to confirm *why* frame time
  changed, not just *that* it did.
- Open both `.trace.zip` files in DevTools Performance and compare the
  Scripting/Rendering/Painting/GPU time buckets side by side — this is the
  authoritative JS-vs-GPU split; the JSON report alone cannot fully
  separate GPU-bound stalls (e.g. shadow map fill-rate) from JS cost.

A change is only a genuine improvement if `frameMs.p95` and `jankyPct`
both improve (or hold) in the after run across at least 3 repeated
sessions per tier — not if `window.__perf()` shows fewer draw calls.
