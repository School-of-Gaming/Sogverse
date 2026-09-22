--
-- Name: create_participation(uuid, uuid, uuid, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product               public.products;
  v_eff_status            public.effective_product_status;
  v_seats_taken           INTEGER;
  v_existing_id           UUID;
  v_existing_status       public.participation_status;
  v_participation_id      UUID;
  v_is_parent             BOOLEAN;
  v_auto_group_id         UUID;
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
  -- `confirm_paid_participation` conflicts on, or a signup can pass here, take
  -- the parent's money, and then be refused at confirmation with nothing to
  -- show for it. 'completed' is the member that was missing: nothing writes
  -- that status today, so the gap was unreachable rather than harmless.
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

  -- Seat-count gate. Sits above the free / external branches so an explicit cap
  -- on a no-charge product (the schema permits it, incl. municipality clubs) is
  -- honored — earlier versions only checked the cap on paid signups, so a free
  -- product with seat_count=20 silently accepted the 21st signup. A parent's
  -- own seat counts here like anybody else's: the cap is on seats, not on
  -- children.
  IF v_product.seat_count IS NOT NULL THEN
    v_seats_taken := public.count_active_seats(p_product_id);
    IF v_seats_taken >= v_product.seat_count THEN
      RETURN jsonb_build_object('kind', 'full');
    END IF;
  END IF;

  -- THE ENROLMENT CONDITIONS (00210). Every gate above has passed and a seat is
  -- available, so this signup is one the platform will accept — which is
  -- precisely when the product's required consents bind. Raises check_violation
  -- naming any document the caller did not agree to; otherwise writes one
  -- acceptance row per required document at that document's current version.
  -- Runs for EVERY purchase shape, the paid ones included: they write no
  -- participation row here, but the parent agreed here, so the record belongs
  -- here. A no-op for the overwhelming majority of products, which require
  -- nothing.
  --
  -- The customer is BOTH the agreeing party and the actor on this path (00212):
  -- a parent enrolling their own child ticked the boxes themselves, which is
  -- exactly what distinguishes these rows from the ones an admin writes through
  -- admin_enroll_participant.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  -- AUTOMATIC PLACEMENT (00206), for the two branches below that seat somebody
  -- on the spot. A no-charge product with exactly one group has no placement
  -- decision left in it, so the seat goes straight into that group instead of
  -- into the unassigned inbox; zero groups has nowhere to put anyone, and two
  -- or more is a real decision that stays a human's. NULL out of this read is
  -- the unassigned inbox, which is what every enrollment did before.
  --
  -- Safe against a concurrent group edit because the product row is held FOR
  -- UPDATE above — the same lock the group editor takes. LIMIT 2 because the
  -- question is "exactly one?", not "how many?".
  IF public.is_no_charge(v_product.billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  IF p_purchase_shape = 'free' THEN
    IF v_product.billing_mode <> 'free' THEN
      RAISE EXCEPTION 'product is not free'
        USING ERRCODE = 'check_violation';
    END IF;
    -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
    -- from group_id, and the table comment forbids writing it by hand.
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'free_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Municipality clubs are invoiced off-platform: no Stripe, nothing to
  -- confirm later. Mirrors the free branch (instant active), gated on
  -- billing_mode so a paid product can never be registered without payment.
  IF p_purchase_shape = 'external' THEN
    IF v_product.billing_mode <> 'external_contract' THEN
      RAISE EXCEPTION 'product is not externally contracted'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.participations (
      product_id, participant_id, customer_id, status, group_id
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id
    )
    RETURNING id INTO v_participation_id;
    RETURN jsonb_build_object(
      'kind', 'external_active',
      'participation_id', v_participation_id
    );
  END IF;

  -- Paid shapes (subscription_monthly, single_payment). Everything above has
  -- passed, so this signup is one the platform would accept — but no row is
  -- written until the money arrives. The caller creates the Stripe Checkout
  -- Session next; if the parent abandons it, nothing was left behind to clean
  -- up. `confirm_paid_participation` writes the row from the webhook.
  RETURN jsonb_build_object('kind', 'validated');
END;
$$;


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. The two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. It takes p_consented_documents and, just after the seat-cap gate, calls record_required_consents: an enrolment onto a product with required consent documents is refused with check_violation unless the array covers all of them, and otherwise records one acceptance row per required document at that document''s current version. That runs for EVERY purchase shape — the paid ones write no participation row here, but the parent agreed here, so the record is made here, and an acceptance behind an abandoned Checkout is a harmless true statement. A full product returns kind=''full'' before any of it, because nobody enrolled. It names p_customer_id as the acceptance''s accepted_by as well as its customer: on this path the parent ticked the boxes themselves, which is what tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user.';


--
-- Name: FUNCTION create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) TO service_role;


