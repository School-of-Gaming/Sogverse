-- end_participation is the one way a seat ends, and a seat is not deleted.
--
-- WHAT THIS CHANGES
--
-- 1. `end_participation` replaces the DELETE `cancel_participation` ran: a seat
--    is marked ended, with when and why, and keeps its group; its family
--    subscription row is marked cancelled and ended with it. A waitlisted row
--    never held a seat and is still deleted.
-- 2. `family_subscriptions.ended_at` records that a subscription ended with its
--    seat, and such a row can never leave `cancelled` again, so a late
--    customer.subscription.updated from Stripe cannot revive it.
-- 3. A delete of any participation that is not waitlisted is refused unless the
--    transaction is an erasure (`sogverse.erasure` = on), which also covers the
--    cascades from a profile or a product. `erase_participations` is the
--    service-role door for that, for the GDPR erasure and for test teardown.
--
-- THE DEPLOYMENT WINDOW
--
-- Migrations reach production before the app does, and the app from before
-- this change calls `cancel_participation(uuid, text)` from the Stripe webhook;
-- this change's webhook calls end_participation. The old function stays, tagged
-- legacy-cancel-participation, as a wrapper over end_participation, only for
-- the app still deployed when these migrations run and for the deliveries
-- Stripe may retry to it over the following three days. A follow-up after that
-- window drops it, and tightens payments_amount_cents_check to positive.

-- ---------------------------------------------------------------------------
-- 1. family_subscriptions.ended_at and its terminal state
-- ---------------------------------------------------------------------------

ALTER TABLE public.family_subscriptions
  ADD COLUMN ended_at timestamp with time zone,
  ADD CONSTRAINT chk_family_subscriptions_ended_is_cancelled
    CHECK (ended_at IS NULL OR status = 'cancelled');

COMMENT ON COLUMN public.family_subscriptions.ended_at IS 'When this subscription ended together with its seat, set by end_participation alongside status cancelled (chk_family_subscriptions_ended_is_cancelled). A row with it set is terminal: trg_family_subscriptions_ended_is_terminal refuses any update moving it off cancelled or changing the stamp, so a late Stripe event cannot revive it. NULL on every other row, including a cancelled one whose seat is still held — a subscription Stripe gave up on after failed payments is stored cancelled while its seat lives on until an admin removes it, and that row stays updatable.';

