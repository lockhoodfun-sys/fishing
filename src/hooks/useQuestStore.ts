import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import type { QuestProgressView } from "@/lib/quest.functions";

interface QuestStore {
  panelOpen: boolean;
  quest: QuestProgressView | null;
  /** true once we've asked the server at least once, so "no more quests"
   * (quest === null after a load) can be told apart from "hasn't loaded yet". */
  loaded: boolean;
  loading: boolean;
  claiming: boolean;
  error: string | null;
  setPanelOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  claim: () => Promise<boolean>;
}

export const useQuestStore = create<QuestStore>((set, get) => ({
  panelOpen: false,
  quest: null,
  loaded: false,
  loading: false,
  claiming: false,
  error: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ quest: null, loaded: false, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const { getQuestProgress } = await import("@/lib/quest.functions");
      const quest = await getQuestProgress({ data: proof });
      set({ quest, loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Could not load your quest." });
    }
  },
  claim: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return false;
    set({ claiming: true, error: null });
    try {
      const { claimQuestReward } = await import("@/lib/quest.functions");
      const profile = await claimQuestReward({ data: proof });
      useProfileStore.getState().setProfile(profile);
      await get().refresh();
      set({ claiming: false });
      return true;
    } catch (e) {
      set({ claiming: false, error: e instanceof Error ? e.message : "Could not claim the reward." });
      return false;
    }
  },
}));