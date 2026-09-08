import { useEffect, useState } from "react";
import { Coins, Loader2, Backpack as BackpackIcon } from "lucide-react";
import { toast } from "sonner";
import { useInventoryStore } from "@/hooks/useInventoryStore";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useRodStore } from "@/hooks/useRodStore";
import { useBaitStore } from "@/hooks/useBaitStore";
import { useBoatStore } from "@/hooks/useBoatStore";
import { useHotbarFishStore, MAX_HOTBAR_FISH } from "@/hooks/useHotbarFishStore";
import { useFishThumbnail } from "@/hooks/useFishThumbnail";
import { useBoatThumbnail } from "@/hooks/useBoatThumbnail";
import { getFishData, mutationFor, priceFor } from "@/lib/fishRules";
import type { Rarity } from "@/lib/fishRules";
import { rodLook } from "@/lib/rodLooks";
import { baitLook } from "@/lib/baitLooks";
import { BOAT_LOOKS, DEFAULT_BOAT_ID } from "@/lib/boatModels";
import { RodIllustration } from "./RodShop";
import { BaitOrb } from "./BaitShop";
import { BoatIllustration } from "./BoatShop";

type BagTab = "fish" | "rod" | "bait" | "boat";

const TABS: { id: BagTab; label: string }[] = [
  { id: "fish", label: "Fish" },
  { id: "rod", label: "Rod" },
  { id: "bait", label: "Bait" },
  { id: "boat", label: "Boat" },
];

function speciesInfo(id: string) {
  const s = getFishData().species.find((sp) => sp.id === id);
  return {
    name: s?.name ?? id,
    color: s?.color ?? "#93c5fd",
    rarity: (s?.rarity ?? "common") as Rarity,
  };
}

/** Shared sizing tokens so every Bag tab (Fish/Rod/Bait/Boat) renders at
 *  identical card and scroll-area dimensions — no more per-tab drift.
 *  SCROLL_AREA is a *fixed* height (not max-height): tabs with few items
 *  (2 rods) must occupy the same vertical space as tabs with many (153
 *  fish), or the whole panel resizes every time the player switches tabs. */
const CARD_SHELL = "flex flex-col rounded-2xl border p-2.5 transition-colors";
const IMAGE_BOX = "flex h-24 items-center justify-center rounded-xl";
const SCROLL_AREA = "h-80 overflow-y-auto pr-1 scrollbar-none";
const GRID = "grid grid-cols-2 gap-2.5 content-start";

/** Centers a status message (connect wallet / loading / empty) inside the
 *  fixed-height scroll area so it never shrinks the panel. */
function TabMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-center">{children}</div>;
}

/** The small summary row every tab shows above its content, so the panel's
 *  header block is always the same height no matter which tab is active. */
function TabSummary({ left, right }: { left: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex h-5 items-center justify-between">
      <p className="text-xs text-slate-300">{left}</p>
      {right}
    </div>
  );
}

/**
 * Shared card chrome for an EQUIPPABLE gear tile (rod/bait/boat) inside the
 * Bag. The Bag only ever shows gear the player already owns — buying still
 * happens at the NPC shops, never here — so there is no "Buy" state.
 */
