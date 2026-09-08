import { Trophy } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useLeaderboardStore } from "@/hooks/useLeaderboardStore";

export function LeaderboardButton() {
  const profile = useProfileStore((s) => s.profile);
  const setPanelOpen = useLeaderboardStore((s) => s.setPanelOpen);
  const refresh = useLeaderboardStore((s) => s.refresh);

  if (!profile) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setPanelOpen(true);
        void refresh();
      }}
      className="pointer-events-auto flex w-44 items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2.5 text-left text-sm font-medium text-slate-50 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900/75"
      title="Open leaderboard"
    >
      <Trophy className="h-4 w-4 text-amber-400" aria-hidden />
      Leaderboard
    </button>
  );
}
