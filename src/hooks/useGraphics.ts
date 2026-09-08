import { create } from "zustand";

export type GraphicsTier = "low" | "medium" | "high";

export interface GraphicsPreset {
  label: string;
  dpr: [number, number];
  shadows: boolean;
  bloom: boolean;
  multisampling: number;
  /** 0 = paling ringan (1 sampel noise), 1 = sedang, 2 = penuh */
  oceanDetail: number;
  /** pengali ukuran sprite efek cahaya bawah air */
  glowScale: number;
  /** lampu dinamis pada efek memancing (mahal di GPU lemah) */
  fxLights: boolean;
  /** jumlah bidang beam cahaya bawah air */
  fxBeams: number;
  /** pengali jumlah partikel (motes/embers) efek memancing */
  fxParticles: number;
  /** jarak (m) NPC masih digambar; di luar itu dilewati total */
  npcDistance: number;
  /** jarak (m) nama NPC (elemen HTML) masih ditampilkan */
  npcLabelDistance: number;
  /** resolusi peta bayangan matahari */
  shadowMapSize: number;
  /** ikan ikut melempar bayangan (mahal: banyak submesh) */
  fishShadows: boolean;
}

export const GRAPHICS: Record<GraphicsTier, GraphicsPreset> = {
  low: {
    label: "Low",
    dpr: [1, 1],
    shadows: false,
    bloom: false,
    multisampling: 0,
    oceanDetail: 0,
    glowScale: 0.45,
    fxLights: false,
    fxBeams: 1,
    fxParticles: 0.34,
    npcDistance: 45,
    npcLabelDistance: 22,
    shadowMapSize: 512,
    fishShadows: false,
  },
  medium: {
    label: "Medium",
    dpr: [1, 1.25],
    shadows: true,
    bloom: true,
    multisampling: 2,
    oceanDetail: 1,
    glowScale: 0.8,
    fxLights: true,
    fxBeams: 2,
    fxParticles: 0.7,
    npcDistance: 90,
    npcLabelDistance: 35,
    shadowMapSize: 1024,
    fishShadows: false,
  },
  high: {
    label: "High",
    dpr: [1, 1.5],
    shadows: true,
    bloom: true,
    multisampling: 2,
    oceanDetail: 2,
    glowScale: 1,
    fxLights: true,
    fxBeams: 3,
    fxParticles: 1,
    npcDistance: 200,
    npcLabelDistance: 50,
    shadowMapSize: 2048,
    fishShadows: true,
  },
};

const KEY = "gofish.gfx";

function isTier(v: unknown): v is GraphicsTier {
  return v === "low" || v === "medium" || v === "high";
}

/** Perangkat lemah / HP mulai di "Sedang" supaya frame rate stabil sejak awal. */
function detectTier(): GraphicsTier {
  if (typeof window === "undefined") return "high";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (isTier(saved)) return saved;
  } catch {
    /* storage tidak tersedia */
  }
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return cores <= 4 || touch ? "medium" : "high";
}

interface GraphicsState {
  tier: GraphicsTier;
  setTier: (tier: GraphicsTier) => void;
}

export const useGraphics = create<GraphicsState>((set) => ({
  tier: "high",
  setTier: (tier) => {
    try {
      window.localStorage.setItem(KEY, tier);
    } catch {
      /* storage tidak tersedia */
    }
    set({ tier });
  },
}));

/** Terapkan pilihan tersimpan/terdeteksi setelah hidrasi (hindari mismatch SSR). */
export function hydrateGraphics() {
  const tier = detectTier();
  if (useGraphics.getState().tier !== tier) useGraphics.setState({ tier });
}

export const graphicsPreset = (tier: GraphicsTier) => GRAPHICS[tier];
