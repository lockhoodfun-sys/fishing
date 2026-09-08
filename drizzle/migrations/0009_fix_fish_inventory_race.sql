-- =============================================================================
-- 0009_fix_fish_inventory_race.sql
-- Fix: race condition between sell_fish() and claim_npc_reward() on the same
-- wallet's fish_inventory_items rows.
--
-- Bug: claim_npc_reward() first SELECT count(*)s fish per rarity to decide
-- how many reward packages to grant (v_max_packages / v_base_gold), and only
-- LATER runs the actual DELETE for those fish. Nothing locks the rows in
-- between. If sell_fish() runs concurrently on the same wallet and deletes
-- the same fish first, claim_npc_reward()'s gold amount was already computed
-- from stale stock -- the player ends up both selling those fish for coins
-- AND getting NPC gold for fish that were "spent" twice.
--
-- Fix: both functions now take a per-wallet transaction-scoped advisory lock
-- (pg_advisory_xact_lock) as their very first statement, keyed by the wallet
-- address. This serializes ALL fish_inventory_items-touching operations for
-- a given wallet -- whichever function gets there first finishes its whole
-- count-then-mutate sequence before the other is allowed to start, so counts
-- can never go stale mid-function. The lock is released automatically at
-- COMMIT/ROLLBACK, so there's no separate unlock step to forget.
--
-- No schema changes -- functions only.
-- =============================================================================

