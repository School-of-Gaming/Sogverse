--
-- Name: admin_enroll_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_for_gamers       boolean;
  v_for_parents      boolean;
  v_participant_role public.user_role;
  v_customer_id      uuid;
  v_participation_id uuid;
  v_auto_group_id    uuid;
  v_required_slugs   text[];
BEGIN
  PERFORM public.assert_admin();

  -- FOR UPDATE since 00206: the automatic placement below counts this product's
  -- groups, and the lock is what stops that count from being taken against a
  -- group list another admin is in the middle of changing. Same lock, same
  -- order (product, then participations) as every other participation writer.
  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_product_type, v_billing_mode, v_for_gamers, v_for_parents
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included, since 00166 — is the free camp and free event this function has
  -- always written.
  IF v_product_type = 'consumer_club' AND v_billing_mode = 'paid' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for subscription-billed consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- This function derives the customer rather than being told one, so "is this
  -- a self seat" is decided from the participant's ROLE. A `customer` profile
  -- is an adult taking a seat on their own account; every other role (and a
  -- participant who does not exist at all, whose role reads NULL and so fails
  -- this comparison) goes down the child path and is resolved through the
  -- parent link exactly as before — including the error it has always raised.
  SELECT role INTO v_participant_role
    FROM public.profiles WHERE id = p_participant_id;

  IF v_participant_role = 'customer' THEN
    IF NOT v_for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- An adult pays for their own seat: they are the customer AND the
    -- participant. This is the row shape the dropped no-self-signup CHECK used
    -- to forbid.
    v_customer_id := p_participant_id;
  ELSE
    -- One parent per gamer is the current model; where a gamer somehow has
    -- several links, the oldest wins so the choice is deterministic rather than
    -- whatever the planner returned. Multi-parent reckoning is future work.
    SELECT parent_id INTO v_customer_id
      FROM public.parent_gamer
      WHERE gamer_id = p_participant_id
      ORDER BY created_at ASC
      LIMIT 1;
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'gamer % has no linked parent', p_participant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_for_gamers THEN
      RAISE EXCEPTION 'product % is not open to gamers', p_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- AUTOMATIC PLACEMENT (00206). A no-charge product with exactly one group has
  -- no placement decision left in it. A paid camp or event still lands in the
  -- unassigned inbox — money on the seat is what separates the two, and this
  -- function serves both.
  IF public.is_no_charge(v_billing_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_auto_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_product_id
         LIMIT 2
      ) g;
  END IF;

  -- The partial unique index on (product_id, participant_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  --
  -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
  -- from group_id, and the table comment forbids writing it by hand.
  INSERT INTO public.participations (product_id, participant_id, customer_id, status, group_id)
  VALUES (p_product_id, p_participant_id, v_customer_id, 'active', v_auto_group_id)
  RETURNING id INTO v_participation_id;

  -- THE ENROLMENT CONDITIONS (00212). The seat exists, so the product's
  -- required consents bind to it exactly as they would on a family signup —
  -- but the admin is not prompted and is never refused. Every required slug is
  -- supplied automatically from the product's own requirement set, so the gate
  -- passes by construction and its job here is the WRITE rather than the check;
  -- the family stays the customer, and the acting admin is stamped as the one
  -- who performed the act. A product requiring nothing leaves v_required_slugs
  -- NULL and the call is a no-op, which is every product but one.
  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required_slugs
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  PERFORM public.record_required_consents(
    p_product_id, v_customer_id, p_participant_id, (SELECT auth.uid()),
    v_required_slugs
  );

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;


--
-- Name: FUNCTION admin_enroll_participant(p_product_id uuid, p_participant_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) IS 'Admin-gated comp-enrollment: drops a participant onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event. Since 00173 it also enforces the audience: a customer profile takes a seat as their own customer and needs for_parents, anyone else is resolved through the parent link and needs for_gamers. Renamed from admin_enroll_gamer in 00175 — it has not only enrolled gamers since 00173. Since 00206 it places the seat automatically when the product charges nothing (billing_mode free or external_contract) AND has exactly one group, matching the family self-enrollment path; a PAID camp or event still lands in the unassigned inbox, as does any product with zero or several groups, and whether the single group has a gedu assigned is not consulted. That placement is why the product read now takes FOR UPDATE — the group count has to be taken under the same lock the group editor holds. group_joined_at is never written here; a trigger stamps it from group_id. Since 00212 it is the THIRD door into record_required_consents, and the only one that neither prompts nor refuses: admins are trusted, a comp-enrollment is arranged with the family off-platform, so every slug in the product''s requirement set is supplied automatically and the acceptance rows are written on the family''s behalf — customer_id the family''s, accepted_by the acting admin''s auth.uid(). It runs AFTER the INSERT because the partial unique index is the already-enrolled gate on this path, so an acceptance exists only where a seat does. There is no consent argument on this function or on the route above it, and no UI change: nothing about the Add button''s behaviour differs on a consent-requiring product.';


--
-- Name: FUNCTION admin_enroll_participant(p_product_id uuid, p_participant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) TO service_role;


