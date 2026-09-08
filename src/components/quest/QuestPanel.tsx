import { useEffect } from "react";
import { toast } from "sonner";
import { ListChecks, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useQuestStore } from "@/hooks/useQuestStore";

export function QuestPanel() {
  const proof = useProfileStore((s) => s.proof);
  const panelOpen = useQuestStore((s) => s.panelOpen);
  const setPanelOpen = useQuestStore((s) => s.setPanelOpen);
  const quest = useQuestStore((s) => s.quest);
  const loaded = useQuestStore((s) => s.loaded);
  const loading = useQuestStore((s) => s.loading);
  const claiming = useQuestStore((s) => s.claiming);
  const error = useQuestStore((s) => s.error);
  const refresh = useQuestStore((s) => s.refresh);
  const claim = useQuestStore((s) => s.claim);

  useEffect(() => {
    if (panelOpen && proof) void refresh();
  }, [panelOpen, proof, refresh]);

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

  const requirementLabel = (type: string) => {
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
  };
  // "All done" only shows once we've actually loaded and status says so —
  // see the note in quest.functions.ts: a null quest is NOT how completion
  // is represented, `status === "claimed"` on quest 10 is.
  const allDone = loaded && quest?.status === "claimed" && quest.orderIndex === 10;

  return (
    <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-sky-400" aria-hidden />
            Quests
          </DialogTitle>
          <DialogDescription>
            One quest at a time — every quest can mix catching, selling, and gear
            upgrades. Rewards pay both coins and XP.
          </DialogDescription>
        </DialogHeader>

        {!proof ? (
          <p className="text-sm text-muted-foreground">Connect your wallet to see your quest.</p>
        ) : loading && !loaded ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your quest…
          </p>
        ) : allDone ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-6 text-center">
            <Sparkles className="h-6 w-6 text-amber-400" aria-hidden />
            <p className="text-sm font-semibold">All quests complete!</p>
            <p className="text-xs text-muted-foreground">
              You've claimed every quest reward. Nice work, angler.
            </p>
          </div>
        ) : !quest ? (
          <p className="text-sm text-muted-foreground">No quest data available right now.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{quest.title}</p>
                <span className="text-xs font-medium text-muted-foreground">
                  Quest {quest.orderIndex}/10
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{quest.description}</p>

              <div className="mt-3 space-y-2.5">
                {quest.requirements.map((req, i) => {
                  const value = Math.min(quest.progressValues[i] ?? 0, req.qty);
                  const pct = Math.min(100, (value / req.qty) * 100);
                  const done = value >= req.qty;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {requirementLabel(req.type)}{" "}
                          <span className="font-medium text-foreground/90">{req.key}</span>
                        </span>
                        <span className={`tabular-nums ${done ? "text-emerald-400 font-semibold" : ""}`}>
                          {value} / {req.qty}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            done ? "bg-emerald-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-end gap-3 text-xs font-semibold">
                <span className="text-amber-400">+{quest.rewardCoins.toLocaleString()} coins</span>
                <span className="text-sky-400">+{quest.rewardXp.toLocaleString()} XP</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={quest.status !== "completed_unclaimed" || claiming}
              onClick={onClaim}
            >
              {claiming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quest.status === "completed_unclaimed" ? "Claim reward" : "Not complete yet"}
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}