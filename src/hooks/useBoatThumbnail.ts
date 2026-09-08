import { useEffect, useState } from "react";
import { ensureBoatThumbnail, boatThumbnail } from "@/lib/boatThumbnails";

/** Bag icon rendered straight from the boat tier's GLB (null until it's ready). */
export function useBoatThumbnail(boatId: string, url: string): string | null {
  const [src, setSrc] = useState<string | null>(() => boatThumbnail(boatId));

  useEffect(() => {
    let alive = true;
    setSrc(boatThumbnail(boatId));
    void ensureBoatThumbnail(boatId, url).then((data) => {
      if (alive && data) setSrc(data);
    });
    return () => {
      alive = false;
    };
  }, [boatId, url]);

  return src;
}
