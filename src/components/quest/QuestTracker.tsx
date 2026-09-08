import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useQuestStore } from "@/hooks/useQuestStore";

function requirementLabel(type: string) {
  switch (type) {
    case "catch_count":
      return "Catch";
    case "sell_count":
      return "Sell";
    case "buy_rod":
      return "Buy rod";
    case "buy_bait":
      return "Buy bait";
    case "buy_boat":
      return "Buy boat";
    default:
      return type;
  }
}

/** Always-on quest HUD docked top-right (Fisch-style tracker) — shows the
 * active quest's progress bar without requiring a click to open anything.
 * Clicking the title still opens QuestPanel for the full claim flow, but
 * the claim button is also available right here so most play sessions never
 * need the modal at all. */
export function QuestTracker() {
  const profile = useProfileStore((s) => s.profile);
  const proof = useProfileStore((s) => s.proof);
  const quest = useQuestStore((s) => s.quest);
  const loaded = useQuestStore((s) => s.loaded);
  const claiming = useQuestStore((s) => s.claiming);
  const refresh = useQuestStore((s) => s.refresh);
  const claim = useQuestStore((s) => s.claim);
  const setPanelOpen = useQuestStore((s) => s.setPanelOpen);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  if (!profile) return null;
  // Nothing to render until the first load resolves — avoids a flash of an
  // empty/undefined card while `refresh()` is in flight.
  if (!loaded && !quest) return null;

  const allDone = loaded && quest?.status === "claimed" && quest.orderIndex === 10;
  const claimable = quest?.status === "completed_unclaimed";

  const onClaim = async () => {
    if (!quest) return;
    const wasLastQuest = quest.orderIndex === 10;
    const ok = await claim();
    if (ok) {
      toast.success(
        wasLastQuest
          ? `Claimed +${quest.rewardCoins.toLocaleString()} coins & +${quest.rewardXp.toLocaleString()} XP — that was the last quest!`
          : `Claimed +${quest.rewardCoins.toLocaleString()} coins & +${quest.rewardXp.toLocaleString()} XP. Next quest unlocked.`,
      );
    } else {
      toast.error(useQuestStore.getState().error ?? "Could not claim the reward.");
    }
  };

  return (
    <div className="pointer-events-auto mt-24 w-40 [text-shadow:0_2px_4px_rgba(0,0,0,0.95)]">
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-bold uppercase tracking-wide text-amber-300 drop-shadow-md hover:text-amber-200"
        title="Open quest details"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 drop-shadow-md" aria-hidden />
        {allDone ? "All quests complete!" : quest ? `Quest ${quest.orderIndex}/10` : "Quests"}
      </button>

      {allDone ? (
        <p className="mt-1.5 text-xs font-semibold text-white">
          You've claimed every quest reward. Nice work, angler.
        </p>
      ) : quest ? (
        <>
          <p className="mt-1.5 text-sm font-bold leading-snug text-white">
            {quest.title}
          </p>

          <div className="mt-2 space-y-1.5">
            {quest.requirements.map((req, i) => {
              const value = Math.min(quest.progressValues[i] ?? 0, req.qty);
              const pct = Math.min(100, (value / req.qty) * 100);
              const done = value >= req.qty;
              return (
                <div key={i}>
                  <div className="relative h-2 overflow-hidden rounded-full bg-slate-950/70 ring-1 ring-white/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        done
                          ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]"
                          : "bg-gradient-to-r from-sky-600 via-sky-400 to-cyan-300 shadow-[0_0_8px_2px_rgba(56,189,248,0.7)]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] font-bold tabular-nums text-white">
                    <span className="truncate">
                      {requirementLabel(req.type)} {req.key}
                    </span>
                    <span>
                      {value}/{req.qty}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold tabular-nums text-amber-300">
            <span>+{quest.rewardCoins.toLocaleString()}</span>
            <span className="text-sky-300">+{quest.rewardXp.toLocaleString()} XP</span>
          </div>

          {claimable && (
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/90 px-2 py-1.5 text-xs font-semibold text-slate-900 shadow-md transition-colors hover:bg-emerald-400 disabled:opacity-60 [text-shadow:none]"
            >
              {claiming && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Claim reward
            </button>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-xs font-semibold text-white">
          Your quests start after your angler profile is saved. Catch a fish or reconnect your
          wallet to begin.
        </p>
      )}
    </div>
  );
}