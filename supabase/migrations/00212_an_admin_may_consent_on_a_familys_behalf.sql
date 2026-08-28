-- An admin may consent on a family's behalf, and the record says so.
--
-- WHY
--
-- 00210 wired the enrolment-consent gate into the two doors a FAMILY comes
-- through — `create_participation` and `join_waitlist`. There is a third door,
-- and it was missed: `admin_enroll_participant`, the comp-enrolment RPC behind
-- the admin group panel's Add button. An admin dropping a child onto the Roblox
-- programme wrote a seat and no acceptance at all, so the product's own
-- enrolment conditions were unrecorded for exactly the seats staff created.
--
-- THE DECISION: RECORD, DO NOT REFUSE
--
-- Admins are trusted (see the RBAC rule in CLAUDE.md), so the admin path is
-- neither prompted nor blocked. The consent still happened — a comp-enrolment
-- is arranged with the family, off-platform, and the admin is acting on what
-- they were told — so what the platform owes is an honest record of WHO
-- performed the act, not a refusal that would make the Add button stop working
-- on one product.
--
-- That is what `accepted_by` is for. It is the profile that performed the
-- consent act, which is a different question from `customer_id` (the adult the
-- agreement binds):
--
--   * Family paths — the parent ticked the boxes themselves, so accepted_by
--     equals customer_id. Two columns holding one id is not redundancy; it is
--     the two questions happening to have the same answer, which is precisely
--     the case a single column could not distinguish from the one below.
--   * Admin path — accepted_by is the acting admin's own profile id, taken from
--     auth.uid() and never from an argument. customer_id stays the family's,
--     because the agreement is still theirs.
--
-- So "did this family agree" is answered by customer_id as it always was, and
-- "who clicked" is answered separately. A staff-made record can never be read
-- back as a parent's own click.
--
-- WHY THE COLUMN IS PLAIN NOT NULL WITH NO BACKFILL
--
-- consent_acceptances is a table this branch created (00210) and has never been
-- written to outside a from-scratch CI database: staging holds zero rows, and
-- production applies 00210 through 00212 in one deploy onto a table that does
-- not exist yet. A backfill default would therefore be repairing rows that
-- provably cannot exist, and it would leave a defaulted column behind claiming
-- a history the table does not have.
--
-- The FK carries NO cascade, matching products.created_by — the repo's existing
-- actor reference. An acceptance is a legal record and the profile that made it
-- is part of that record, so a profile which has consented on a family's behalf
-- cannot be hard-deleted while the record stands. The FAMILY's own removal path
-- is untouched: customer_id still cascades, and it takes the row with it.

-- ---------------------------------------------------------------------------
-- 1. Who performed the consent act
-- ---------------------------------------------------------------------------

ALTER TABLE public.consent_acceptances
  ADD COLUMN accepted_by uuid NOT NULL REFERENCES public.profiles(id);

COMMENT ON COLUMN public.consent_acceptances.accepted_by IS
  'The profile that PERFORMED the consent act — a different question from '
  'customer_id, which names the adult the agreement binds. On both family '
  'paths they are the same id, because the parent ticked the boxes themselves; '
  'on the admin comp-enrolment path (00212) this is the acting admin''s own '
  'profile while customer_id stays the family''s, so a staff-made record can '
  'never be read back as a parent''s own click. Taken from auth.uid() on that '
  'path and from the enrolment in hand on the others — never from a caller '
  'argument. No cascade on the FK, matching products.created_by: the profile '
  'that made a legal record is part of it, so it cannot be hard-deleted while '
  'the record stands; the family''s own removal runs through customer_id, '
  'which does cascade.';

CREATE INDEX idx_consent_acceptances_accepted_by
  ON public.consent_acceptances (accepted_by);

-- ---------------------------------------------------------------------------
-- 2. The one writer of an acceptance takes the actor
-- ---------------------------------------------------------------------------
--
-- Adding a parameter changes the argument list, so this is a DROP and recreate
-- rather than CREATE OR REPLACE — an overload would leave two candidates behind
-- — and the ACL is rebuilt from scratch below. Still no EXECUTE grant for
-- anybody: it is reached only from inside the three SECURITY DEFINER enrolment
-- functions, which run as the owner and already hold the privilege.
--
-- The NULL-element guard and the two-valued NOT EXISTS membership test are
-- 00211's and are carried across verbatim. p_accepted_by is placed after
-- p_participant_id, with the caller-supplied array last, so the three ids that
-- identify the enrolment stay together.

DROP FUNCTION public.record_required_consents(uuid, uuid, uuid, text[]);

