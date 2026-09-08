-- =============================================================================
-- 0012_extreme_multi_requirement_quests.sql
-- Feature: replace the old "one requirement, coins only" quest chain with a
-- 10-quest "extreme" chain where every quest can demand MULTIPLE things at
-- once (catch + sell + buy gear, mixed) and pays BOTH coins and XP.
--
-- Shape changes:
--   quest_definitions.requirement  : jsonb OBJECT  -> jsonb ARRAY of objects
--                                    each object is {"type","key","qty"}
--                                    type in ('catch_count','sell_count',
--                                             'buy_rod','buy_bait','buy_boat')
--                                    key  = rarity (catch_count/sell_count)
--                                           or tier id (buy_rod/buy_bait/buy_boat)
--   quest_definitions.reward_xp    : NEW column, paid alongside reward_coins
--   player_quest_progress.progress_value : numeric -> jsonb ARRAY of numbers,
--                                    one counter per requirement, same index
--
-- Because the shape of `requirement`/`progress_value` changes, every
-- player's in-flight progress is reset to quest 1 -- there is no sane way to
-- map old single-counter progress onto the new multi-requirement quests.
--
-- Hooks added so EVERY player-facing economy action can drive quest
-- progress, not just catching fish: sell_fish, buy_rod, buy_bait, buy_boat
-- now all call advance_quest_progress internally (in the same transaction,
-- via the SECURITY DEFINER function itself), so callers in TS don't need to
-- change except record_catch's existing best-effort call (signature grew).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema changes
-- -----------------------------------------------------------------------------
ALTER TABLE public.quest_definitions DROP CONSTRAINT IF EXISTS quest_definitions_reward_coins_check;
ALTER TABLE public.quest_definitions ADD CONSTRAINT quest_definitions_reward_coins_check CHECK (reward_coins <= 200000);

ALTER TABLE public.quest_definitions ADD COLUMN IF NOT EXISTS reward_xp numeric NOT NULL DEFAULT 0 CHECK (reward_xp <= 50000);

-- player_quest_progress.progress_value: numeric -> jsonb array, via a swap
-- column (Postgres can't just retype numeric -> jsonb in place sensibly).
ALTER TABLE public.player_quest_progress ADD COLUMN IF NOT EXISTS progress_value_v2 jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.player_quest_progress DROP COLUMN IF EXISTS progress_value;
ALTER TABLE public.player_quest_progress RENAME COLUMN progress_value_v2 TO progress_value;

-- -----------------------------------------------------------------------------
-- 2. Reset the quest chain: wipe the old 10 easy quests, seed the new
--    "extreme" 10-quest chain. Every quest below touches a different mix of
--    the game's systems (catching every rarity, selling fish, buying every
--    non-starter rod/bait/boat tier) so completing the chain means the
--    player has tried everything gofish has to offer.
-- -----------------------------------------------------------------------------
DELETE FROM public.quest_definitions;

