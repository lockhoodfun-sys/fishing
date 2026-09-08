CREATE OR REPLACE FUNCTION public.ensure_starter_gear(_wallet text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  _id text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE wallet_address = w) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_rods WHERE wallet_address = w) THEN
    SELECT id INTO _id FROM public.rod_tiers ORDER BY sort_order, id LIMIT 1;
    IF _id IS NOT NULL THEN
      INSERT INTO public.player_rods (wallet_address, rod_id, equipped)
      VALUES (w, _id, true)
      ON CONFLICT (wallet_address, rod_id) DO UPDATE SET equipped = true;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_baits WHERE wallet_address = w) THEN
    SELECT id INTO _id FROM public.bait_tiers ORDER BY sort_order, id LIMIT 1;
    IF _id IS NOT NULL THEN
      INSERT INTO public.player_baits (wallet_address, bait_id, equipped)
      VALUES (w, _id, true)
      ON CONFLICT (wallet_address, bait_id) DO UPDATE SET equipped = true;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.player_boats WHERE wallet_address = w) THEN
    SELECT id INTO _id FROM public.boat_tiers ORDER BY sort_order, id LIMIT 1;
    IF _id IS NOT NULL THEN
      INSERT INTO public.player_boats (wallet_address, boat_id, equipped)
      VALUES (w, _id, true)
      ON CONFLICT (wallet_address, boat_id) DO UPDATE SET equipped = true;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_rods(_wallet text)
RETURNS TABLE(rod_id text, name text, max_catch_weight_kg numeric, luck_percent numeric, speed_percent numeric, price_coins numeric, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.max_catch_weight_kg, t.luck_percent, t.speed_percent, t.price_coins,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.rod_tiers t
  LEFT JOIN public.player_rods p ON p.rod_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_baits(_wallet text)
RETURNS TABLE(bait_id text, name text, luck_percent numeric, price_coins numeric, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.luck_percent, t.price_coins,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.bait_tiers t
  LEFT JOIN public.player_baits p ON p.bait_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_boats(_wallet text)
RETURNS TABLE(boat_id text, name text, speed_percent numeric, price_coins numeric, equipped boolean, purchased_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name, t.speed_percent, t.price_coins,
         COALESCE(p.equipped, false), p.purchased_at
  FROM public.boat_tiers t
  LEFT JOIN public.player_boats p ON p.boat_id = t.id AND p.wallet_address = lower(_wallet)
  ORDER BY t.sort_order, t.id;
$function$;

CREATE OR REPLACE FUNCTION public.buy_rod(_wallet text, _rod_id text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  _price numeric;
  _prof public.profiles;
BEGIN
  SELECT price_coins INTO _price FROM public.rod_tiers WHERE id = _rod_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown rod'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_rods WHERE wallet_address = w AND rod_id = _rod_id) THEN
    RAISE EXCEPTION 'Already owned';
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
  _prof public.profiles;
BEGIN
  SELECT price_coins INTO _price FROM public.bait_tiers WHERE id = _bait_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown bait'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_baits WHERE wallet_address = w AND bait_id = _bait_id) THEN
    RAISE EXCEPTION 'Already owned';
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
  _prof public.profiles;
BEGIN
  SELECT price_coins INTO _price FROM public.boat_tiers WHERE id = _boat_id;
  IF _price IS NULL THEN RAISE EXCEPTION 'Unknown boat'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_boats WHERE wallet_address = w AND boat_id = _boat_id) THEN
    RAISE EXCEPTION 'Already owned';
  END IF;
  UPDATE public.profiles SET coins = coins - _price, updated_at = now()
  WHERE wallet_address = w AND coins >= _price RETURNING * INTO _prof;
  IF _prof IS NULL THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  INSERT INTO public.player_boats (wallet_address, boat_id, equipped) VALUES (w, _boat_id, false);
  RETURN _prof;
END;
$function$;

CREATE OR REPLACE FUNCTION public.equip_rod(_wallet text, _rod_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE w text := lower(_wallet);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.player_rods WHERE wallet_address = w AND rod_id = _rod_id) THEN
    RAISE EXCEPTION 'Rod not owned';
  END IF;
  UPDATE public.player_rods SET equipped = (rod_id = _rod_id) WHERE wallet_address = w;
END;
$function$;

CREATE OR REPLACE FUNCTION public.equip_bait(_wallet text, _bait_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE w text := lower(_wallet);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.player_baits WHERE wallet_address = w AND bait_id = _bait_id) THEN
    RAISE EXCEPTION 'Bait not owned';
  END IF;
  UPDATE public.player_baits SET equipped = (bait_id = _bait_id) WHERE wallet_address = w;
END;
$function$;

CREATE OR REPLACE FUNCTION public.equip_boat(_wallet text, _boat_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE w text := lower(_wallet);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.player_boats WHERE wallet_address = w AND boat_id = _boat_id) THEN
    RAISE EXCEPTION 'Boat not owned';
  END IF;
  UPDATE public.player_boats SET equipped = (boat_id = _boat_id) WHERE wallet_address = w;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_starter_gear(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_player_rods(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_player_baits(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_player_boats(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_rod(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_bait(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_boat(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equip_rod(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equip_bait(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equip_boat(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_starter_gear(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_player_rods(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_player_baits(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_player_boats(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_rod(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_bait(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_boat(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.equip_rod(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.equip_bait(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.equip_boat(text, text) TO service_role;
NOTIFY pgrst, 'reload schema';