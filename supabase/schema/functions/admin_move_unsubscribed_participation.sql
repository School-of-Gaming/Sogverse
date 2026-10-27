--
-- Name: admin_move_unsubscribed_participation(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_source_product_id uuid;
  v_status            public.participation_status;
  v_participant_id    uuid;
  v_customer_id       uuid;
  v_locked            integer;
  v_target_type       public.product_type;
  v_target_mode       public.billing_mode;
  v_for_gamers        boolean;
  v_for_parents       boolean;
  v_participant_role  public.user_role;
  v_live_sub          text;
  v_group_id          uuid;
  v_required_slugs    text[];
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id
    INTO v_source_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participation % does not exist', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Refused BEFORE the lock below, not after: the lock reads both products in
  -- one `IN` list, and a target equal to the source collapses that list to a
  -- single row — which would surface as "the target does not exist" and send an
  -- admin looking for a missing product instead of telling them the seat is
  -- already there.
  IF p_target_product_id = v_source_product_id THEN
    RAISE EXCEPTION 'participation % is already on product % — a move needs a different target (same product)',
      p_participation_id, p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- BOTH product rows, locked in ONE statement ORDERED BY id. Two admins
  -- moving seats in opposite directions (one from A to B while another goes
  -- from B to A) take the same two locks; taking them in the order the ids sort
  -- in means both transactions queue on the same row first, so one waits rather
  -- than the pair deadlocking. The order is the whole point of the ORDER BY —
  -- it is not a presentation choice and must not be dropped.
  --
  -- The source is locked as well as the target because the seat leaves it: its
  -- seat counts and its group list are read by every other participation writer
  -- under this same lock.
  SELECT count(*)
    INTO v_locked
    FROM (
      SELECT id
        FROM public.products
       WHERE id IN (v_source_product_id, p_target_product_id)
       ORDER BY id
         FOR UPDATE
    ) locked;
  -- The source exists by foreign key, so a missing row can only be the target.
  IF v_locked < 2 THEN
    RAISE EXCEPTION 'target product % does not exist', p_target_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- THE SEAT, RE-READ UNDER THE LOCKS, against what the panel saw when the
  -- sheet was opened. The read above happened before the locks were held, so
  -- this is the first look at the seat nothing can change underneath. A
  -- mismatch means the seat moved in between — a second admin, or a stale
  -- sheet pressed after the seat has already gone somewhere else — and moving
  -- it again from wherever it now is would be a move nobody asked for.
  SELECT product_id, status, participant_id, customer_id
    INTO v_source_product_id, v_status, v_participant_id, v_customer_id
    FROM public.participations
   WHERE id = p_participation_id;

  IF v_source_product_id IS DISTINCT FROM p_expected_source_product_id THEN
    RAISE EXCEPTION 'participation % is on product %, not the % the move was checked against — the seat has moved',
      p_participation_id, v_source_product_id, p_expected_source_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'participation % is % and not active — only an active seat can be moved',
      p_participation_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A LIVE subscription, in exactly the sense admin_move_participation and
  -- admin_remove_participation mean it: a family_subscriptions row whose status
  -- is anything but `cancelled`. This is the opposite side of the club switch's
  -- refusal — a seat with a monthly charge on it moves only with that charge,
  -- through the switch, which moves the Stripe subscription first. Moving its
  -- row here would leave the subscription billing for a club the seat is no
  -- longer on.
  SELECT stripe_subscription_id
    INTO v_live_sub
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id
     AND status <> 'cancelled';
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION 'participation % has the live subscription % — it moves through the club switch',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_target_type, v_target_mode, v_for_gamers, v_for_parents
    FROM public.products
   WHERE id = p_target_product_id;

  -- Asked through the shared predicate, so the panel's picker and this refusal
  -- cannot drift apart. A seat on a subscription-shaped product cannot exist
  -- without a monthly Stripe subscription, which a move with no money in it
  -- has no way to create.
  IF public.is_subscription_shaped(v_target_type, v_target_mode) THEN
    RAISE EXCEPTION 'product % is a subscription club — a seat there needs a subscription this move cannot create',
      p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE AUDIENCE, decided exactly as admin_enroll_participant decides it: from
  -- the participant's ROLE. A `customer` profile is an adult on their own
  -- account and needs a product open to parents; every other role is a child
  -- and needs one open to gamers. The customer is not re-derived here — the
  -- seat already names it, and it travels with the row.
  SELECT role INTO v_participant_role
    FROM public.profiles WHERE id = v_participant_id;

  IF v_participant_role = 'customer' THEN
    IF NOT v_for_parents THEN
      RAISE EXCEPTION 'product % is not open to parents', p_target_product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT v_for_gamers THEN
    RAISE EXCEPTION 'product % is not open to gamers', p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_group_id IS NOT NULL THEN
    -- THE ADMIN'S OWN PLACEMENT, and the one thing that has to be true about
    -- it. Read under the target's lock taken above, so the group list cannot
    -- change between this check and the write. A group of the SOURCE is the
    -- mistake this refuses in practice — the sheet is opened from the source
    -- product's panel — and writing it would leave the seat pointing at a group
    -- of a product it is not on: a state no UI can produce, which every
    -- group-scoped read (rosters, attendance, the feed) would then answer
    -- wrongly about rather than fail on.
    PERFORM 1
       FROM public.product_groups
      WHERE id = p_group_id
        AND product_id = p_target_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'group % is not a group of the target product % — a moved seat can only land in a group of the product it moves to',
        p_group_id, p_target_product_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_group_id := p_group_id;
  ELSE
    -- THE SHARED PLACEMENT RULE, applied to the TARGET, and the answer whenever
    -- the admin names no group. A no-charge product with exactly one group has
    -- no placement decision left in it; anything else — a paid camp or event
    -- included — lands in the unassigned inbox. LIMIT 2 because the question
    -- is "exactly one?", not "how many?".
    IF public.is_no_charge(v_target_mode) THEN
      SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
        INTO v_group_id
        FROM (
          SELECT id FROM public.product_groups
           WHERE product_id = p_target_product_id
           LIMIT 2
        ) g;
    END IF;
  END IF;

  -- The whole write. The purchase markers are untouched on purpose: the family
  -- bought this seat when they bought it, and a paid camp's payment marker
  -- travels with the row. The join instant is absent for the reason it is
  -- absent from every other writer — the BEFORE UPDATE trigger stamps it from
  -- group_id, and the table comment forbids writing it by hand.
  --
  -- Nothing group-scoped travels either: attendance marks, creations and feed
  -- history belong to the old group and stay there.
  --
  -- If the participant already holds a row on the target in any status the
  -- partial unique index covers — active, waitlisted or completed — this raises
  -- 23505, which is the answer: the collision is deliberately not pre-checked.
  UPDATE public.participations
     SET product_id = p_target_product_id,
         group_id   = v_group_id
   WHERE id = p_participation_id;

  -- THE TARGET'S ENROLMENT CONDITIONS, recorded exactly as a comp-enrolment
  -- records them: every slug in the target's requirement set is supplied
  -- automatically, on the family's behalf — customer_id the family's,
  -- accepted_by the acting admin. A move is arranged with the family
  -- off-platform just as a comp-enrolment is. A target requiring nothing
  -- leaves v_required_slugs NULL and the call is a no-op. It runs AFTER the
  -- UPDATE so an acceptance exists only where the seat now does.
  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required_slugs
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_target_product_id;

  PERFORM public.record_required_consents(
    p_target_product_id, v_customer_id, v_participant_id, (SELECT auth.uid()),
    v_required_slugs
  );

  RETURN jsonb_build_object(
    'participation_id',  p_participation_id,
    'source_product_id', v_source_product_id,
    'target_product_id', p_target_product_id,
    'group_id',          v_group_id,
    'customer_id',       v_customer_id,
    'participant_id',    v_participant_id
  );
END;
$$;


--
-- Name: FUNCTION admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid) IS 'Admin-gated move of a seat with nothing to bill: repoints one ACTIVE participation that carries no live subscription — a free or municipality seat, or a paid one-time camp or event — at any product that is not subscription-shaped (is_subscription_shaped false: free and municipality clubs, and every camp and event, paid or free). No money moves. Guard-first on assert_admin. Locks BOTH product rows in one statement ordered by id, which is what stops two admins moving seats in opposite directions from deadlocking. Refusals, each with its errcode so the route can map them: the participation or the target product does not exist (no_data_found); the target IS the source (same product), the seat is no longer on p_expected_source_product_id (the seat has moved), the seat is not active, the target is a subscription club, the target is not open to the participant''s audience (a customer profile needs for_parents, any other role for_gamers — the rule admin_enroll_participant applies), or p_group_id names a group that is not the target''s (check_violation); the seat carries a live subscription — a family_subscriptions row whose status is anything but cancelled — and so moves through admin_move_participation instead (object_not_in_prerequisite_state). p_group_id is the admin''s placement on the target; omitted or NULL, placement falls to the shared automatic-placement rule applied to the target: a no-charge product with exactly one group places the seat there, anything else lands it in the unassigned inbox. The join instant is never written here — the BEFORE UPDATE trigger stamps it from group_id. Seat cap, age range, region lock, product status and end date are deliberately NOT enforced: admins are trusted, in the posture the club switch and comp-enrolment already take. The already-on-the-target collision is not pre-checked either — the partial unique index over active/waitlisted/completed rows raises 23505. The row is UPDATEd rather than deleted and recreated, so its id, payment marker and purchase stamps travel with it. After the move the target''s required consents are recorded through record_required_consents exactly as admin_enroll_participant records them: every required slug supplied automatically, customer_id the family''s, accepted_by the acting admin. Returns participation_id, source_product_id, target_product_id, group_id, customer_id and participant_id.';


--
-- Name: FUNCTION admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_move_unsubscribed_participation(p_participation_id uuid, p_target_product_id uuid, p_expected_source_product_id uuid, p_group_id uuid) TO service_role;


