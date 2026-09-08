-- =============================================================================
-- 0010_hold_tier_time_window.sql
-- Fix: fish_hold_tiers eligibility was based on an INSTANT on-chain balance
-- snapshot (resolveHoldStatus() -> balanceOf() at the moment of the check).
-- That means a wallet can borrow tokens for a few minutes, pass the check,
-- then return them -- or a single whale can rotate one balance across many
-- wallets in sequence, "holding" each just long enough to claim. The tier
-- name implies sustained holding; the mechanism only ever checked a point in
-- time.
--
-- Fix: track periodic balance snapshots per wallet (fish_hold_snapshots) and
-- gate tier eligibility on a continuous holding window (fish_hold_tiers.
-- min_hold_hours) instead of the instant balance. A tier only counts as
-- reached if EVERY snapshot across the last min_hold_hours hours is at or
-- above that tier's min_usd_value, AND there is snapshot coverage reaching
-- back that far (so a brand-new wallet, or one with a gap in history, can
-- never claim "instant" eligibility no matter how large its balance).
--
-- resolve_windowed_tier() does the SQL-side evaluation; the instant balance
-- read + snapshot recording stays in TS (onchain.server.ts), same division
-- of responsibility as the rest of this project (chain reads happen only in
-- Node/viem, Postgres functions take resolved values as parameters).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. fish_hold_tiers: how long a tier's threshold must hold continuously
--    before it counts. Higher tiers require proportionally longer proof.
-- -----------------------------------------------------------------------------
ALTER TABLE public.fish_hold_tiers ADD COLUMN IF NOT EXISTS min_hold_hours integer NOT NULL DEFAULT 24;

UPDATE public.fish_hold_tiers SET min_hold_hours = 24 WHERE id = 'tier_10';
UPDATE public.fish_hold_tiers SET min_hold_hours = 24 WHERE id = 'tier_100';
UPDATE public.fish_hold_tiers SET min_hold_hours = 48 WHERE id = 'tier_1000';
UPDATE public.fish_hold_tiers SET min_hold_hours = 72 WHERE id = 'tier_2000';

-- -----------------------------------------------------------------------------
-- 2. fish_hold_snapshots: periodic balance-value samples per wallet.
--    Written by (a) resolveHoldStatus() opportunistically on every check a
--    player triggers, and (b) the hold-snapshot cron for wallets that are
--    eligibility-relevant but haven't checked in recently. usd_value is
--    stored raw (not a tier id) so re-tuning fish_hold_tiers thresholds
--    later doesn't invalidate old snapshots.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fish_hold_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  usd_value numeric NOT NULL,
  sampled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fish_hold_snapshots_wallet_idx
  ON public.fish_hold_snapshots (wallet_address, sampled_at DESC);

GRANT ALL ON public.fish_hold_snapshots TO service_role;
ALTER TABLE public.fish_hold_snapshots ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policy: all access goes through verified server code,
-- same pattern as every other table in this project.

-- -----------------------------------------------------------------------------
-- 3. resolve_windowed_tier -- the actual gating check.
--    Walks tiers highest-first; a tier qualifies only if:
--      a) snapshot coverage reaches back to (now - min_hold_hours), i.e. the
--         earliest snapshot inside the window is not itself suspiciously
--         recent (1h slack for cron cadence / first-ever sample timing), AND
--      b) zero snapshots inside that window fall below the tier's threshold.
--    Returns NULL if no tier qualifies (including: no history at all yet).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_windowed_tier(text);
CREATE OR REPLACE FUNCTION public.resolve_windowed_tier(_wallet text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_tier public.fish_hold_tiers;
  v_window_start timestamptz;
  v_earliest_sample timestamptz;
  v_below_count integer;
BEGIN
  FOR v_tier IN SELECT * FROM public.fish_hold_tiers ORDER BY sort_order DESC LOOP
    v_window_start := now() - (v_tier.min_hold_hours || ' hours')::interval;

    SELECT min(sampled_at) INTO v_earliest_sample
      FROM public.fish_hold_snapshots
      WHERE wallet_address = v_wallet AND sampled_at >= v_window_start;

    -- No sample reaching back near the start of the window -> not proven
    -- held long enough yet, regardless of current balance. 1h slack absorbs
    -- normal cron/opportunistic sampling gaps without weakening the window.
    IF v_earliest_sample IS NULL OR v_earliest_sample > v_window_start + interval '1 hour' THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_below_count
      FROM public.fish_hold_snapshots
      WHERE wallet_address = v_wallet
        AND sampled_at >= v_window_start
        AND usd_value < v_tier.min_usd_value;

    IF v_below_count = 0 THEN
      RETURN v_tier.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_windowed_tier(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_windowed_tier(text) TO service_role;
