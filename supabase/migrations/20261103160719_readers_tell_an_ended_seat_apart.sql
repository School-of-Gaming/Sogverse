-- The readers that took "the row exists" to mean "the seat is held".
--
-- A seat now ends and stays, so every read that found a seat by its row alone
-- learns to tell an ended one apart.
--
-- 1. confirm_booking: a settled booking whose seat has ended answers with no
--    seat, as it did when the seat was deleted, so a redelivered event never
--    puts it back. Its duplicate check, and create_booking's, drop the retired
--    completed status and leave ended out, so a family can enrol again.
--    confirm_paid_participation needs no change: it refuses when that answer
--    carries no seat.
-- 2. set_gamer_group_note and set_gamer_group_creations: staff write only about
--    somebody still in the group, so an ended seat no longer counts.
-- 3. get_my_family_product_feed: an ended seat keeps its page, bounded at the
--    instant it ended.
-- 4. get_klaviyo_parent_snapshots: participations and subscriptions are the
--    ones held now; klaviyo_attendance_marked prefers a live seat.
-- 5. apply_group_changes: a move between groups touches only an active seat,
--    so a stale admin panel cannot move an ended seat out of the group it
--    ended in.


-- 1. Bookings

CREATE OR REPLACE FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text DEFAULT NULL::text) RETURNS jsonb
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
  -- event after the seat ended must not put the seat back. participation_id is
  -- NULL then: an ended seat is kept as history, but it is not one to confirm.
  IF v_booking.status = 'settled' THEN
    SELECT id INTO v_participation_id
      FROM public.participations
     WHERE booking_id = p_booking_id
       AND status <> 'ended';
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
      AND status IN ('active', 'waitlisted')
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

COMMENT ON FUNCTION public.confirm_booking(p_booking_id uuid, p_checkout_session_id text) IS 'Turns a booking into a seat: the one path, called in the same transaction for a free or external booking and from the Stripe webhook for a paid one. Locks the product, then the booking. A booking already settled returns kind=settled with idempotent=true and the seat''s id, which is NULL if the seat has since ended, and writes nothing, so a redelivered event never puts a seat back. A booking already duplicate returns kind=duplicate_payment again. A session id other than the one the booking stores raises check_violation, and that includes passing one to a booking that stores none. If the participant already holds an active seat or a waitlisted place on the product the booking becomes duplicate and returns kind=duplicate_payment with existing_participation_id and existing_status, both NULL on a repeat if that seat has since gone. Otherwise it inserts the active seat, placed automatically when the product charges nothing and has exactly one group, and returns kind=settled with idempotent=false. Every return carries the booking''s booking_id, customer_id, participant_id, product_id, purchase_shape and currency, so the webhook reads nothing from Stripe metadata. Deliberately audience-ungated: validation happened before the money, and an after-money recorder refusing would strand a charge with no seat. service_role only: it has no auth.uid() and trusts the calling route.';

