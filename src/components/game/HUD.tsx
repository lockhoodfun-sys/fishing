import {
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Moon,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { useGameStore } from "@/hooks/useGameStore";
import { useWeather, WEATHER, type WeatherKind } from "@/hooks/useWeather";
import { useDayNight, dayLabelFor, type DayLabel } from "@/hooks/useDayNight";
import { LeaderboardTracker } from "@/components/leaderboard/LeaderboardTracker";

const DAY_ICON = {
  Dawn: Sunrise,
  Day: Sun,
  Dusk: Sunset,
  Night: Moon,
} satisfies Record<DayLabel, typeof Sun>;

const WEATHER_ICON: Record<WeatherKind, typeof Sun> = {
  cerah: Sun,
  berawan: Cloud,
  berkabut: CloudFog,
  hujan: CloudRain,
  badai: CloudLightning,
};

/** 12-hour clock label, e.g. "11:07 PM". */
function formatClock(hour: number) {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((((hour % 1) + 1) % 1) * 60);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function HUD() {
  const { phase, message, score, last } = useGameStore();
  const bite = phase === "bite";
  const weatherKind = useWeather((s) => s.kind);
  const hour = useDayNight((s) => s.hour);
  const dayLabel = dayLabelFor(hour);
  const DayIcon = DAY_ICON[dayLabel];
  const WeatherIcon = WEATHER_ICON[weatherKind];




  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {phase === "caught" && last?.isMonster && (
        <div
          key={score}
          className="animate-monster-flash fixed inset-0 z-50"
          aria-hidden="true"
        />
      )}
      <div className="flex items-start justify-between p-4 sm:p-6">
        <div className="flex flex-col items-start gap-2">
          <LeaderboardTracker />
        </div>
      </div>

      {/* Top-center notifications */}
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {bite && (
          <div className="animate-pulse rounded-full bg-red-500/90 px-6 py-2 text-lg font-bold tracking-wide text-white shadow-xl">
            ! BITE !
          </div>
        )}
        <div className="rounded-full border border-white/25 bg-slate-900/50 px-6 py-2 text-center text-sm font-medium text-slate-50 shadow-lg backdrop-blur-md">
          {message}
        </div>
      </div>

      {/* Bottom-left status: weather + time of day */}
      <div className="absolute bottom-4 left-4 flex flex-col items-start gap-1.5 text-slate-50 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
        <div className="flex items-center gap-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-slate-900/55 shadow-lg backdrop-blur-md">
            <DayIcon size={16} />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-slate-900/55 shadow-lg backdrop-blur-md">
            <WeatherIcon size={16} />
          </span>
          <span className="rounded-lg border border-white/25 bg-slate-900/55 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest shadow-lg backdrop-blur-md">
            {WEATHER[weatherKind].label}
          </span>
        </div>
        <p className="text-2xl font-extrabold tracking-tight">Koleo Island</p>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock size={15} />
          <span className="tabular-nums">{formatClock(hour)}</span>
          <span className="text-slate-200/80">· {dayLabel}</span>
        </div>
      </div>


    </div>
  );
}