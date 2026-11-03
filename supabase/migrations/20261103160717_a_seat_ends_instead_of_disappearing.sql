-- A seat ends instead of disappearing.
--
-- WHAT THIS CHANGES
--
-- 1. `participation_status` loses `completed`, which no code ever wrote (a seat
--    on a finished product is derived from the product's dates; any row holding
--    it becomes `active`), and the retired `reserving`, which nothing has
--    written since paid seats were created at payment confirmation, and gains
--    `ended`: a seat that was held and is not any more. PostgreSQL cannot drop
--    an enum value, so the type is recreated, and with it every object that
--    names it in a definition: the column, its two CHECKs, its three partial
--    indexes, the two status triggers and participation_state().
-- 2. `participations` gains `ended_at` and `end_reason`, both set exactly when
--    the status is `ended`. An ended seat keeps its group_id: the family goes on
--    reading the group's feed and reports up to the day the seat ended.
-- 3. The partial unique index over a participant's place on a product covers
--    active and waitlisted rows only, so a family that left can enrol again.
-- 4. `is_live_seat()` names the one status that holds a seat now.
-- 5. join_waitlist and admin_enroll_participant stop naming `reserving`.

-- ---------------------------------------------------------------------------
-- 1. The status type
-- ---------------------------------------------------------------------------

-- No code ever wrote `completed`, but a hand-made row can hold it (staging had
-- one, a camp seat from before this change; production had none). Such a seat
-- was held to the end of its product, which is exactly what an `active` seat on
-- a product whose dates have passed now means, so it becomes one.
UPDATE public.participations SET status = 'active' WHERE status::text = 'completed';

-- Nothing has written `reserving` since paid seats moved to payment
-- confirmation, and production and staging held no such row when this was
-- written. A row that holds it now is one nobody can account for, so the
-- migration stops rather than guessing what it meant.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.participations WHERE status::text = 'reserving';
  IF v_count > 0 THEN
    RAISE EXCEPTION '% participations still hold the retired reserving status; settle them by hand before this migration', v_count;
  END IF;
END;
$$;

DROP TRIGGER participations_klaviyo_changed ON public.participations;
DROP TRIGGER trg_participations_refresh_counts_upd ON public.participations;
DROP INDEX public.idx_participations_active;
DROP INDEX public.idx_participations_waitlisted;
DROP INDEX public.uq_participations_active_or_waitlisted;
ALTER TABLE public.participations
  DROP CONSTRAINT chk_participations_offer_only_when_waitlisted,
  DROP CONSTRAINT chk_participations_waitlisted_has_timestamp;
DROP FUNCTION public.participation_state(public.participation_status, uuid);

ALTER TYPE public.participation_status RENAME TO participation_status_retired;

CREATE TYPE public.participation_status AS ENUM (
  'active',
  'waitlisted',
  'ended'
);

COMMENT ON TYPE public.participation_status IS 'Where a participation stands. active: it holds a seat now. waitlisted: a place in line, not a seat; leaving the line deletes the row. ended: it held a seat and does not any more, kept so who was in which club, when, and why they left survives, with ended_at and end_reason saying when and why (end_participation is the one writer). Whether the product itself has finished is derived from its dates and never stored here.';

ALTER TABLE public.participations
  ALTER COLUMN status TYPE public.participation_status
  USING status::text::public.participation_status;

DROP TYPE public.participation_status_retired;

ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_offer_only_when_waitlisted
    CHECK (seat_offer_sent_at IS NULL OR status = 'waitlisted'),
  ADD CONSTRAINT chk_participations_waitlisted_has_timestamp
    CHECK (status <> 'waitlisted' OR waitlisted_at IS NOT NULL);

CREATE INDEX idx_participations_active
  ON public.participations USING btree (product_id)
  WHERE status = 'active';

CREATE INDEX idx_participations_waitlisted
  ON public.participations USING btree (product_id, waitlisted_at)
  WHERE status = 'waitlisted';

-- Ended rows are outside it on purpose: a family that left can enrol again.
CREATE UNIQUE INDEX uq_participations_active_or_waitlisted
  ON public.participations USING btree (product_id, participant_id)
  WHERE status IN ('active', 'waitlisted');

CREATE TRIGGER participations_klaviyo_changed
  AFTER UPDATE OF status, product_id, seat_offer_sent_at ON public.participations
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM new.status
        OR old.product_id IS DISTINCT FROM new.product_id
        OR old.seat_offer_sent_at IS DISTINCT FROM new.seat_offer_sent_at)
  EXECUTE FUNCTION public.klaviyo_participation_changed();

CREATE TRIGGER trg_participations_refresh_counts_upd
  AFTER UPDATE OF status, product_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();

CREATE FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$$;