INSERT INTO public.quest_definitions (id, order_index, title, description, requirement, reward_coins, reward_xp) VALUES
  ('quest_01', 1,
   'A Challenging Start',
   'Catch 250 common fish, then sell 100 common fish.',
   '[{"type":"catch_count","key":"common","qty":250},
     {"type":"sell_count","key":"common","qty":100}]'::jsonb,
   500, 150),

  ('quest_02', 2,
   'The Angler''s Gear',
   'Catch 150 common fish, sell 50 common fish, then upgrade both your rod and bait to Uncommon tier.',
   '[{"type":"catch_count","key":"common","qty":150},
     {"type":"sell_count","key":"common","qty":50},
     {"type":"buy_rod","key":"uncommon","qty":1},
     {"type":"buy_bait","key":"uncommon","qty":1}]'::jsonb,
   1200, 400),

  ('quest_03', 3,
   'Rare Pursuit',
   'Catch 100 common fish and 50 rare fish, then sell 50 common fish and 20 rare fish.',
   '[{"type":"catch_count","key":"common","qty":100},
     {"type":"catch_count","key":"rare","qty":50},
     {"type":"sell_count","key":"common","qty":50},
     {"type":"sell_count","key":"rare","qty":20}]'::jsonb,
   2500, 800),

  ('quest_04', 4,
   'Breaking Into Epic',
   'Catch 50 common fish and 25 epic fish, sell 30 rare fish, then upgrade your rod to Rare tier.',
   '[{"type":"catch_count","key":"common","qty":50},
     {"type":"catch_count","key":"epic","qty":25},
     {"type":"sell_count","key":"rare","qty":30},
     {"type":"buy_rod","key":"rare","qty":1}]'::jsonb,
   5000, 1500),

  ('quest_05', 5,
   'Seasoned Angler',
   'Catch 80 rare fish and 15 epic fish, sell 40 epic fish, then upgrade your bait to Rare tier.',
   '[{"type":"catch_count","key":"rare","qty":80},
     {"type":"catch_count","key":"epic","qty":15},
     {"type":"sell_count","key":"epic","qty":40},
     {"type":"buy_bait","key":"rare","qty":1}]'::jsonb,
   9000, 2500),

  ('quest_06', 6,
   'New Captain',
   'Catch 40 epic fish and 5 legendary fish, upgrade your rod to Epic tier, then buy the Reef Runner boat.',
   '[{"type":"catch_count","key":"epic","qty":40},
     {"type":"catch_count","key":"legendary","qty":5},
     {"type":"buy_rod","key":"epic","qty":1},
     {"type":"buy_boat","key":"reef_runner","qty":1}]'::jsonb,
   16000, 4000),

  ('quest_07', 7,
   'A Legend in the Making',
   'Catch 20 legendary fish, sell 60 epic fish, upgrade your bait to Epic tier, then buy the Bow Raider boat.',
   '[{"type":"catch_count","key":"legendary","qty":20},
     {"type":"sell_count","key":"epic","qty":60},
     {"type":"buy_bait","key":"epic","qty":1},
     {"type":"buy_boat","key":"bow_raider","qty":1}]'::jsonb,
   30000, 7000),

  ('quest_08', 8,
   'Conqueror of the Depths',
   'Catch 60 epic fish, 10 legendary fish, and 2 mythic fish, then upgrade your rod to Legendary tier.',
   '[{"type":"catch_count","key":"epic","qty":60},
     {"type":"catch_count","key":"legendary","qty":10},
     {"type":"catch_count","key":"mythic","qty":2},
     {"type":"buy_rod","key":"legendary","qty":1}]'::jsonb,
   55000, 12000),

  ('quest_09', 9,
   'On the Verge of Myth',
   'Catch 15 legendary fish and 5 mythic fish, upgrade your bait to Legendary tier, then buy the Sea Marshal boat.',
   '[{"type":"catch_count","key":"legendary","qty":15},
     {"type":"catch_count","key":"mythic","qty":5},
     {"type":"buy_bait","key":"legendary","qty":1},
     {"type":"buy_boat","key":"sea_marshal","qty":1}]'::jsonb,
   90000, 18000),

  ('quest_10', 10,
   'The True Mythic Angler',
   'Catch 10 mythic fish, sell 5 legendary fish, then gear up fully with Mythic-tier rod, bait, and boat (Vex Yacht).',
   '[{"type":"catch_count","key":"mythic","qty":10},
     {"type":"sell_count","key":"legendary","qty":5},
     {"type":"buy_rod","key":"mythic","qty":1},
     {"type":"buy_bait","key":"mythic","qty":1},
     {"type":"buy_boat","key":"vex_yacht","qty":1}]'::jsonb,
   150000, 30000)
ON CONFLICT (id) DO UPDATE SET
  order_index = EXCLUDED.order_index, title = EXCLUDED.title, description = EXCLUDED.description,
  requirement = EXCLUDED.requirement, reward_coins = EXCLUDED.reward_coins, reward_xp = EXCLUDED.reward_xp;

