-- =============================================================================
-- 0007_gear_level_gates.sql
-- Feature: level-gated gear tiers, per spec:
--   Starter/Basic/Wooden = level 1
--   Uncommon              = level 5
--   Rare                  = level 10
--   Epic                  = level 20
--   Legendary             = level 35
--   Mythic                = level 50
--
-- Applied uniformly to rod_tiers, bait_tiers, boat_tiers via each tier's
-- existing `sort_order` (1..6, see 0004_gofish_gear_columns_and_catalog.sql)
-- instead of matching on `id` per table — ids differ across the three
-- tables (e.g. "starter" vs "basic_bait" vs "wooden_dinghy") but sort_order
-- is consistently 1..6 in the same tier order in every one of them, so a
-- single CASE works for all three without risk of missing/mis-mapping a row.
--
-- Double-lock: buying now requires BOTH enough coins (existing check) AND
-- profile.level >= min_level (new). Equip is intentionally left untouched —
-- you can only equip gear you already own, and owning it already proved the
-- level gate was met at purchase time, so there is nothing to re-check there.
-- =============================================================================

-- 1. New column, defaulted to 1 so nothing existing becomes locked by accident
ALTER TABLE public.rod_tiers  ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 1;
ALTER TABLE public.bait_tiers ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 1;
ALTER TABLE public.boat_tiers ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 1;

-- 2. Populate by sort_order (identical 1..6 tier ladder in all three tables)
UPDATE public.rod_tiers SET min_level = CASE sort_order
  WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 10 WHEN 4 THEN 20 WHEN 5 THEN 35 WHEN 6 THEN 50
  ELSE min_level END;
UPDATE public.bait_tiers SET min_level = CASE sort_order
  WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 10 WHEN 4 THEN 20 WHEN 5 THEN 35 WHEN 6 THEN 50
  ELSE min_level END;
UPDATE public.boat_tiers SET min_level = CASE sort_order
  WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 10 WHEN 4 THEN 20 WHEN 5 THEN 35 WHEN 6 THEN 50
  ELSE min_level END;

-- 3. get_player_* now also returns min_level so the client can show a lock
--    state without a second round trip. Return shape changes, so the old
--    functions must be dropped before CREATE OR REPLACE (Postgres refuses to
--    change a function's OUT columns in place).
DROP FUNCTION IF EXISTS public.get_player_rods(text);
CREATE OR REPLACE FUNCTION public.get_player_rods(_wallet text)
RETURNS TABLE(rod_id text, name text, max_catch_weight_kg numeric, luck_percent numeric, speed_percent numeric, price_coins numeric, min_level integer, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.max_catch_weight_kg, t.luck_percent, t.speed_percent, t.price_coins, t.min_level,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.rod_tiers t
  LEFT JOIN public.player_rods p ON p.rod_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

DROP FUNCTION IF EXISTS public.get_player_baits(text);
CREATE OR REPLACE FUNCTION public.get_player_baits(_wallet text)
RETURNS TABLE(bait_id text, name text, luck_percent numeric, price_coins numeric, min_level integer, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.luck_percent, t.price_coins, t.min_level,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.bait_tiers t
  LEFT JOIN public.player_baits p ON p.bait_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

DROP FUNCTION IF EXISTS public.get_player_boats(text);
CREATE OR REPLACE FUNCTION public.get_player_boats(_wallet text)
RETURNS TABLE(boat_id text, name text, speed_percent numeric, price_coins numeric, min_level integer, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.speed_percent, t.price_coins, t.min_level,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.boat_tiers t
  LEFT JOIN public.player_boats p ON p.boat_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

-- 4. buy_* now enforce the level gate too, in addition to the existing
--    "already owned" and "enough coins" checks. Same signature as before
--    (CREATE OR REPLACE is safe here — only the function body changes).
CREATE OR REPLACE FUNCTION public.buy_rod(_wallet text, _rod_id text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  _price numeric;
  _min_level integer;
  _player_level integer;
  _prof public.profiles;
BEGIN
  SELECT price_coins, min_level INTO _price, _min_level FROM public.rod_tiers WHERE id = _rod_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown rod'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_rods WHERE wallet_address = w AND rod_id = _rod_id) THEN
    RAISE EXCEPTION 'Already owned';
  END IF;
  SELECT level INTO _player_level FROM public.profiles WHERE wallet_address = w;
  IF _player_level IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF _player_level < coalesce(_min_level, 1) THEN
    RAISE EXCEPTION 'Requires level %', coalesce(_min_level, 1);
  END IF;
  UPDATE public.profiles SET coins = coins - _price, updated_at = now()
  WHERE wallet_address = w AND coins >= _price RETURNING * INTO _prof;
  IF _prof IS NULL THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  INSERT INTO public.player_rods (wallet_address, rod_id, equipped) VALUES (w, _rod_id, false);
  RETURN _prof;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_bait(_wallet text, _bait_id text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  _price numeric;
  _min_level integer;
  _player_level integer;
  _prof public.profiles;
BEGIN
  SELECT price_coins, min_level INTO _price, _min_level FROM public.bait_tiers WHERE id = _bait_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown bait'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_baits WHERE wallet_address = w AND bait_id = _bait_id) THEN
    RAISE EXCEPTION 'Already owned';
  END IF;
  SELECT level INTO _player_level FROM public.profiles WHERE wallet_address = w;
  IF _player_level IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF _player_level < coalesce(_min_level, 1) THEN
    RAISE EXCEPTION 'Requires level %', coalesce(_min_level, 1);
  END IF;
  UPDATE public.profiles SET coins = coins - _price, updated_at = now()
  WHERE wallet_address = w AND coins >= _price RETURNING * INTO _prof;
  IF _prof IS NULL THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  INSERT INTO public.player_baits (wallet_address, bait_id, equipped) VALUES (w, _bait_id, false);
  RETURN _prof;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buy_boat(_wallet text, _boat_id text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  _price numeric;
  _min_level integer;
  _player_level integer;
  _prof public.profiles;
BEGIN
  SELECT price_coins, min_level INTO _price, _min_level FROM public.boat_tiers WHERE id = _boat_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown boat'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_boats WHERE wallet_address = w AND boat_id = _boat_id) THEN
    RAISE EXCEPTION 'Already owned';
  END IF;
  SELECT level INTO _player_level FROM public.profiles WHERE wallet_address = w;
  IF _player_level IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF _player_level < coalesce(_min_level, 1) THEN
    RAISE EXCEPTION 'Requires level %', coalesce(_min_level, 1);
  END IF;
  UPDATE public.profiles SET coins = coins - _price, updated_at = now()
  WHERE wallet_address = w AND coins >= _price RETURNING * INTO _prof;
  IF _prof IS NULL THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  INSERT INTO public.player_boats (wallet_address, boat_id, equipped) VALUES (w, _boat_id, false);
  RETURN _prof;
END;
$function$;

-- 5. Re-apply the same privilege lockdown as 20260905115237_*.sql — these
--    functions are recreated above (get_player_* dropped+recreated with new
--    OUT columns; buy_* replaced in place), so the grants need reasserting.
REVOKE ALL ON FUNCTION public.get_player_rods(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_player_baits(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_player_boats(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_rod(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_bait(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_boat(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_rods(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_player_baits(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_player_boats(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_rod(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_bait(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_boat(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
