ALTER TABLE public.rod_tiers
  ADD COLUMN IF NOT EXISTS luck_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speed_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_coins numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.bait_tiers
  ADD COLUMN IF NOT EXISTS luck_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_coins numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

DELETE FROM public.rod_tiers;
INSERT INTO public.rod_tiers (id, name, max_catch_weight_kg, luck_percent, speed_percent, price_coins, sort_order) VALUES
  ('starter','Starter Rod',10,0,0,0,1),
  ('uncommon','Uncommon Rod',40,10,5,1000,2),
  ('rare','Rare Rod',100,25,12,10000,3),
  ('epic','Epic Rod',250,50,22,60000,4),
  ('legendary','Legendary Rod',600,80,35,250000,5),
  ('mythic','Mythic Rod',1500,130,50,1000000,6);

DELETE FROM public.bait_tiers;
INSERT INTO public.bait_tiers (id, name, rarity_multiplier, luck_percent, price_coins, sort_order) VALUES
  ('basic_bait','Basic Bait','{}'::jsonb,0,0,1),
  ('uncommon_bait','Uncommon Bait','{}'::jsonb,20,1000,2),
  ('rare_bait','Rare Bait','{}'::jsonb,50,15000,3),
  ('epic_bait','Epic Bait','{}'::jsonb,95,120000,4),
  ('legendary_bait','Legendary Bait','{}'::jsonb,160,600000,5),
  ('mythic_bait','Mythic Bait','{}'::jsonb,250,2000000,6);

DELETE FROM public.boat_tiers;
INSERT INTO public.boat_tiers (id, name, speed_percent, price_coins, sort_order) VALUES
  ('wooden_dinghy','Wooden Dinghy',100,0,1),
  ('minnow','SS Minnow',130,5000,2),
  ('reef_runner','Reef Runner',160,40000,3),
  ('bow_raider','Bow Raider',200,200000,4),
  ('sea_marshal','Sea Marshal',250,800000,5),
  ('vex_yacht','Vex Yacht',320,3000000,6);

CREATE TABLE IF NOT EXISTS public.player_rods (
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  rod_id text NOT NULL REFERENCES public.rod_tiers(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, rod_id)
);
CREATE TABLE IF NOT EXISTS public.player_baits (
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  bait_id text NOT NULL REFERENCES public.bait_tiers(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, bait_id)
);
CREATE TABLE IF NOT EXISTS public.player_boats (
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  boat_id text NOT NULL REFERENCES public.boat_tiers(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, boat_id)
);

GRANT ALL ON public.player_rods TO service_role;
GRANT ALL ON public.player_baits TO service_role;
GRANT ALL ON public.player_boats TO service_role;

ALTER TABLE public.player_rods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_baits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_boats ENABLE ROW LEVEL SECURITY;