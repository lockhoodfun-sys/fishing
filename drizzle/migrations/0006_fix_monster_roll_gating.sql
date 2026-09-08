-- =============================================================================
-- 0006_fix_monster_roll_gating.sql
-- Fix: monster catch (Ancient Leviathan) was rolled via an independent flat
--      2% chance in record_catch(), checked BEFORE and OUTSIDE the rod_cap /
--      luck-weighted pool. That meant a wallet on the free Starter Rod
--      (max_catch_weight_kg = 10) had the same 2%-per-cast shot at a fish
--      worth ~84,000 coins on average as a wallet with a maxed-out Mythic
--      Rod (1,500 coins spent -> 1,000,000+ coins). Gear progression had no
--      effect on the single largest income source in the game.
--
-- Fix (Option A): remove the special-cased pre-roll entirely. Monster
-- species now compete inside the exact same rarity-weighted pool as every
-- other fish, subject to the same `s.min_weight_kg <= rod_cap` filter.
-- Ancient Leviathan's min_weight_kg (1200) only clears that filter once a
-- wallet owns a rod with max_catch_weight_kg >= 1200 -- currently only the
-- Mythic Rod (1500). It shares the 'mythic' rarity_base_weight bucket with
-- Baby Tuna, so luck/bait/weather multipliers apply to it exactly like any
-- other fish. No new columns, no config changes -- game_config's
-- 'monster_catch_chance' row is no longer read by this function (left in
-- place, harmless, in case something else references it later).
-- =============================================================================

DROP FUNCTION IF EXISTS public.record_catch(text, text);

