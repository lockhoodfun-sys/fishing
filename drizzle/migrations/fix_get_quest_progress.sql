-- HOTFIX: get_quest_progress was wrongly declared STABLE while its body
-- contains an INSERT (creates the player's default quest-progress row on
-- first visit). Postgres rejects data-modifying statements inside a STABLE
-- function — that's the "SELECT is not allowed in a non-volatile function"
-- error. Re-declaring without STABLE (default VOLATILE) fixes it. Logic is
-- unchanged, only the LANGUAGE/volatility line differs from 0008.
DROP FUNCTION IF EXISTS public.get_quest_progress(text);
CREATE OR REPLACE FUNCTION public.get_quest_progress(_wallet text)
RETURNS TABLE(
  quest_id text, order_index integer, title text, description text,
  requirement jsonb, reward_coins numeric, progress_value numeric, status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH p AS (
    INSERT INTO public.player_quest_progress (wallet_address)
    VALUES (lower(_wallet))
    ON CONFLICT (wallet_address) DO NOTHING
    RETURNING *
  ), progress AS (
    SELECT * FROM p
    UNION ALL
    SELECT * FROM public.player_quest_progress WHERE wallet_address = lower(_wallet)
    LIMIT 1
  )
  SELECT q.id, q.order_index, q.title, q.description, q.requirement, q.reward_coins,
         progress.progress_value, progress.status
  FROM progress
  JOIN public.quest_definitions q ON q.order_index = progress.current_quest_order;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_quest_progress(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_quest_progress(text) TO service_role;
