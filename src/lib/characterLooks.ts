/**
 * Character presets for the player's blocky angler avatar.
 *
 * Same idea as rodLooks/baitLooks: one flat table of palettes + shape flags,
 * consumed by the mesh helpers in components/game/AnglerBody.tsx. The default
 * ("rook") reproduces the original avatar exactly, so nothing changes for a
 * player who never picks a character.
 */

export type HairStyle = "spiky" | "ponytail" | "shaggy" | "undercut";
export type Headwear = "headphones" | "strawhat" | "beanie" | "headband";
export type TopStyle = "vest" | "apron" | "sweater" | "jacket";
export type LegStyle = "ripped" | "shorts" | "waders" | "legging";
export type FootStyle = "sneaker" | "sandal" | "boot" | "techsneaker";
export type FaceStyle = "lines" | "smile" | "bearded" | "stern";

export interface CharacterLook {
  id: string;
  name: string;
  tagline: string;
  /** palette */
  skin: string;
  hair: string;
  shirt: string;
  top: string;
  trim: string;
  pants: string;
  pantsAlt: string;
  shoe: string;
  shoeAlt: string;
  sleeve: string;
  cuff: string;
  accent: string;
  /** shapes */
  hairStyle: HairStyle;
  headwear: Headwear;
  topStyle: TopStyle;
  legStyle: LegStyle;
  footStyle: FootStyle;
  faceStyle: FaceStyle;
  /** torso/limb bulk multiplier (1 = original) */
  build: number;
}

export const CHARACTER_PRESETS: CharacterLook[] = [
  {
    id: "rook",
    name: "Rook",
    tagline: "City angler in a tailored vest and headphones.",
    skin: "#f2c48a",
    hair: "#d9dde2",
    shirt: "#171a1f",
    top: "#0d0f13",
    trim: "#e8eaed",
    pants: "#20242c",
    pantsAlt: "#8e949c",
    shoe: "#f4f5f2",
    shoeAlt: "#9aa0a8",
    sleeve: "#8d949c",
    cuff: "#14171b",
    accent: "#e6e8ea",
    hairStyle: "spiky",
    headwear: "headphones",
    topStyle: "vest",
    legStyle: "ripped",
    footStyle: "sneaker",
    faceStyle: "lines",
    build: 1,
  },
  {
    id: "marisol",
    name: "Marisol",
    tagline: "Reef diver with a straw hat and fisher's apron.",
    skin: "#c98a5a",
    hair: "#1d1b1a",
    shirt: "#f0714f",
    top: "#f7d9a4",
    trim: "#b8422f",
    pants: "#2f5f92",
    pantsAlt: "#7ba3cd",
    shoe: "#f2c53d",
    shoeAlt: "#c99a1f",
    sleeve: "#c98a5a",
    cuff: "#f0714f",
    accent: "#b8422f",
    hairStyle: "ponytail",
    headwear: "strawhat",
    topStyle: "apron",
    legStyle: "shorts",
    footStyle: "sandal",
    faceStyle: "smile",
    build: 0.92,
  },
  {
    id: "bjorn",
    name: "Bjorn",
    tagline: "North-sea deckhand in wool and rubber waders.",
    skin: "#ecc0a0",
    hair: "#c99a52",
    shirt: "#4a6b8a",
    top: "#31506b",
    trim: "#d8e2ea",
    pants: "#3f6b4c",
    pantsAlt: "#2c4c37",
    shoe: "#14171b",
    shoeAlt: "#2a2f36",
    sleeve: "#4a6b8a",
    cuff: "#31506b",
    accent: "#e2c14a",
    hairStyle: "shaggy",
    headwear: "beanie",
    topStyle: "sweater",
    legStyle: "waders",
    footStyle: "boot",
    faceStyle: "bearded",
    build: 1.12,
  },
  {
    id: "kenji",
    name: "Kenji",
    tagline: "Tech diver in a neon-striped shell jacket.",
    skin: "#f6d3ad",
    hair: "#15161a",
    shirt: "#16324f",
    top: "#0f2033",
    trim: "#38e0d0",
    pants: "#1b1e24",
    pantsAlt: "#38e0d0",
    shoe: "#3d434c",
    shoeAlt: "#38e0d0",
    sleeve: "#16324f",
    cuff: "#0f2033",
    accent: "#38e0d0",
    hairStyle: "undercut",
    headwear: "headband",
    topStyle: "jacket",
    legStyle: "legging",
    footStyle: "techsneaker",
    faceStyle: "stern",
    build: 0.96,
  },
];

export const DEFAULT_CHARACTER_ID = "rook";

export function characterLook(id?: string | null): CharacterLook {
  return (
    CHARACTER_PRESETS.find((c) => c.id === id) ??
    CHARACTER_PRESETS.find((c) => c.id === DEFAULT_CHARACTER_ID)!
  );
}
