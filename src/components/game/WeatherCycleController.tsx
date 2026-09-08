import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useWeather, currentWeatherSlot, weatherForSlot } from "@/hooks/useWeather";
import { useDayNight } from "@/hooks/useDayNight";

/** Advances the in-game clock and keeps the weather in sync with the
 *  real-time weather slot. Both are pure functions of wall-clock time, so a
 *  refresh resumes the current weather/hour instead of resetting.
 *  Renders nothing. */
export function WeatherCycleController() {
  const slotRef = useRef<number | null>(null);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    useDayNight.getState().advance(dt);

    const slot = currentWeatherSlot();
    const kind = weatherForSlot(slot);
    // Recompute every frame is cheap; only push when the resolved weather
    // actually changes (slot rollover, or weights arriving from the server).
    if (slotRef.current !== slot || useWeather.getState().kind !== kind) {
      slotRef.current = slot;
      if (useWeather.getState().kind !== kind) useWeather.getState().setKind(kind);
    }
  });

  return null;
}
