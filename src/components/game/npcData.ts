export type FaceKind = "smile" | "squint" | "stern" | "wink";
export type HatKind = "straw" | "beanie" | "wide" | "captain" | "none";
export type TorsoExtra = "apron" | "vest" | "belt" | "jacket";

export interface NpcOutfit {
  skin: string;
  shirt: string;
  pants: string;
  accent: string;
  hat: HatKind;
  hatColor: string;
  extra: TorsoExtra;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  place: string;
  /** world x / z where the NPC stands */
  pos: [number, number];
  talkDist: number;
  face: FaceKind;
  outfit: NpcOutfit;
  greeting: string;
  smallTalk: string[];
  /** the fish merchant is the only NPC that trades for now */
  trades: boolean;
  /** the rod shop keeper sells rods */
  sellsRods?: boolean;
  /** the bait merchant sells baits */
  sellsBaits?: boolean;
  /** the boat dealer sells hulls */
  sellsBoats?: boolean;
  /** teaser line for shops that are not implemented yet */
  comingSoon?: string;
  /** the gold-reward NPC (new, gold economy feature) — renders RewardShop
   * instead of the sell/trade flow in NpcDialog. */
  isRewardNpc?: boolean;
}

export const NPCS: NpcDef[] = [
  {
    id: "fish",
    name: "Marlo",
    role: "Fish Merchant",
    place: "Koleo Island dock stall",
    pos: [8.6, 9.6],
    talkDist: 5.5,
    face: "smile",
    trades: true,
    outfit: {
      skin: "#f2c14e",
      shirt: "#2f7f8f",
      pants: "#3b4a63",
      accent: "#e8e2d2",
      hat: "straw",
      hatColor: "#e0a83c",
      extra: "apron",
    },
    greeting:
      "Welcome to my stall! I buy anything you pull out of these waters — the heavier and the stranger, the better the coin.",
    smallTalk: [
      "The reef's been generous this week. Bring me anything with fins.",
      "Storms scare the tourists off, but the big ones bite hardest then.",
      "A sparkling catch fetches half again the coin. Keep your eyes open.",
      "Heaviest fish I ever bought? A leviathan. Nearly sank my scales.",
    ],
  },
  {
    id: "bait",
    name: "Pip",
    role: "Bait Merchant",
    place: "Bait shop, west shore",
    pos: [-13.9, 5.5],
    talkDist: 5.5,
    face: "squint",
    trades: false,
    sellsBaits: true,
    outfit: {
      skin: "#e6a86b",
      shirt: "#8fbf5a",
      pants: "#5c4630",
      accent: "#d9b382",
      hat: "beanie",
      hatColor: "#d9534f",
      extra: "belt",
    },
    greeting:
      "Worms, shrimp, glow-grubs — I've got whatever the fish are craving today. Good bait beats a good rod, mark my words.",
    smallTalk: [
      "Glow-grubs at night, shrimp at dawn. That's the whole secret.",
      "Cheap bait, cheap fish. Don't be stingy with your own dinner.",
      "I once baited a hook with cheese. Caught a boot. Still proud.",
    ],
  },
  {
    id: "rod",
    name: "Old Bram",
    role: "Rod Shop Keeper",
    place: "Teal rod shop, far west",
    pos: [-41.2, -6.2],
    talkDist: 5.5,
    face: "stern",
    trades: false,
    sellsRods: true,
    outfit: {
      skin: "#c98b5f",
      shirt: "#4b5f8a",
      pants: "#2c3550",
      accent: "#7a5230",
      hat: "wide",
      hatColor: "#6b4a2f",
      extra: "vest",
    },
    greeting:
      "A rod is a promise, angler. Bring me coin and I'll bend you carbon that never snaps on a monster.",
    smallTalk: [
      "Snapped line? That's not bad luck, that's a cheap rod.",
      "Heavier fish need a stronger rod. Physics, not opinion.",
      "Forty years shaping rods. Never caught a thing myself.",
    ],
  },
  {
    id: "boat",
    name: "Captain Vex",
    role: "Boat Dealer",
    place: "Boat shop, east pier",
    pos: [19.63, 20.89],
    talkDist: 6,
    face: "wink",
    trades: false,
    sellsBoats: true,
    outfit: {
      skin: "#d99a6c",
      shirt: "#1f4f7a",
      pants: "#20293d",
      accent: "#e0d5b8",
      hat: "captain",
      hatColor: "#16233b",
      extra: "jacket",
    },
    greeting:
      "Ahoy! Tired of paddling the shallows? A proper hull takes you where the mythics swim.",
    smallTalk: [
      "Deep water, deeper pockets. That's the trade.",
      "My first boat sank twice. Second one only once.",
      "A fast hull outruns a storm. A cheap one becomes a reef.",
    ],
  },
  {
    id: "beach_greeter",
    name: "Suri",
    role: "Beach Local",
    place: "Small tent, dock's far end",
    // Real position, captured via window.__player.pos (see
    // src/hooks/usePlayer.ts dev aid) as instructed by the user. Y is
    // intentionally not hardcoded — Npcs.tsx snaps to the ground mesh at
    // runtime via groundAround(), same as every other NPC.
    pos: [-19.07, 47.77],
    talkDist: 5.5,
    face: "wink",
    trades: false,
    outfit: {
      skin: "#e0a878",
      shirt: "#f2d24a",
      pants: "#3f7f6b",
      accent: "#fef3c7",
      hat: "straw",
      hatColor: "#d97706",
      extra: "vest",
    },
    greeting:
      "Hey! Not many anglers make it all the way out to this beach. Sun's better here anyway.",
    smallTalk: [
      "The tide out here brings in things the main dock never sees.",
      "I heard there's a shack further down the shore. Haven't checked it myself.",
      "Bring a boat next time — walking here from the dock takes forever.",
    ],
  },
  {
    id: "gold_broker",
    name: "Reya",
    role: "Gold Broker",
    place: "Beach Summer island, far shore",
    // Swapped with beach_greeter (Suri) on request — this is Suri's old,
    // real captured position: X/Z read directly from the user's own
    // in-game position via window.__player.pos (see src/hooks/usePlayer.ts
    // dev aid) while standing on the "beach_summer__assets_kit.glb" island.
    // Y is intentionally not hardcoded — Npcs.tsx snaps to the island's own
    // "sand" ground mesh at runtime via groundAround(), same as every other
    // NPC.
    pos: [132.51, 941.52],
    talkDist: 5.5,
    face: "wink",
    trades: false,
    isRewardNpc: true,
    outfit: {
      skin: "#d9a86c",
      shirt: "#8f5fbf",
      pants: "#2c2540",
      accent: "#f2d24a",
      hat: "none",
      hatColor: "#000000",
      extra: "vest",
    },
    greeting:
      "Bring me a haul of fish and I'll trade it for gold — real gold, the kind you can cash out. Come back daily, the offer resets.",
    smallTalk: [
      "Gold isn't coin. Coin buys gear here; gold you can walk away with.",
      "The bigger your hold, the bigger the gold I can hand you each visit.",
      "I only deal once a day, at midnight sharp. Don't be late.",
    ],
  },
];

export function npcById(id: string | null) {
  return NPCS.find((n) => n.id === id) ?? null;
}