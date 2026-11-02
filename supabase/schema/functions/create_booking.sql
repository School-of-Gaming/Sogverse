--
-- Name: create_booking(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_is_parent             BOOLEAN;
  v_booking_id            UUID;
  v_open_sessions         JSONB;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- WHO IS IN THE SEAT, and whether this product admits them.
  --
  -- Plain `=`, deliberately not `IS NOT DISTINCT FROM`: two NULL ids are not a
  -- self seat, they are a caller with nothing to say, and the NULL comparison
  -- drops them into the ELSE branch where the parent-link check refuses them.
  -- Fail-closed falls out of the operator rather than out of a guard somewhere
  -- above.
  IF p_participant_id = p_customer_id THEN
    -- The adult's own seat. This function has no auth.uid() (service_role
    -- only), so "self" can only mean participant = the customer the route
    -- pinned to the session user — which is the same footing the parent-link
    -- check has always stood on.
    IF NOT v_product.for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Somebody else's seat. The parent-link requirement is unchanged and is
    -- what keeps "a parent can never enroll another adult" true: an unlinked
    -- adult fails here exactly as an unlinked child does.
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

  v_eff_status := public.effective_status(p_product_id);
  IF v_eff_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'product is not accepting signups (effective status: %)', v_eff_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_product.registration_opens_at IS NOT NULL
     AND v_product.registration_opens_at > NOW() THEN
    RAISE EXCEPTION 'registration has not yet opened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_currency NOT IN ('eur', 'gbp', 'usd') THEN
    RAISE EXCEPTION 'unsupported currency: %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_purchase_shape NOT IN (
    'subscription_monthly', 'single_payment', 'free', 'external'
  ) THEN
    RAISE EXCEPTION 'unsupported purchase shape: %', p_purchase_shape
      USING ERRCODE = 'check_violation';
  END IF;

  -- The already-enrolled gate. Its status list has to match the one
  -- confirm_booking conflicts on, or a signup can pass here, take the parent's
  -- money, and then be refused at confirmation with nothing to show for it.
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('active', 'waitlisted', 'completed')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'gamer % already has a participation on this product (status: %)', p_participant_id, v_existing_status
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Seat-count gate, for every shape, so an explicit cap on a no-charge product
  -- (the schema permits it, incl. municipality clubs) is honored. A parent's own
  -- seat counts here like anybody else's: the cap is on seats, not on children.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- THE ENROLMENT CONDITIONS. Every gate above has passed and a seat is
  -- available, so this signup is one the platform will accept — which is
  -- precisely when the product's required consents bind. Raises check_violation
  -- naming any document the caller did not agree to; otherwise writes one
  -- acceptance row per required document at that document's current version.
  -- Runs for EVERY purchase shape, the paid ones included: the parent agreed
  -- here, so the record belongs here. A no-op for the overwhelming majority of
  -- products, which require nothing.
  --
  -- The customer is BOTH the agreeing party and the actor on this path:
  -- a parent enrolling their own child ticked the boxes themselves, which is
  -- exactly what distinguishes these rows from the ones an admin writes through
  -- admin_enroll_participant.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  IF p_purchase_shape = 'free' AND v_product.billing_mode <> 'free' THEN
    RAISE EXCEPTION 'product is not free'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to confirm
  -- later. Gated on billing_mode so a paid product can never be registered
  -- without payment.
  IF p_purchase_shape = 'external' AND v_product.billing_mode <> 'external_contract' THEN
    RAISE EXCEPTION 'product is not externally contracted'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Read before the new booking exists, so these are the OTHER bookings' Sessions.
  -- By (product, participant): a second guardian booking the same child counts.
  SELECT COALESCE(jsonb_agg(b.stripe_checkout_session_id), '[]'::jsonb)
    INTO v_open_sessions
    FROM public.bookings b
    WHERE b.product_id = p_product_id
      AND b.participant_id = p_participant_id
      AND b.status = 'pending'
      AND b.stripe_checkout_session_id IS NOT NULL
      AND b.checkout_closes_at > now();

  INSERT INTO public.bookings (
    product_id, participant_id, customer_id, purchase_shape, currency,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, p_purchase_shape, p_currency,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
  )
  RETURNING id INTO v_booking_id;

  IF p_purchase_shape IN ('free', 'external') THEN
    RETURN jsonb_build_object(
      'kind', CASE p_purchase_shape WHEN 'free' THEN 'free_active' ELSE 'external_active' END,
      'participation_id', public.confirm_booking(v_booking_id)->'participation_id'
    );
  END IF;

  -- Paid shapes. The booking waits for the money and holds no seat. The caller
  -- expires the open Sessions listed here and creates the new one.
  RETURN jsonb_build_object(
    'kind', 'pending',
    'booking_id', v_booking_id,
    'open_checkout_sessions', v_open_sessions
  );
END;
$$;


--
-- Name: FUNCTION create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap), records the required consents and writes the booking with the parent''s UTM tag and School of Gaming answer. Free and external bookings are settled in the same transaction and return kind=free_active or kind=external_active with participation_id. Paid shapes return kind=pending with booking_id and open_checkout_sessions, the session ids of any other pending booking for this product and participant whose Session is still open, for the route to expire; the seat waits for the Stripe webhook to call confirm_booking, and a pending booking holds no seat. A full product returns kind=full before any of it, because nobody enrolled. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count race-free against a concurrent signup. record_required_consents runs for EVERY purchase shape, because the parent agreed here, and an acceptance behind an abandoned Checkout is a harmless true statement; it names p_customer_id as accepted_by as well as customer, which tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user, and to pass the UTM tag only under marketing cookie consent.';


--
-- Name: FUNCTION create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) TO service_role;


