import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import type { LeaderboardEntry, LeaderboardSort } from "@/lib/leaderboard.functions";

interface LeaderboardStore {
  panelOpen: boolean;
  sortBy: LeaderboardSort;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  setPanelOpen: (open: boolean) => void;
  setSortBy: (sortBy: LeaderboardSort) => void;
  refresh: () => Promise<void>;
}

export const useLeaderboardStore = create<LeaderboardStore>((set, get) => ({
  panelOpen: false,
  sortBy: "xp",
  entries: [],
  me: null,
  loading: false,
  loaded: false,
  error: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setSortBy: (sortBy) => {
    if (sortBy === get().sortBy) return;
    set({ sortBy });
    void get().refresh();
  },
  refresh: async () => {
    const proof = useProfileStore.getState().proof;
    if (!proof) {
      set({ entries: [], me: null, loaded: false, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const { getLeaderboard } = await import("@/lib/leaderboard.functions");
      const { entries, me } = await getLeaderboard({ data: { proof, sortBy: get().sortBy } });
      set({ entries, me, loaded: true, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Could not load the leaderboard.",
      });
    }
  },
}));
