-- =============================================================================
-- 0008_gold_economy_and_quests.sql
-- Feature: gold currency (separate from coins), daily NPC gold reward tied to
-- level + on-chain hold-value tiers, gold withdrawal to ETH, and a simple
-- linear quest chain (coins reward, no relation to level gating).
--
-- Reference: docs/rencana-final-ekonomi-gofish.md (approved plan). Key rules
-- baked into the functions below:
--   - NPC reward access requires BOTH profile.level >= 5 AND hold-tier >= tier_10
--     (hold-tier is resolved in TS via onchain.server.ts and passed in as
--     _tier_id, since only Node/viem can read on-chain balance + GeckoTerminal
--     price; Postgres never talks to the chain).
--   - Base requirement claim is all-or-nothing per package, limited by the
--     scarcest rarity relative to requirement (floor of min ratio across
--     rarities in the requirement). Leftover fish stay in inventory.
--   - Fish consumed come from fish_inventory_items (real per-fish stock), which
--     has NO rarity column itself -- rarity lives on fish_species.rarity, so
--     every claim computation joins fish_inventory_items to fish_species.
--   - Everything is tier-capped: base + bonus gold earned per NPC visit (per
--     event) can never exceed the wallet's tier generation cap for that visit.
--   - Withdrawal min/max/frequency are enforced from fish_hold_tiers, keyed by
--     the same _tier_id passed in from TS.
--   - Treasury is assumed always sufficient -- no pending/fallback state.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles: new `gold` balance column
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gold numeric NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 2. gold_ledger -- mandatory audit trail (gold is convertible to ETH)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gold_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  amount numeric NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'npc_base_claim', 'npc_bonus_claim', 'withdrawal_locked',
    'withdrawal_rejected_refund', 'admin_adjustment'
  )),
  balance_after numeric NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gold_ledger_wallet_idx ON public.gold_ledger (wallet_address, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. npc_reward_config -- tweakable params, no redeploy needed
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.npc_reward_config (
  key text PRIMARY KEY,
  value numeric NOT NULL
);

INSERT INTO public.npc_reward_config (key, value) VALUES
  ('common_min', 100), ('common_max', 200),
  ('rare_min', 40),    ('rare_max', 100),
  ('epic_min', 20),    ('epic_max', 60),
  ('base_reward_gold', 1),
  ('bonus_legendary_qty', 5), ('bonus_legendary_gold', 2),
  ('bonus_mythic_qty', 1),    ('bonus_mythic_gold', 3),
  ('min_level', 5)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. npc_reward_events -- 1 row/day, created by the 00:00 UTC cron
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.npc_reward_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL UNIQUE,
  base_requirement jsonb NOT NULL,   -- [{rarity, qty}]
  bonus_requirement jsonb NOT NULL,  -- [{rarity, qty, gold}]
  spawn_at timestamptz NOT NULL,
  expire_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. npc_reward_claims -- per-wallet progress per event
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.npc_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.npc_reward_events(id) ON DELETE CASCADE,
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  base_claims_count integer NOT NULL DEFAULT 0,
  bonus_claimed boolean NOT NULL DEFAULT false,
  total_gold_earned numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, wallet_address)
);

