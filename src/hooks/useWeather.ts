import { create } from "zustand";
import { getFishData } from "@/lib/fishRules";
import { WORLD_EPOCH_MS } from "@/hooks/useDayNight";


export type WeatherKind = "cerah" | "berawan" | "berkabut" | "hujan" | "badai";

export interface WeatherPreset {
  label: string;
  /** drei <Sky /> tuning */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  /** sky saturation boost (1 = untouched, used to keep clear skies blue) */
  skySaturation: number;
  sunPosition: [number, number, number];
  /** atmosphere */
  fogColor: string;
  fogDensity: number;
  /** lighting */
  ambient: number;
  hemi: number;
  sun: number;
  sunColor: string;
  /** cloud deck */
  cloudOpacity: number;
  cloudColor: string;
  cloudSpeed: number;
  /** precipitation */
  rain: number; // 0..1 amount
  rainSpeed: number;
  wind: number;
  lightning: boolean;
  /** page backdrop behind the canvas */
  backdrop: string;
  /** ocean body colours (shallow -> mid -> deep) and the horizon haze */
  waterShallow: string;
  waterMid: string;
  waterDeep: string;
  waterHorizon: string;
}

export const WEATHER: Record<WeatherKind, WeatherPreset> = {
  cerah: {
    label: "Clear",
    // Deeper rayleigh + low turbidity keeps the dome a saturated sky blue
    // instead of the washed-out white ACES tone mapping tends to produce.
    turbidity: 1.6,
    rayleigh: 3.4,
    mieCoefficient: 0.003,
    skySaturation: 2.1,
    sunPosition: [30, 22, 18],
    fogColor: "#b8e0f7",
    fogDensity: 0.0, // 0 unit kabut / 1000
    ambient: 0.55,
    hemi: 0.7,
    sun: 2.1,
    sunColor: "#fff3d9",
    cloudOpacity: 0.28,
    cloudColor: "#ffffff",
    cloudSpeed: 0.08,
    rain: 0,
    rainSpeed: 0,
    wind: 0,
    lightning: false,
    backdrop: "#7ecbf5",
    waterShallow: "#7ff0e2",
    waterMid: "#3fd8d2",
    waterDeep: "#12a2b4",
    waterHorizon: "#b9dff3",
  },
  berawan: {
    label: "Cloudy",
    // Same blue-sky family as "cerah", just a touch hazier — the mood shift
    // comes from thicker clouds, not from draining the hue toward gray.
    turbidity: 3,
    rayleigh: 3.0,
    mieCoefficient: 0.005,
    skySaturation: 1.9,
    sunPosition: [22, 12, 20],
    fogColor: "#aed7f0",
    fogDensity: 0.002,
    ambient: 0.5,
    hemi: 0.65,
    sun: 1.5,
    sunColor: "#f5f0df",
    cloudOpacity: 0.6,
    cloudColor: "#eef3f7",
    cloudSpeed: 0.14,
    rain: 0,
    rainSpeed: 0,
    wind: 0.2,
    lightning: false,
    backdrop: "#8cc2ee",
    waterShallow: "#6fe0d4",
    waterMid: "#35c2c0",
    waterDeep: "#0f93a3",
    waterHorizon: "#a8d5ef",
  },
  berkabut: {
    label: "Foggy",
    turbidity: 5,
    rayleigh: 2.8,
    mieCoefficient: 0.008,
    skySaturation: 1.7,
    sunPosition: [18, 8, 22],
    fogColor: "#c3e2f2",
    fogDensity: 0.006,
    ambient: 0.62,
    hemi: 0.72,
    sun: 1.0,
    sunColor: "#eef1f0",
    cloudOpacity: 0.5,
    cloudColor: "#e4eef4",
    cloudSpeed: 0.05,
    rain: 0,
    rainSpeed: 0,
    wind: 0.05,
    lightning: false,
    backdrop: "#a8d2ec",
    waterShallow: "#82e0d6",
    waterMid: "#3fbcbe",
    waterDeep: "#1f8fa0",
    waterHorizon: "#bfe0f2",
  },
  hujan: {
    label: "Rain",
    // Noticeably moodier than clear, but still the same teal/blue family —
    // darker, not desaturated toward slate gray.
    turbidity: 7,
    rayleigh: 2.6,
    mieCoefficient: 0.01,
    skySaturation: 1.5,
    sunPosition: [14, 7, 24],
    fogColor: "#86b6d6",
    fogDensity: 0.003,
    ambient: 0.46,
    hemi: 0.55,
    sun: 0.85,
    sunColor: "#cddce8",
    cloudOpacity: 0.8,
    cloudColor: "#b7c8d6",
    cloudSpeed: 0.24,
    rain: 0.6,
    rainSpeed: 26,
    wind: 1.2,
    lightning: false,
    backdrop: "#5fa0d0",
    waterShallow: "#5cc9c0",
    waterMid: "#2ea3a8",
    waterDeep: "#0f6f85",
    waterHorizon: "#7fb8d8",
  },
  badai: {
    label: "Storm",
    // The darkest preset, but still anchored in deep blue-teal rather than
    // flat gray — dramatic mood comes from low light + heavy clouds/rain/
    // lightning, not from abandoning the game's colour identity.
    turbidity: 10,
    rayleigh: 2.4,
    mieCoefficient: 0.014,
    skySaturation: 1.3,
    sunPosition: [8, 4, 26],
    fogColor: "#3f5f80",
    fogDensity: 0.004,
    ambient: 0.34,
    hemi: 0.4,
    sun: 0.5,
    sunColor: "#7f93ab",
    cloudOpacity: 0.95,
    cloudColor: "#4a5b70",
    cloudSpeed: 0.45,
    rain: 1,
    rainSpeed: 40,
    wind: 3.2,
    lightning: true,
    backdrop: "#34527a",
    waterShallow: "#3a8a8f",
    waterMid: "#1f6f81",
    waterDeep: "#0a4a5c",
    waterHorizon: "#4a6f90",
  },
};

interface WeatherStore {
  kind: WeatherKind;
  setKind: (k: WeatherKind) => void;
}

const KINDS = Object.keys(WEATHER) as WeatherKind[];

function slotInterval(): number {
  const v = getFishData().weatherCycle.change_interval_seconds;
  return v > 0 ? v : 240;
}

/** Index of the weather slot the world is currently in. Derived from real
 *  time so a refresh resumes the same weather instead of resetting. */
export function currentWeatherSlot(nowMs = Date.now()): number {
  return Math.floor((nowMs - WORLD_EPOCH_MS) / 1000 / slotInterval());
}

/** Deterministic 0..1 draw for a slot index (mulberry-ish hash). */
function slotRandom(slot: number): number {
  let h = (slot ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Same slot -> same weather, for every player and every refresh. */
export function weatherForSlot(slot: number): WeatherKind {
  const weights = getFishData().weatherCycle.weights;
  const entries = KINDS.map((k) => [k, Math.max(0, Number(weights[k] ?? 0))] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return "cerah";
  let r = slotRandom(slot) * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

export const useWeather = create<WeatherStore>((set) => ({
  kind: weatherForSlot(currentWeatherSlot()),
  setKind: (kind) => set({ kind }),
}));