CREATE OR REPLACE FUNCTION public.record_catch(_wallet text, _weather_kind text DEFAULT 'cerah')
RETURNS TABLE (
  out_species_id text,
  out_species_name text,
  out_color text,
  out_rarity text,
  out_weight_kg numeric,
  out_mutation_key text,
  out_mutation_label text,
  out_is_monster boolean,
  out_xp_gained integer,
  out_profile public.profiles
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := lower(_wallet);
  cooldown_seconds numeric;
  last_cast timestamptz;

  rod_cap numeric;
  rod_luck numeric;
  bait_luck numeric;
  bait_rarity_mult jsonb;
  weather_rarity_mult jsonb;
  resolved_weather text;

  luck numeric;
  total_weight numeric := 0;
  roll numeric;
  picked_species record;
  picked_rarity text;
  picked_weight numeric;

  picked_mutation record;
  mutation_total numeric := 0;
  mutation_roll numeric;

  gained integer;
  result_profile public.profiles;
BEGIN
  -- ---- ownership guard: only a verified wallet's own server call reaches
  -- here (verifyProof happens in profile.functions.ts before this RPC is
  -- invoked; this function is not reachable by anon/authenticated directly).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE wallet_address = w) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- ---- cooldown -------------------------------------------------------
  SELECT value INTO cooldown_seconds FROM public.game_config WHERE key = 'cast_cooldown_seconds';
  cooldown_seconds := coalesce(cooldown_seconds, 1.5);

  SELECT last_cast_at INTO last_cast FROM public.profiles WHERE wallet_address = w;
  IF last_cast IS NOT NULL AND now() < last_cast + make_interval(secs => cooldown_seconds) THEN
    RAISE EXCEPTION 'Casting too fast. Please wait a moment before casting again.';
  END IF;

  -- ---- validate weather (client hint; must match a real row or fall back) --
  SELECT we.weather_kind INTO resolved_weather
    FROM public.weather_effects we WHERE we.weather_kind = _weather_kind;
  IF resolved_weather IS NULL THEN
    resolved_weather := 'cerah';
  END IF;
  SELECT we.rarity_multiplier INTO weather_rarity_mult
    FROM public.weather_effects we WHERE we.weather_kind = resolved_weather;
  weather_rarity_mult := coalesce(weather_rarity_mult, '{}'::jsonb);

  -- ---- equipped gear (server truth from player_rods/player_baits) -----
  SELECT rt.max_catch_weight_kg, rt.luck_percent
    INTO rod_cap, rod_luck
    FROM public.player_rods pr JOIN public.rod_tiers rt ON rt.id = pr.rod_id
   WHERE pr.wallet_address = w AND pr.equipped = true
   LIMIT 1;
  IF rod_cap IS NULL THEN
    SELECT max_catch_weight_kg, luck_percent INTO rod_cap, rod_luck
      FROM public.rod_tiers WHERE id = 'starter';
  END IF;

  SELECT bt.luck_percent, bt.rarity_multiplier
    INTO bait_luck, bait_rarity_mult
    FROM public.player_baits pb JOIN public.bait_tiers bt ON bt.id = pb.bait_id
   WHERE pb.wallet_address = w AND pb.equipped = true
   LIMIT 1;
  IF bait_luck IS NULL THEN
    SELECT luck_percent, rarity_multiplier INTO bait_luck, bait_rarity_mult
      FROM public.bait_tiers WHERE id = 'basic_bait';
  END IF;
  bait_rarity_mult := coalesce(bait_rarity_mult, '{}'::jsonb);

  luck := (1 + greatest(0, coalesce(rod_luck, 0)) / 100.0)
        * (1 + greatest(0, coalesce(bait_luck, 0)) / 100.0);

  -- ---- weighted pool over ALL species (including monster) within the
  -- rod's catch cap. Monster species are no longer special-cased: they
  -- compete in the same rarity-weighted draw as everything else, so a
  -- Starter Rod (cap 10kg) can never surface Ancient Leviathan (min
  -- weight 1200kg) -- only a rod whose max_catch_weight_kg >= 1200
  -- clears the filter below.
  WITH pool AS (
    SELECT
      s.id, s.name, s.color, s.rarity, s.min_weight_kg, s.max_weight_kg, s.is_monster,
      greatest(0,
        coalesce(rbw.base_weight, 1)
        * (CASE WHEN coalesce(s.rarity, 'common') = 'common' THEN 1 ELSE luck END)
        * coalesce(nullif((bait_rarity_mult ->> coalesce(s.rarity, 'common'))::numeric, 0), 1)
        * coalesce(nullif((weather_rarity_mult ->> coalesce(s.rarity, 'common'))::numeric, 0), 1)
      ) AS rw
    FROM public.fish_species s
    LEFT JOIN public.rarity_base_weights rbw ON rbw.rarity = coalesce(s.rarity, 'common')
    WHERE s.min_weight_kg <= coalesce(rod_cap, 1e18)
  )
  SELECT coalesce(sum(rw), 0) INTO total_weight FROM pool;

  IF total_weight <= 0 THEN
    -- Safe fallback: never hand out a monster catch through the empty-pool
    -- edge case (e.g. mis-seeded data). Non-monster species only.
    SELECT id, name, color, rarity, min_weight_kg, max_weight_kg, is_monster
      INTO picked_species FROM public.fish_species WHERE is_monster = false LIMIT 1;
  ELSE
    roll := random() * total_weight;
    WITH pool AS (
      SELECT
        s.id, s.name, s.color, s.rarity, s.min_weight_kg, s.max_weight_kg, s.is_monster,
        greatest(0,
          coalesce(rbw.base_weight, 1)
          * (CASE WHEN coalesce(s.rarity, 'common') = 'common' THEN 1 ELSE luck END)
          * coalesce(nullif((bait_rarity_mult ->> coalesce(s.rarity, 'common'))::numeric, 0), 1)
          * coalesce(nullif((weather_rarity_mult ->> coalesce(s.rarity, 'common'))::numeric, 0), 1)
        ) AS rw
      FROM public.fish_species s
      LEFT JOIN public.rarity_base_weights rbw ON rbw.rarity = coalesce(s.rarity, 'common')
      WHERE s.min_weight_kg <= coalesce(rod_cap, 1e18)
    ), ranked AS (
      SELECT *, sum(rw) OVER (ORDER BY id) AS running FROM pool
    )
    SELECT id, name, color, rarity, min_weight_kg, max_weight_kg, is_monster
      INTO picked_species
      FROM ranked
      WHERE running >= roll
      ORDER BY running
      LIMIT 1;
  END IF;

  IF picked_species.id IS NULL THEN
    RAISE EXCEPTION 'No eligible fish species configured';
  END IF;

  picked_rarity := coalesce(picked_species.rarity, 'common');

  picked_weight := round(
    (picked_species.min_weight_kg
      + random() * (picked_species.max_weight_kg - picked_species.min_weight_kg))::numeric,
    2
  );

  -- ---- mutation roll ------------------------------------------------------
  SELECT coalesce(sum(greatest(0, drop_weight)), 0) INTO mutation_total FROM public.mutations;
  IF mutation_total <= 0 THEN
    SELECT key, label, multiplier INTO picked_mutation FROM public.mutations LIMIT 1;
  ELSE
    mutation_roll := random() * mutation_total;
    SELECT key, label, multiplier INTO picked_mutation
      FROM (
        SELECT *, sum(greatest(0, drop_weight)) OVER (ORDER BY key) AS running
        FROM public.mutations
      ) ranked
      WHERE running >= mutation_roll
      ORDER BY running
      LIMIT 1;
  END IF;
  IF picked_mutation.key IS NULL THEN
    SELECT 'none'::text AS key, 'Normal'::text AS label, 1::numeric AS multiplier
      INTO picked_mutation;
  END IF;

  -- ---- persist: inventory row + profile counters/xp/level + cooldown ----
  INSERT INTO public.fish_inventory_items (wallet_address, species_id, weight_kg, mutation_key)
  VALUES (w, picked_species.id, picked_weight, picked_mutation.key);

  SELECT greatest(1, round(public.xp_for_rarity(picked_rarity) * picked_mutation.multiplier)::int)
    INTO gained;

  UPDATE public.profiles SET
    fish_common = fish_common + CASE WHEN picked_rarity = 'common' THEN 1 ELSE 0 END,
    fish_rare = fish_rare + CASE WHEN picked_rarity = 'rare' THEN 1 ELSE 0 END,
    fish_epic = fish_epic + CASE WHEN picked_rarity = 'epic' THEN 1 ELSE 0 END,
    fish_legendary = fish_legendary + CASE WHEN picked_rarity = 'legendary' THEN 1 ELSE 0 END,
    fish_mythic = fish_mythic + CASE WHEN picked_rarity = 'mythic' THEN 1 ELSE 0 END,
    xp = xp + gained,
    level = public.level_for_xp(xp + gained),
    last_cast_at = now(),
    updated_at = now()
  WHERE wallet_address = w
  RETURNING * INTO result_profile;

  RETURN QUERY SELECT
    picked_species.id, picked_species.name, picked_species.color, picked_rarity,
    picked_weight, picked_mutation.key, picked_mutation.label, picked_species.is_monster,
    gained, result_profile;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_catch(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_catch(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
