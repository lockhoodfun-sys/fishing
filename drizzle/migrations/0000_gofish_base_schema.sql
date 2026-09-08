-- Game rule tables (public read-only)
CREATE TABLE public.fish_species (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#ffffff',
  rarity text,
  min_weight_kg numeric NOT NULL DEFAULT 1,
  max_weight_kg numeric NOT NULL DEFAULT 10,
  is_monster boolean NOT NULL DEFAULT false,
  base_price_per_kg numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.rarity_base_weights (
  rarity text PRIMARY KEY,
  base_weight numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.rod_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  max_catch_weight_kg numeric NOT NULL DEFAULT 100
);
CREATE TABLE public.bait_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.mutations (
  key text PRIMARY KEY,
  label text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1,
  drop_weight numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.weather_effects (
  weather_kind text PRIMARY KEY,
  bite_window_seconds numeric NOT NULL DEFAULT 1.5,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.weather_cycle_config (
  id text PRIMARY KEY,
  change_interval_seconds integer NOT NULL DEFAULT 240,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.game_config (
  key text PRIMARY KEY,
  value numeric NOT NULL DEFAULT 0
);

GRANT SELECT ON public.fish_species, public.rarity_base_weights, public.rod_tiers,
  public.bait_tiers, public.mutations, public.weather_effects,
  public.weather_cycle_config, public.game_config TO anon, authenticated;
GRANT ALL ON public.fish_species, public.rarity_base_weights, public.rod_tiers,
  public.bait_tiers, public.mutations, public.weather_effects,
  public.weather_cycle_config, public.game_config TO service_role;

ALTER TABLE public.fish_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rarity_base_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rod_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bait_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON public.fish_species FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.rarity_base_weights FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.rod_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.bait_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.mutations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.weather_effects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.weather_cycle_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.game_config FOR SELECT TO anon, authenticated USING (true);

-- Player profiles keyed by wallet address (written only by server code)
CREATE TABLE public.profiles (
  wallet_address text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  coins numeric NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  fish_common integer NOT NULL DEFAULT 0,
  fish_rare integer NOT NULL DEFAULT 0,
  fish_epic integer NOT NULL DEFAULT 0,
  fish_legendary integer NOT NULL DEFAULT 0,
  fish_mythic integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_idx ON public.profiles (lower(username));

CREATE TABLE public.fish_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  species_id text NOT NULL,
  weight_kg numeric NOT NULL,
  mutation_key text NOT NULL DEFAULT 'none',
  caught_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fish_inventory_wallet_idx ON public.fish_inventory_items (wallet_address, caught_at DESC);

GRANT ALL ON public.profiles, public.fish_inventory_items TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fish_inventory_items ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: all access goes through verified server code.

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
