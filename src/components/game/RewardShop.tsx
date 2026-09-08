import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Timer } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useInventoryStore } from "@/hooks/useInventoryStore";
import { useGoldNpcStore } from "@/hooks/useGoldNpcStore";
import { getFishData } from "@/lib/fishRules";

function speciesRarity(id: string): string | null {
  return getFishData().species.find((s) => s.id === id)?.rarity ?? null;
}

/** mm:ss (or hh:mm:ss once past an hour) countdown to a target Date. */
function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function RewardShop() {
  const proof = useProfileStore((s) => s.proof);
  const items = useInventoryStore((s) => s.items);
  const status = useGoldNpcStore((s) => s.status);
  const loading = useGoldNpcStore((s) => s.loading);
  const claiming = useGoldNpcStore((s) => s.claiming);
  const error = useGoldNpcStore((s) => s.error);
  const lastClaim = useGoldNpcStore((s) => s.lastClaim);
  const refresh = useGoldNpcStore((s) => s.refresh);
  const claim = useGoldNpcStore((s) => s.claim);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  const stockByRarity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const rarity = speciesRarity(item.species_id);
      if (!rarity) continue;
      counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const countdown = useCountdown(status?.event?.expireAt ?? null);

  const onClaim = async () => {
    const ok = await claim();
    if (ok) {
      const result = useGoldNpcStore.getState().lastClaim;
      if (result) {
        toast.success(
          `+${result.goldEarned} gold` +
            (result.bonusEarned > 0 ? ` (includes ${result.bonusEarned} bonus)` : ""),
        );
      }
    } else {
      toast.error(useGoldNpcStore.getState().error ?? "The claim failed.");
    }
  };

  if (!proof) {
    return (
      <p className="text-sm text-slate-300">
        "Connect your wallet first, friend — I only deal with registered crews."
      </p>
    );
  }

  if (loading && !status) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking today's offer…
      </p>
    );
  }

  if (!status) {
    return <p className="text-sm text-rose-400">{error ?? "Could not reach the reward NPC."}</p>;
  }

  if (status.reason) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-300">"{status.reason}"</p>
        {status.tier === null && (
          <p className="text-xs text-slate-400">
            Current hold value: ${status.usdValue.toFixed(2)}
          </p>
        )}
      </div>
    );
  }

  if (!status.event) {
    return <p className="text-sm text-slate-300">"Come back at 00:00 UTC — that's when I set up shop."</p>;
  }

  const { event, claimProgress } = status;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          Deal closes in
        </span>
        <span className="font-semibold tabular-nums text-amber-300">{countdown}</span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Base trade · 1 gold per full package
        </p>
        <div className="space-y-1.5">
          {event.baseRequirement.map((req) => {
            const have = stockByRarity.get(req.rarity) ?? 0;
            const packages = Math.floor(have / req.qty);
            return (
              <div
                key={req.rarity}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs"
              >
                <span className="capitalize text-slate-200">{req.rarity}</span>
                <span className="tabular-nums text-slate-300">
                  {have} / {req.qty} ({packages} pkg)
                </span>
              </div>
            );
          })}
        </div>
        {claimProgress && claimProgress.basePackagesClaimed > 0 && (
          <p className="text-[11px] text-slate-400">
            Already claimed {claimProgress.basePackagesClaimed} package(s) from this visit.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Bonus · once per visit{claimProgress?.bonusClaimed ? " (claimed)" : ""}
        </p>
        <div className="space-y-1.5">
          {event.bonusRequirement.map((req) => {
            const have = stockByRarity.get(req.rarity) ?? 0;
            return (
              <div
                key={req.rarity}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs"
              >
                <span className="capitalize text-slate-200">{req.rarity}</span>
                <span className="tabular-nums text-slate-300">
                  {have} / {req.qty} · +{req.gold} gold
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={claiming}
        onClick={onClaim}
        className="w-full rounded-lg bg-amber-400/90 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-300 disabled:opacity-50"
      >
        {claiming ? "Trading…" : "Claim gold"}
      </button>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {claimProgress && (
        <p className="text-[11px] text-slate-400">
          Total gold earned this visit: {claimProgress.totalGoldEarned}
        </p>
      )}
    </div>
  );
}
