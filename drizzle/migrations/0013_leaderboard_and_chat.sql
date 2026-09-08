-- =============================================================================
-- 0013_leaderboard_and_chat.sql
-- Feature: global leaderboard (by level/XP, coins, or total fish caught) and a
-- global chat room.
--
-- Design notes, mirroring the security model already used across this app:
--   - Leaderboard reads NEVER touch `profiles` directly from the client (that
--     table has zero anon/authenticated policies, same as everywhere else in
--     this app) -- get_leaderboard / get_my_leaderboard_rank are
--     SECURITY DEFINER, service_role only, called from leaderboard.functions.ts
--     the same way get_player_rods() etc. already are.
--   - Chat is different: messages are public by nature, so `chat_messages`
--     gets its own public-read policy (same category as fish_species,
--     rod_tiers, etc. at the top of 0000_gofish_base_schema.sql). Only
--     SELECT is granted to anon/authenticated -- every INSERT goes through
--     send_chat_message (SECURITY DEFINER, service_role only) so the
--     wallet/username/cooldown/length checks can never be bypassed
--     client-side, and Realtime (postgres_changes) can subscribe directly
--     against the public read policy without a server round trip.
--   - fish_common/rare/epic/legendary/mythic on `profiles` are all-time catch
--     counters that are never decremented by sell_fish, so "total fish
--     caught" is already a safe, persistent leaderboard stat.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Leaderboard: read-only aggregates over `profiles`, ranked server-side.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leaderboard(_sort_by text, _limit integer)
RETURNS TABLE (
  rank bigint,
  wallet_address text,
  username text,
  display_name text,
  avatar_url text,
  level integer,
  xp integer,
  coins numeric,
  total_fish integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE WHEN _sort_by = 'coins' THEN p.coins END DESC NULLS LAST,
          CASE WHEN _sort_by = 'fish' THEN
            (p.fish_common + p.fish_rare + p.fish_epic + p.fish_legendary + p.fish_mythic)
          END DESC NULLS LAST,
          CASE WHEN _sort_by NOT IN ('coins', 'fish') THEN p.xp END DESC NULLS LAST,
          p.wallet_address ASC
      ) AS rank,
      p.wallet_address,
      p.username,
      p.display_name,
      p.avatar_url,
      p.level,
      p.xp,
      p.coins,
      (p.fish_common + p.fish_rare + p.fish_epic + p.fish_legendary + p.fish_mythic)::integer AS total_fish
    FROM public.profiles p
  ) ranked
  ORDER BY ranked.rank
  LIMIT greatest(1, least(coalesce(_limit, 50), 100));
$function$;

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_rank(_wallet text, _sort_by text)
RETURNS TABLE (
  rank bigint,
  wallet_address text,
  username text,
  display_name text,
  avatar_url text,
  level integer,
  xp integer,
  coins numeric,
  total_fish integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          CASE WHEN _sort_by = 'coins' THEN p.coins END DESC NULLS LAST,
          CASE WHEN _sort_by = 'fish' THEN
            (p.fish_common + p.fish_rare + p.fish_epic + p.fish_legendary + p.fish_mythic)
          END DESC NULLS LAST,
          CASE WHEN _sort_by NOT IN ('coins', 'fish') THEN p.xp END DESC NULLS LAST,
          p.wallet_address ASC
      ) AS rank,
      p.*
    FROM public.profiles p
  )
  SELECT
    ranked.rank,
    ranked.wallet_address,
    ranked.username,
    ranked.display_name,
    ranked.avatar_url,
    ranked.level,
    ranked.xp,
    ranked.coins,
    (ranked.fish_common + ranked.fish_rare + ranked.fish_epic + ranked.fish_legendary + ranked.fish_mythic)::integer AS total_fish
  FROM ranked
  WHERE ranked.wallet_address = lower(_wallet);
$function$;

REVOKE ALL ON FUNCTION public.get_leaderboard(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_rank(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_rank(text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Global chat
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  -- Denormalized snapshot of the sender's identity at send time, so the chat
  -- feed never has to join profiles (and still reads fine if a username
  -- later changes).
  username text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages (created_at DESC);

INSERT INTO public.game_config (key, value) VALUES
  ('chat_cooldown_seconds', 2)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON public.chat_messages FOR SELECT TO anon, authenticated USING (true);
-- No insert/update/delete policy for anon/authenticated: writes only ever
-- happen through send_chat_message below.

GRANT SELECT ON public.chat_messages TO anon, authenticated;
GRANT ALL ON public.chat_messages TO service_role;

-- Let the client subscribe to new messages directly (Realtime honors the
-- "public read" policy above, so this never exposes anything the SELECT
-- grant doesn't already allow).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.send_chat_message(_wallet text, _message text)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  cleaned text := btrim(_message);
  cooldown_seconds numeric;
  last_sent timestamptz;
  prof public.profiles;
  result public.chat_messages;
BEGIN
  IF cleaned = '' OR char_length(cleaned) > 240 THEN
    RAISE EXCEPTION 'Message must be between 1 and 240 characters.';
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE wallet_address = w;
  IF prof IS NULL THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  SELECT value INTO cooldown_seconds FROM public.game_config WHERE key = 'chat_cooldown_seconds';
  cooldown_seconds := coalesce(cooldown_seconds, 2);

  SELECT created_at INTO last_sent FROM public.chat_messages
    WHERE wallet_address = w ORDER BY created_at DESC LIMIT 1;
  IF last_sent IS NOT NULL AND now() < last_sent + make_interval(secs => cooldown_seconds) THEN
    RAISE EXCEPTION 'Slow down before sending another message.';
  END IF;

  INSERT INTO public.chat_messages (wallet_address, username, display_name, avatar_url, message)
  VALUES (w, prof.username, prof.display_name, prof.avatar_url, cleaned)
  RETURNING * INTO result;

  -- Keep the table small: retain only the most recent 200 messages globally.
  DELETE FROM public.chat_messages
  WHERE id NOT IN (
    SELECT id FROM public.chat_messages ORDER BY created_at DESC LIMIT 200
  );

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_chat_message(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
