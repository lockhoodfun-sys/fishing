import { useEffect } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useBaitStore } from "@/hooks/useBaitStore";
import { baitLook } from "@/lib/baitLooks";

/** Gambar umpan 2D per tier — bentuknya mengikuti model di air. */
export function BaitOrb({ baitId }: { baitId: string }) {
  const look = baitLook(baitId);
  const id = `bait-${baitId}`;
  const fill = `url(#${id})`;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={id} cx="40%" cy="35%">
          <stop offset="0%" stopColor={look.accent} />
          <stop offset="55%" stopColor={look.core} />
          <stop offset="100%" stopColor={look.shell} />
        </radialGradient>
      </defs>
      {look.glow > 0 && (
        <circle cx="50" cy="52" r={30 + look.glow * 14} fill={look.core} opacity={0.1 + look.glow * 0.18} />
      )}
      {look.shape === "grub" && (
        <>
          <ellipse cx="50" cy="54" rx="17" ry="26" fill={fill} transform="rotate(-20 50 54)" />
          <circle cx="58" cy="34" r="8" fill={look.shell} />
        </>
      )}
      {look.shape === "cluster" && (
        <>
          <circle cx="44" cy="44" r="17" fill={fill} />
          <circle cx="62" cy="55" r="13" fill={fill} />
          <circle cx="45" cy="68" r="11" fill={fill} />
        </>
      )}
      {look.shape === "crystal" && (
        <>
          <polygon points="50,18 72,52 50,86 28,52" fill={fill} />
          <polygon points="50,18 72,52 50,52" fill={look.accent} opacity="0.35" />
        </>
      )}
      {look.shape === "rune" && (
        <>
          <circle cx="50" cy="52" r="24" fill="none" stroke={look.accent} strokeWidth="2.5" opacity="0.75" />
          <polygon points="50,28 71,64 29,64" fill={fill} />
          <circle cx="50" cy="55" r="7" fill={look.shell} />
        </>
      )}
      {look.shape === "flame" && (
        <>
          <path d="M50 16 C66 40 72 56 62 72 C56 82 44 82 38 72 C28 56 34 40 50 16 Z" fill={fill} />
          <path d="M50 42 C58 56 58 66 50 74 C42 66 42 56 50 42 Z" fill={look.accent} opacity="0.7" />
        </>
      )}
      {look.shape === "void" && (
        <>
          <polygon points="50,20 76,38 76,66 50,84 24,66 24,38" fill={fill} />
          <ellipse cx="50" cy="52" rx="36" ry="12" fill="none" stroke={look.core} strokeWidth="2" opacity="0.7" />
          <ellipse
            cx="50"
            cy="52"
            rx="34"
            ry="11"
            fill="none"
            stroke={look.accent}
            strokeWidth="1.4"
            opacity="0.6"
            transform="rotate(40 50 52)"
          />
        </>
      )}
      <ellipse cx="41" cy="40" rx="6" ry="4" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}


/** Pip's bait stock: kartu horizontal — luck, harga, beli, pakai. */
export function BaitShop() {
  const proof = useProfileStore((s) => s.proof);
  const coins = Math.round(Number(useProfileStore((s) => s.profile?.coins) ?? 0));
  const level = Math.round(Number(useProfileStore((s) => s.profile?.level) ?? 1));
  const baits = useBaitStore((s) => s.baits);
  const loading = useBaitStore((s) => s.loading);
  const busyId = useBaitStore((s) => s.busyId);
  const error = useBaitStore((s) => s.error);
  const refresh = useBaitStore((s) => s.refresh);
  const buy = useBaitStore((s) => s.buy);
  const equip = useBaitStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  if (!proof) {
    return (
      <p className="text-sm text-slate-300">
        "Connect your wallet first — worms aren't free, friend."
      </p>
    );
  }

  if (loading && baits.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Digging through the bait crates…
      </p>
    );
  }

  if (error && baits.length === 0) {
    return <p className="text-sm text-rose-400">Could not load the bait catalog: {error}</p>;
  }

  if (baits.length === 0) {
    return <p className="text-sm text-slate-300">No bait is available right now.</p>;
  }

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {baits.map((bait) => {
          const busy = busyId === bait.bait_id;
          const locked = !bait.owned && level < bait.min_level;
          const affordable = coins >= bait.price_coins;
          const look = baitLook(bait.bait_id);
          return (
            <div
              key={bait.bait_id}
              className={`flex w-44 shrink-0 flex-col rounded-xl border-2 p-2.5 ${
                bait.equipped
                  ? "border-amber-300/80 bg-amber-300/10"
                  : bait.owned
                    ? "border-white/25 bg-white/[0.05]"
                    : locked
                      ? "border-white/10 bg-white/[0.02] opacity-60"
                      : "border-white/15 bg-white/[0.03]"
              }`}
            >
              <p className="text-center text-sm font-bold text-slate-100">{bait.name}</p>
              {bait.owned ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-emerald-400">
                  {bait.equipped ? "In use" : "Owned"}
                </p>
              ) : locked ? (
                <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                  Requires level {bait.min_level}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-1 text-[12px] font-bold text-amber-300">
                  <Coins className="h-3.5 w-3.5" aria-hidden />
                  {bait.price_coins.toLocaleString()}
                </p>
              )}

              <div
                className="my-2 h-28 rounded-lg"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${look.core}33, rgba(0,0,0,0.35) 70%)`,
                }}
              >
                <BaitOrb baitId={bait.bait_id} />
              </div>

              <div className="rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold leading-5 text-slate-200">
                <p>
                  Luck: <span className="text-emerald-400">{bait.luck_percent}%</span>
                </p>
              </div>

              {bait.owned ? (
                <button
                  type="button"
                  disabled={busy || bait.equipped}
                  onClick={() => void equip(bait.bait_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {bait.equipped ? "Equipped" : busy ? "Switching…" : "Use bait"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !affordable || locked}
                  onClick={() => void buy(bait.bait_id)}
                  className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {busy
                    ? "Buying…"
                    : locked
                      ? `Locked · Lv ${bait.min_level}`
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