CREATE TABLE IF NOT EXISTS public.fish_species (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#ffffff',
  rarity text,
  min_weight_kg numeric NOT NULL DEFAULT 1,
  max_weight_kg numeric NOT NULL DEFAULT 10,
  is_monster boolean NOT NULL DEFAULT false,
  base_price_per_kg numeric NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS public.rarity_base_weights (
  rarity text PRIMARY KEY,
  base_weight numeric NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS public.rod_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  max_catch_weight_kg numeric NOT NULL DEFAULT 100,
  luck_percent numeric NOT NULL DEFAULT 0,
  speed_percent numeric NOT NULL DEFAULT 0,
  price_coins numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.bait_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  luck_percent numeric NOT NULL DEFAULT 0,
  price_coins numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.boat_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  speed_percent numeric NOT NULL DEFAULT 100,
  price_coins numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.mutations (
  key text PRIMARY KEY,
  label text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1,
  drop_weight numeric NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS public.weather_effects (
  weather_kind text PRIMARY KEY,
  bite_window_seconds numeric NOT NULL DEFAULT 1.5,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.weather_cycle_config (
  id text PRIMARY KEY,
  change_interval_seconds integer NOT NULL DEFAULT 240,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.game_config (
  key text PRIMARY KEY,
  value numeric NOT NULL DEFAULT 0
);

GRANT SELECT ON public.fish_species TO anon, authenticated;
GRANT SELECT ON public.rarity_base_weights TO anon, authenticated;
GRANT SELECT ON public.rod_tiers TO anon, authenticated;
GRANT SELECT ON public.bait_tiers TO anon, authenticated;
GRANT SELECT ON public.boat_tiers TO anon, authenticated;
GRANT SELECT ON public.mutations TO anon, authenticated;
GRANT SELECT ON public.weather_effects TO anon, authenticated;
GRANT SELECT ON public.weather_cycle_config TO anon, authenticated;
GRANT SELECT ON public.game_config TO anon, authenticated;
GRANT ALL ON public.fish_species TO service_role;
GRANT ALL ON public.rarity_base_weights TO service_role;
GRANT ALL ON public.rod_tiers TO service_role;
GRANT ALL ON public.bait_tiers TO service_role;
GRANT ALL ON public.boat_tiers TO service_role;
GRANT ALL ON public.mutations TO service_role;
GRANT ALL ON public.weather_effects TO service_role;
GRANT ALL ON public.weather_cycle_config TO service_role;
GRANT ALL ON public.game_config TO service_role;

ALTER TABLE public.fish_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rarity_base_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rod_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bait_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read fish_species" ON public.fish_species;
DROP POLICY IF EXISTS "public read rarity_base_weights" ON public.rarity_base_weights;
DROP POLICY IF EXISTS "public read rod_tiers" ON public.rod_tiers;
DROP POLICY IF EXISTS "public read bait_tiers" ON public.bait_tiers;
DROP POLICY IF EXISTS "public read boat_tiers" ON public.boat_tiers;
DROP POLICY IF EXISTS "public read mutations" ON public.mutations;
DROP POLICY IF EXISTS "public read weather_effects" ON public.weather_effects;
DROP POLICY IF EXISTS "public read weather_cycle_config" ON public.weather_cycle_config;
DROP POLICY IF EXISTS "public read game_config" ON public.game_config;

CREATE POLICY "public read fish_species" ON public.fish_species FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read rarity_base_weights" ON public.rarity_base_weights FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read rod_tiers" ON public.rod_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read bait_tiers" ON public.bait_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read boat_tiers" ON public.boat_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read mutations" ON public.mutations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read weather_effects" ON public.weather_effects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read weather_cycle_config" ON public.weather_cycle_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read game_config" ON public.game_config FOR SELECT TO anon, authenticated USING (true);