/** Tampilan umpan per tier: tiap tingkat punya bentuk khas, bukan sekadar beda warna. */
export type BaitShape = "grub" | "cluster" | "crystal" | "rune" | "flame" | "void";

export interface BaitLook {
  core: string;
  shell: string;
  accent: string;
  glow: number;
  /** Bentuk khas tier ini. */
  shape: BaitShape;
  /** Skala relatif model umpan. */
  size: number;
}

export const BAIT_LOOKS: Record<string, BaitLook> = {
  basic_bait: {
    core: "#c98a4b", shell: "#8a5c2e", accent: "#e8c79a", glow: 0,
    shape: "grub", size: 1,
  },
  uncommon_bait: {
    core: "#7fd46a", shell: "#2f6b31", accent: "#c9f7b3", glow: 0.15,
    shape: "cluster", size: 1.1,
  },
  rare_bait: {
    core: "#5fb0ff", shell: "#1c3f77", accent: "#bfe2ff", glow: 0.35,
    shape: "crystal", size: 1.2,
  },
  epic_bait: {
    core: "#c58cff", shell: "#43206e", accent: "#ecd6ff", glow: 0.6,
    shape: "rune", size: 1.3,
  },
  legendary_bait: {
    core: "#ffcf5c", shell: "#7a4a0d", accent: "#fff0c2", glow: 0.85,
    shape: "flame", size: 1.45,
  },
  mythic_bait: {
    core: "#ff3355", shell: "#4a0413", accent: "#ffb3c2", glow: 1.2,
    shape: "void", size: 1.6,
  },
};

export const baitLook = (id: string | null | undefined): BaitLook =>
  (id ? BAIT_LOOKS[id] : undefined) ?? BAIT_LOOKS["basic_bait"]!;
