--
-- Name: admin_remove_participation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) RETURNS jsonb
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

  -- A LIVE subscription, not merely a row — see demote_to_waitlist above for
  -- the whole reasoning; the two refusals are deliberately one predicate. The
  -- stakes here are the sharper of the two: removal is the ONLY exit a
  -- participation has once its subscription is dead (there is nothing left for
  -- the family to cancel), so counting a `cancelled` row as live left the seat
  -- permanently occupied with no instruction that could ever free it.
  --
  -- Still refused for anything that can bill: cancelling the participation
  -- CASCADEs family_subscriptions, and a live subscription would carry on
  -- charging a family the database no longer knows about.
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

  RETURN public.cancel_participation(p_participation_id, 'admin_cancelled');
END;
$$;


--
-- Name: FUNCTION admin_remove_participation(p_product_id uuid, p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS 'Admin-gated un-enrollment. Refuses a participation that is not on the named product, or one with a LIVE Stripe subscription — a family_subscriptions row whose status is anything but ''cancelled'' — which must be cancelled through Stripe first, or the cancel would orphan it; otherwise delegates to cancel_participation. A dunning-dead subscription is stored as ''cancelled'' and does NOT refuse: admin removal is the only exit such a seat has, so counting it would strand the seat forever. Product type is not consulted — a free club has no parent-facing cancel, so this is its only exit.';


--
-- Name: FUNCTION admin_remove_participation(p_product_id uuid, p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) TO service_role;