function GearCard({
  name,
  equipped,
  busy,
  onEquip,
  statLines,
  children,
}: {
  name: string;
  equipped: boolean;
  busy: boolean;
  onEquip: () => void;
  statLines: { label: string; value: string; className?: string }[];
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${CARD_SHELL} ${
        equipped
          ? "border-amber-300/80 bg-amber-300/10"
          : "border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:border-white/25"
      }`}
    >
      <p className="truncate text-center text-[13px] font-semibold leading-tight text-slate-100">
        {name}
      </p>
      <p className="text-center text-[11px] font-extrabold uppercase tracking-wide text-emerald-400">
        {equipped ? "In use" : "Owned"}
      </p>

      <div
        className={`my-2 ${IMAGE_BOX}`}
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(56,189,248,0.15), rgba(0,0,0,0.35) 70%)",
        }}
      >
        {children}
      </div>

      <div className="flex min-h-16 flex-col justify-center space-y-0.5 rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold leading-5 text-slate-200">
        {statLines.map((line) => (
          <p key={line.label}>
            {line.label}: <span className={line.className ?? "text-emerald-400"}>{line.value}</span>
          </p>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || equipped}
        onClick={onEquip}
        className="mt-2 w-full rounded-lg bg-emerald-500 py-1.5 text-xs font-extrabold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
      >
        {equipped ? "Equipped" : busy ? "Switching…" : "Use"}
      </button>
    </div>
  );
}

const RARITY_RING: Record<Rarity, string> = {
  common: "rgba(148,163,184,0.35)",
  rare: "rgba(56,189,248,0.45)",
  epic: "rgba(192,132,252,0.45)",
  legendary: "rgba(251,191,36,0.5)",
  mythic: "rgba(251,113,133,0.55)",
};

function FishTab() {
  const items = useInventoryStore((s) => s.items);
  const loading = useInventoryStore((s) => s.loading);
  const proof = useProfileStore((s) => s.proof);
  const hotbarSlots = useHotbarFishStore((s) => s.slots);
  const addToHotbar = useHotbarFishStore((s) => s.addToHotbar);
  const totalKg = items.reduce((a, b) => a + b.weight_kg, 0);
  const totalValue = items.reduce(
    (a, b) => a + priceFor(b.species_id, b.weight_kg, b.mutation_key),
    0,
  );

  return (
    <>
      <TabSummary
        left={`${items.length} item · ${totalKg.toFixed(2)} kg`}
        right={
          <p className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">
            <Coins size={12} />
            {totalValue.toLocaleString()}
          </p>
        }
      />

      <div className={SCROLL_AREA}>
        {!proof && (
          <TabMessage>
            <p className="text-xs text-slate-400">Connect your wallet to see your catch.</p>
          </TabMessage>
        )}
        {proof && loading && items.length === 0 && (
          <TabMessage>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your catch…
            </p>
          </TabMessage>
        )}
        {proof && !loading && items.length === 0 && (
          <TabMessage>
            <p className="text-xs text-slate-400">Bag is empty. Catch some fish!</p>
          </TabMessage>
        )}
        {items.length > 0 && (
          <div className={GRID}>
            {items.map((item) => {
              const info = speciesInfo(item.species_id);
              const mutation = mutationFor(item.mutation_key);
              const value = priceFor(item.species_id, item.weight_kg, item.mutation_key);
              const ring = RARITY_RING[info.rarity] ?? RARITY_RING.common;
              const inHotbar = hotbarSlots.some((s) => s.id === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const reason = addToHotbar(item);
                    if (reason === "duplicate") {
                      toast.info("Already in your hotbar.");
                    } else if (reason === "full") {
                      toast.error(
                        `Hotbar is full (max ${MAX_HOTBAR_FISH} fish). Remove one first.`,
                      );
                    } else {
                      toast.success(`${info.name} added to hotbar.`);
                    }
                  }}
                  className={`${CARD_SHELL} relative w-full text-left transition-colors ${
                    inHotbar
                      ? "border-amber-300/80 bg-amber-300/10"
                      : "border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:border-white/25"
                  }`}
                >
                  <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-bold text-amber-300 backdrop-blur-sm">
                    <Coins size={11} />
                    {value.toLocaleString()}
                  </span>
                  {inHotbar && (
                    <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-slate-950">
                      <BackpackIcon size={11} /> Hotbar
                    </span>
                  )}

                  {/* Image cell: oversized and nudged up so it never crowds the text below. */}
                  <div
                    className={`relative my-2 overflow-visible ${IMAGE_BOX}`}
                    style={{
                      background: `radial-gradient(circle at 50% 40%, ${ring}, rgba(0,0,0,0.4) 72%)`,
                    }}
                  >
                    <div className="-translate-y-2">
                      <FishThumbnail color={info.color} rarity={info.rarity} size="lg" />
                    </div>
                  </div>

                  <div className="flex min-h-16 flex-col items-center justify-center space-y-0.5 rounded-lg bg-black/40 px-2.5 py-1.5 text-center">
                    <p className="truncate text-[13px] font-semibold leading-tight text-slate-100">
                      {mutation && mutation.key !== "none" ? (
                        <>
                          <span className="text-sky-300">{mutation.label}</span> {info.name}
                        </>
                      ) : (
                        info.name
                      )}
                    </p>
                    <p className="text-[11px] font-semibold leading-5 text-slate-400">
                      {item.weight_kg.toFixed(2)} kg
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** Bag icon: the real GLB model, falling back to the stylised fish while it renders. */
export function FishThumbnail({
  color,
  rarity,
  size = "sm",
}: {
  color: string;
  rarity: Rarity;
  size?: "sm" | "lg";
}) {
  const src = useFishThumbnail(rarity);
  const imgClass = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const svgClass = size === "lg" ? "h-12 w-12" : "h-7 w-7";
  if (src) {
    return <img src={src} alt="" className={`${imgClass} object-contain`} loading="lazy" />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${svgClass} animate-fish-swim`}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M2 12c2.5-3 6.5-4 10-4s7.5 1 10 4c-2.5 3-6.5 4-10 4S4.5 15 2 12z"
        fill={color}
        opacity="0.92"
      />
      <path d="M22 12c-2-1.5-4.5-2.5-7-3" />
      <circle cx="6.5" cy="11" r="1" fill="#12161c" stroke="none" />
      <path d="M2 12l-1-2v4l1-2z" fill={color} />
    </svg>
  );
}

