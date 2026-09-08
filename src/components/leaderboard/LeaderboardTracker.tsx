import { useEffect } from "react";
import { ChevronRight, Crown, Loader2, Medal, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useLeaderboardStore } from "@/hooks/useLeaderboardStore";
import { useLeaderboardAvatars } from "@/hooks/useLeaderboardAvatars";
import type { LeaderboardEntry, LeaderboardSort } from "@/lib/leaderboard.functions";

const SORTS: { value: LeaderboardSort; label: string }[] = [
  { value: "xp", label: "Level" },
  { value: "coins", label: "Coins" },
  { value: "fish", label: "Fish" },
];

const TRACKER_LIMIT = 5;

function statFor(entry: LeaderboardEntry, sortBy: LeaderboardSort) {
  if (sortBy === "coins") return Math.round(entry.coins).toLocaleString();
  if (sortBy === "fish") return entry.total_fish.toLocaleString();
  return `Lv.${entry.level}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 ring-1 ring-amber-300/30">
        <Crown className="h-3 w-3" aria-hidden />
      </span>
    );
  if (rank === 2 || rank === 3)
    return (
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${
          rank === 2
            ? "bg-slate-300/15 text-slate-300 ring-slate-300/30"
            : "bg-orange-400/15 text-orange-400 ring-orange-400/30"
        }`}
      >
        <Medal className="h-3 w-3" aria-hidden />
      </span>
    );
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold tabular-nums text-slate-400">
      {rank}
    </span>
  );
}

function MiniRow({
  entry,
  sortBy,
  highlight,
  avatarUrl,
}: {
  entry: LeaderboardEntry;
  sortBy: LeaderboardSort;
  highlight: boolean;
  avatarUrl: string | null | undefined;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors ${
        highlight ? "bg-sky-500/15 ring-1 ring-sky-400/40" : "hover:bg-white/5"
      }`}
    >
      <RankBadge rank={entry.rank} />
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="text-[8px]">
          {(entry.display_name || entry.username).slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-50">
        {entry.display_name || entry.username}
      </span>
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-amber-200">
        {statFor(entry, sortBy)}
      </span>
    </div>
  );
}

/**
 * Always-on leaderboard HUD docked top-left, mirroring how QuestTracker
 * keeps the top-right quest visible without a click — shows the top ranks
 * plus the viewer's own rank immediately. Clicking the header or footer
 * still opens LeaderboardPanel for the full top-50 list.
 */
export function LeaderboardTracker() {
  const profile = useProfileStore((s) => s.profile);
  const proof = useProfileStore((s) => s.proof);
  const sortBy = useLeaderboardStore((s) => s.sortBy);
  const setSortBy = useLeaderboardStore((s) => s.setSortBy);
  const entries = useLeaderboardStore((s) => s.entries);
  const me = useLeaderboardStore((s) => s.me);
  const loading = useLeaderboardStore((s) => s.loading);
  const loaded = useLeaderboardStore((s) => s.loaded);
  const error = useLeaderboardStore((s) => s.error);
  const refresh = useLeaderboardStore((s) => s.refresh);
  const setPanelOpen = useLeaderboardStore((s) => s.setPanelOpen);

  useEffect(() => {
    if (proof) void refresh();
    // Only re-fetch when the wallet proof itself changes — setSortBy already
    // triggers its own refresh, so depending on it here would double-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proof]);

  const avatars = useLeaderboardAvatars(entries, me);

  if (!profile) return null;

  const top = entries.slice(0, TRACKER_LIMIT);
  const meInView = !!me && top.some((e) => e.wallet_address === me.wallet_address);

  return (
    <div className="pointer-events-auto w-48 rounded-xl border border-white/20 bg-slate-900/60 p-2 text-slate-50 shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex w-full items-center gap-1 text-left text-[10px] font-bold uppercase tracking-wide text-amber-300 hover:text-amber-200"
        title="Open full leaderboard"
      >
        <Trophy className="h-3 w-3 shrink-0" aria-hidden />
        Leaderboard
      </button>

      <div className="mt-1.5 flex gap-0.5">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSortBy(s.value)}
            className={`flex-1 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide transition-colors ${
              sortBy === s.value
                ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/40"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}

      {loading && !loaded ? (
        <div className="flex items-center justify-center py-2.5 text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        </div>
      ) : (
        <div className="mt-1.5 space-y-0">
          {top.map((entry) => (
            <MiniRow
              key={entry.wallet_address}
              entry={entry}
              sortBy={sortBy}
              highlight={!!me && entry.wallet_address === me.wallet_address}
              avatarUrl={avatars[entry.wallet_address]}
            />
          ))}
          {top.length === 0 && (
            <p className="py-1.5 text-center text-[10px] text-slate-400">No anglers ranked yet.</p>
          )}
          {me && !meInView && (
            <>
              <div className="my-0.5 border-t border-white/10" />
              <MiniRow
                entry={me}
                sortBy={sortBy}
                highlight
                avatarUrl={avatars[me.wallet_address]}
              />
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-white/5 px-1.5 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100"
      >
        View full
        <ChevronRight className="h-2.5 w-2.5" aria-hidden />
      </button>
    </div>
  );
}