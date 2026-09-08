import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHARACTER_PRESETS, DEFAULT_CHARACTER_ID } from "@/lib/characterLooks";
import { CharacterPreview } from "./AnglerBody";
import { useCharacterStore } from "@/hooks/useCharacterStore";
import { useProfileStore } from "@/hooks/useProfileStore";

function PreviewCanvas({ id }: { id: string }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 3.6, 11], fov: 34 }}
      gl={{ antialias: true }}
      className="!h-40 w-full"
    >
      <color attach="background" args={["#0b1220"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 8, 6]} intensity={1.4} />
      <directionalLight position={[-5, 3, -4]} intensity={0.5} color="#8fd7ff" />
      <group position={[0, -2.6, 0]} rotation={[0, 0.5, 0]}>
        <CharacterPreview id={id} />
      </group>
    </Canvas>
  );
}

/**
 * Character picker shown once right after the wallet profile is ready, and
 * re-openable from the profile panel. Appearance only — it never touches
 * progress, gear or coins.
 */
export function CharacterSelect() {
  const profile = useProfileStore((s) => s.profile);
  const address = useProfileStore((s) => s.address);
  const open = useCharacterStore((s) => s.selectOpen);
  const setSelectOpen = useCharacterStore((s) => s.setSelectOpen);
  const choose = useCharacterStore((s) => s.choose);
  const byAddress = useCharacterStore((s) => s.byAddress);
  const key = (address ?? "guest").toLowerCase();
  const current = byAddress[key] ?? null;

  // first time this wallet has a profile: offer the picker automatically
  useEffect(() => {
    if (profile && !current) setSelectOpen(true);
  }, [profile, current, setSelectOpen]);

  return (
    <Dialog open={open} onOpenChange={setSelectOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose your angler</DialogTitle>
          <DialogDescription>
            Looks only — your catches, coins and gear stay exactly the same. You can change this
            any time from your profile.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
          {CHARACTER_PRESETS.map((c) => {
            const selected = (current ?? DEFAULT_CHARACTER_ID) === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(address, c.id)}
                className={`overflow-hidden rounded-xl border text-left transition-colors ${
                  selected
                    ? "border-sky-400 ring-2 ring-sky-400/50"
                    : "border-border hover:border-sky-400/60"
                }`}
              >
                <PreviewCanvas id={c.id} />
                <div className="space-y-1 p-3">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.tagline}</p>
                  {selected && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                      Selected
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
