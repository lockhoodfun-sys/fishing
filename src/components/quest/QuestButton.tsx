import { useEffect } from "react";
import { ListChecks } from "lucide-react";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useQuestStore } from "@/hooks/useQuestStore";

/** Small pill docked directly under the profile/wallet card (see
 * GameCanvas's top-right stack) — replaces the old "Quests" button that
 * used to live inside ProfilePanel. Loads quest state on its own as soon as
 * a profile exists, so the claimable dot is visible even if the player
 * never opens the panel. */
export function QuestButton() {
  const profile = useProfileStore((s) => s.profile);
  const proof = useProfileStore((s) => s.proof);
  const quest = useQuestStore((s) => s.quest);
  const refresh = useQuestStore((s) => s.refresh);
  const setPanelOpen = useQuestStore((s) => s.setPanelOpen);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  if (!profile) return null;

  const claimable = quest?.status === "completed_unclaimed";

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      className="pointer-events-auto flex w-44 items-center justify-between gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2.5 text-left text-sm font-medium text-slate-50 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900/75"
      title="Open quests"
    >
      <span className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-sky-400" aria-hidden />
        Quests
      </span>
      {claimable && (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]"
          aria-hidden
        />
      )}
    </button>
  );
}