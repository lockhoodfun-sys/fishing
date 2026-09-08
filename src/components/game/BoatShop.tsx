import { useEffect } from "react";
import { Coins, Gauge, Loader2 } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useBoatStore } from "@/hooks/useBoatStore";

/** Silhouette perahu 2D — makin cepat hullnya, makin ramping bentuknya. */
export function BoatIllustration({ speed }: { speed: number }) {
  const sleek = Math.min(1, Math.max(0, (speed - 100) / 200));
  const hull = `M8 ${58} L${72 - sleek * 6} ${58} L${64 - sleek * 10} ${72} L${18 - sleek * 4} 72 Z`;
  return (
    <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden>
      <path d={hull} fill="#7dd3fc" opacity="0.9" />
      <path
        d={`M22 ${58} L${30 + sleek * 6} ${40 - sleek * 8} L${54 + sleek * 4} ${40 - sleek * 8} L${58} ${58} Z`}
        fill="#38bdf8"
        opacity="0.85"
      />
      <rect x="30" y={42 - sleek * 8} width="20" height="8" rx="2" fill="#0f172a" opacity="0.55" />
      <path d="M4 78 Q20 72 40 78 T78 78" stroke="#e2e8f0" strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M6 86 Q24 80 44 86 T80 86" stroke="#e2e8f0" strokeWidth="2" fill="none" opacity="0.3" />
    </svg>
  );
}

/** Captain Vex's hull yard: kartu horizontal — kecepatan, harga, beli, pakai. */
export function BoatShop() {
  const proof = useProfileStore((s) => s.proof);
  const coins = Math.round(Number(useProfileStore((s) => s.profile?.coins) ?? 0));
  const level = Math.round(Number(useProfileStore((s) => s.profile?.level) ?? 1));
  const boats = useBoatStore((s) => s.boats);
  const loading = useBoatStore((s) => s.loading);
  const busyId = useBoatStore((s) => s.busyId);
  const error = useBoatStore((s) => s.error);
  const refresh = useBoatStore((s) => s.refresh);
  const buy = useBoatStore((s) => s.buy);
  const equip = useBoatStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  if (!proof) {
    return (
      <p className="text-sm text-slate-300">
        "Connect your wallet first — nobody sails off my pier on credit."
      </p>
    );
  }

  if (loading && boats.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Hauling hulls out of the yard…
      </p>
    );
  }

  if (error && boats.length === 0) {
    return <p className="text-sm text-rose-400">Could not load the boat catalog: {error}</p>;
  }

  if (boats.length === 0) {
    return <p className="text-sm text-slate-300">No boats are available right now.</p>;
  }

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {boats.map((b) => {
          const busy = busyId === b.boat_id;
          const locked = !b.owned && level < b.min_level;
          const affordable = coins >= b.price_coins;
          return (
            <div
              key={b.boat_id}
              className={`flex w-44 shrink-0 flex-col rounded-xl border-2 p-2.5 ${
                b.equipped
                  ? "border-amber-300/80 bg-amber-300/10"
                  : b.owned
                    ? "border-white/25 bg-white/[0.05]"
                    : locked
                      ? "border-white/10 bg-white/[0.02] opacity-60"
                      : "border-white/15 bg-white/[0.03]"
              }`}
            >
              <p className="text-center text-sm font-bold text-slate-100">{b.name}</p>
              {b.owned ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-emerald-400">
                  {b.equipped ? "Sailing" : "Owned"}
                </p>
              ) : locked ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                  Requires level {b.min_level}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-1 text-[12px] font-bold text-amber-300">
                  <Coins className="h-3.5 w-3.5" aria-hidden />
                  {b.price_coins.toLocaleString()}
                </p>
              )}

              <div className="my-2 h-24 rounded-lg bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.18),rgba(0,0,0,0.35)_70%)]">
                <BoatIllustration speed={b.speed_percent} />
              </div>

              <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200">
                <Gauge className="h-3.5 w-3.5 text-sky-400" aria-hidden />
                Speed: <span className="text-emerald-400">{b.speed_percent}%</span>
              </div>

              {b.owned ? (
                <button
                  type="button"
                  disabled={busy || b.equipped}
                  onClick={() => void equip(b.boat_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {b.equipped ? "In the water" : busy ? "Switching…" : "Sail this"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !affordable || locked}
                  onClick={() => void buy(b.boat_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {busy
                    ? "Buying…"
                    : locked
                      ? `Locked · Lv ${b.min_level}`
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