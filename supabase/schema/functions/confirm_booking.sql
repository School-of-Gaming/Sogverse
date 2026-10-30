--
-- Name: confirm_booking(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id        UUID;
  v_billing_mode      public.billing_mode;
  v_booking           public.bookings;
  v_facts             JSONB;
  v_duplicate         JSONB;
  v_existing_id       UUID;
  v_existing_status   public.participation_status;
  v_group_id          UUID;
  v_participation_id  UUID;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % does not exist', p_booking_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The product before the booking: the lock order every seat writer follows.
  SELECT billing_mode INTO v_billing_mode
    FROM public.products WHERE id = v_product_id FOR UPDATE;
  SELECT * INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  -- What the webhook needs for every later write, so it reads none of it from
  -- Stripe's metadata.
  v_facts := jsonb_build_object(
    'booking_id',     v_booking.id,
    'customer_id',    v_booking.customer_id,
    'participant_id', v_booking.participant_id,
    'product_id',     v_booking.product_id,
    'purchase_shape', v_booking.purchase_shape,
    'currency',       v_booking.currency
  );

  -- A settled booking answers as it did and writes nothing: a redelivered
  -- event after the seat was cancelled must not put the seat back.
  -- participation_id is NULL then, because cancelling deletes the seat.
  IF v_booking.status = 'settled' THEN
    SELECT id INTO v_participation_id
      FROM public.participations WHERE booking_id = p_booking_id;
    RETURN v_facts || jsonb_build_object(
      'kind', 'settled',
      'participation_id', v_participation_id,
      'idempotent', TRUE
    );
  END IF;

  -- The partial UNIQUE on (product_id, participant_id) stays as the backstop.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = v_booking.product_id
      AND participant_id = v_booking.participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  v_duplicate := v_facts || jsonb_build_object(
    'kind', 'duplicate_payment',
    'existing_participation_id', v_existing_id,
    'existing_status', v_existing_status::text
  );

  IF v_booking.status = 'duplicate' THEN
    RETURN v_duplicate;
  END IF;

  -- Only the Session the booking holds confirms it. The checkout route stores
  -- the id before the parent receives the Checkout URL, so a booking holding
  -- none was never paid through Stripe, and a free or external one passes none.
  IF v_booking.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id THEN
    RAISE EXCEPTION 'checkout session % is not the one booking % holds', p_checkout_session_id, p_booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings
       SET status = 'duplicate',
           settled_at = now()
     WHERE id = p_booking_id;
    RETURN v_duplicate;
  END IF;

  -- AUTOMATIC PLACEMENT. A no-charge product with exactly one group has no
  -- placement decision left in it, so the seat goes straight into that group
  -- instead of into the unassigned inbox; zero groups has nowhere to put
  -- anyone, and two or more is a real decision that stays a human's. NULL out
  -- of this read is the unassigned inbox. Safe against a concurrent group edit
  -- because the product row is held FOR UPDATE, the lock the group editor takes.
  -- LIMIT 2 because the question is "exactly one?", not "how many?".
  IF public.is_no_charge(v_billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = v_booking.product_id
         LIMIT 2
      ) g;
  END IF;

  -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
  -- from group_id, and the table comment forbids writing it by hand.
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, group_id, booking_id
  ) VALUES (
    v_booking.product_id, v_booking.participant_id, v_booking.customer_id,
    'active', v_group_id, p_booking_id
  )
  RETURNING id INTO v_participation_id;

  UPDATE public.bookings
     SET status = 'settled',
         settled_at = now()
   WHERE id = p_booking_id;

  RETURN v_facts || jsonb_build_object(
    'kind', 'settled',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;


--
-- Name: FUNCTION confirm_booking(p_booking_id uuid, p_checkout_session_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text) IS 'Turns a booking into a seat: the one path, called in the same transaction for a free or external booking and from the Stripe webhook for a paid one. Locks the product, then the booking. A booking already settled returns kind=settled with idempotent=true and the seat''s id, which is NULL if the seat has since been cancelled, and writes nothing, so a redelivered event never puts a seat back. A booking already duplicate returns kind=duplicate_payment again. A session id other than the one the booking stores raises check_violation, and that includes passing one to a booking that stores none. If the participant already holds an active, waitlisted or completed seat on the product the booking becomes duplicate and returns kind=duplicate_payment with existing_participation_id and existing_status, both NULL on a repeat if that seat has since gone. Otherwise it inserts the active seat, placed automatically when the product charges nothing and has exactly one group, and returns kind=settled with idempotent=false. Every return carries the booking''s booking_id, customer_id, participant_id, product_id, purchase_shape and currency, so the webhook reads nothing from Stripe metadata. Deliberately audience-ungated: validation happened before the money, and an after-money recorder refusing would strand a charge with no seat. service_role only: it has no auth.uid() and trusts the calling route.';


--
-- Name: FUNCTION confirm_booking(p_booking_id uuid, p_checkout_session_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text) TO service_role;


