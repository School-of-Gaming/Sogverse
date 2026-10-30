-- A booking is recorded before Stripe Checkout, and it holds the parent's answers.
--
-- WHAT THIS CHANGES
--
-- 1. `public.bookings` holds a family's request: who, what, purchase shape,
--    currency, the UTM tag and the School of Gaming answer. A pending booking
--    holds no seat, so it blocks nothing and nothing ever has to clean one up.
-- 2. `participations.booking_id` replaces `participations.stripe_checkout_session_id`,
--    which moves to the booking, and the six seat-answer columns move off the
--    seat: a table-level grant and a gamer policy let a signed-in child read
--    their parent's answers there. The parent alone reads a booking.
-- 3. `create_booking` replaces `create_participation`, and `confirm_booking` is
--    the one function that turns a booking into a seat. `confirm_paid_participation`
--    stays only for Checkout Sessions created before this ships.
-- 4. A waitlist join writes a booking too, with no shape and no currency because
--    no money is involved.
-- 5. Klaviyo reads the answers through `booking_id`, and a seat's payment marker
--    becomes "its booking is a paid shape".

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TYPE public.booking_status AS ENUM ('pending', 'settled', 'duplicate');

COMMENT ON TYPE public.booking_status IS 'Where a booking stands: pending (still being processed: for a paid shape, waiting for the money), settled (processing finished and produced its seat or place in line) or duplicate (processing finished, but the participant already held a seat on the product). Whether a pending booking is abandoned is derived when read, never stored.';

CREATE TABLE public.bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchase_shape text,
  currency text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  school_of_gaming_marketing_opt_in boolean,
  status public.booking_status DEFAULT 'pending' NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  checkout_closes_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  settled_at timestamp with time zone,
  CONSTRAINT chk_bookings_purchase_shape CHECK (
    purchase_shape IN ('subscription_monthly', 'single_payment', 'free', 'external')
  ),
  CONSTRAINT chk_bookings_currency CHECK (currency IN ('eur', 'gbp', 'usd')),
  CONSTRAINT chk_bookings_shape_iff_currency CHECK (
    (purchase_shape IS NULL) = (currency IS NULL)
  )
);

CREATE INDEX idx_bookings_product_participant
  ON public.bookings USING btree (product_id, participant_id);
CREATE INDEX idx_bookings_participant ON public.bookings USING btree (participant_id);
CREATE INDEX idx_bookings_customer ON public.bookings USING btree (customer_id);