function RodTab() {
  const proof = useProfileStore((s) => s.proof);
  const rods = useRodStore((s) => s.rods);
  const loading = useRodStore((s) => s.loading);
  const busyId = useRodStore((s) => s.busyId);
  const error = useRodStore((s) => s.error);
  const refresh = useRodStore((s) => s.refresh);
  const equip = useRodStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  const owned = rods.filter((rod) => rod.owned);
  const equippedRod = owned.find((rod) => rod.equipped);

  return (
    <>
      <TabSummary
        left={`${owned.length} rod${owned.length === 1 ? "" : "s"} owned`}
        right={
          equippedRod && (
            <p className="truncate rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">
              {equippedRod.name}
            </p>
          )
        }
      />

      <div className={SCROLL_AREA}>
        {!proof && (
          <TabMessage>
            <p className="text-xs text-slate-400">Connect your wallet to manage rods.</p>
          </TabMessage>
        )}
        {proof && loading && rods.length === 0 && (
          <TabMessage>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rods…
            </p>
          </TabMessage>
        )}
        {proof && !loading && owned.length === 0 && (
          <TabMessage>
            <p className="text-xs text-slate-400">
              You don't own any rod yet. Visit the rod shop NPC to buy one.
            </p>
          </TabMessage>
        )}
        {proof && owned.length > 0 && (
          <div className={GRID}>
            {owned.map((rod) => {
              const look = rodLook(rod.rod_id);
              return (
                <GearCard
                  key={rod.rod_id}
                  name={rod.name}
                  equipped={rod.equipped}
                  busy={busyId === rod.rod_id}
                  onEquip={() => void equip(rod.rod_id)}
                  statLines={[
                    { label: "Luck", value: `${rod.luck_percent}%` },
                    { label: "Speed", value: `${rod.speed_percent}%` },
                    {
                      label: "Max",
                      value: `${rod.max_catch_weight_kg.toLocaleString()}kg`,
                      className: "text-sky-400",
                    },
                  ]}
                >
                  <RodIllustration rodId={rod.rod_id} glow={look.glow} />
                </GearCard>
              );
            })}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </>
  );
}

function BaitTab() {
  const proof = useProfileStore((s) => s.proof);
  const baits = useBaitStore((s) => s.baits);
  const loading = useBaitStore((s) => s.loading);
  const busyId = useBaitStore((s) => s.busyId);
  const error = useBaitStore((s) => s.error);
  const refresh = useBaitStore((s) => s.refresh);
  const equip = useBaitStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  const owned = baits.filter((bait) => bait.owned);
  const equippedBait = owned.find((bait) => bait.equipped);

  return (
    <>
      <TabSummary
        left={`${owned.length} bait${owned.length === 1 ? "" : "s"} owned`}
        right={
          equippedBait && (
            <p className="truncate rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">
              {equippedBait.name}
            </p>
          )
        }
      />

      <div className={SCROLL_AREA}>
        {!proof && (
          <TabMessage>
            <p className="text-xs text-slate-400">Connect your wallet to manage bait.</p>
          </TabMessage>
        )}
        {proof && loading && baits.length === 0 && (
          <TabMessage>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading bait…
            </p>
          </TabMessage>
        )}
        {proof && !loading && owned.length === 0 && (
          <TabMessage>
            <p className="text-xs text-slate-400">
              You don't own any bait yet. Visit the bait shop NPC to buy one.
            </p>
          </TabMessage>
        )}
        {proof && owned.length > 0 && (
          <div className={GRID}>
            {owned.map((bait) => {
              void baitLook(bait.bait_id); // ensures a look exists for this tier (styling lives in BaitOrb itself)
              return (
                <GearCard
                  key={bait.bait_id}
                  name={bait.name}
                  equipped={bait.equipped}
                  busy={busyId === bait.bait_id}
                  onEquip={() => void equip(bait.bait_id)}
                  statLines={[{ label: "Luck", value: `${bait.luck_percent}%` }]}
                >
                  <div className="h-16 w-16">
                    <BaitOrb baitId={bait.bait_id} />
                  </div>
                </GearCard>
              );
            })}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </>
  );
}

/** Boat tile image: the real hull GLB, falling back to the 2D silhouette while it renders. */
function BoatThumb({ boatId, speedPercent }: { boatId: string; speedPercent: number }) {
  const url = (BOAT_LOOKS[boatId] ?? BOAT_LOOKS[DEFAULT_BOAT_ID])!.url;
  const src = useBoatThumbnail(boatId, url);
  if (src) {
    return <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />;
  }
  return <BoatIllustration speed={speedPercent} />;
}

function BoatTab() {
  const proof = useProfileStore((s) => s.proof);
  const boats = useBoatStore((s) => s.boats);
  const loading = useBoatStore((s) => s.loading);
  const busyId = useBoatStore((s) => s.busyId);
  const error = useBoatStore((s) => s.error);
  const refresh = useBoatStore((s) => s.refresh);
  const equip = useBoatStore((s) => s.equip);

  useEffect(() => {
    if (proof) void refresh();
  }, [proof, refresh]);

  const owned = boats.filter((b) => b.owned);
  const equippedBoat = owned.find((b) => b.equipped);

  return (
    <>
      <TabSummary
        left={`${owned.length} boat${owned.length === 1 ? "" : "s"} owned`}
        right={
          equippedBoat && (
            <p className="truncate rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">
              {equippedBoat.name}
            </p>
          )
        }
      />

      <div className={SCROLL_AREA}>
        {!proof && (
          <TabMessage>
            <p className="text-xs text-slate-400">Connect your wallet to manage boats.</p>
          </TabMessage>
        )}
        {proof && loading && boats.length === 0 && (
          <TabMessage>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading boats…
            </p>
          </TabMessage>
        )}
        {proof && !loading && owned.length === 0 && (
          <TabMessage>
            <p className="text-xs text-slate-400">
              You don't own any boat yet. Visit the boat shop NPC to buy one.
            </p>
          </TabMessage>
        )}
        {proof && owned.length > 0 && (
          <div className={GRID}>
            {owned.map((b) => (
              <GearCard
                key={b.boat_id}
                name={b.name}
                equipped={b.equipped}
                busy={busyId === b.boat_id}
                onEquip={() => void equip(b.boat_id)}
                statLines={[{ label: "Speed", value: `${b.speed_percent}%` }]}
              >
                <BoatThumb boatId={b.boat_id} speedPercent={b.speed_percent} />
              </GearCard>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </>
  );
}

/**
 * The bag: a 4-tab inventory/loadout screen. Fish shows the catch; Rod/Bait/
 * Boat only list gear the player already OWNS, with a single "Use" action to
 * equip it. Buying new rod/bait/boat (and selling fish) is NOT done here —
 * that stays at the NPC shops out in the world.
 */
export function BagPanel() {
  const [tab, setTab] = useState<BagTab>("fish");
  const items = useInventoryStore((s) => s.items);

  return (
    <div className="pointer-events-auto absolute bottom-[190px] left-1/2 z-30 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-white/25 bg-slate-900/85 p-4 text-slate-50 shadow-2xl backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-base font-bold tracking-tight">Bag</p>
      </div>

      <div className="mb-3 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-colors ${
              tab === t.id ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            {t.label}
            {t.id === "fish" && items.length > 0 ? ` (${items.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "fish" && <FishTab />}
      {tab === "rod" && <RodTab />}
      {tab === "bait" && <BaitTab />}
      {tab === "boat" && <BoatTab />}
    </div>
  );
}