-- Every in-flight player restarts the (now completely different) chain at
-- quest 1 with a clean progress array.
UPDATE public.player_quest_progress
   SET current_quest_order = 1,
       progress_value = '[]'::jsonb,
       status = 'active',
       updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. get_quest_progress -- now also returns reward_xp, progress_value is jsonb
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_quest_progress(text);
CREATE OR REPLACE FUNCTION public.get_quest_progress(_wallet text)
RETURNS TABLE(
  quest_id text, order_index integer, title text, description text,
  requirement jsonb, reward_coins numeric, reward_xp numeric,
  progress_value jsonb, status text
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
  SELECT q.id, q.order_index, q.title, q.description, q.requirement, q.reward_coins, q.reward_xp,
         progress.progress_value, progress.status
  FROM progress
  JOIN public.quest_definitions q ON q.order_index = progress.current_quest_order;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_quest_progress(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_quest_progress(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. claim_quest_reward -- checks EVERY requirement in the array, pays coins
--    AND xp (with level recomputed the same way record_catch does).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_quest_reward(text);
CREATE OR REPLACE FUNCTION public.claim_quest_reward(_wallet text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_progress public.player_quest_progress;
  v_quest public.quest_definitions;
  v_reqs jsonb;
  v_old jsonb;
  v_i integer;
  v_n integer;
  v_req jsonb;
  v_val numeric;
  v_result public.profiles;
  v_next_order integer;
BEGIN
  SELECT * INTO v_progress FROM public.player_quest_progress WHERE wallet_address = v_wallet FOR UPDATE;
  IF v_progress IS NULL THEN
    RAISE EXCEPTION 'No quest progress found';
  END IF;

  SELECT * INTO v_quest FROM public.quest_definitions WHERE order_index = v_progress.current_quest_order;
  IF v_quest IS NULL THEN
    RAISE EXCEPTION 'No active quest';
  END IF;

  v_reqs := v_quest.requirement;
  v_old := coalesce(v_progress.progress_value, '[]'::jsonb);
  v_n := jsonb_array_length(v_reqs);

  FOR v_i IN 0..v_n - 1 LOOP
    v_req := v_reqs -> v_i;
    v_val := coalesce((v_old -> v_i)::numeric, 0);
    IF v_val < (v_req ->> 'qty')::numeric THEN
      RAISE EXCEPTION 'Quest requirement not met yet';
    END IF;
  END LOOP;

  UPDATE public.profiles
     SET coins = coins + v_quest.reward_coins,
         xp = xp + v_quest.reward_xp,
         level = public.level_for_xp(xp + v_quest.reward_xp),
         updated_at = now()
   WHERE wallet_address = v_wallet
  RETURNING * INTO v_result;

  SELECT min(order_index) INTO v_next_order FROM public.quest_definitions WHERE order_index > v_progress.current_quest_order;

  UPDATE public.player_quest_progress
     SET current_quest_order = coalesce(v_next_order, v_progress.current_quest_order),
         progress_value = '[]'::jsonb,
         status = CASE WHEN v_next_order IS NULL THEN 'claimed' ELSE 'active' END,
         updated_at = now()
   WHERE wallet_address = v_wallet;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_quest_reward(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. advance_quest_progress -- generic now: (_event_type, _key, _qty) instead
--    of the old catch-only (_rarity). Bumps EVERY matching requirement slot
--    in the active quest's requirement array by _qty (capped at that slot's
--    qty), and flips status to completed_unclaimed once ALL slots are full.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.advance_quest_progress(text, text);
CREATE OR REPLACE FUNCTION public.advance_quest_progress(_wallet text, _event_type text, _key text, _qty numeric DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_progress public.player_quest_progress;
  v_quest public.quest_definitions;
  v_reqs jsonb;
  v_old jsonb;
  v_new jsonb := '[]'::jsonb;
  v_i integer;
  v_n integer;
  v_req jsonb;
  v_old_val numeric;
  v_new_val numeric;
  v_all_done boolean := true;
BEGIN
  INSERT INTO public.player_quest_progress (wallet_address)
  VALUES (v_wallet)
  ON CONFLICT (wallet_address) DO NOTHING;

  SELECT * INTO v_progress FROM public.player_quest_progress WHERE wallet_address = v_wallet FOR UPDATE;
  IF v_progress.status <> 'active' THEN
    RETURN;
  END IF;

  SELECT * INTO v_quest FROM public.quest_definitions WHERE order_index = v_progress.current_quest_order;
  IF v_quest IS NULL THEN
    RETURN;
  END IF;

  v_reqs := v_quest.requirement;
  v_old := coalesce(v_progress.progress_value, '[]'::jsonb);
  v_n := jsonb_array_length(v_reqs);

  FOR v_i IN 0..v_n - 1 LOOP
    v_req := v_reqs -> v_i;
    v_old_val := coalesce((v_old -> v_i)::numeric, 0);
    IF v_req ->> 'type' = _event_type AND v_req ->> 'key' = _key THEN
      v_new_val := least(v_old_val + _qty, (v_req ->> 'qty')::numeric);
    ELSE
      v_new_val := v_old_val;
    END IF;
    v_new := v_new || to_jsonb(v_new_val);
    IF v_new_val < (v_req ->> 'qty')::numeric THEN
      v_all_done := false;
    END IF;
  END LOOP;

  UPDATE public.player_quest_progress
     SET progress_value = v_new,
         status = CASE WHEN v_all_done THEN 'completed_unclaimed' ELSE 'active' END,
         updated_at = now()
   WHERE wallet_address = v_wallet;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.advance_quest_progress(text, text, text, numeric) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.advance_quest_progress(text, text, text, numeric) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. sell_fish -- now also drives sell_count quest progress, per rarity sold,
--    in the SAME transaction as the sale (best-effort catch-up is not needed
--    since we're already inside the SECURITY DEFINER function).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_fish(_wallet text, _item_id uuid, _species_id text, _sell_all boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.profiles;
  earned numeric := 0;
  r record;
BEGIN
  -- Serialize against claim_npc_reward() (and any other future function)
  -- touching this wallet's fish_inventory_items.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(_wallet), 0));

  CREATE TEMP TABLE _sold_fish ON COMMIT DROP AS
  WITH sold AS (
    DELETE FROM public.fish_inventory_items f
    WHERE f.wallet_address = _wallet
      AND (_sell_all IS TRUE
           OR (_item_id IS NOT NULL AND f.id = _item_id)
           OR (_species_id IS NOT NULL AND f.species_id = _species_id))
    RETURNING f.species_id, f.weight_kg, f.mutation_key
  )
  SELECT s.species_id, s.weight_kg, s.mutation_key, sp.rarity, sp.base_price_per_kg
  FROM sold s
  LEFT JOIN public.fish_species sp ON sp.id = s.species_id;

  SELECT coalesce(sum(
    s.weight_kg
    * coalesce(s.base_price_per_kg, 1)
    * coalesce((SELECT m.multiplier FROM public.mutations m WHERE m.key = s.mutation_key), 1)
  ), 0)
  INTO earned
  FROM _sold_fish s;

  UPDATE public.profiles
     SET coins = coins + round(earned), updated_at = now()
   WHERE wallet_address = _wallet
  RETURNING * INTO result;

  FOR r IN
    SELECT rarity, count(*) AS qty
    FROM _sold_fish
    WHERE rarity IS NOT NULL
    GROUP BY rarity
  LOOP
    PERFORM public.advance_quest_progress(_wallet, 'sell_count', r.rarity, r.qty);
  END LOOP;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. buy_rod / buy_bait / buy_boat -- each now also drives its matching
--    buy_rod / buy_bait / buy_boat quest requirement, keyed by tier id.
-- -----------------------------------------------------------------------------
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
  PERFORM public.advance_quest_progress(w, 'buy_rod', _rod_id, 1);
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
  PERFORM public.advance_quest_progress(w, 'buy_bait', _bait_id, 1);
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
  PERFORM public.advance_quest_progress(w, 'buy_boat', _boat_id, 1);
  RETURN _prof;
END;
$function$;

REVOKE ALL ON FUNCTION public.buy_rod(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_bait(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buy_boat(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_rod(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_bait(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_boat(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