COMMENT ON TABLE public.bookings IS 'One row per request a family made for a place on a product: who, what, the purchase shape, the currency and the answers they gave. Written by create_booking and join_waitlist; confirm_booking turns one into a seat. A pending booking holds no seat, because count_active_seats reads participations alone, so this is not a pre-payment hold: it blocks nothing and no job cleans one up. Abandoned is derived when read: pending AND (stripe_checkout_session_id IS NULL OR checkout_closes_at < now()). That label is for display only for the first 3 days after checkout_closes_at, because a Session that completed while the webhook was failing stays pending until Stripe redelivers it. Abandoned bookings are kept as booking history for support, and a booking goes only when its account or product does (ON DELETE CASCADE). Its status records whether the request has finished processing and says nothing about a seat: seat state lives only on participations, and nothing counts seats from this table. Read by the parent who booked; a gamer has no policy.';
COMMENT ON COLUMN public.bookings.product_id IS 'The product requested. A seat an admin later moves keeps its booking, so this can differ from the seat''s product_id: the booking records the request.';
COMMENT ON COLUMN public.bookings.participant_id IS 'Who the place is for: a gamer, or the customer on an adult''s own seat.';
COMMENT ON COLUMN public.bookings.customer_id IS 'The parent who booked, and the only reader of the row.';
COMMENT ON COLUMN public.bookings.purchase_shape IS 'subscription_monthly, single_payment, free or external. NULL exactly on a booking with no purchase in it, which is a waitlist join, and then currency is NULL too (chk_bookings_shape_iff_currency). A paid shape is what a seat''s payment marker reads.';
COMMENT ON COLUMN public.bookings.currency IS 'The currency of the purchase. NULL exactly when purchase_shape is.';
COMMENT ON COLUMN public.bookings.utm_source IS 'The utm_source of the visit that led to this booking, or NULL. Written once, by create_booking or join_waitlist, and only when the request carried marketing cookie consent, the same server-side gate the account''s own UTM columns are written under: the routes read the values from the request and clean them with the UTM module''s sanitiser (src/lib/utm.ts) under that gate. Case preserved. Read by the Klaviyo enrolled and waitlisted events through participations.booking_id; a label that grants nothing.';
COMMENT ON COLUMN public.bookings.utm_medium IS 'The utm_medium of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.bookings.utm_campaign IS 'The utm_campaign of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.bookings.utm_content IS 'The utm_content of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.bookings.utm_term IS 'The utm_term of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.bookings.school_of_gaming_marketing_opt_in IS 'The parent''s answer to the product''s "I want emails from School of Gaming" box: true or false when the product asked (a school_of_gaming row in product_marketing_consents), NULL when it did not. A yes subscribes the parent to School of Gaming''s Klaviyo list once, when the event the seat''s own insert files is sent: enrolled for a seat taken at once, waitlisted for a waitlist join. A later promotion or demotion of the seat does not carry it again, and the answer itself is never an event property. It is never written to marketing_consents, because Klaviyo owns School of Gaming''s mailing consent.';
COMMENT ON COLUMN public.bookings.status IS 'pending, settled or duplicate; see the booking_status type. Set by confirm_booking, or to settled by join_waitlist, which has no money to wait for.';
COMMENT ON COLUMN public.bookings.stripe_checkout_session_id IS 'The Stripe Checkout Session for this booking, set by the checkout route right after creating it. NULL on a no-charge booking and a waitlist join. confirm_booking refuses a different session from the one stored here.';
COMMENT ON COLUMN public.bookings.checkout_closes_at IS 'When the Checkout Session stops being payable: its expires_at, reset to now() when the checkout route expires it to replace it.';
COMMENT ON COLUMN public.bookings.settled_at IS 'When the booking left pending.';

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_select_own_bookings ON public.bookings
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO service_role;
GRANT SELECT ON TABLE public.bookings TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The seat points at its booking, and every answer already given moves
-- ---------------------------------------------------------------------------

ALTER TABLE public.participations
  ADD COLUMN booking_id uuid UNIQUE REFERENCES public.bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.participations.booking_id IS 'The booking this seat came from, where the UTM tag and the School of Gaming answer live and which says whether money was involved. NULL for a seat an admin or a partner created. Promotion, a seat offer''s acceptance, demotion and an admin''s move all keep it, so after a move the booking''s product_id can differ from the seat''s.';

-- Shape and currency for what was written before bookings existed:
--   - A seat with a session id was paid for: a consumer club is a monthly
--     subscription and anything else a single payment, whatever its status now.
--   - Otherwise a waitlisted seat is a waitlist join, which has no purchase.
--   - A seat on a no-charge product was booked in that product's shape.
--   - What is left has answers, no session and a paid product: a waitlist join
--     that was promoted. It never went through Checkout, so it has no purchase
--     either, and its seat must not gain a payment marker.
-- Currency comes from the seat's family subscription, else eur.
CREATE TEMPORARY TABLE booking_backfill ON COMMIT DROP AS
SELECT p.id AS participation_id,
       gen_random_uuid() AS booking_id,
       sh.purchase_shape,
       CASE WHEN sh.purchase_shape IS NOT NULL
            THEN COALESCE(fs.currency, 'eur') END AS currency
  FROM public.participations p
  JOIN public.products pr ON pr.id = p.product_id
  LEFT JOIN public.family_subscriptions fs ON fs.participation_id = p.id
 CROSS JOIN LATERAL (
   SELECT CASE
            WHEN p.stripe_checkout_session_id IS NOT NULL THEN
              CASE WHEN pr.product_type = 'consumer_club'
                   THEN 'subscription_monthly' ELSE 'single_payment' END
            WHEN p.status = 'waitlisted' THEN NULL
            WHEN pr.billing_mode = 'free' THEN 'free'
            WHEN pr.billing_mode = 'external_contract' THEN 'external'
          END AS purchase_shape
 ) sh
 WHERE p.stripe_checkout_session_id IS NOT NULL
    OR p.utm_source IS NOT NULL
    OR p.utm_medium IS NOT NULL
    OR p.utm_campaign IS NOT NULL
    OR p.utm_content IS NOT NULL
    OR p.utm_term IS NOT NULL
    OR p.school_of_gaming_marketing_opt_in IS NOT NULL;

