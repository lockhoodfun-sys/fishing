-- =============================================================================
-- 0011_withdrawal_expiry_and_self_cancel.sql
-- Feature: stale `pending` withdrawal requests no longer lock a player's gold
-- forever if an admin never gets to them, and a player can back out of a
-- request themselves instead of waiting on the cron or an admin.
--
--   - Auto-expire: a `pending` request older than
--     game_config.withdrawal_expire_hours (default 168h / 7 days, tweakable
--     without a redeploy) is refunded and moved to 'expired' by the
--     expire_stale_withdrawals() cron function.
--   - Self-cancel: a player can cancel their own still-`pending` request at
--     any time via cancel_withdrawal() -- gold is refunded immediately, no
--     cron/admin involved.
--   - 'expired' (system) and 'cancelled' (player) are separate from
--     'rejected' (admin) purely for audit-trail clarity on who/what ended
--     the request.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. withdrawal_requests.status: allow the two new terminal states.
-- -----------------------------------------------------------------------------
ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN ('pending', 'paid', 'rejected', 'expired', 'cancelled'));

-- -----------------------------------------------------------------------------
-- 2. gold_ledger.reason: two new refund reasons, kept distinct from the
--    existing admin-rejection refund reason for the same audit-trail reason.
-- -----------------------------------------------------------------------------
ALTER TABLE public.gold_ledger DROP CONSTRAINT IF EXISTS gold_ledger_reason_check;
ALTER TABLE public.gold_ledger ADD CONSTRAINT gold_ledger_reason_check
  CHECK (reason IN (
    'npc_base_claim', 'npc_bonus_claim', 'withdrawal_locked',
    'withdrawal_rejected_refund', 'withdrawal_expired_refund',
    'withdrawal_cancelled_refund', 'admin_adjustment'
  ));

-- -----------------------------------------------------------------------------
-- 3. game_config: how many hours a pending request may sit before it auto-
--    expires. Read live by expire_stale_withdrawals() on every run.
-- -----------------------------------------------------------------------------
INSERT INTO public.game_config (key, value) VALUES
  ('withdrawal_expire_hours', 168)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. cancel_withdrawal -- player self-cancel. Only the request's own wallet
--    may cancel it, and only while it is still 'pending'.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_withdrawal(text, uuid);
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(_wallet text, _withdrawal_id uuid)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(_wallet);
  v_row public.withdrawal_requests;
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_row FROM public.withdrawal_requests
    WHERE id = _withdrawal_id AND wallet_address = v_wallet
    FOR UPDATE;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending request can be cancelled';
  END IF;

  UPDATE public.profiles SET gold = gold + v_row.gold_amount, updated_at = now()
   WHERE wallet_address = v_wallet
  RETURNING * INTO v_profile;

  INSERT INTO public.gold_ledger (wallet_address, amount, reason, balance_after, metadata)
  VALUES (v_wallet, v_row.gold_amount, 'withdrawal_cancelled_refund', v_profile.gold,
          jsonb_build_object('withdrawal_id', _withdrawal_id));

  UPDATE public.withdrawal_requests
     SET status = 'cancelled', processed_at = now(), processed_by = v_wallet
   WHERE id = _withdrawal_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal(text, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(text, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. expire_stale_withdrawals -- cron entry point. Refunds + expires every
--    'pending' request older than game_config.withdrawal_expire_hours.
--    Loops (rather than one bulk UPDATE) because each refund needs its own
--    gold_ledger row with that wallet's post-refund balance_after.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.expire_stale_withdrawals();
CREATE OR REPLACE FUNCTION public.expire_stale_withdrawals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expire_hours numeric;
  v_row public.withdrawal_requests;
  v_profile public.profiles;
  v_count integer := 0;
BEGIN
  SELECT value INTO v_expire_hours FROM public.game_config WHERE key = 'withdrawal_expire_hours';
  IF v_expire_hours IS NULL THEN
    v_expire_hours := 168;
  END IF;

  FOR v_row IN
    SELECT * FROM public.withdrawal_requests
      WHERE status = 'pending'
        AND requested_at < now() - (v_expire_hours || ' hours')::interval
      FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.profiles SET gold = gold + v_row.gold_amount, updated_at = now()
     WHERE wallet_address = v_row.wallet_address
    RETURNING * INTO v_profile;

    INSERT INTO public.gold_ledger (wallet_address, amount, reason, balance_after, metadata)
    VALUES (v_row.wallet_address, v_row.gold_amount, 'withdrawal_expired_refund', v_profile.gold,
            jsonb_build_object('withdrawal_id', v_row.id));

    UPDATE public.withdrawal_requests
       SET status = 'expired', processed_at = now(), processed_by = 'system:auto-expire'
     WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_withdrawals() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.expire_stale_withdrawals() TO service_role;
