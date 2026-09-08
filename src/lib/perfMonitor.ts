/**
 * Rigorous, renderer-agnostic performance monitor for GoFish.
 *
 * Why this exists: the only prior instrumentation was `window.__perf()`
 * (see GameCanvas.tsx PerfProbe), which returns a single instantaneous
 * snapshot of `gl.info` for whatever frame happens to be current when you
 * call it by hand in the console. That is not a measurement, it's a sample
 * of size 1 with no timing context - see docs/PERF_PLAN.md "Invalid prior
 * metrics" for the full list of problems with it.
 *
 * This module instead:
 *  - Times frames with `requestAnimationFrame`, independent of R3F's
 *    internal render loop, so it also captures time spent OUTSIDE Three's
 *    render call (React reconciliation, zustand subscribers, DOM/HUD
 *    updates) — the thing users actually perceive as jank.
 *  - Records long tasks via PerformanceObserver('longtask') to catch
 *    main-thread stalls that don't show up as a single slow rAF frame
 *    (e.g. work queued in a microtask/timeout between frames).
 *  - Samples renderer draw calls/triangles/geometries/textures every frame
 *    via the WebGLRenderer.info object already exposed on `gl`.
 *  - Reports percentiles (p50/p95/p99), not just mean FPS, because mean FPS
 *    hides stutter — a session that's 60fps 95% of the time and drops to
 *    15fps for a second averages out looking fine.
 *  - Is a no-op until armed, so it costs nothing in production and doesn't
 *    change what's being measured (avoids Heisenberg effects from e.g.
 *    console.log-per-frame, which itself costs several ms).
 */

export interface FrameSample {
  /** ms since monitor start */
  t: number;
  /** wall-clock ms between this rAF callback and the previous one */
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

export interface PerfReport {
  durationMs: number;
  frames: number;
  fpsAvg: number;
  frameMs: { p50: number; p75: number; p95: number; p99: number; max: number };
  /** frames whose frameMs exceeded 1.5x the 60fps budget (>25ms) */
  janky: number;
  jankyPct: number;
  longTasks: { count: number; totalMs: number; longest: number };
  drawCalls: { p50: number; p95: number; max: number };
  triangles: { p50: number; p95: number; max: number };
  dpr: number;
  raw: FrameSample[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

export class PerfMonitor {
  private samples: FrameSample[] = [];
  private longTasks: PerformanceEntry[] = [];
  private observer?: PerformanceObserver;
  private rafId = 0;
  private lastT = 0;
  private startT = 0;
  private running = false;
  private getInfo: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number };
  private getDpr: () => number;

  constructor(
    getInfo: PerfMonitor["getInfo"],
    getDpr: PerfMonitor["getDpr"] = () => window.devicePixelRatio,
  ) {
    this.getInfo = getInfo;
    this.getDpr = getDpr;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.samples = [];
    this.longTasks = [];
    this.startT = performance.now();
    this.lastT = this.startT;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.longTasks.push(entry);
      });
      this.observer.observe({ type: "longtask", buffered: true });
    } catch {
      // longtask not supported (e.g. Firefox); frameMs percentiles still work.
    }

    const tick = () => {
      const now = performance.now();
      const frameMs = now - this.lastT;
      this.lastT = now;
      const info = this.getInfo();
      this.samples.push({
        t: now - this.startT,
        frameMs,
        drawCalls: info.calls,
        triangles: info.triangles,
        geometries: info.geometries,
        textures: info.textures,
        programs: info.programs,
      });
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): PerfReport {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.observer?.disconnect();

    // Drop the first sample: its frameMs measures the gap since start(),
    // not a real frame, and would skew p50 on short sessions.
    const frames = this.samples.slice(1);
    const frameMs = frames.map((f) => f.frameMs).sort((a, b) => a - b);
    const draws = frames.map((f) => f.drawCalls).sort((a, b) => a - b);
    const tris = frames.map((f) => f.triangles).sort((a, b) => a - b);
    const durationMs = performance.now() - this.startT;
    const janky = frames.filter((f) => f.frameMs > 25).length;

    return {
      durationMs,
      frames: frames.length,
      fpsAvg: frames.length / (durationMs / 1000),
      frameMs: {
        p50: percentile(frameMs, 50),
        p75: percentile(frameMs, 75),
        p95: percentile(frameMs, 95),
        p99: percentile(frameMs, 99),
        max: frameMs[frameMs.length - 1] ?? 0,
      },
      janky,
      jankyPct: frames.length ? (100 * janky) / frames.length : 0,
      longTasks: {
        count: this.longTasks.length,
        totalMs: this.longTasks.reduce((s, e) => s + e.duration, 0),
        longest: this.longTasks.reduce((m, e) => Math.max(m, e.duration), 0),
      },
      drawCalls: { p50: percentile(draws, 50), p95: percentile(draws, 95), max: draws[draws.length - 1] ?? 0 },
      triangles: { p50: percentile(tris, 50), p95: percentile(tris, 95), max: tris[tris.length - 1] ?? 0 },
      dpr: this.getDpr(),
      raw: this.samples,
    };
  }
}