REVOKE ALL ON FUNCTION public.participation_state(public.participation_status, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(public.participation_status, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. When and why a seat ended
-- ---------------------------------------------------------------------------

CREATE TYPE public.participation_end_reason AS ENUM (
  'subscription_cancelled',
  'admin_removed'
);

COMMENT ON TYPE public.participation_end_reason IS 'Why a seat ended. subscription_cancelled: its Stripe subscription was deleted (customer.subscription.deleted), whether the family cancelled in the portal or Stripe gave up on the payments. admin_removed: an admin took the seat away (admin_remove_participation).';

ALTER TABLE public.participations
  ADD COLUMN ended_at timestamp with time zone,
  ADD COLUMN end_reason public.participation_end_reason,
  ADD CONSTRAINT chk_participations_ended_iff_ended_at
    CHECK ((status = 'ended') = (ended_at IS NOT NULL)),
  ADD CONSTRAINT chk_participations_ended_iff_end_reason
    CHECK ((status = 'ended') = (end_reason IS NOT NULL));

COMMENT ON COLUMN public.participations.ended_at IS 'When the seat ended, set by end_participation; NULL exactly when the status is not ended (chk_participations_ended_iff_ended_at). An ended seat keeps its group_id and group_joined_at, so its family reads the group''s feed and reports up to this instant and no further, never raised to the date its subscription had paid through.';

COMMENT ON COLUMN public.participations.end_reason IS 'Why the seat ended, set with ended_at by end_participation; NULL exactly when the status is not ended (chk_participations_ended_iff_end_reason).';

COMMENT ON TABLE public.participations IS 'One row per seat on a product, held now or held once: who holds it, who pays for it, which group they sit in and what state the seat is in. A seat that ends is kept with status ended (end_participation), never deleted, so the history of who was in which club survives; only a waitlisted row, which never held a seat, is deleted when it leaves the line, and trg_participations_guard_delete refuses any other delete outside an erasure. Some of its columns are settled by triggers rather than by any caller, and are therefore invisible at the call site: updated_at is touched on every write, a group_id naming a group of another product is rejected by trg_validate_participations_group, and group_joined_at is stamped by trg_participations_stamp_group_joined_at whenever group_id is set, changed or cleared — group_id has at least five writers, including the ON DELETE SET NULL cascade from product_groups, which is why the stamp lives in a trigger and not in an RPC. Do not set group_joined_at by hand: chk_participations_group_joined_at_iff_group refuses a stamp out of step with group_id.';

-- ---------------------------------------------------------------------------
-- 3. Which status holds a seat now
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.is_live_seat(p_status public.participation_status) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT p_status = 'active'::public.participation_status;
$$;

COMMENT ON FUNCTION public.is_live_seat(p_status public.participation_status) IS 'Whether a participation in this status holds a seat now: active, and nothing else. waitlisted is a place in line, and ended held a seat once. A reader that means "who is in the club" asks this rather than listing statuses of its own.';

REVOKE ALL ON FUNCTION public.is_live_seat(public.participation_status) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_live_seat(public.participation_status) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Nothing names reserving any more
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
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
  v_booking_id        UUID;
  v_is_parent         BOOLEAN;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same audience gate as create_booking, and for the same reason: a
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

  -- Idempotency: existing waitlisted/active row → return it as-is,
  -- flagged so the caller can tell this apart from the INSERT below.
  SELECT id, waitlisted_at, status
    INTO v_existing_id, v_existing_ts, v_existing_status
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status IN ('waitlisted', 'active')
    LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'waitlisted' THEN
      SELECT COUNT(*) INTO v_position
        FROM public.participations
        WHERE product_id = p_product_id AND status = 'waitlisted'
          AND (waitlisted_at < v_existing_ts
               OR (waitlisted_at = v_existing_ts AND id <= v_existing_id));
    ELSE
      -- Already holds a seat — not on the waitlist.
      v_position := 0;
    END IF;
    RETURN jsonb_build_object(
      'participation_id', v_existing_id,
      'waitlist_position', v_position,
      'status', v_existing_status::text,
      'idempotent', TRUE
    );
  END IF;

  -- THE ENROLMENT CONDITIONS, below the idempotency return so a replay
  -- records nothing: the same enrolment agreed once. Raises check_violation
  -- naming any required document the caller did not agree to; otherwise writes
  -- one acceptance row per required document at its current version. Joining a
  -- queue IS the enrolment moment on this path — meeting the conditions for the
  -- first time at promotion would ask a family to agree at the moment they are
  -- least able to decline.
  --
  -- The customer is both the agreeing party and the actor, for the
  -- reason create_booking states.
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

  -- The request and its answers. Settled from the start, because there is no
  -- money to wait for, and with no purchase shape or currency for the same
  -- reason, which is what keeps it from reading as a payment marker.
  INSERT INTO public.bookings (
    product_id, participant_id, customer_id, status, settled_at,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'settled', v_now,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, waitlisted_at, booking_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now, v_booking_id
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

COMMENT ON FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[], p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text, p_school_of_gaming_marketing_opt_in boolean) IS 'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted or active row already there (an ended one is history and does not count). Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. It takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. It names p_customer_id as the acceptance''s accepted_by as well as its customer, the parent having ticked the boxes themselves. The join''s UTM tag (p_utm_source … p_utm_term) and School of Gaming mailing answer (p_school_of_gaming_marketing_opt_in, NULL when not asked) are written onto a settled booking it inserts, with no purchase shape and no currency because no money is involved, and the waitlisted row links to it through booking_id, where the Klaviyo waitlisted and enrolled events read them; a replay writes neither. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';

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

  -- FOR UPDATE: the automatic placement below counts this product's groups, and
  -- the lock is what stops that count from being taken against a group list
  -- another admin is in the middle of changing. Same lock, same order (product,
  -- then participations) as every other participation writer.
  SELECT product_type, billing_mode, for_gamers, for_parents
    INTO v_product_type, v_billing_mode, v_for_gamers, v_for_parents
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included — is the free camp and free event this function writes.
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

  -- AUTOMATIC PLACEMENT. A no-charge product with exactly one group has no
  -- placement decision left in it. A paid camp or event still lands in the
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

  -- The partial unique index on (product_id, participant_id) over active and
  -- waitlisted rows is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  --
  -- group_joined_at is absent on purpose: the BEFORE INSERT trigger stamps it
  -- from group_id, and the table comment forbids writing it by hand.
  INSERT INTO public.participations (product_id, participant_id, customer_id, status, group_id)
  VALUES (p_product_id, p_participant_id, v_customer_id, 'active', v_auto_group_id)
  RETURNING id INTO v_participation_id;

  -- THE ENROLMENT CONDITIONS. The seat exists, so the product's
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