INSERT INTO public.bookings (
  id, product_id, participant_id, customer_id, purchase_shape, currency,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  school_of_gaming_marketing_opt_in, status, stripe_checkout_session_id,
  created_at, settled_at
)
SELECT b.booking_id, p.product_id, p.participant_id, p.customer_id,
       b.purchase_shape, b.currency,
       p.utm_source, p.utm_medium, p.utm_campaign, p.utm_content, p.utm_term,
       p.school_of_gaming_marketing_opt_in, 'settled', p.stripe_checkout_session_id,
       p.created_at, p.created_at
  FROM booking_backfill b
  JOIN public.participations p ON p.id = b.participation_id;

-- Linking a seat is not a change to the seat, so updated_at stays where it is.
ALTER TABLE public.participations DISABLE TRIGGER participations_updated_at;

UPDATE public.participations p
   SET booking_id = b.booking_id
  FROM booking_backfill b
 WHERE p.id = b.participation_id;

ALTER TABLE public.participations ENABLE TRIGGER participations_updated_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.participations
     WHERE booking_id IS NULL
       AND (stripe_checkout_session_id IS NOT NULL
            OR utm_source IS NOT NULL OR utm_medium IS NOT NULL
            OR utm_campaign IS NOT NULL OR utm_content IS NOT NULL
            OR utm_term IS NOT NULL
            OR school_of_gaming_marketing_opt_in IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'a seat with a session id or an answer has no booking';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. confirm_booking, the one way a booking becomes a seat
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.confirm_booking(
  p_booking_id uuid,
  p_checkout_session_id text DEFAULT NULL
) RETURNS jsonb
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

  IF v_booking.stripe_checkout_session_id IS NOT NULL
     AND v_booking.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id THEN
    RAISE EXCEPTION 'booking % belongs to another checkout session', p_booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings
       SET status = 'duplicate',
           settled_at = now(),
           stripe_checkout_session_id =
             COALESCE(stripe_checkout_session_id, p_checkout_session_id)
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
         settled_at = now(),
         stripe_checkout_session_id =
           COALESCE(stripe_checkout_session_id, p_checkout_session_id)
   WHERE id = p_booking_id;

  RETURN v_facts || jsonb_build_object(
    'kind', 'settled',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_booking(uuid, text) IS 'Turns a booking into a seat: the one path, called in the same transaction for a free or external booking and from the Stripe webhook for a paid one. Locks the product, then the booking. A booking already settled returns kind=settled with idempotent=true and the seat''s id, which is NULL if the seat has since been cancelled, and writes nothing, so a redelivered event never puts a seat back. A booking already duplicate returns kind=duplicate_payment again. A session id different from the one the booking stores raises check_violation. If the participant already holds an active, waitlisted or completed seat on the product the booking becomes duplicate and returns kind=duplicate_payment with existing_participation_id and existing_status, both NULL on a repeat if that seat has since gone. Otherwise it inserts the active seat, placed automatically when the product charges nothing and has exactly one group, and returns kind=settled with idempotent=false. Every return carries the booking''s booking_id, customer_id, participant_id, product_id, purchase_shape and currency, so the webhook reads nothing from Stripe metadata. Deliberately audience-ungated: validation happened before the money, and an after-money recorder refusing would strand a charge with no seat. service_role only: it has no auth.uid() and trusts the calling route.';

REVOKE ALL ON FUNCTION public.confirm_booking(uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_booking(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. create_booking replaces create_participation
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean);

CREATE FUNCTION public.create_booking(
  p_product_id uuid,
  p_participant_id uuid,
  p_customer_id uuid,
  p_purchase_shape text,
  p_currency text,
  p_consented_documents text[] DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL
) RETURNS jsonb
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

COMMENT ON FUNCTION public.create_booking(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap), records the required consents and writes the booking with the parent''s UTM tag and School of Gaming answer. Free and external bookings are settled in the same transaction and return kind=free_active or kind=external_active with participation_id. Paid shapes return kind=pending with booking_id and open_checkout_sessions, the session ids of any other pending booking for this product and participant whose Session is still open, for the route to expire; the seat waits for the Stripe webhook to call confirm_booking, and a pending booking holds no seat. A full product returns kind=full before any of it, because nobody enrolled. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count race-free against a concurrent signup. record_required_consents runs for EVERY purchase shape, because the parent agreed here, and an acceptance behind an abandoned Checkout is a harmless true statement; it names p_customer_id as accepted_by as well as customer, which tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user, and to pass the UTM tag only under marketing cookie consent.';

REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_booking(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. legacy-checkout-session: confirm_paid_participation goes through a booking
-- ---------------------------------------------------------------------------

DROP FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean);

CREATE FUNCTION public.confirm_paid_participation(
  p_product_id uuid,
  p_participant_id uuid,
  p_customer_id uuid,
  p_checkout_session_id text,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL,
  p_purchase_shape text DEFAULT NULL,
  p_currency text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_booking_id UUID;
BEGIN
  -- legacy-checkout-session: a Session created before bookings has none, so one
  -- is made here from its metadata, and the seat takes the one confirm path. A
  -- redelivery finds the booking this call or the backfill wrote.
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.bookings (
    product_id, participant_id, customer_id, purchase_shape, currency,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in, stripe_checkout_session_id
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, p_purchase_shape, p_currency,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in, p_checkout_session_id
  )
  ON CONFLICT (stripe_checkout_session_id) DO NOTHING;

  SELECT id INTO v_booking_id
    FROM public.bookings
    WHERE stripe_checkout_session_id = p_checkout_session_id;

  RETURN public.confirm_booking(v_booking_id, p_checkout_session_id);
END;
$$;

COMMENT ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text) IS 'legacy-checkout-session: exists only until no Checkout Session created before bookings can still be redelivered. service_role only: the arguments come from that Session''s metadata. Writes a booking from them, or reuses the one holding this session id, and returns what confirm_booking returns.';

-- legacy-checkout-session
REVOKE ALL ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. A waitlist join writes a booking
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

-- ---------------------------------------------------------------------------
-- 6b. A seat's payment marker reads its booking
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        -- The assignment ROLE rides each pill, which is what the groups panel's
        -- role select reads and writes back through apply_group_changes. This
        -- panel is the permanent-assignment editor; the session-card staffing
        -- editor is a different tool and deliberately does not link to it.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email,
                     'role',       ga.role
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        -- The group's trainee seats, which the panel places and removes
        -- through apply_group_changes. No role: a trainee is not paid.
        'trainees', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         tp.id,
                     'first_name', tp.first_name,
                     'email',      tp.email
                   )
                   ORDER BY t.created_at, tp.id
                 )
            FROM gedu_group_trainees t
            JOIN profiles tp ON tp.id = t.gedu_id
           WHERE t.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_birth_year',         gprof.birth_year,
                     'participant_birth_month',        gprof.birth_month,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition: money once arrived for
                     -- this seat.
                     'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
                     -- The staff-only flair, identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps, identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_birth_year',         gprof.birth_year,
             'participant_birth_month',        gprof.birth_month,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here, not the constant FALSE that
  -- "demote_to_waitlist refuses a subscribed row, so this cannot exist" would
  -- allow. It can exist: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  --
  -- The two seat-offer stamps are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_birth_year',         gprof.birth_year,
             'participant_birth_month',        gprof.birth_month,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             EXISTS (SELECT 1 FROM public.bookings paid WHERE paid.id = p.booking_id AND paid.purchase_shape IN ('subscription_monthly', 'single_payment')),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Klaviyo reads the answers through the booking
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.klaviyo_participation_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_old_status public.participation_status;
  v_booking    public.bookings;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
  END IF;

  -- No row for a seat an admin or a partner created, which leaves every answer
  -- null in the events below.
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;

  -- Each event is a status the participation ARRIVES at, so a write that
  -- leaves the status where it was is not one. A seat is held once it is
  -- active, whatever the product charges. The marketing answer was given with
  -- the booking, so only the seat's own insert carries it: a seat promoted
  -- off the waitlist, or demoted and promoted again, records null, or the
  -- drain would subscribe a parent who may have unsubscribed since.
  IF NEW.status = 'active'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'enrolled'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.signed_up_at ELSE now() END,
      public.klaviyo_seat_holder_facts(NEW.participant_id, NEW.customer_id)
        || jsonb_build_object(
             'utm_source',       v_booking.utm_source,
             'utm_medium',       v_booking.utm_medium,
             'utm_campaign',     v_booking.utm_campaign,
             'utm_content',      v_booking.utm_content,
             'utm_term',         v_booking.utm_term,
             'marketing_opt_in', CASE WHEN TG_OP = 'INSERT'
                                      THEN v_booking.school_of_gaming_marketing_opt_in
                                 END
           )
    );
  END IF;

  IF NEW.status = 'waitlisted'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    -- A waitlist join is the booking on this path, so its insert carries the
    -- answer exactly as a seat taken at once does; a seat demoted back onto
    -- the waitlist later records null. The UTM tag is the visit that made the
    -- booking, read on every filing, as enrolled reads it.
    PERFORM public.enqueue_klaviyo_event(
      'waitlisted'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      COALESCE(NEW.waitlisted_at, now()),
      jsonb_build_object(
        'utm_source',       v_booking.utm_source,
        'utm_medium',       v_booking.utm_medium,
        'utm_campaign',     v_booking.utm_campaign,
        'utm_content',      v_booking.utm_content,
        'utm_term',         v_booking.utm_term,
        'marketing_opt_in', CASE WHEN TG_OP = 'INSERT'
                                 THEN v_booking.school_of_gaming_marketing_opt_in
                            END
      )
    );
  END IF;

  IF NEW.seat_offer_sent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.seat_offer_sent_at IS NULL) THEN
    PERFORM public.enqueue_klaviyo_event(
      'seat_offered'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      NEW.seat_offer_sent_at
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — enrolled when it arrives at active (by insert or from the waitlist) on a product of any billing mode, with klaviyo_seat_holder_facts, the UTM tag of the seat''s booking and — on the insert that books the seat only — its School of Gaming marketing answer (null on a later activation, so a re-activated seat never re-subscribes); waitlisted when it arrives at waitlisted, with the booking''s UTM tag and — on the insert that joins the waitlist only — the same answer (null when a seat is demoted onto it); seat_offered when a seat offer is first stamped on it. A seat with no booking files every answer null. Granted to nobody.';

-- ---------------------------------------------------------------------------
-- 8. Comments that named what moved
-- ---------------------------------------------------------------------------

CREATE FUNCTION pg_temp.reworded(p_current text, p_from text, p_to text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF p_current IS NULL OR position(p_from IN p_current) = 0 THEN
    RAISE EXCEPTION 'comment does not say: %', p_from;
  END IF;
  RETURN replace(p_current, p_from, p_to);
END;
$$;

DO $$
BEGIN
  EXECUTE format(
    'COMMENT ON FUNCTION public.is_no_charge(public.billing_mode) IS %L',
    pg_temp.reworded(
      obj_description('public.is_no_charge(public.billing_mode)'::regprocedure, 'pg_proc'),
      'in create_participation', 'in create_booking'));

  EXECUTE format(
    'COMMENT ON FUNCTION public.record_required_consents(uuid, uuid, uuid, uuid, text[]) IS %L',
    pg_temp.reworded(
      obj_description('public.record_required_consents(uuid, uuid, uuid, uuid, text[])'::regprocedure, 'pg_proc'),
      'create_participation and join_waitlist', 'create_booking and join_waitlist'));

  EXECUTE format(
    'COMMENT ON TABLE public.consent_acceptances IS %L',
    pg_temp.reworded(
      obj_description('public.consent_acceptances'::regclass, 'pg_class'),
      'create_participation and join_waitlist', 'create_booking and join_waitlist'));

  EXECUTE format(
    'COMMENT ON TABLE public.product_marketing_consents IS %L',
    pg_temp.reworded(
      obj_description('public.product_marketing_consents'::regclass, 'pg_class'),
      'recorded on the seat it was given with (participations.school_of_gaming_marketing_opt_in)',
      'recorded on the booking it was given with (bookings.school_of_gaming_marketing_opt_in)'));

  EXECUTE format(
    'COMMENT ON FUNCTION public.admin_set_product_marketing_consents(uuid, public.marketing_consent_type[]) IS %L',
    pg_temp.reworded(
      obj_description('public.admin_set_product_marketing_consents(uuid, public.marketing_consent_type[])'::regprocedure, 'pg_proc'),
      'stored on the seat (participations.school_of_gaming_marketing_opt_in)',
      'stored on the booking (bookings.school_of_gaming_marketing_opt_in)'));

  EXECUTE format(
    'COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS %L',
    pg_temp.reworded(
      pg_temp.reworded(
        col_description(
          'public.klaviyo_event_outbox'::regclass,
          (SELECT attnum FROM pg_attribute
            WHERE attrelid = 'public.klaviyo_event_outbox'::regclass AND attname = 'facts')),
        'the seat''s utm_source', 'the utm_source of the seat''s booking,'),
      'the row''s utm_source', 'the utm_source of the row''s booking,'));

  EXECUTE format(
    'COMMENT ON FUNCTION public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean) IS %L',
    pg_temp.reworded(
      obj_description('public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean)'::regprocedure, 'pg_proc'),
      'written onto the row a fresh join inserts', 'written onto the booking a fresh join inserts'));

  EXECUTE format(
    'COMMENT ON FUNCTION public.join_waitlist(uuid, uuid, uuid, text[], text, text, text, text, text, boolean) IS %L',
    pg_temp.reworded(
      obj_description('public.join_waitlist(uuid, uuid, uuid, text[], text, text, text, text, text, boolean)'::regprocedure, 'pg_proc'),
      'are written onto the row it inserts, as create_participation writes them onto a seat, where the Klaviyo waitlisted and enrolled events read them; a replay writes neither.',
      'are written onto a settled booking it inserts, with no purchase shape and no currency because no money is involved, and the waitlisted row links to it through booking_id, where the Klaviyo waitlisted and enrolled events read them; a replay writes neither.'));

  EXECUTE format(
    'COMMENT ON FUNCTION public.get_product_groups_with_details(uuid) IS %L',
    pg_temp.reworded(
      obj_description('public.get_product_groups_with_details(uuid)'::regprocedure, 'pg_proc'),
      'a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear',
      'whether the seat''s booking is a paid shape — money once arrived for this seat, which demotion does not clear, and which a waitlist join''s booking, having no shape, does not claim'));
END;
$$;

DROP FUNCTION pg_temp.reworded(text, text, text);

-- ---------------------------------------------------------------------------
-- 9. Nothing reads the seat's old columns any more
-- ---------------------------------------------------------------------------

-- Dropping the session column drops uq_participations_checkout_session with it.
-- The same uniqueness now sits on bookings.
ALTER TABLE public.participations
  DROP COLUMN stripe_checkout_session_id,
  DROP COLUMN utm_source,
  DROP COLUMN utm_medium,
  DROP COLUMN utm_campaign,
  DROP COLUMN utm_content,
  DROP COLUMN utm_term,
  DROP COLUMN school_of_gaming_marketing_opt_in;
