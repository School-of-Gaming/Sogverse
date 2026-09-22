--
-- Name: join_waitlist(uuid, uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product           public.products;
  v_existing_id       UUID;
  v_existing_ts       TIMESTAMPTZ;
  v_existing_status   public.participation_status;
  v_now               TIMESTAMPTZ;
  v_position          INTEGER;
  v_participation_id  UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same audience gate as create_participation, and for the same reason: a
  -- queue is a promise of a seat, so it has to refuse exactly the seats the
  -- signup path would. See that function for why `=` rather than
  -- `IS NOT DISTINCT FROM`, and for why the parent-link arm is what keeps a
  -- parent from enrolling another adult.
  IF p_participant_id = p_customer_id THEN
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.parent_gamer
      WHERE parent_id = p_customer_id AND gamer_id = p_participant_id
    ) INTO v_is_parent;
    IF NOT v_is_parent THEN
      RAISE EXCEPTION 'customer % is not the parent of gamer %', p_customer_id, p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_product.for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT v_product.waitlist_enabled THEN
    RAISE EXCEPTION 'waitlist is not enabled for this product'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotency: existing waitlisted/reserving/active row → return it as-is,
  -- flagged so the caller can tell this apart from the INSERT below.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'reserving', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a spot (active/reserving) — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text,
      'idempotent', TRUE
    );
  END IF;

  -- THE ENROLMENT CONDITIONS (00210), below the idempotency return so a replay
  -- records nothing: the same enrolment agreed once. Raises check_violation
  -- naming any required document the caller did not agree to; otherwise writes
  -- one acceptance row per required document at its current version. Joining a
  -- queue IS the enrolment moment on this path — meeting the conditions for the
  -- first time at promotion would ask a family to agree at the moment they are
  -- least able to decline.
  --
  -- The customer is both the agreeing party and the actor (00212), for the
  -- reason create_participation states.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  -- Stamp the join time; order is derived from it, never stored as a rank.
  -- clock_timestamp(), NOT now(): now() is transaction_timestamp() (frozen at
  -- transaction start), so concurrent joins serialized on the gate lock can
  -- carry equal/inverted stamps and both compute rank 1. clock_timestamp()
  -- reads the wall clock at this statement — which runs under the lock, after
  -- the prior joiner committed — so stamps are monotonic with real join order.
  v_now := clock_timestamp();
  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now
  )
  RETURNING id INTO v_participation_id;

  SELECT COUNT(*) INTO v_position
    FROM public.participations
    WHERE product_id = p_product_id AND status = 'waitlisted'
      AND (waitlisted_at < v_now
           OR (waitlisted_at = v_now AND id <= v_participation_id));

  -- The one call that wrote a row. Everything that must happen exactly once per
  -- place in line keys on this.
  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'waitlist_position', v_position,
    'status', 'waitlisted',
    'idempotent', FALSE
  );
END;
$$;


--
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) IS 'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted/reserving/active row already there. Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. Since 00210 it takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. Since 00212 it names p_customer_id as the acceptance''s accepted_by as well as its customer, the parent having ticked the boxes themselves. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';


--
-- Name: FUNCTION join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) FROM PUBLIC;


