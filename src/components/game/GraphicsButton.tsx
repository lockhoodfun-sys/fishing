import { useEffect, useRef, useState } from "react";
import { Settings, Volume2, VolumeX, Music } from "lucide-react";
import { GRAPHICS, useGraphics, hydrateGraphics, type GraphicsTier } from "@/hooks/useGraphics";
import {
  setWeatherMuted,
  isWeatherMuted,
  setMusicVolume,
  setMasterVolume,
  loadAudioPrefs,
} from "@/lib/weatherAudio";

const ORDER: GraphicsTier[] = ["low", "medium", "high"];

/** Settings menu: graphics quality + audio controls. */
export function GraphicsButton() {
  const tier = useGraphics((s) => s.tier);
  const setTier = useGraphics((s) => s.setTier);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => isWeatherMuted());
  const [music, setMusic] = useState(0.12);
  const [volume, setVolume] = useState(0.9);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrateGraphics();
    const prefs = loadAudioPrefs();
    setVolume(prefs.master);
    setMusic(prefs.music);
    setMuted(prefs.muted);
    setMasterVolume(prefs.master);
    setMusicVolume(prefs.music);
    setWeatherMuted(prefs.muted);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setWeatherMuted(next);
  };

  return (
    <div ref={rootRef} className={`pointer-events-auto relative ${open ? "z-50" : ""}`}>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-slate-50 shadow backdrop-blur transition-colors hover:bg-slate-800/80"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute top-full right-0 mt-2 max-h-[calc(100dvh-7rem)] w-52 overflow-y-auto overscroll-contain rounded-xl border border-white/20 bg-slate-900 p-1 text-xs text-slate-50 shadow-2xl">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
            Graphics quality
          </p>
          {ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10 ${
                t === tier ? "bg-white/10 font-semibold" : ""
              }`}
            >
              {GRAPHICS[t].label}
              {t === tier ? <span aria-hidden>✓</span> : null}
            </button>
          ))}

          <div className="mx-1 my-1 border-t border-white/10" />

          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
            Audio
          </p>
          <button
            type="button"
            onClick={toggleMute}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              Sound
            </span>
            <span className={muted ? "text-slate-400" : "font-semibold"}>
              {muted ? "Off" : "On"}
            </span>
          </button>

          <div className="flex items-center gap-2 px-2 py-1.5">
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="shrink-0">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              aria-label="Overall volume"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setVolume(v);
                setMasterVolume(v);
              }}
              className="h-1 w-full cursor-pointer accent-sky-400"
            />
          </div>

          <div className="flex items-center gap-2 px-2 py-1.5">
            <Music className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="shrink-0">Music</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(music * 100)}
              aria-label="Music volume"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setMusic(v);
                setMusicVolume(v);
              }}
              className="h-1 w-full cursor-pointer accent-sky-400"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
