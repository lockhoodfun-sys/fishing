/**
 * XP curve mirroring the database (public.level_for_xp, see
 * drizzle/migrations/0001_seed_gameplay_and_xp.sql):
 *   level N requires 100 * (N-1)^2 total XP  -> 1: 0, 2: 100, 3: 400, 4: 900, ...
 * This used to be a flat 500 XP/level here, which desynced the client
 * progress bar from the real (server-authoritative) level. Keep this in
 * sync with level_for_xp() if that SQL function ever changes.
 */

const XP_LEVEL_BASE = 100;

/** Total XP required to REACH `level` (i.e. XP floor for that level). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return XP_LEVEL_BASE * (n - 1) ** 2;
}

/** Mirrors public.level_for_xp(_xp): floor(sqrt(xp/100)) + 1, clamped to >= 1. */
export function levelForXp(xp: number): number {
  const safeXp = Math.max(0, xp);
  return Math.max(1, Math.floor(Math.sqrt(safeXp / XP_LEVEL_BASE)) + 1);
}

export interface XpProgress {
  level: number;
  total: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP needed to finish the current level. */
  span: number;
  percent: number;
}

export function xpProgressFor(xp: number | null | undefined): XpProgress {
  const total = Math.max(0, Math.round(Number(xp ?? 0)));
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - floor);
  const into = Math.min(span, total - floor);
  return { level, total, into, span, percent: Math.round((into / span) * 100) };
}

/** XP awarded for a catch — mirrors public.xp_for_rarity + mutation multiplier. */
export function xpForCatch(rarity: string, mutationMultiplier = 1): number {
  const base =
    rarity === "common" ? 10
    : rarity === "rare" ? 25
    : rarity === "epic" ? 60
    : rarity === "legendary" ? 150
    : rarity === "mythic" ? 400
    : 5;
  return Math.max(1, Math.round(base * mutationMultiplier));
}