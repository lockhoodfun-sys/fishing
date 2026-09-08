/** Tampilan pancing per tier: dipakai model 3D di tangan dan kartu di toko. */
export type RodShape = "wood" | "fiber" | "slim" | "carved" | "ornate" | "ethereal";

export interface RodLook {
  grip: string;
  blank: string;
  tip: string;
  accent: string;
  glow: number;
  /** Bentuk khas tier ini — bukan sekadar beda warna. */
  shape: RodShape;
  /** Radius pegangan (bagian bawah joran). */
  gripRadius: number;
  /** Ketebalan batang utama (bawah, atas). */
  blankRadius: [number, number];
  /** Jumlah permata/ornamen yang menempel di batang. */
  gems: number;
}

export const ROD_LOOKS: Record<string, RodLook> = {
  starter: {
    grip: "#5d3a22", blank: "#6b4b2c", tip: "#7d5a35", accent: "#b9c1c8", glow: 0,
    shape: "wood", gripRadius: 0.16, blankRadius: [0.11, 0.06], gems: 0,
  },
  uncommon: {
    grip: "#3f5a2e", blank: "#1f4030", tip: "#2a5a40", accent: "#8fd18f", glow: 0,
    shape: "fiber", gripRadius: 0.15, blankRadius: [0.1, 0.05], gems: 0,
  },
  rare: {
    grip: "#1f3352", blank: "#16345e", tip: "#1f4e8c", accent: "#6db4ff", glow: 0.15,
    shape: "slim", gripRadius: 0.13, blankRadius: [0.085, 0.04], gems: 1,
  },
  epic: {
    grip: "#3a2154", blank: "#2c1a52", tip: "#5b2d8e", accent: "#c58cff", glow: 0.35,
    shape: "carved", gripRadius: 0.145, blankRadius: [0.095, 0.045], gems: 3,
  },
  legendary: {
    grip: "#5c3a10", blank: "#6b3d0f", tip: "#b06a1e", accent: "#ffcf5c", glow: 0.6,
    shape: "ornate", gripRadius: 0.155, blankRadius: [0.1, 0.05], gems: 4,
  },
  mythic: {
    grip: "#4a0f22", blank: "#520f2e", tip: "#8c1445", accent: "#ff5c8a", glow: 1,
    shape: "ethereal", gripRadius: 0.14, blankRadius: [0.09, 0.042], gems: 6,
  },
};

export const rodLook = (id: string | null | undefined): RodLook =>
  (id ? ROD_LOOKS[id] : undefined) ?? ROD_LOOKS["starter"]!;