CREATE FUNCTION public.record_required_consents(
  p_product_id          uuid,
  p_customer_id         uuid,
  p_participant_id      uuid,
  p_accepted_by         uuid,
  p_consented_documents text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  -- FIRST, before anything reads the product: an array carrying a NULL element
  -- is refused outright (00211). A NULL is not a slug, so it can never be an
  -- agreement to a document, and the only thing it has ever been good for is
  -- turning the membership test below into a three-valued expression that
  -- answers "nothing is missing" for a caller who agreed to nothing.
  -- `unnest(NULL::text[])` yields no rows, so an omitted array (the ordinary
  -- shape on a product that requires nothing) passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consented_documents) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the consented-document list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  -- The overwhelmingly common case: a product with no required consents. It is
  -- not an error to send slugs anyway — an extra slug is a client that has not
  -- refreshed, not an attack — so nothing is written and nothing is refused.
  IF v_required IS NULL THEN
    RETURN;
  END IF;

  -- COALESCE rather than a NULL check: a caller who sent nothing and a caller
  -- who sent an empty array are making the same claim, and both must be refused
  -- with the same message naming what is missing.
  --
  -- NOT EXISTS rather than 00210's `NOT (r = ANY (...))` (00211): the ANY form
  -- is three-valued and a NULL element makes it answer NULL instead of false for
  -- every required document, which drops every row from this ARRAY() and
  -- reports that nothing is missing. This form is two-valued — a NULL element
  -- fails `c = r` and contributes nothing — so a required document with no
  -- match stays missing whatever else is in the array. The guard at the top of
  -- this function already refuses that input; this is the second lock on the
  -- same door, and it is deliberate.
  v_missing := ARRAY(
    SELECT r
      FROM unnest(v_required) AS r
     WHERE NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_consented_documents, ARRAY[]::text[])) AS c
        WHERE c = r
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'this product requires consent to % before enrolling',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One row per REQUIRED document — never one per slug the caller sent, so a
  -- client that ticks a document the product does not require records nothing
  -- extra. The version is resolved here and never taken from the caller: the
  -- greatest created_at for that slug, with `version DESC` as a tiebreaker so
  -- two revisions published in one transaction pick deterministically rather
  -- than arbitrarily (an arbitrary answer to "what is current" is worse than a
  -- wrong one, because it changes between reads).
  --
  -- A required slug with NO published version yields NULL here and the NOT NULL
  -- on document_version aborts the enrolment. That is the intended handling: it
  -- is a data error only a migration could create, and enrolling somebody
  -- against a document that has never been published is not a lesser outcome
  -- than failing loudly.
  --
  -- accepted_by is likewise the caller's to state and not the caller's to
  -- forge: every one of the three callers is SECURITY DEFINER and passes either
  -- the customer it already pinned or its own auth.uid(), so no wire field
  -- reaches this column.
  INSERT INTO public.consent_acceptances (
    customer_id, participant_id, product_id, document_slug, document_version,
    accepted_by
  )
  SELECT p_customer_id,
         p_participant_id,
         p_product_id,
         r,
         (SELECT cdv.version
            FROM public.consent_document_versions cdv
           WHERE cdv.document_slug = r
           ORDER BY cdv.created_at DESC, cdv.version DESC
           LIMIT 1),
         p_accepted_by
    FROM unnest(v_required) AS r;
END;
$$;

COMMENT ON FUNCTION public.record_required_consents(uuid, uuid, uuid, uuid, text[]) IS
  'The enrolment-consent gate, and the only writer of consent_acceptances. '
  'Loads the product''s required document slugs, refuses the enrolment with '
  'check_violation unless the caller''s array covers ALL of them (naming the '
  'missing ones), and then writes one acceptance row per REQUIRED slug at that '
  'slug''s CURRENT version — the row with the greatest created_at, resolved '
  'server-side and never supplied by a caller. A product requiring nothing is a '
  'no-op, including when slugs are sent anyway. Carries no EXECUTE grant for '
  'any role, because every caller is SECURITY DEFINER and already holds the '
  'privilege as the owner. Since 00211 an array containing a NULL element is '
  'refused before anything else happens, and the missing-set test is a '
  'two-valued NOT EXISTS rather than 00210''s `NOT (r = ANY (...))`: the ANY '
  'form answered SQL NULL — which NOT turns into NULL, not true — whenever the '
  'array held a NULL and nothing matched, so ARRAY[NULL] passed the gate for '
  'every required document and recorded acceptances nobody had given. Since '
  '00212 it takes p_accepted_by, the profile that PERFORMED the act, and there '
  'are THREE callers rather than two: create_participation and join_waitlist '
  'pass their own p_customer_id, because the parent ticked the boxes '
  'themselves, and admin_enroll_participant passes the acting admin''s '
  'auth.uid() while leaving customer_id the family''s. These consents are '
  'NON-REVOCABLE enrolment conditions — see the consent_acceptances table '
  'comment.';

