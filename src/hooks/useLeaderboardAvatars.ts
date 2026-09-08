import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@/lib/leaderboard.functions";
import { resolveAvatarUrl } from "@/lib/avatarUrl";

/**
 * Resolves `avatar_url` storage paths for a set of leaderboard rows (plus
 * the viewer's own row) into loadable URLs, keyed by wallet address.
 * Shared by LeaderboardTracker and LeaderboardPanel so both stay in sync
 * without duplicating the resolution logic.
 */
export function useLeaderboardAvatars(
  entries: LeaderboardEntry[],
  me: LeaderboardEntry | null,
) {
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    const paths = new Map<string, string>();
    for (const e of entries) {
      if (e.avatar_url) paths.set(e.wallet_address, e.avatar_url);
    }
    if (me?.avatar_url) paths.set(me.wallet_address, me.avatar_url);
    void Promise.all(
      [...paths.entries()].map(async ([wallet, path]) => {
        const url = await resolveAvatarUrl(path);
        if (!cancelled) setAvatars((prev) => ({ ...prev, [wallet]: url }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [entries, me]);

  return avatars;
}