CREATE FUNCTION public.family_subscription_ended_is_terminal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL
     AND (NEW.status IS DISTINCT FROM 'cancelled'
          OR NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'family subscription % ended with its seat at % and cannot change status',
      OLD.id, OLD.ended_at
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.family_subscription_ended_is_terminal() IS 'BEFORE UPDATE trigger on family_subscriptions: a row whose ended_at is set stays cancelled with that stamp, and an update trying otherwise raises object_not_in_prerequisite_state rather than being silently kept, so a writer learns it tried to revive an ended subscription. Other columns stay writable. Granted to nobody.';

REVOKE ALL ON FUNCTION public.family_subscription_ended_is_terminal() FROM PUBLIC;

CREATE TRIGGER trg_family_subscriptions_ended_is_terminal
  BEFORE UPDATE ON public.family_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.family_subscription_ended_is_terminal();

-- ---------------------------------------------------------------------------
-- 2. The one writer
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id              uuid;
  v_status                  public.participation_status;
  v_stripe_subscription_id  text;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  -- The product before the seat: the lock order every seat writer follows. The
  -- status is read again under it, so two concurrent ends see one another.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  SELECT status INTO v_status
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND OR v_status = 'ended' THEN
    RETURN jsonb_build_object('kind', 'noop');
  END IF;

  SELECT stripe_subscription_id INTO v_stripe_subscription_id
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id;

  IF v_status = 'waitlisted' THEN
    -- A place in line never held a seat, so there is no history to keep.
    DELETE FROM public.participations WHERE id = p_participation_id;
  ELSE
    UPDATE public.participations
       SET status = 'ended',
           ended_at = now(),
           end_reason = p_reason
     WHERE id = p_participation_id;

    UPDATE public.family_subscriptions
       SET status = 'cancelled',
           ended_at = now()
     WHERE participation_id = p_participation_id;
  END IF;

  RETURN jsonb_build_object(
    'kind', 'cancelled',
    'product_id', v_product_id,
    'previous_status', v_status::text,
    'stripe_subscription_id', v_stripe_subscription_id,
    'reason', p_reason::text
  );
END;
$$;

COMMENT ON FUNCTION public.end_participation(p_participation_id uuid, p_reason public.participation_end_reason) IS 'The one way a seat ends. Under the product lock: an active seat becomes ended with ended_at now() and end_reason p_reason, keeping its group so the family reads the feed up to that day, and its family_subscriptions row becomes cancelled with ended_at now(), after which that row is terminal. A waitlisted row never held a seat and is deleted instead. A row already ended, or not there at all, answers kind=noop and writes nothing, so a redelivered Stripe deletion is harmless. Otherwise answers kind=cancelled with product_id, previous_status, the stripe_subscription_id the row carried (NULL when none) and reason. Touches only the database: whoever calls it has already dealt with Stripe, or Stripe is the one telling us. service_role only.';

REVOKE ALL ON FUNCTION public.end_participation(uuid, public.participation_end_reason) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_participation(uuid, public.participation_end_reason) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.end_participation(
    p_participation_id,
    CASE p_reason
      WHEN 'admin_cancelled' THEN 'admin_removed'
      ELSE p_reason
    END::public.participation_end_reason
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_participation(p_participation_id uuid, p_reason text) IS 'legacy-cancel-participation: kept only for the app deployed before seats ended, whose Stripe webhook calls it while the migrations run ahead of the new app, and for Stripe''s three-day redelivery window after that; a follow-up drops it once that window has passed. Delegates to end_participation, reading the old admin_cancelled reason as admin_removed. service_role only.';

REVOKE ALL ON FUNCTION public.cancel_participation(uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_participation(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row_product_id uuid;
  v_live_sub       text;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id INTO v_row_product_id
    FROM public.participations WHERE id = p_participation_id;
  IF NOT FOUND OR v_row_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'participation % is not on product %',
      p_participation_id, p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A LIVE subscription, not merely a row — see demote_to_waitlist for the
  -- whole reasoning; the two refusals are deliberately one predicate. The
  -- stakes here are the sharper of the two: removal is the ONLY exit a
  -- participation has once its subscription is dead (there is nothing left for
  -- the family to cancel), so counting a `cancelled` row as live left the seat
  -- permanently occupied with no instruction that could ever free it.
  --
  -- Still refused for anything that can bill: ending the seat ends its
  -- family_subscriptions row too, and a live subscription would carry on
  -- charging a family whose seat the database says is over.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id
      AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN public.end_participation(p_participation_id, 'admin_removed');
END;
$$;

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS 'Admin-gated un-enrollment. Refuses a participation that is not on the named product, or one with a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — which must be cancelled through Stripe first, or ending the seat would leave it billing; otherwise delegates to end_participation with reason admin_removed, which ends a held seat (keeping the row and its group) and deletes a waitlisted row. A dunning-dead subscription is stored as ''cancelled'' and does NOT refuse: admin removal is the only exit such a seat has, so counting it would strand the seat forever. Product type is not consulted — a free club has no parent-facing cancel, so this is its only exit.';

-- ---------------------------------------------------------------------------
-- 3. The delete guard and the erasure door
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_participation_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.status <> 'waitlisted'
     AND current_setting('sogverse.erasure', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'participation % held a seat and is ended, not deleted (end_participation); only an erasure deletes it',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.guard_participation_delete() IS 'BEFORE DELETE trigger on participations: a row that is not waitlisted is history, so deleting it is refused (restrict_violation) unless the transaction set sogverse.erasure to on. The guard sees cascades as well, so deleting a profile or a product that still has seats needs the setting too: the GDPR erasure sets it (SET LOCAL sogverse.erasure = on, or erase_participations first), and a product is only ever deleted by hand. Waitlisted rows go freely: leaving the line, declining an offer and turning a waitlist off all delete them. Granted to nobody.';

REVOKE ALL ON FUNCTION public.guard_participation_delete() FROM PUBLIC;

CREATE TRIGGER trg_participations_guard_delete
  BEFORE DELETE ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.guard_participation_delete();

CREATE FUNCTION public.erase_participations(p_participation_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('sogverse.erasure', 'on', true);
  DELETE FROM public.participations WHERE id = ANY (p_participation_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('sogverse.erasure', 'off', true);
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.erase_participations(p_participation_ids uuid[]) IS 'Deletes the named participations whatever their status, past trg_participations_guard_delete, and returns how many went; their family_subscriptions rows cascade with them. This is erasure, not an ending: a seat leaving a club goes through end_participation and is kept. For the GDPR erasure procedure and for test teardown. The erasure setting is switched on only around its own DELETE. service_role only.';

REVOKE ALL ON FUNCTION public.erase_participations(uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.erase_participations(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The waitlist exits still delete, and say why
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) IS 'Give up a waitlist spot. Authorized to the purchasing parent (customer_id = auth.uid()); refuses any row that is not still waitlisted, under the product gate lock. Deletes the row: a place in line never held a seat, so there is no history to keep, which is what end_participation does with a waitlisted row too.';