REVOKE EXECUTE ON FUNCTION
  public.record_required_consents(uuid, uuid, uuid, uuid, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. The two family doors name the parent as the actor
-- ---------------------------------------------------------------------------
--
-- Neither signature changes, so both are CREATE OR REPLACE (the shape 00206
-- used for these same two functions) and their bodies below are 00210's with
-- ONE line changed each: the record_required_consents call now names
-- p_customer_id as the actor as well as the agreeing customer. The REVOKE/GRANT
-- pairs are restated anyway, following 00206 — the cost is two lines and the
-- alternative is trusting that a replace never touches an ACL.

CREATE OR REPLACE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
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

COMMENT ON FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[]) IS
  'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. Since 00206 the two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product still land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. Since 00210 it takes p_consented_documents and, just after the seat-cap gate, calls record_required_consents: an enrolment onto a product with required consent documents is refused with check_violation unless the array covers all of them, and otherwise records one acceptance row per required document at that document''s current version. That runs for EVERY purchase shape — the paid ones write no participation row here, but the parent agreed here, so the record is made here, and an acceptance behind an abandoned Checkout is a harmless true statement. A full product returns kind=''full'' before any of it, because nobody enrolled. Since 00212 it names p_customer_id as the acceptance''s accepted_by as well as its customer: on this path the parent ticked the boxes themselves, which is what tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user.';

REVOKE ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[]) RETURNS jsonb
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

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[]) IS
  'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted/reserving/active row already there. Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. Since 00210 it takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. Since 00212 it names p_customer_id as the acceptance''s accepted_by as well as its customer, the parent having ticked the boxes themselves. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';

REVOKE ALL ON FUNCTION public.join_waitlist(uuid, uuid, uuid, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. The third door: admin comp-enrolment
-- ---------------------------------------------------------------------------
--
-- The body below is the LIVE definition from supabase/schema.sql with ONE
-- addition: the record_required_consents call after the seat is written.
-- Everything else is verbatim, and the signature is unchanged, so this is a
-- CREATE OR REPLACE with the ACL restated (the shape 00206 used on this same
-- function).
--
-- WHAT THE ADMIN IS AND IS NOT ASKED. Nothing. There is no consent argument on
-- the RPC, none on the route, and no checkbox in the panel. Admins are trusted,
-- and a comp-enrolment is arranged with the family off-platform, so the
-- required documents are supplied automatically — read straight off
-- product_required_consents, which is the same set the gate would have demanded
-- — and the resulting rows are attributed to the admin who clicked.
--
-- WHY AFTER THE INSERT. The already-enrolled rule on this path IS the partial
-- unique index, raised by the INSERT itself; recording consent above it would
-- put the write before the only gate left. Below it, an acceptance row exists
-- only where a seat does. (Both are one transaction either way — this is about
-- which order reads correctly, not about atomicity.)
--
-- WHY auth.uid() AND NOT AN ARGUMENT. The actor must be the person who really
-- clicked, and this function already establishes them: assert_admin() reads the
-- caller's live role from their profiles row, so a caller who gets past it has
-- one. An argument would be a claim the RPC could not check.

CREATE OR REPLACE FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) RETURNS jsonb
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

COMMENT ON FUNCTION public.admin_enroll_participant(p_product_id uuid, p_participant_id uuid) IS
  'Admin-gated comp-enrollment: drops a participant onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event. Since 00173 it also enforces the audience: a customer profile takes a seat as their own customer and needs for_parents, anyone else is resolved through the parent link and needs for_gamers. Renamed from admin_enroll_gamer in 00175 — it has not only enrolled gamers since 00173. Since 00206 it places the seat automatically when the product charges nothing (billing_mode free or external_contract) AND has exactly one group, matching the family self-enrollment path; a PAID camp or event still lands in the unassigned inbox, as does any product with zero or several groups, and whether the single group has a gedu assigned is not consulted. That placement is why the product read now takes FOR UPDATE — the group count has to be taken under the same lock the group editor holds. group_joined_at is never written here; a trigger stamps it from group_id. Since 00212 it is the THIRD door into record_required_consents, and the only one that neither prompts nor refuses: admins are trusted, a comp-enrollment is arranged with the family off-platform, so every slug in the product''s requirement set is supplied automatically and the acceptance rows are written on the family''s behalf — customer_id the family''s, accepted_by the acting admin''s auth.uid(). It runs AFTER the INSERT because the partial unique index is the already-enrolled gate on this path, so an acceptance exists only where a seat does. There is no consent argument on this function or on the route above it, and no UI change: nothing about the Add button''s behaviour differs on a consent-requiring product.';