-- ---- sell_fish ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sell_fish(_wallet text, _item_id uuid, _species_id text, _sell_all boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.profiles;
  earned numeric := 0;
BEGIN
  -- Serialize against claim_npc_reward() (and any other future function)
  -- touching this wallet's fish_inventory_items.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(_wallet), 0));

  WITH sold AS (
    DELETE FROM public.fish_inventory_items f
    WHERE f.wallet_address = _wallet
      AND (_sell_all IS TRUE
           OR (_item_id IS NOT NULL AND f.id = _item_id)
           OR (_species_id IS NOT NULL AND f.species_id = _species_id))
    RETURNING f.species_id, f.weight_kg, f.mutation_key
  )
  SELECT coalesce(sum(
    s.weight_kg
    * coalesce(sp.base_price_per_kg, 1)
    * coalesce((SELECT m.multiplier FROM public.mutations m WHERE m.key = s.mutation_key), 1)
  ), 0)
  INTO earned
  FROM sold s
  LEFT JOIN public.fish_species sp ON sp.id = s.species_id;

  UPDATE public.profiles
     SET coins = coins + round(earned), updated_at = now()
   WHERE wallet_address = _wallet
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ---- claim_npc_reward ---------------------------------------------------------
-- Same body as 0008's version, with one line added at the top of BEGIN.
DROP FUNCTION IF EXISTS public.claim_npc_reward(text, uuid, text);
CREATE OR REPLACE FUNCTION public.claim_npc_reward(_wallet text, _event_id uuid, _tier_id text)
RETURNS TABLE(
  gold_earned numeric,
  base_packages_claimed integer,
  bonus_earned numeric,
  new_gold_balance numeric,
  consumed jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_level integer;
  v_tier public.fish_hold_tiers;
  v_event public.npc_reward_events;
  v_claim public.npc_reward_claims;
  v_base_req jsonb;
  v_bonus_req jsonb;
  v_req record;
  v_stock numeric;
  v_max_packages integer := NULL;
  v_base_gold numeric := 0;
  v_bonus_gold numeric := 0;
  v_total_new_gold numeric := 0;
  v_cap numeric;
  v_room numeric;
  v_consumed jsonb := '[]'::jsonb;
  v_deleted_ids uuid[];
  v_result_profile public.profiles;
BEGIN
  -- Serialize against sell_fish() (and any other future function) touching
  -- this wallet's fish_inventory_items. Must be the very first statement so
  -- the stock counts below can never go stale before the DELETEs later in
  -- this same function run.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_wallet, 0));

  SELECT level INTO v_level FROM public.profiles WHERE wallet_address = v_wallet;
  IF v_level IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF v_level < (SELECT value FROM public.npc_reward_config WHERE key = 'min_level') THEN
    RAISE EXCEPTION 'Level too low to access the reward NPC';
  END IF;

  SELECT * INTO v_tier FROM public.fish_hold_tiers WHERE id = _tier_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Not eligible: insufficient token hold value';
  END IF;

  SELECT * INTO v_event FROM public.npc_reward_events WHERE id = _event_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'NPC event not found';
  END IF;
  IF now() < v_event.spawn_at OR now() >= v_event.expire_at THEN
    RAISE EXCEPTION 'NPC is not available right now';
  END IF;

  INSERT INTO public.npc_reward_claims (event_id, wallet_address)
  VALUES (_event_id, v_wallet)
  ON CONFLICT (event_id, wallet_address) DO NOTHING;

  SELECT * INTO v_claim FROM public.npc_reward_claims
    WHERE event_id = _event_id AND wallet_address = v_wallet
    FOR UPDATE;

  -- Remaining generation room for this visit/tier. Tier "unlimited" = NULL cap.
  v_cap := v_tier.generation_cap_gold;
  IF v_cap IS NOT NULL THEN
    v_room := v_cap - v_claim.total_gold_earned;
    IF v_room <= 0 THEN
      RAISE EXCEPTION 'Generation cap for this visit already reached';
    END IF;
  END IF;

  -- ---- Base requirement: scarcest-resource-limited, all-or-nothing per package ----
  -- Safe from the sell_fish race now: the advisory lock above guarantees no
  -- concurrent sell_fish() call for this wallet can run between this count
  -- and the DELETE further down.
  v_base_req := v_event.base_requirement;
  FOR v_req IN SELECT * FROM jsonb_to_recordset(v_base_req) AS x(rarity text, qty numeric)
  LOOP
    SELECT count(*) INTO v_stock
      FROM public.fish_inventory_items f
      JOIN public.fish_species sp ON sp.id = f.species_id
      WHERE f.wallet_address = v_wallet AND sp.rarity = v_req.rarity;

    IF v_req.qty > 0 THEN
      IF v_max_packages IS NULL THEN
        v_max_packages := floor(v_stock / v_req.qty)::integer;
      ELSE
        v_max_packages := least(v_max_packages, floor(v_stock / v_req.qty)::integer);
      END IF;
    END IF;
  END LOOP;
  v_max_packages := greatest(coalesce(v_max_packages, 0), 0);

  -- Cap packages by remaining tier room (base_reward_gold per package).
  DECLARE
    v_gold_per_pkg numeric := (SELECT value FROM public.npc_reward_config WHERE key = 'base_reward_gold');
  BEGIN
    IF v_gold_per_pkg > 0 AND v_cap IS NOT NULL THEN
      v_max_packages := least(v_max_packages, floor(v_room / v_gold_per_pkg)::integer);
    END IF;
    v_base_gold := v_max_packages * v_gold_per_pkg;
  END;

  -- Consume fish for the packages actually claimed (delete oldest-first per rarity).
  IF v_max_packages > 0 THEN
    FOR v_req IN SELECT * FROM jsonb_to_recordset(v_base_req) AS x(rarity text, qty numeric)
    LOOP
      IF v_req.qty > 0 THEN
        WITH to_delete AS (
          SELECT f.id FROM public.fish_inventory_items f
            JOIN public.fish_species sp ON sp.id = f.species_id
            WHERE f.wallet_address = v_wallet AND sp.rarity = v_req.rarity
            ORDER BY f.caught_at ASC
            LIMIT (v_req.qty * v_max_packages)::integer
        ), deleted AS (
          DELETE FROM public.fish_inventory_items f
          WHERE f.id IN (SELECT id FROM to_delete)
          RETURNING f.id
        )
        SELECT array_agg(id) INTO v_deleted_ids FROM deleted;

        v_consumed := v_consumed || jsonb_build_object(
          'rarity', v_req.rarity,
          'qty', v_req.qty * v_max_packages
        );
      END IF;
    END LOOP;
  END IF;

  -- ---- Bonus (once per visit, does not stack, still capped by tier room) ----
  v_bonus_req := v_event.bonus_requirement;
  IF NOT v_claim.bonus_claimed THEN
    DECLARE
      v_bonus_room numeric := CASE WHEN v_cap IS NULL THEN NULL ELSE v_room - v_base_gold END;
      v_can_bonus boolean := true;
      v_bonus_gold_total numeric := 0;
      v_bonus_consumed jsonb := '[]'::jsonb;
    BEGIN
      FOR v_req IN SELECT * FROM jsonb_to_recordset(v_bonus_req) AS x(rarity text, qty numeric, gold numeric)
      LOOP
        SELECT count(*) INTO v_stock
          FROM public.fish_inventory_items f
          JOIN public.fish_species sp ON sp.id = f.species_id
          WHERE f.wallet_address = v_wallet AND sp.rarity = v_req.rarity;
        IF v_stock < v_req.qty THEN
          v_can_bonus := false;
        END IF;
      END LOOP;

      IF v_can_bonus THEN
        SELECT coalesce(sum((x->>'gold')::numeric), 0) INTO v_bonus_gold_total
          FROM jsonb_array_elements(v_bonus_req) x;

        IF v_bonus_room IS NOT NULL AND v_bonus_gold_total > v_bonus_room THEN
          v_can_bonus := false;
        END IF;
      END IF;

      IF v_can_bonus THEN
        FOR v_req IN SELECT * FROM jsonb_to_recordset(v_bonus_req) AS x(rarity text, qty numeric, gold numeric)
        LOOP
          WITH to_delete AS (
            SELECT f.id FROM public.fish_inventory_items f
              JOIN public.fish_species sp ON sp.id = f.species_id
              WHERE f.wallet_address = v_wallet AND sp.rarity = v_req.rarity
              ORDER BY f.caught_at ASC
              LIMIT v_req.qty::integer
          ), deleted AS (
            DELETE FROM public.fish_inventory_items f
            WHERE f.id IN (SELECT id FROM to_delete)
            RETURNING f.id
          )
          SELECT array_agg(id) INTO v_deleted_ids FROM deleted;

          v_bonus_consumed := v_bonus_consumed || jsonb_build_object('rarity', v_req.rarity, 'qty', v_req.qty);
        END LOOP;

        v_bonus_gold := v_bonus_gold_total;
        v_consumed := v_consumed || v_bonus_consumed;
      END IF;
    END;
  END IF;

  v_total_new_gold := v_base_gold + v_bonus_gold;

  IF v_total_new_gold <= 0 THEN
    RAISE EXCEPTION 'Not enough fish in inventory to claim anything right now';
  END IF;

  UPDATE public.npc_reward_claims
     SET base_claims_count = base_claims_count + v_max_packages,
         bonus_claimed = bonus_claimed OR (v_bonus_gold > 0),
         total_gold_earned = total_gold_earned + v_total_new_gold,
         updated_at = now()
   WHERE event_id = _event_id AND wallet_address = v_wallet;

  UPDATE public.profiles
     SET gold = gold + v_total_new_gold, updated_at = now()
   WHERE wallet_address = v_wallet
  RETURNING * INTO v_result_profile;

  INSERT INTO public.gold_ledger (wallet_address, amount, reason, balance_after, metadata)
  VALUES (
    v_wallet,
    v_total_new_gold,
    CASE WHEN v_bonus_gold > 0 AND v_base_gold = 0 THEN 'npc_bonus_claim' ELSE 'npc_base_claim' END,
    v_result_profile.gold,
    jsonb_build_object('event_id', _event_id, 'base_gold', v_base_gold, 'bonus_gold', v_bonus_gold, 'consumed', v_consumed)
  );

  RETURN QUERY SELECT v_total_new_gold, v_max_packages, v_bonus_gold, v_result_profile.gold, v_consumed;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_npc_reward(text, uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_npc_reward(text, uuid, text) TO service_role;
