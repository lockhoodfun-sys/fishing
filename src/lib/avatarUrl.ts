import { supabase } from "@/integrations/supabase/client";

// Plenty for a single browsing session's worth of leaderboard/chat avatars —
// the `avatars` bucket is private, so every viewer (not just the owner)
// needs a signed URL. Mirrors the helper inlined in ProfilePanel.tsx.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

export async function resolveAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}
