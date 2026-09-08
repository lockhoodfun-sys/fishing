#!/usr/bin/env node
/**
 * Reproducible before/after GoFish benchmark, driven with real Chrome via
 * Playwright (not headless-only Chromium quirks — pass --headed to eyeball
 * it, and prefer `channel: 'chrome'` below if you need parity with a user's
 * actual browser/GPU driver).
 *
 * What it measures per run:
 *  - JS frame pacing (frameMs p50/p95/p99, % janky frames >25ms) via
 *    window.__perfSession (src/lib/perfMonitor.ts), NOT gl.info alone.
 *  - Chrome tracing categories devtools.timeline + disabled-by-default-v8.cpu_profiler
 *    to separate "Layout/Recalc/Script" (JS) from "GPU"/"Raster" buckets in
 *    the resulting .json.gz trace, importable in chrome://tracing or the
 *    DevTools Performance panel for a visual before/after diff.
 *  - Long tasks (>50ms main-thread blocking) count/total, from the same
 *    PerformanceObserver used in the browser session.
 *  - Renderer counters (draw calls, triangles) percentiles, to attribute
 *    frame cost to scene complexity rather than just "GPU is slow".
 *
 * Usage:
 *   node scripts/perf-bench.mjs --url http://localhost:5173 --tier high \
 *        --duration 20000 --out /mnt/documents/perf-high-before.json
 *
 * Run this identically before and after a change (same tier, same duration,
 * same machine, same tab focused/visible, nothing else on the page doing
 * work) — only then is the diff attributable to the code change.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const url = arg("url", "http://localhost:5173");
const tier = arg("tier", "high"); // low | medium | high
const durationMs = Number(arg("duration", "20000"));
const out = arg("out", `/mnt/documents/perf-${tier}-${Date.now()}.json`);
const tracePath = out.replace(/\.json$/, ".trace.zip");

async function main() {
  const browser = await chromium.launch({
    channel: "chrome", // real Chrome, not the Playwright-bundled Chromium build
    args: ["--enable-gpu-benchmarking", "--disable-frame-rate-limit"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  const page = await context.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page error]", m.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });

  // Set the graphics tier deterministically instead of relying on
  // hardwareConcurrency-based auto-detect, which makes runs non-reproducible
  // across machines (see src/hooks/useGraphics.ts detectTier()).
  await page.evaluate((t) => localStorage.setItem("gofish.gfx", t), tier);
  await page.reload({ waitUntil: "networkidle" });

  // Wait for the loading screen to clear and the canvas + __perfSession to exist.
  await page.waitForFunction(() => !!(window).__perfSession, null, { timeout: 30000 });
  await page.waitForTimeout(4000); // let shader warmup / MIN_VISIBLE_MS loading screen settle

  await page.evaluate(() => (window).__perfSession.start());
  await page.waitForTimeout(durationMs);
  const report = await page.evaluate(() => (window).__perfSession.stop());

  await context.tracing.stop({ path: tracePath });

  const result = { url, tier, durationMs, timestamp: new Date().toISOString(), report: { ...report, raw: undefined } };
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nTrace saved to ${tracePath} (open in chrome://tracing or DevTools > Performance > Load profile)`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
