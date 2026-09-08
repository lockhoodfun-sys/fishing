import { useEffect } from "react";
import { Backpack, X } from "lucide-react";
import { toast } from "sonner";
import { useGameStore } from "@/hooks/useGameStore";
import { useInventoryStore } from "@/hooks/useInventoryStore";
import { useProfileStore } from "@/hooks/useProfileStore";
import { rodOrDefault } from "@/lib/fishRules";
import { useRodStore } from "@/hooks/useRodStore";
import { useBaitStore } from "@/hooks/useBaitStore";
import { useBoatStore } from "@/hooks/useBoatStore";
import { useHotbarFishStore } from "@/hooks/useHotbarFishStore";
import { baitOrDefault, getFishData, type Rarity } from "@/lib/fishRules";
import { BagPanel, FishThumbnail } from "./BagPanel";

/**
 * Roblox-style bottom-center hotbar.
 * Slot 1 = fishing rod (click / press 1 to equip or stow on the back).
 * Slot 2 = bag (click / press 2 to open the caught-fish list).
 * The bag list is the server-side bucket — the same one Marlo sells from.
 */
export function Hotbar() {
  const rodStowed = useGameStore((s) => s.rodStowed);
  const bagOpen = useGameStore((s) => s.bagOpen);
  const phase = useGameStore((s) => s.phase);
  const items = useInventoryStore((s) => s.items);
  const refresh = useInventoryStore((s) => s.refresh);
  const proof = useProfileStore((s) => s.proof);
  const equippedId = useRodStore((s) => s.equippedId);
  const refreshRods = useRodStore((s) => s.refresh);
  const equippedBaitId = useBaitStore((s) => s.equippedId);
  const refreshBaits = useBaitStore((s) => s.refresh);
  const refreshBoats = useBoatStore((s) => s.refresh);
  const rod = rodOrDefault(equippedId);
  const bait = baitOrDefault(equippedBaitId);
  const hotbarFish = useHotbarFishStore((s) => s.slots);
  const heldFishId = useHotbarFishStore((s) => s.heldId);

  const toggleRod = () => {
    const st = useGameStore.getState();
    if (st.phase !== "idle") return;
    const next = !st.rodStowed;
    st.setRodStowed(next);
    if (!next) {
      // equipping the rod puts both hands back on it, so a held fish has
      // to come down first
      useHotbarFishStore.getState().lower();
    }
    st.setMessage(
      next
        ? "Rod stowed on your back. Click slot 1 to equip it again."
        : "Rod equipped. ENTER / left click to cast.",
    );
  };

  const toggleHoldFish = (id: string) => {
    const st = useGameStore.getState();
    if (st.phase !== "idle") {
      toast.error("Finish fishing first.");
      return;
    }
    const store = useHotbarFishStore.getState();
    const willHold = store.heldId !== id;
    if (willHold && !st.rodStowed) {
      // both hands are needed to hold up a fish — stow the rod first
      st.setRodStowed(true);
    }
    store.toggleHold(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Digit1") toggleRod();
      if (e.code === "Digit2") useGameStore.getState().toggleBag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the bag in sync: on sign-in and every time it is opened.
  useEffect(() => {
    if (!proof) return;
    void refresh();
    void refreshRods();
    void refreshBaits();
    void refreshBoats();
  }, [proof, refresh, refreshRods, refreshBaits, refreshBoats]);

  useEffect(() => {
    if (!bagOpen || !proof) return;
    void refresh();
  }, [bagOpen, proof, refresh]);

  // Drop any hotbar fish that got sold (or otherwise vanished from the
  // bucket) so the hotbar never points at a fish that no longer exists.
  useEffect(() => {
    const stale = hotbarFish.filter((slot) => !items.some((it) => it.id === slot.id));
    for (const slot of stale) useHotbarFishStore.getState().removeFromHotbar(slot.id);
  }, [items, hotbarFish]);

  return (
    <>
      {bagOpen && <BagPanel />}

      <div className="pointer-events-none absolute bottom-[128px] left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/65 px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-200 shadow-lg backdrop-blur-md">
        <span className="text-amber-200">{rod.name}</span>
        <span className="ml-2 text-slate-400">
          Luck {rod.luck_percent}% · Speed {rod.speed_percent}% · Max{" "}
          {rod.max_catch_weight_kg.toLocaleString()} kg
        </span>
        <span className="ml-2 border-l border-white/15 pl-2 text-emerald-300">
          {bait.name} · Luck {bait.luck_percent}%
        </span>
      </div>

      <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/20 bg-slate-900/55 p-2 shadow-2xl backdrop-blur-md">
        <HotSlot
          index={1}
          label={rod.name.replace(/ Rod$/, "")}
          active={!rodStowed}
          disabled={phase !== "idle"}
          onClick={toggleRod}
        >
          <div className="h-8 w-1 rotate-[35deg] rounded-full bg-gradient-to-b from-amber-200 to-amber-700" />
        </HotSlot>
        <HotSlot
          index={2}
          label="Bag"
          active={bagOpen}
          badge={items.length || undefined}
          onClick={() => useGameStore.getState().toggleBag()}
        >
          <Backpack size={26} className="text-amber-200" />
        </HotSlot>
        {hotbarFish.map((item, i) => {
          const species = getFishData().species.find((sp) => sp.id === item.species_id);
          return (
            <HotSlot
              key={item.id}
              index={3 + i}
              label={(species?.name ?? item.species_id).slice(0, 10)}
              active={heldFishId === item.id}
              onClick={() => toggleHoldFish(item.id)}
              onRemove={() => useHotbarFishStore.getState().removeFromHotbar(item.id)}
            >
              <div className="h-8 w-8">
                <FishThumbnail
                  color={species?.color ?? "#93c5fd"}
                  rarity={(species?.rarity as Rarity | undefined) ?? "common"}
                  size="sm"
                />
              </div>
            </HotSlot>
          );
        })}
      </div>
    </>
  );
}

function HotSlot({
  index,
  label,
  active,
  disabled,
  badge,
  onClick,
  onRemove,
  children,
}: {
  index: number;
  label: string;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  badge?: number | undefined;
  onClick: () => void;
  /** Shows a small "X" button in the corner (used to unload a fish from the hotbar). */
  onRemove?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-[74px] w-[74px] flex-col items-center justify-center gap-1 rounded-xl border-2 transition ${
        active
          ? "border-amber-300 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
          : "border-white/25 bg-slate-950/50 hover:border-white/50"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className="absolute left-1.5 top-1 text-[11px] font-bold text-white/70">{index}</span>
      {badge !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onRemove();
            }
          }}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white/90 shadow hover:bg-rose-500"
        >
          <X size={12} strokeWidth={3} />
        </span>
      )}
      <span className="flex h-8 items-center justify-center">{children}</span>
      <span className="truncate px-1 text-[11px] font-bold text-slate-100">{label}</span>
    </button>
  );
}