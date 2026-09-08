import { useEffect, useState } from "react";
import { ensureFishThumbnail, fishThumbnail } from "@/lib/fishThumbnails";
import type { Rarity } from "@/lib/fishRules";

/** Bag icon rendered straight from the rarity's GLB (null until it's ready). */
export function useFishThumbnail(rarity: Rarity | null | undefined): string | null {
  const key = (rarity ?? "common") as Rarity;
  const [src, setSrc] = useState<string | null>(() => fishThumbnail(key));

  useEffect(() => {
    let alive = true;
    setSrc(fishThumbnail(key));
    void ensureFishThumbnail(key).then((data) => {
      if (alive && data) setSrc(data);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return src;
}
