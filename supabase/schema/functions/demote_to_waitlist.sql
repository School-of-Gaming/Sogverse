--
-- Name: demote_to_waitlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demote_to_waitlist(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
  v_live_sub   TEXT;
  v_now        TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, as before. The product's TYPE is not read: nothing
  -- in this function branches on it.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- A LIVE subscription, not merely a row. participation_id is UNIQUE here and
  -- stripe_subscription_id is NOT NULL, so at most one row can match — but the
  -- webhook updates status in place instead of deleting, and a subscription
  -- Stripe gave up dunning (`unpaid`, stored as `cancelled`) never fires
  -- subscription.deleted. Treating that dead row as live made this refusal
  -- permanent: the seat could never be waitlisted, and the family had nothing
  -- left to cancel. `cancelled` is the only terminal value; past_due,
  -- incomplete and canceling can all still bill and still refuse.
  --
  -- What is being protected is unchanged: demoting a genuinely subscribed
  -- family puts a live subscription on a waitlisted row, which the parent's own
  -- leave affordance can delete — CASCADEing family_subscriptions away while
  -- Stripe keeps billing.
  --
  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below.
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

  -- Idempotent: already on the waitlist.
  IF v_status = 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only an active participation can be moved to the waitlist (status: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back of the line: clock_timestamp() under the gate lock is monotonic with
  -- real ordering, the rule for every cross-transaction ordering key. Clear
  -- group_id — waitlisted gamers aren't grouped.
  v_now := clock_timestamp();
  UPDATE public.participations
     SET status = 'waitlisted',
         waitlisted_at = v_now,
         group_id = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'demoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;


--
-- Name: FUNCTION demote_to_waitlist(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) IS 'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses any participation carrying a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — on any product type: a waitlisted row can be deleted by the parent via leave_my_waitlist_spot, which cascades family_subscriptions and orphans a subscription that keeps billing. A ''cancelled'' row is explicitly not live: dunning-exhausted subscriptions are stored that way and never fire subscription.deleted, so counting them would hold the seat hostage forever. Raised with the same errcode admin_remove_participation uses for the same condition.';


--
-- Name: FUNCTION demote_to_waitlist(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) TO service_role;


