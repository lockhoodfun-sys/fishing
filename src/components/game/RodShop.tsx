import { useEffect } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useRodStore } from "@/hooks/useRodStore";
import { rodLook } from "@/lib/rodLooks";

/** Gambar pancing 2D per tier — bentuk dan ornamennya beda tiap rarity. */
export function RodIllustration({ rodId, glow }: { rodId: string; glow: number }) {
  const look = rodLook(rodId);
  const w = look.blankRadius[0] * 46;
  return (
    <svg viewBox="0 0 80 130" className="h-full w-full" aria-hidden>
      {glow > 0 && (
        <circle cx="40" cy="62" r="34" fill={look.accent} opacity={0.12 + glow * 0.15} />
      )}
      {/* blank (batang) */}
      <line x1="34" y1="112" x2="52" y2="18" stroke={look.blank} strokeWidth={w} strokeLinecap="round" />
      {/* tip */}
      <line x1="50" y1="26" x2="52" y2="18" stroke={look.tip} strokeWidth={w * 0.6} strokeLinecap="round" />
      {/* guide rings */}
      {[96, 78, 60, 42].map((y, i) => (
        <circle key={y} cx={35.5 + i * 1.1} cy={y} r="2.4" fill="none" stroke={look.accent} strokeWidth="1.2" />
      ))}
      {/* ornamen permata khas tier */}
      {Array.from({ length: look.gems }, (_, i) => (
        <polygon
          key={i}
          points="0,-3.2 2.6,0 0,3.2 -2.6,0"
          fill={look.accent}
          opacity="0.95"
          transform={`translate(${37 + i * 0.9}, ${104 - i * 14})`}
        />
      ))}
      {/* sayap ornamen untuk legendary / mythic */}
      {(look.shape === "ornate" || look.shape === "ethereal") && (
        <>
          <path d="M34 100 L22 88 L34 92 Z" fill={look.accent} opacity="0.85" />
          <path d="M36 100 L48 88 L36 92 Z" fill={look.accent} opacity="0.85" />
        </>
      )}
      {look.shape === "ethereal" && (
        <ellipse cx="35" cy="100" rx="13" ry="4.5" fill="none" stroke={look.accent} strokeWidth="1" opacity="0.7" />
      )}
      {/* grip */}
      <line
        x1="32"
        y1="122"
        x2="34"
        y2="106"
        stroke={look.grip}
        strokeWidth={look.gripRadius * 58}
        strokeLinecap={look.shape === "wood" ? "square" : "round"}
      />
      {/* reel */}
      <rect x="38" y="92" width="13" height="13" rx={look.shape === "wood" ? 1 : 5} fill={look.accent} opacity="0.9" />
      <circle cx="44.5" cy="98.5" r="3.4" fill={look.blank} />
    </svg>
  );
}


/** Old Bram's rod stock: kartu horizontal — stat, harga, beli, pakai. */
export function RodShop() {
  const proof = useProfileStore((s) => s.proof);
  const coins = Math.round(Number(useProfileStore((s) => s.profile?.coins) ?? 0));
  const level = Math.round(Number(useProfileStore((s) => s.profile?.level) ?? 1));
  const rods = useRodStore((s) => s.rods);
  const loading = useRodStore((s) => s.loading);
  const busyId = useRodStore((s) => s.busyId);
  const error = useRodStore((s) => s.error);
  const refresh = useRodStore((s) => s.refresh);
  const buy = useRodStore((s) => s.buy);
  const equip = useRodStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  if (!proof) {
    return (
      <p className="text-sm text-slate-300">
        "Connect your wallet first — I don't hand out carbon on credit."
      </p>
    );
  }

  if (loading && rods.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Pulling rods off the rack…
      </p>
    );
  }

  if (error && rods.length === 0) {
    return <p className="text-sm text-rose-400">Could not load the rod catalog: {error}</p>;
  }

  if (rods.length === 0) {
    return <p className="text-sm text-slate-300">No rods are available right now.</p>;
  }

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {rods.map((rod) => {
          const busy = busyId === rod.rod_id;
          const locked = !rod.owned && level < rod.min_level;
          const affordable = coins >= rod.price_coins;
          const look = rodLook(rod.rod_id);
          return (
            <div
              key={rod.rod_id}
              className={`flex w-44 shrink-0 flex-col rounded-xl border-2 p-2.5 ${
                rod.equipped
                  ? "border-amber-300/80 bg-amber-300/10"
                  : rod.owned
                    ? "border-white/25 bg-white/[0.05]"
                    : locked
                      ? "border-white/10 bg-white/[0.02] opacity-60"
                      : "border-white/15 bg-white/[0.03]"
              }`}
            >
              <p className="text-center text-sm font-bold text-slate-100">{rod.name}</p>
              {rod.owned ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-emerald-400">
                  {rod.equipped ? "In use" : "Owned"}
                </p>
              ) : locked ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                  Requires level {rod.min_level}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-1 text-[12px] font-bold text-amber-300">
                  <Coins className="h-3.5 w-3.5" aria-hidden />
                  {rod.price_coins.toLocaleString()}
                </p>
              )}

              <div
                className="my-2 h-28 rounded-lg"
                style={{
                  background: `radial-gradient(circle at 50% 45%, ${look.accent}22, rgba(0,0,0,0.35) 70%)`,
                }}
              >
                <RodIllustration rodId={rod.rod_id} glow={look.glow} />
              </div>

              <div className="rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold leading-5 text-slate-200">
                <p>
                  Luck: <span className="text-emerald-400">{rod.luck_percent}%</span>
                </p>
                <p>
                  Speed: <span className="text-emerald-400">{rod.speed_percent}%</span>
                </p>
                <p>
                  Weight: <span className="text-sky-400">{rod.max_catch_weight_kg.toLocaleString()}kg</span>
                </p>
              </div>

              {rod.owned ? (
                <button
                  type="button"
                  disabled={busy || rod.equipped}
                  onClick={() => void equip(rod.rod_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {rod.equipped ? "Equipped" : busy ? "Switching…" : "Use rod"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !affordable || locked}
                  onClick={() => void buy(rod.rod_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {busy
                    ? "Buying…"
                    : locked
                      ? `Locked · Lv ${rod.min_level}`
                      : affordable
                        ? "Buy"
                        : "Not enough coins"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}