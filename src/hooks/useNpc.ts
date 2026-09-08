import { create } from "zustand";

interface NpcStore {
  /** id of the NPC the player currently stands next to, if any */
  nearId: string | null;
  /** id of the NPC whose dialog is open, if any */
  openId: string | null;
  setNear: (id: string, near: boolean) => void;
  setOpen: (id: string | null) => void;
}

export const useNpc = create<NpcStore>((set, get) => ({
  nearId: null,
  openId: null,
  setNear: (id, near) => {
    const cur = get().nearId;
    if (near && cur !== id) set({ nearId: id });
    else if (!near && cur === id) set({ nearId: null });
  },
  setOpen: (openId) => set({ openId }),
}));