-- -----------------------------------------------------------------------------
-- 6. fish_hold_tiers -- seeded from the approved tier table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fish_hold_tiers (
  id text PRIMARY KEY,
  min_usd_value numeric NOT NULL,
  generation_cap_gold numeric NULL,  -- NULL = unlimited
  wd_min numeric NULL,
  wd_max numeric NULL,               -- NULL = unlimited
  wd_per_day integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.fish_hold_tiers (id, min_usd_value, generation_cap_gold, wd_min, wd_max, wd_per_day, sort_order) VALUES
  ('tier_10',   10,   5,    5, 5,    1, 1),
  ('tier_100',  100,  15,   5, 15,   1, 2),
  ('tier_1000', 1000, 30,   5, 30,   1, 3),
  ('tier_2000', 2000, NULL, NULL, NULL, 1, 4)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. withdrawal_requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  gold_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  tx_hash text NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  processed_by text NULL,
  notes text NULL
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_wallet_idx ON public.withdrawal_requests (wallet_address, requested_at DESC);

-- -----------------------------------------------------------------------------
-- 8. quest_definitions -- seed 10 rows, easy -> hard
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quest_definitions (
  id text PRIMARY KEY,
  order_index integer NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  requirement jsonb NOT NULL,
  reward_coins numeric NOT NULL CHECK (reward_coins <= 5000)
);

INSERT INTO public.quest_definitions (id, order_index, title, description, requirement, reward_coins) VALUES
  ('quest_01', 1,  'First Catch',        'Catch 5 common fish.',                       '{"type":"catch_count","rarity":"common","qty":5}',       50),
  ('quest_02', 2,  'Getting the Hang',   'Catch 20 common fish.',                      '{"type":"catch_count","rarity":"common","qty":20}',      120),
  ('quest_03', 3,  'Rare Find',          'Catch 5 rare fish.',                         '{"type":"catch_count","rarity":"rare","qty":5}',         250),
  ('quest_04', 4,  'Steady Angler',      'Catch 50 common fish.',                      '{"type":"catch_count","rarity":"common","qty":50}',      400),
  ('quest_05', 5,  'Rare Collector',     'Catch 20 rare fish.',                        '{"type":"catch_count","rarity":"rare","qty":20}',        700),
  ('quest_06', 6,  'Epic Debut',         'Catch 5 epic fish.',                         '{"type":"catch_count","rarity":"epic","qty":5}',         1100),
  ('quest_07', 7,  'Deep Sea Regular',   'Catch 100 common fish.',                     '{"type":"catch_count","rarity":"common","qty":100}',     1600),
  ('quest_08', 8,  'Epic Hunter',        'Catch 25 epic fish.',                        '{"type":"catch_count","rarity":"epic","qty":25}',        2400),
  ('quest_09', 9,  'Legend in the Making','Catch 5 legendary fish.',                   '{"type":"catch_count","rarity":"legendary","qty":5}',    3500),
  ('quest_10', 10, 'Mythic Angler',      'Catch 1 mythic fish.',                       '{"type":"catch_count","rarity":"mythic","qty":1}',       5000)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. player_quest_progress
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_quest_progress (
  wallet_address text PRIMARY KEY REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  current_quest_order integer NOT NULL DEFAULT 1,
  progress_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed_unclaimed', 'claimed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 10. RLS -- same pattern as every other table in this project: enabled,
--     no anon/authenticated policy, service_role only.
-- -----------------------------------------------------------------------------
GRANT ALL ON public.gold_ledger, public.npc_reward_config, public.npc_reward_events,
  public.npc_reward_claims, public.fish_hold_tiers, public.withdrawal_requests,
  public.quest_definitions, public.player_quest_progress
  TO service_role;

ALTER TABLE public.gold_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_reward_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fish_hold_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_quest_progress ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: all access goes through verified server code.

-- =============================================================================
-- 11. Functions
-- =============================================================================

-- ---- claim_npc_reward -------------------------------------------------------
-- _tier_id: resolved in TS (onchain.server.ts) BEFORE calling this function,
-- from the wallet's live hold value. NULL/absent tier is rejected here too,
-- so this function is never the sole gate, but it is still a hard gate.
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

-- ---- request_withdrawal -----------------------------------------------------
DROP FUNCTION IF EXISTS public.request_withdrawal(text, numeric, text);
CREATE OR REPLACE FUNCTION public.request_withdrawal(_wallet text, _amount numeric, _tier_id text)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_tier public.fish_hold_tiers;
  v_profile public.profiles;
  v_today_count integer;
  v_result public.withdrawal_requests;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT * INTO v_tier FROM public.fish_hold_tiers WHERE id = _tier_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Not eligible to withdraw';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE wallet_address = v_wallet FOR UPDATE;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF v_profile.gold < _amount THEN
    RAISE EXCEPTION 'Insufficient gold balance';
  END IF;

  IF v_tier.wd_min IS NOT NULL AND _amount < v_tier.wd_min THEN
    RAISE EXCEPTION 'Amount below minimum withdrawal for your tier';
  END IF;
  IF v_tier.wd_max IS NOT NULL AND _amount > v_tier.wd_max THEN
    RAISE EXCEPTION 'Amount above maximum withdrawal for your tier';
  END IF;

  SELECT count(*) INTO v_today_count
    FROM public.withdrawal_requests
    WHERE wallet_address = v_wallet
      AND status IN ('pending', 'paid')
      AND requested_at >= date_trunc('day', now());
  IF v_today_count >= v_tier.wd_per_day THEN
    RAISE EXCEPTION 'Withdrawal limit for today already reached';
  END IF;

  UPDATE public.profiles SET gold = gold - _amount, updated_at = now()
   WHERE wallet_address = v_wallet
  RETURNING * INTO v_profile;

  INSERT INTO public.withdrawal_requests (wallet_address, gold_amount, status)
  VALUES (v_wallet, _amount, 'pending')
  RETURNING * INTO v_result;

  INSERT INTO public.gold_ledger (wallet_address, amount, reason, balance_after, metadata)
  VALUES (v_wallet, -_amount, 'withdrawal_locked', v_profile.gold, jsonb_build_object('withdrawal_id', v_result.id));

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text) TO service_role;

-- ---- admin_mark_withdrawal ---------------------------------------------------
-- _admin_wallet is also checked in the TS layer against the env var before
-- this is ever called; this function additionally hard-checks it can only
-- write status transitions, never bypasses the wallet-proof step.
DROP FUNCTION IF EXISTS public.admin_mark_withdrawal(text, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_mark_withdrawal(_admin_wallet text, _withdrawal_id uuid, _tx_hash text, _approve boolean)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin text := lower(_admin_wallet);
  v_row public.withdrawal_requests;
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_row FROM public.withdrawal_requests WHERE id = _withdrawal_id FOR UPDATE;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal already processed';
  END IF;

  IF _approve THEN
    UPDATE public.withdrawal_requests
       SET status = 'paid', tx_hash = _tx_hash, processed_at = now(), processed_by = v_admin
     WHERE id = _withdrawal_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.profiles SET gold = gold + v_row.gold_amount, updated_at = now()
     WHERE wallet_address = v_row.wallet_address
    RETURNING * INTO v_profile;

    INSERT INTO public.gold_ledger (wallet_address, amount, reason, balance_after, metadata)
    VALUES (v_row.wallet_address, v_row.gold_amount, 'withdrawal_rejected_refund', v_profile.gold,
            jsonb_build_object('withdrawal_id', _withdrawal_id));

    UPDATE public.withdrawal_requests
       SET status = 'rejected', processed_at = now(), processed_by = v_admin
     WHERE id = _withdrawal_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_mark_withdrawal(text, uuid, text, boolean) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.admin_mark_withdrawal(text, uuid, text, boolean) TO service_role;

-- ---- claim_quest_reward / get_quest_progress ---------------------------------
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
  v_req jsonb;
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

  v_req := v_quest.requirement;
  IF v_progress.progress_value < (v_req->>'qty')::numeric THEN
    RAISE EXCEPTION 'Quest requirement not met yet';
  END IF;

  UPDATE public.profiles SET coins = coins + v_quest.reward_coins, updated_at = now()
   WHERE wallet_address = v_wallet
  RETURNING * INTO v_result;

  SELECT min(order_index) INTO v_next_order FROM public.quest_definitions WHERE order_index > v_progress.current_quest_order;

  UPDATE public.player_quest_progress
     SET current_quest_order = coalesce(v_next_order, v_progress.current_quest_order),
         progress_value = 0,
         status = CASE WHEN v_next_order IS NULL THEN 'claimed' ELSE 'active' END,
         updated_at = now()
   WHERE wallet_address = v_wallet;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_quest_reward(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(text) TO service_role;

-- ---- record_catch hook: keep quest progress in sync without touching the
-- existing record_catch signature/behavior (called separately, right after,
-- from the same server function that calls record_catch today).
DROP FUNCTION IF EXISTS public.advance_quest_progress(text, text);
CREATE OR REPLACE FUNCTION public.advance_quest_progress(_wallet text, _rarity text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_progress public.player_quest_progress;
  v_quest public.quest_definitions;
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

  IF v_quest.requirement->>'type' = 'catch_count' AND v_quest.requirement->>'rarity' = _rarity THEN
    UPDATE public.player_quest_progress
       SET progress_value = least(progress_value + 1, (v_quest.requirement->>'qty')::numeric),
           status = CASE WHEN progress_value + 1 >= (v_quest.requirement->>'qty')::numeric
                         THEN 'completed_unclaimed' ELSE 'active' END,
           updated_at = now()
     WHERE wallet_address = v_wallet;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.advance_quest_progress(text, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.advance_quest_progress(text, text) TO service_role;