CREATE OR REPLACE FUNCTION public.create_booking(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
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
      AND status IN ('active', 'waitlisted')
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

-- 2. Staff write only about somebody still in the group

CREATE OR REPLACE FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_row  public.gamer_group_notes;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate — refusing a substitute
  -- standing in for another group would make the feature useless in the one
  -- situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: a note may only be written about somebody who sits in the
  -- group it is filed under. Without this an authorized gedu could file a note
  -- against any profile id on the platform. The table carries no write grant,
  -- so it is correctly outside the write-IDOR loop's completeness check — these
  -- two checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- Any status but ended counts, not just active: a note about somebody on the
  -- group's waitlist is a coherent thing to write, and narrowing it buys
  -- nothing. What it does exclude is a member who has LEFT the group — moved
  -- out, or whose seat ended and so keeps the group only as history — which is
  -- why an orphaned note cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
       AND part.status        <> 'ended'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- A trimmed-empty save DELETES the row. Clearing a note is how a gedu retires
  -- guidance that no longer applies, and the absence of a row is what "no note"
  -- means on every surface — so the empty save has to produce that absence
  -- rather than an empty string standing in for it. The returned document is
  -- the null shape, so a caller merges the same keys either way.
  IF v_note IS NULL THEN
    DELETE FROM public.gamer_group_notes
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',                   p_group_id,
      'participant_id',             p_participant_id,
      'note',                       NULL,
      'note_updated_by_first_name', NULL,
      'updated_at',                 NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history: only the last editor is stored.
  -- updated_at is left to the touch trigger. Length is NOT checked here — the
  -- CHECK refuses anything over 2000 with 23514, and since the dialog caps at
  -- 2000 a longer write can only come from a non-UI caller, which deserves a
  -- loud refusal rather than a silent truncation.
  INSERT INTO public.gamer_group_notes AS n
         (group_id, participant_id, note, updated_by)
  VALUES (p_group_id, p_participant_id, v_note, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET note       = EXCLUDED.note,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'note',           v_row.note,
    -- Resolved at read time on purpose, unlike the signed-name snapshot on a
    -- contract acceptance: this line answers "who should I ask about this
    -- note", so the name they go by today is the right answer. NULL when the
    -- editor's account is gone (updated_by is ON DELETE SET NULL), and the
    -- surface then shows the note with no editor line.
    'note_updated_by_first_name',
      (SELECT pr.first_name FROM public.profiles pr WHERE pr.id = v_row.updated_by),
    'updated_at',     v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) IS 'Write, replace or clear the staff note about one member of one group, and return the resulting document (group_id, participant_id, note, note_updated_by_first_name, updated_at). Open to an ADMIN or to any gedu assigned to any group of the group''s product, with full read/write parity between the two; guard-first on assert_role, then two further 42501s — the ACTOR half (staff reach over the product) and the TARGET half (the participant actually holds a participation in that group, at any status but ended). The target half is what stands in for a write-IDOR loop entry, since the table carries no write grant for any client role. A trimmed-empty note DELETES the row and returns the null-shaped document, because absence of a row is what "no note" means everywhere else. Over-long notes are refused by the table''s CHECK (23514) rather than truncated. Last-write-wins, and only the last editor is stored — there is no history. A note does not follow a member moved to another group: it stays where it was written.';

CREATE OR REPLACE FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_creations jsonb := COALESCE(p_creations, '[]'::jsonb);
  v_row       public.gamer_group_creations;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate and is the note's rule
  -- unchanged — refusing a substitute standing in for another group would make
  -- the feature useless in the one situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: creations may only be filed against somebody who sits in
  -- the group they are filed under. Without this an authorized gedu could write
  -- against any profile id on the platform. The table carries no write grant, so
  -- it is correctly outside the write-IDOR loop's completeness check — these two
  -- checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- Any status but ended counts, not just active, exactly as the note's target
  -- check does: what it excludes is a member who has LEFT the group — moved
  -- out, or whose seat ended — which is why an orphaned list cannot be edited
  -- back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
       AND part.status        <> 'ended'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Refused here rather than by the CHECK only because the CHECK's message for a
  -- non-array is about jsonpath, which names nothing a caller can act on.
  IF jsonb_typeof(v_creations) <> 'array' THEN
    RAISE EXCEPTION 'p_creations must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- An empty list DELETES the row. Absence of a row is what "no creations" means
  -- on every surface, so the empty save has to produce that absence rather than
  -- an empty array standing in for it — and the CHECK refuses an empty array, so
  -- the two states genuinely cannot both exist. The returned document is the
  -- empty shape, so a caller merges the same keys either way.
  IF jsonb_array_length(v_creations) = 0 THEN
    DELETE FROM public.gamer_group_creations
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',       p_group_id,
      'participant_id', p_participant_id,
      'creations',      '[]'::jsonb,
      'updated_at',     NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history. updated_at is left to the touch
  -- trigger. The list is stored EXACTLY as supplied: no trimming and no
  -- rebuilding of each element, because rebuilding would quietly drop the extra
  -- keys the CHECK exists to refuse, and trimming would make the CHECK's
  -- non-blank clause unreachable. Shape, caps and blankness are all the table's
  -- (23514), which the dialog is built never to hit.
  INSERT INTO public.gamer_group_creations AS c
         (group_id, participant_id, creations, updated_by)
  VALUES (p_group_id, p_participant_id, v_creations, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET creations  = EXCLUDED.creations,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'creations',      v_row.creations,
    'updated_at',     v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) IS 'Replace the whole list of creations for one member of one group, and return the resulting document (group_id, participant_id, creations, updated_at). Set-shaped rather than per-row add/update/delete: nothing reads or references a single creation, and a small list edited in a dialog is replaced whole. Open to an ADMIN or to any gedu assigned to any group of the group''s product, with full read/write parity between the two; guard-first on assert_role, then two further 42501s — the ACTOR half (staff reach over the product) and the TARGET half (the participant actually holds a participation in that group, at any status but ended). The target half is what stands in for a write-IDOR loop entry, since the table carries no write grant for any client role. An EMPTY list deletes the row and returns the empty-shaped document, because absence of a row is what "no creations" means everywhere else. The value is stored verbatim — no trimming, no key filtering — so the table''s CHECK is the single authority on shape, caps and blankness (23514); normalising here would discard the extra keys that CHECK exists to refuse. Idempotent: the same list written twice is the same row, which is what makes a partial failure in the two-write dialog safe to retry. Last-write-wins, and only the last writer is stored — there is no history, and nothing in v1 displays the provenance it does keep.';

-- 3. An ended seat keeps its page, as far as the seat went

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
  v_creations      jsonb;
  v_cancellations  jsonb;
  v_paid_through   date;
  v_start_date     date;
  v_horizon        date;
  v_status         public.participation_status;
  v_ended_at       timestamptz;
  v_access_end     timestamptz;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, where a NULL uid
  -- would disappear into a larger boolean expression instead of refusing.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.participant_id, part.group_id, part.product_id, part.status, part.ended_at
    INTO v_participant_id, v_group_id, v_product_id, v_status, v_ended_at
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- An ended seat keeps its page as far as the seat went: up to the instant it
  -- ended, and no further (owner ruling, 2026-11-03: reports up to the day they
  -- left). Not raised to a subscription's paid-through date: a seat Stripe
  -- cancels ends at its period end anyway, and an admin's removal is immediate,
  -- so its page must not go on listing sessions the child no longer attends.
  -- NULL on a seat that has not ended, which leaves every list below as it was.
  IF v_status = 'ended' THEN
    v_access_end := v_ended_at;
  END IF;

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
  FROM public.profiles pr WHERE pr.id = v_participant_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it. The requirement flag
  -- is not selected either, and its absence here is the enforcement: it
  -- is staff-facing, and a family sees nothing different on a flagged product.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'delivery_mode', p.delivery_mode,
    'voice_room_mode', p.voice_room_mode,
    'external_voice_url', p.external_voice_url,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description,
               'voice_join_instructions', pt.voice_join_instructions
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person and hybrid products — same test as the gedu feed, and for
  -- the same reason: an online municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.delivery_mode <> 'online';

  -- Who teaches this group, by first name. Nothing else about them: not the
  -- surname, not the email, not the verification state. A family is being told
  -- who they are with, which is a first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
    ) AS gedu_rows;

  -- THIS participant's creations in THIS group, and nobody else's. A
  -- flat array on the document rather than a map keyed by participant, so
  -- another child's work has nowhere to live here BY TYPE — the same move
  -- `attendance` makes below, where the gedu feed carries a map and this
  -- document carries one answer. Empty array when there is no row, so the card
  -- renders on "is this empty" and never on "is this null".
  SELECT COALESCE(
           (SELECT c.creations
              FROM public.gamer_group_creations c
             WHERE c.group_id       = v_group_id
               AND c.participant_id = v_participant_id),
           '[]'::jsonb
         )
    INTO v_creations;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. There is deliberately no window here: what is stored is
  -- what travels.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys ride on every session, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` has the same shape as the gedu and admin documents' —
  -- {id, width, height}, ordered by (created_at, id) — because one shared
  -- gallery component renders them all. The uploader does not travel: it is
  -- safeguarding audit, and a family surface is the last place for it.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.participant_id   = v_participant_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
         -- Cancellation: a record kept under a cancellation does not travel. A
         -- family is told the session is off, and a report on it would say
         -- otherwise; a restore brings the row back here as it was.
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
         -- An ended seat: nothing that started after its access ended.
         AND (v_access_end IS NULL OR s.starts_at < v_access_end)
    ) AS session_rows;

  -- Cancellation: the group's cancelled sessions in effect, newest first, as a
  -- date and NOTHING ELSE. The reason and who cancelled are admin-only; a
  -- family is told the session is off, not why. One kept over a record the
  -- schedule no longer projects travels too, and the record beside it does
  -- not (above): the family has no instants to draw it at, so the date
  -- simply stops being shown rather than showing the report. One on a holiday
  -- is not listed: that date carries its break and nothing else, and the
  -- cancellation is listed again if the break goes.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('session_date', sc.session_date)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = v_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
     AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
     AND (v_access_end IS NULL
          OR sc.session_date <= (v_access_end AT TIME ZONE (
               SELECT p.timezone FROM public.products p WHERE p.id = v_product_id
             ))::date);

  -- The product-local date a cancelled membership is paid through: the
  -- `canceling` subscription's current_period_end, the instant the family's
  -- access ends, which the page also reads (as its access-until) to clamp the
  -- list. NULL on anything else, which leaves the horizon as it is.
  SELECT (fs.current_period_end AT TIME ZONE p.timezone)::date
    INTO v_paid_through
    FROM public.family_subscriptions fs
    JOIN public.products p ON p.id = v_product_id
   WHERE fs.participation_id = p_participation_id
     AND fs.status = 'canceling';

  -- An ended seat's access stops at the product-local date it ended.
  IF v_access_end IS NOT NULL THEN
    SELECT (v_access_end AT TIME ZONE p.timezone)::date
      INTO v_paid_through
      FROM public.products p WHERE p.id = v_product_id;
  END IF;

  -- The plan's span, which the holiday breaks share: the product's start to
  -- its horizon for THIS group, raised to the paid-through date.
  SELECT p.start_date INTO v_start_date
    FROM public.products p WHERE p.id = v_product_id;
  v_horizon := public.session_plan_horizon(v_product_id, v_group_id, v_paid_through);
  -- For an ended seat the paid-through date is a ceiling as well as a floor:
  -- the plan stops where the seat's access did.
  IF v_access_end IS NOT NULL THEN
    v_horizon := LEAST(v_horizon, v_paid_through);
  END IF;

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'creations',   v_creations,
    'sessions',    v_sessions,
    'cancellations', v_cancellations,
    -- The plan from the product's start to its horizon for THIS group — the
    -- eighth session that has not ended and that the group has not cancelled,
    -- on an open-ended product — raised to the paid-through date, so a cancelled membership's
    -- plan reaches the last session the family may still attend. Plain plan
    -- rows; the cancellations above are laid over them by date.
    'planned_sessions', public.planned_sessions_document(v_product_id, v_horizon),
    -- The holiday breaks over the same span, each with the sessions it
    -- withdrew from the plan above.
    'holiday_breaks',   public.holiday_breaks_document(v_product_id, v_start_date, v_horizon)
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person and hybrid products, the teaching gedus'' first names, the group''s full stored session history with reports and PHOTOS, the named participant''s own attendance marks, and that participant''s own creations. Each session carries updated_by and the last editor''s first name — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit. That key rides on this strict family document under no versioned twin of its own, on the severity paragraph in docs/plans/CLAUDE.md: transient read-side breakage inside a release window is accepted. `creations` is a TOP-LEVEL array of {title, url} — this participant''s own, in this group, and structurally incapable of holding anybody else''s because it is not a map keyed by participant. It is the one staff-authored family-facing field that carries links, an owner-approved exception to the link-free rule session reports follow, and the render side parses each URL and degrades to the title as plain text when it is not http(s). Empty array when there is nothing, so the card renders on emptiness and never on null. `planned_sessions` is the product''s plan from start_date to session_plan_horizon for this group (planned_sessions_document), raised to the product-local date a `canceling` subscription''s current_period_end falls on — the paid-through instant the page clamps the list at — as plain {session_date, starts_at, ends_at} rows; the cancellations stay their own list, and leave out any on a holiday date. `holiday_breaks` is holiday_breaks_document over the same span: each break of a calendar the product follows, with its name in every locale and the plan rows it withdrew. An ENDED seat keeps its page: its stored sessions stop at those starting before its ended_at — never raised to a subscription''s current_period_end — its cancellations and plan stop at that instant''s product-local date, and the plan is cut there rather than raised to it. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks or creations, no parent email, no material link, no requires_gamer_creations flag and no owed/completeness state.';

-- 4. Klaviyo hears about the seats held now

CREATE OR REPLACE FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) RETURNS TABLE(customer_id uuid, snapshot jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id,
         jsonb_build_object(
           'profile', jsonb_build_object(
             'id',                p.id,
             'email',             p.email,
             'first_name',        p.first_name,
             'last_name',         p.last_name,
             'phone',             p.phone,
             'locale',            p.locale,
             'spoken_languages',  to_jsonb(p.spoken_languages),
             'currency',          p.currency,
             'created_at',        p.created_at,
             'email_verified_at', p.email_verified_at,
             'home_location', (
               SELECT jsonb_build_object(
                        'id',           l.id,
                        'name',         l.name,
                        'country_code', l.country_code
                      )
                 FROM public.locations l
                WHERE l.id = p.home_location_id
             )
           ),
           'attribution', jsonb_build_object(
             'utm_source',                     p.utm_source,
             'utm_medium',                     p.utm_medium,
             'utm_campaign',                   p.utm_campaign,
             'utm_content',                    p.utm_content,
             'utm_term',                       p.utm_term,
             'signup_intent_kind',             p.signup_intent_kind,
             'signup_intent_id',               p.signup_intent_id,
             'registration_marketing_consent', p.registration_marketing_consent
           ),
           'gamers', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'birth_year',  gp.birth_year,
                        'gender',      gp.gender,
                        'minecraft',   EXISTS (
                                         SELECT 1
                                           FROM public.minecraft_accounts m
                                          WHERE m.user_id = gp.user_id
                                            AND m.minecraft_username IS NOT NULL
                                       ),
                        'roblox',      EXISTS (
                                         SELECT 1
                                           FROM public.roblox_accounts r
                                          WHERE r.user_id = gp.user_id
                                            AND r.roblox_username IS NOT NULL
                                       )
                      )
                      ORDER BY gp.birth_year, gp.user_id
                    )
               FROM public.parent_gamer pg
               JOIN public.gamer_profiles gp ON gp.user_id = pg.gamer_id
              WHERE pg.parent_id = p.id
           ), '[]'::jsonb),
           'participations', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',      part.id,
                        'status',  part.status,
                        'product', public.klaviyo_product_document(part.product_id)
                      )
                      ORDER BY part.signed_up_at, part.id
                    )
               FROM public.participations part
              WHERE part.customer_id = p.id
                AND part.status <> 'ended'::public.participation_status
           ), '[]'::jsonb),
           'subscriptions', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'participation_id',   fs.participation_id,
                        'current_period_end', fs.current_period_end
                      )
                      ORDER BY fs.created_at, fs.id
                    )
               FROM public.family_subscriptions fs
              WHERE fs.customer_id = p.id
                AND fs.ended_at IS NULL
           ), '[]'::jsonb),
           'payments', (
             SELECT jsonb_build_object(
                      'first_at',      min(pay.created_at),
                      'last_at',       max(pay.created_at),
                      'lifetime_cents', COALESCE((
                        SELECT jsonb_object_agg(per.currency, per.total)
                          FROM (
                            SELECT pay2.currency, sum(pay2.amount_cents) AS total
                              FROM public.payments pay2
                             WHERE pay2.customer_id = p.id
                               AND pay2.purpose <> 'reservation_duplicate'::public.payment_purpose
                             GROUP BY pay2.currency
                          ) AS per
                      ), '{}'::jsonb)
                    )
               FROM public.payments pay
              WHERE pay.customer_id = p.id
                AND pay.purpose <> 'reservation_duplicate'::public.payment_purpose
           )
         )
    FROM public.profiles p
   WHERE p.id = ANY (p_customer_ids)
     AND p.role = 'customer'::public.user_role
     AND p.registration_completed_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) IS 'The single definition of what Klaviyo is told about a parent: one row per named id that is a registered parent (role customer, registration_completed_at set), and none for any other — a parent deleted, a Google sign-up that never finished registering, an account promoted to gedu, or one that was never a parent — which tells the sync to delete that Klaviyo profile, or never create it. `profile`: id, email, names, phone, locale, spoken_languages, currency, created_at, email_verified_at and home_location ({id, name, country_code}, null when unset; the canonical name only). `attribution`: the five utm_* values, signup_intent_kind and signup_intent_id, and registration_marketing_consent — all write-once. `gamers`: every linked gamer as {birth_year, gender, minecraft, roblox}, the last two whether a username is linked — no name and no birth month. `participations`: every seat the parent holds or waits for (an ended seat left out) as {id, status, product}, product being klaviyo_product_document. `subscriptions`: every subscription that has not ended with its seat as {participation_id, current_period_end}. `payments`: {first_at, last_at, lifetime_cents}, lifetime_cents an object of summed amount_cents per currency, refunded duplicates (reservation_duplicate) left out of all three. Gamer facts and the parent''s phone are in it, so it is for the service role alone.';

CREATE OR REPLACE FUNCTION public.klaviyo_attendance_marked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_date date;
  v_starts_at    timestamp with time zone;
  v_product_id   uuid;
  v_customer_id  uuid;
BEGIN
  SELECT gs.session_date, gs.starts_at, g.product_id
    INTO v_session_date, v_starts_at, v_product_id
    FROM public.group_sessions gs
    JOIN public.product_groups g ON g.id = gs.group_id
   WHERE gs.id = NEW.session_id;

  -- The parent is the customer of the seat the participant holds on the
  -- session's product. A mark is only written for a seat held in the group,
  -- but the seat may have moved or ended since; a live one is preferred,
  -- and with none at all there is nobody to tell.
  SELECT part.customer_id
    INTO v_customer_id
    FROM public.participations part
   WHERE part.product_id = v_product_id
     AND part.participant_id = NEW.participant_id
   ORDER BY public.is_live_seat(part.status) DESC,
            part.signed_up_at DESC, part.id
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_event(
    'session'::public.klaviyo_event_kind,
    NEW.id, v_customer_id, v_product_id,
    NEW.recorded_at,
    public.klaviyo_seat_holder_facts(NEW.participant_id, v_customer_id)
      || jsonb_build_object(
           'attended',          NEW.status = 'present',
           'session_date',      v_session_date,
           'session_starts_at', v_starts_at
         ),
    'session:' || NEW.session_id::text || ':' || NEW.participant_id::text || ':' || NEW.status
  );

  RETURN NULL;
END;
$$;


-- 5. Only a seat held now moves between groups

CREATE OR REPLACE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb, p_trainees_added jsonb DEFAULT '[]'::jsonb, p_trainees_removed jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
  v_inline_gedu     JSONB;
  v_role            public.gedu_assignment_role;
  v_removed_group   UUID;
  v_removed_gedu    UUID;
  v_orphan_date     DATE;
  v_trainee         JSONB;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    v_removed_group := (v_assignment->>'groupId')::UUID;
    v_removed_gedu  := (v_assignment->>'geduId')::UUID;

    DELETE FROM gedu_group_assignments
     WHERE group_id = v_removed_group
       AND gedu_id  = v_removed_gedu;

    -- REMOVING AN ASSIGNMENT IS AN UNSEATING, and every other write that can
    -- unseat somebody already sweeps the substitution requests it orphans. This one
    -- is the odd case because it unseats WITHOUT touching a substitution row at all:
    -- a gedu removed from the group while they have a live request for Tuesday
    -- leaves that request open, and an admin answering it would seat a sub to
    -- substitute for nobody — and hand them the group's workspace for the date.
    --
    -- Only the dates the removed gedu has a LIVE REQUEST on are swept, because
    -- those are the only ones this removal can have orphaned; the sweep itself
    -- is the same fixpoint every other unseating runs, so a chain that starts
    -- here unwinds exactly as it does there. A date they merely SUBSTITUTE on is not
    -- swept and must not be: a substitution is a seat of its own, and it does not
    -- depend on the assignment this statement just deleted.
    FOR v_orphan_date IN
      SELECT DISTINCT r.session_date
        FROM session_substitution_requests r
       WHERE r.group_id     = v_removed_group
         AND r.requested_by = v_removed_gedu
         AND r.status <> 'withdrawn'::public.substitution_request_status
    LOOP
      PERFORM public.cascade_withdraw_orphaned_substitution_requests(
                v_removed_group, v_orphan_date
              );
    END LOOP;
  END LOOP;

  -- Trainee seats removed, with the assignments and for the same reason: the
  -- one-seat-per-product trigger refuses an add while a seat of the other
  -- kind is still there, so every remove runs before any add. A trainee holds
  -- no substitution request, so nothing is swept.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_removed) LOOP
    DELETE FROM gedu_group_trainees
     WHERE group_id = (v_trainee->>'groupId')::UUID
       AND gedu_id  = (v_trainee->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    -- An added group's educators now arrive as objects carrying a ROLE:
    -- `gedus: [{ geduId, role }]`. Every assignment has a role as of this
    -- migration, and the column's DEFAULT is the backfill, so an element that
    -- omits `role` lands as a primary.
    IF jsonb_typeof(v_group->'gedus') = 'array' THEN
      FOR v_inline_gedu IN SELECT * FROM jsonb_array_elements(v_group->'gedus') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (
          v_new_id,
          (v_inline_gedu->>'geduId')::UUID,
          p_product_id,
          COALESCE((v_inline_gedu->>'role')::public.gedu_assignment_role, 'primary')
        );
      END LOOP;
    END IF;

    -- The legacy shape, still read for the deploy window: a bare array of ids,
    -- every one of them a primary. The old app posts this; the new one posts
    -- `gedus` above. Both are accepted, and a caller sending both gets both
    -- (the primary-key conflict on a repeated pair is silenced by the ON
    -- CONFLICT below, not here, so a duplicate inside ONE batch would still
    -- raise — which is the caller's bug rather than a state to absorb).
    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id, 'primary')
        ON CONFLICT (group_id, gedu_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  -- Explicit conflict target so the (gedu_id, product_id) UNIQUE violation
  -- propagates as an error (an admin trying to assign the same Gedu to two
  -- groups in one product should fail). Only the (group_id, gedu_id)
  -- primary-key conflict is handled here — and as of this migration it UPDATES
  -- the role rather than doing nothing, which is what makes a role change ONE
  -- add rather than a remove plus an add. Re-adding a pair that is already
  -- there is therefore no longer a no-op: it restates the role, which is
  -- exactly what the panel's role select posts.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;
    v_role    := COALESCE(
                   (v_assignment->>'role')::public.gedu_assignment_role,
                   'primary'
                 );

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
    VALUES (v_resolved_group, v_gedu_id, p_product_id, v_role)
    ON CONFLICT (group_id, gedu_id) DO UPDATE
      SET role = EXCLUDED.role;
  END LOOP;

  -- Trainee seats added, after every remove. A group added in this batch is
  -- addressed by its tempId. No ON CONFLICT: re-adding a seat that is
  -- there, or placing a gedu already seated on the product, is refused.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_added) LOOP
    IF v_temp_map ? (v_trainee->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_trainee->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_trainee->>'groupId')::UUID;
    END IF;

    INSERT INTO gedu_group_trainees (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, (v_trainee->>'geduId')::UUID, p_product_id);
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    -- Only a seat held now moves: an ended seat keeps the group it ended in,
    -- and a waitlisted row has none. A move naming either, from a panel that
    -- loaded before the seat ended, is skipped; the panel refetches after the
    -- batch and no longer shows it.
    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id
       AND status = 'active';
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;

COMMENT ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) IS 'The admin groups panel''s whole batch, applied in one transaction: remove assignments, delete groups, rename groups, add groups (each with its educators inline), add assignments, and move participations between groups — only active seats move, so a move naming an ended or waitlisted row is skipped silently. Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two admins editing one product''s groups serialize rather than interleave. Removes run BEFORE adds so moving an educator from group A to group B is one batch — the (gedu_id, product_id) UNIQUE would otherwise refuse the add. Newly added groups are addressed by a client-minted `tempId` and the returned `tempMap` hands back the real ids, which is what lets one batch create a group and move members into it. An assignment carries a ROLE: an added assignment element is { groupId, geduId, role } and upserts ON CONFLICT (group_id, gedu_id) DO UPDATE SET role, so a role change is ONE add rather than a remove plus an add — which also means re-adding an existing pair is not a no-op, it restates the role. An added GROUP''s educators arrive as gedus: [{ geduId, role }]; the legacy geduIds array of bare ids is still read for the deploy window and lands every one of them as a primary. An omitted role is a primary, which is also the column''s default. This function is DELIBERATELY ASSIGNMENT-ONLY with respect to session substitutions, and is annotated as such in the completeness check: it is the writer of the permanent relationship, not a gate on it. Removing an assignment also sweeps the substitution requests it orphans: for every date the removed gedu held a live request on, the same fixpoint every other unseating runs. It remains ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still writes no substitution row — but a writer that can unseat somebody has to leave the derivation consistent, or an admin could answer a request filed by a person who is no longer expected at the session. TRAINEE SEATS ride the same batch: p_trainees_removed and p_trainees_added, each element { groupId, geduId } (an added one may name a tempId), removed with the assignments and added after them, so the one-seat-per-product trigger, which refuses a gedu holding both an assignment and a trainee seat on the product, judges the batch''s end state. An added trainee seat has no ON CONFLICT, so placing a gedu already seated on the product is refused.';