REVOKE EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_participant(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Same apply-time protection 00210 and 00211 carry: a silent no-op — a claimed
-- version number, a grant that did not take, a body that came back without the
-- line this migration exists to add — fails here rather than the next time an
-- admin comps somebody onto the Roblox programme.

DO $assert$
DECLARE
  v_src text;
BEGIN
  -- --- (a) The column, its NOT NULL, and its FK. ----------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.consent_acceptances'::regclass
       AND attname = 'accepted_by'
       AND attnotnull
       AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'consent_acceptances.accepted_by is missing or nullable';
  END IF;

  -- confdeltype 'a' is NO ACTION, which is the decision this migration's header
  -- argues for: a profile that made a legal record cannot be hard-deleted while
  -- the record stands, and a CASCADE added here later would silently delete a
  -- family's acceptances when a staff account was removed.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'public.consent_acceptances'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.profiles'::regclass
       AND array_length(c.conkey, 1) = 1
       AND a.attname = 'accepted_by'
       AND c.confdeltype = 'a'
  ) THEN
    RAISE EXCEPTION 'consent_acceptances.accepted_by does not carry a no-cascade foreign key into profiles';
  END IF;

  -- The write posture is unchanged by the new column: still readable and
  -- nothing else, because a caller who could write accepted_by could attribute
  -- their own click to somebody else.
  IF has_table_privilege('authenticated', 'public.consent_acceptances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.consent_acceptances', 'UPDATE')
  THEN
    RAISE EXCEPTION 'authenticated gained a write grant on consent_acceptances';
  END IF;

  -- --- (b) The writer's new signature, and only that one. -------------------
  IF to_regprocedure('public.record_required_consents(uuid, uuid, uuid, uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'record_required_consents was not recreated with its actor argument';
  END IF;

  IF to_regprocedure('public.record_required_consents(uuid, uuid, uuid, text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'the old record_required_consents signature survived — an overload would let a caller pick the version with no actor';
  END IF;

  IF has_function_privilege('authenticated', 'public.record_required_consents(uuid, uuid, uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_required_consents(uuid, uuid, uuid, uuid, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'record_required_consents came back reachable through the Data API — only the enrolment RPCs may call it';
  END IF;

  -- 00211's two fixes survived the recreate. Asserted here rather than assumed:
  -- this migration retyped the whole body, which is exactly how a security fix
  -- gets quietly reverted.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_required_consents';

  IF position('c IS NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'record_required_consents lost 00211''s NULL-element guard';
  END IF;

  IF position('ANY (COALESCE(p_consented_documents' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'record_required_consents went back to the three-valued ANY membership test';
  END IF;

  IF position('accepted_by' IN v_src) = 0 THEN
    RAISE EXCEPTION 'record_required_consents does not write accepted_by';
  END IF;

  -- --- (c) All three doors call it, and the admin door supplies its own set. -
  FOR v_src IN
    SELECT p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_participation', 'join_waitlist', 'admin_enroll_participant')
  LOOP
    IF position('public.record_required_consents' IN v_src) = 0 THEN
      RAISE EXCEPTION 'an enrolment door does not call record_required_consents';
    END IF;
  END LOOP;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'admin_enroll_participant';

  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_enroll_participant lost its assert_admin guard';
  END IF;

  IF position('auth.uid()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_enroll_participant does not attribute the acceptance to the acting admin';
  END IF;

  IF position('product_required_consents' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_enroll_participant does not read the product''s requirement set';
  END IF;

  -- The retyped bodies are the hazard a full-body rewrite carries: a lost
  -- section reads as a feature quietly not happening rather than as an error.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_participation';

  IF position('count_active_seats' IN v_src) = 0
     OR position('effective_status' IN v_src) = 0
     OR position('parent_gamer' IN v_src) = 0 THEN
    RAISE EXCEPTION 'create_participation lost one of its gates';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'join_waitlist';

  IF position('clock_timestamp()' IN v_src) = 0
     OR position('idempotent' IN v_src) = 0 THEN
    RAISE EXCEPTION 'join_waitlist lost its ordering stamp or its idempotency answer';
  END IF;

  -- --- (d) The ACLs the three replaces were asked to preserve. --------------
  IF NOT has_function_privilege('service_role', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_participation lost its service_role grant';
  END IF;

  IF has_function_privilege('authenticated', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_participation(uuid, uuid, uuid, text, text, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'create_participation became reachable by a client role — it has no auth.uid() and trusts its caller';
  END IF;

  IF has_function_privilege('authenticated', 'public.join_waitlist(uuid, uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.join_waitlist(uuid, uuid, uuid, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'join_waitlist became reachable directly — the guarded wrapper is its only caller';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.admin_enroll_participant(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_enroll_participant lost its authenticated grant — the admin route calls it on the user-bound client';
  END IF;

  IF has_function_privilege('anon', 'public.admin_enroll_participant(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE admin_enroll_participant — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
