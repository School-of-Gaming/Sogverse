-- Klaviyo hears of every enrolment and every attendance mark, as facts.
--
-- WHAT THIS CHANGES
--
-- 1. `purchase` becomes `enrolled`: one event per seat held, on a product of
--    ANY billing mode — paid, free or a municipality's contract — filed at the
--    moment the purchase was (the seat arrives at active, by insert or off the
--    waitlist). first_purchase is gone: Klaviyo counts a parent's enrolments
--    itself. Its facts are who holds the seat (parent or gamer, and the
--    gamer's birth year and gender), the UTM tag of the visit that led to the
--    booking and the parent's answer to the product's School of Gaming mailing
--    ask, all read off the seat when the event is filed.
-- 2. A `session` event per attendance mark: filed when a mark is written and
--    again when its status changes, never when it is deleted. Its unique id
--    names the session, the participant and the status, so a corrected mark is
--    a new event rather than a repeat Klaviyo drops.
-- 3. The outbox stores each event's Klaviyo unique id and is unique on it,
--    since a session event's id is not `<kind>:<source id>`.
-- 4. The product document Klaviyo hears grows delivery_mode,
--    spoken_language_code and location_name, and the triggers that re-file a
--    product's parents watch those columns and the location's name.
-- 5. Seats carry the booking's UTM tag and School of Gaming marketing answer,
--    which create_participation, confirm_paid_participation and the waitlist
--    join take as new optional arguments. A waitlist join's waitlisted event
--    carries the answer, as a seat taken at once's enrolled event does.
-- 6. A product's signup panel may ask the School of Gaming mailing question.
--    The answer lives on the seat; set_marketing_consent still refuses it.

-- ---------------------------------------------------------------------------
-- 1. The event kinds
-- ---------------------------------------------------------------------------

ALTER TYPE public.klaviyo_event_kind RENAME VALUE 'purchase' TO 'enrolled';
ALTER TYPE public.klaviyo_event_kind ADD VALUE 'session';

COMMENT ON TYPE public.klaviyo_event_kind IS 'What happened to a parent, as a Klaviyo event: account_created (they accepted the terms for the first time, which only a parent''s registration does), enrolled (a participation on a product of any billing mode became active), waitlisted (a participation joined a waitlist), seat_offered (a waitlisted participation was offered a seat), subscription_cancelled (a family subscription moved to canceling or cancelled) and session (an attendance mark was written, or its status changed). The sync sends each with the unique id stored on its outbox row, so a retry, or the same transition happening twice, is never counted twice.';

-- ---------------------------------------------------------------------------
-- 2. What a seat records about its booking
-- ---------------------------------------------------------------------------

ALTER TABLE public.participations
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD COLUMN school_of_gaming_marketing_opt_in boolean;

COMMENT ON COLUMN public.participations.utm_source IS 'The utm_source of the visit that led to this booking, or NULL. Written once, when the seat or place in line is created, by create_participation, confirm_paid_participation or join_waitlist, and only when the booking request carried marketing cookie consent — the same server-side gate the account''s own UTM columns are written under. The participation create and waitlist routes read the values from the request and cleans them with the UTM module''s sanitiser (src/lib/utm.ts) under that marketing-cookie gate; a paid seat''s values travel through the Stripe Checkout Session metadata to the webhook, which hands them to confirm_paid_participation. Case preserved. Read by the Klaviyo enrolled event; a label that grants nothing.';
COMMENT ON COLUMN public.participations.utm_medium IS 'The utm_medium of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.participations.utm_campaign IS 'The utm_campaign of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.participations.utm_content IS 'The utm_content of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.participations.utm_term IS 'The utm_term of the visit that led to this booking, or NULL. Same rules as utm_source.';
COMMENT ON COLUMN public.participations.school_of_gaming_marketing_opt_in IS 'The parent''s answer to the product''s "I want emails from School of Gaming" box when they booked this seat: true or false when the product asked (a school_of_gaming row in product_marketing_consents), NULL when it did not. Written once with the seat or place in line, by create_participation, confirm_paid_participation or join_waitlist. A yes subscribes the parent to School of Gaming''s Klaviyo list once, when the event the booking''s own insert files is sent — enrolled for a seat taken at once, waitlisted for a waitlist join; a later promotion or demotion of the row does not carry it again, and the answer itself is never an event property. It is never written to marketing_consents, because Klaviyo owns School of Gaming''s mailing consent.';

-- ---------------------------------------------------------------------------
-- 3. The outbox stores Klaviyo's unique id
-- ---------------------------------------------------------------------------

ALTER TABLE public.klaviyo_event_outbox ADD COLUMN unique_id text;
UPDATE public.klaviyo_event_outbox
   SET unique_id = kind::text || ':' || source_id::text;
ALTER TABLE public.klaviyo_event_outbox ALTER COLUMN unique_id SET NOT NULL;
ALTER TABLE public.klaviyo_event_outbox DROP CONSTRAINT klaviyo_event_outbox_source_unique;
ALTER TABLE public.klaviyo_event_outbox
  ADD CONSTRAINT klaviyo_event_outbox_unique_id_key UNIQUE (unique_id);

COMMENT ON TABLE public.klaviyo_event_outbox IS 'Things that happened to a parent that Klaviyo has not yet been told as events: one row per Klaviyo unique id, filed by enqueue_klaviyo_event from the triggers that see them happen, and deleted by finish_klaviyo_event_job once sent. An event is a fact about a moment, so its row records that moment''s facts when it is filed and never changes; filing the same unique id again while it waits does nothing, and Klaviyo''s own deduplication on the unique id absorbs one filed again after it was sent. No foreign keys: the source row may be gone by the time the event is sent (a cancelled seat), and the event still happened. A parent''s waiting events are deleted with the parent, because an event about somebody Klaviyo is about to forget is pointless. Leased, backed off and parked exactly as klaviyo_profile_outbox is. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.klaviyo_event_outbox.unique_id IS 'Klaviyo''s unique id for the event, which it deduplicates on: `<kind>:<source id>` for every kind but session, whose id is `session:<session id>:<participant id>:<status>` so that a mark corrected to another status is a second event.';
COMMENT ON COLUMN public.klaviyo_event_outbox.source_id IS 'The row the event is about: the parent''s profile id for account_created, a participation for enrolled, waitlisted and seat_offered, a family subscription for subscription_cancelled, a session_attendance row for session.';
COMMENT ON COLUMN public.klaviyo_event_outbox.occurred_at IS 'When it happened, taken from the source row: the profile''s creation, the participation''s activation, waitlisting or seat offer, the subscription''s update, the attendance mark''s recorded_at.';
COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS 'The facts of the moment, as they stood when the event was filed. enrolled: seat_holder (parent or gamer), gamer_birth_year and gamer_gender (null on a parent''s own seat), the seat''s utm_source, utm_medium, utm_campaign, utm_content, utm_term and marketing_opt_in (its school_of_gaming_marketing_opt_in on the booking itself, null on every later activation). session: attended, session_date, session_starts_at, and the same seat_holder, gamer_birth_year and gamer_gender. subscription_cancelled: the subscription''s status and current_period_end. waitlisted: marketing_opt_in (the row''s school_of_gaming_marketing_opt_in on the waitlist join itself, null when a seat is demoted onto the waitlist). Empty for account_created and seat_offered.';

-- ---------------------------------------------------------------------------
-- 4. Filing an event under its unique id
-- ---------------------------------------------------------------------------

DROP FUNCTION public.enqueue_klaviyo_event(public.klaviyo_event_kind, uuid, uuid, uuid, timestamp with time zone, jsonb);

CREATE FUNCTION public.enqueue_klaviyo_event(
  p_kind public.klaviyo_event_kind,
  p_source_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_occurred_at timestamp with time zone,
  p_facts jsonb DEFAULT '{}'::jsonb,
  p_unique_id text DEFAULT NULL::text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Only a parent's events: a seat a gamer holds is its parent's
  -- (participations.customer_id), and every other source names the parent
  -- directly.
  IF NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = p_customer_id
          AND p.role = 'customer'::public.user_role
     ) THEN
    RETURN;
  END IF;

  INSERT INTO public.klaviyo_event_outbox (
    kind, source_id, customer_id, product_id, occurred_at, facts, unique_id
  )
  VALUES (
    p_kind, p_source_id, p_customer_id, p_product_id, p_occurred_at,
    COALESCE(p_facts, '{}'::jsonb),
    COALESCE(p_unique_id, p_kind::text || ':' || p_source_id::text)
  )
  ON CONFLICT (unique_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.kick_klaviyo_sync_once();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_event(public.klaviyo_event_kind, uuid, uuid, uuid, timestamp with time zone, jsonb, text) IS 'Files one event in the Klaviyo event outbox — unless the parent is not a customer, or an event with the same unique id is already waiting — and then, once per transaction, the kick. p_unique_id is Klaviyo''s unique id for it, `<kind>:<source id>` when omitted. Called by the triggers that see an event happen. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_event(public.klaviyo_event_kind, uuid, uuid, uuid, timestamp with time zone, jsonb, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Who holds a seat, as the events tell it
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.klaviyo_seat_holder_facts(p_participant_id uuid, p_customer_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
           'seat_holder',      CASE WHEN p_participant_id = p_customer_id
                                    THEN 'parent' ELSE 'gamer' END,
           'gamer_birth_year', gp.birth_year,
           'gamer_gender',     gp.gender
         )
    FROM (SELECT 1) AS one
    LEFT JOIN public.gamer_profiles gp
      ON gp.user_id = p_participant_id
     AND p_participant_id <> p_customer_id;
$$;

COMMENT ON FUNCTION public.klaviyo_seat_holder_facts(uuid, uuid) IS 'Who holds a seat, as a Klaviyo event records it: seat_holder (parent when the participant is the paying customer, gamer otherwise), and the gamer''s birth_year and gender as gamer_birth_year and gamer_gender — both null on a parent''s own seat. No name and no birth month. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_seat_holder_facts(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 6. The product document
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.klaviyo_product_document(p_product_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
           'id',           p.id,
           'names',        COALESCE((
                             SELECT jsonb_agg(
                                      jsonb_build_object('locale', t.locale, 'name', t.name)
                                      ORDER BY t.locale
                                    )
                               FROM public.product_translations t
                              WHERE t.product_id = p.id
                           ), '[]'::jsonb),
           'topic',        p.topic,
           'product_type', p.product_type,
           'billing_mode', p.billing_mode,
           'delivery_mode', p.delivery_mode,
           'spoken_language_code', p.spoken_language_code,
           'location_name', (
                             SELECT l.name
                               FROM public.locations l
                              WHERE l.id = p.location_id
                           ),
           'start_date',   p.start_date,
           'end_date',     p.end_date,
           'timezone',     p.timezone
         )
    FROM public.products p
   WHERE p.id = p_product_id;
$$;

COMMENT ON FUNCTION public.klaviyo_product_document(p_product_id uuid) IS 'One product as Klaviyo is told about it: id, every name with its locale (the app picks the reader''s through resolveTranslation, never SQL), topic, product_type, billing_mode, delivery_mode, spoken_language_code, location_name (the location''s canonical name, null when the product has none), start_date, end_date and timezone. NULL for a product that does not exist. Granted to nobody.';

-- What re-files a product's parents follows what the document reads.
DROP TRIGGER products_klaviyo ON public.products;
CREATE TRIGGER products_klaviyo
  AFTER UPDATE OF topic, product_type, billing_mode, delivery_mode, spoken_language_code,
                  location_id, start_date, end_date, timezone
  ON public.products
  FOR EACH ROW
  WHEN (old.topic IS DISTINCT FROM new.topic
        OR old.product_type IS DISTINCT FROM new.product_type
        OR old.billing_mode IS DISTINCT FROM new.billing_mode
        OR old.delivery_mode IS DISTINCT FROM new.delivery_mode
        OR old.spoken_language_code IS DISTINCT FROM new.spoken_language_code
        OR old.location_id IS DISTINCT FROM new.location_id
        OR old.start_date IS DISTINCT FROM new.start_date
        OR old.end_date IS DISTINCT FROM new.end_date
        OR old.timezone IS DISTINCT FROM new.timezone)
  EXECUTE FUNCTION public.klaviyo_product_changed();

COMMENT ON FUNCTION public.klaviyo_product_changed() IS 'Trigger on products (topic, type, billing mode, delivery mode, spoken language, location, dates, zone) and product_translations (a name written, changed or removed): files every parent holding a participation in the product in the Klaviyo profile outbox. Granted to nobody.';

CREATE OR REPLACE FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT p.id
      FROM public.profiles p
     WHERE p.home_location_id = p_location_id
       AND p.registration_completed_at IS NOT NULL
    UNION
    SELECT part.customer_id
      FROM public.products pr
      JOIN public.participations part ON part.product_id = pr.id
     WHERE pr.location_id = p_location_id
  ));
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) IS 'Files in the Klaviyo profile outbox every registered parent whose home location this is, because a parent''s Klaviyo profile carries their home location''s name and country, and every parent holding a participation in a product at this location, because a product document carries its location''s name. A fan-out over one location''s parents and seats. Granted to nobody.';

COMMENT ON FUNCTION public.klaviyo_location_changed() IS 'Trigger on locations, after its name or country_code changes: files every registered parent whose home location it is, and every parent with a seat in a product there, in the Klaviyo profile outbox. Granted to nobody.';

-- ---------------------------------------------------------------------------
-- 7. A seat files enrolled for every billing mode
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.klaviyo_participation_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_old_status public.participation_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
  END IF;

  -- Each event is a status the participation ARRIVES at, so a write that
  -- leaves the status where it was is not one. A seat is held once it is
  -- active, whatever the product charges. The marketing answer was given with
  -- the booking, so only the booking (the insert) carries it: a seat promoted
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
             'utm_source',       NEW.utm_source,
             'utm_medium',       NEW.utm_medium,
             'utm_campaign',     NEW.utm_campaign,
             'utm_content',      NEW.utm_content,
             'utm_term',         NEW.utm_term,
             'marketing_opt_in', CASE WHEN TG_OP = 'INSERT'
                                      THEN NEW.school_of_gaming_marketing_opt_in
                                 END
           )
    );
  END IF;

  IF NEW.status = 'waitlisted'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    -- A waitlist join is the booking on this path, so its insert carries the
    -- answer exactly as a seat taken at once does; a seat demoted back onto
    -- the waitlist later records null.
    PERFORM public.enqueue_klaviyo_event(
      'waitlisted'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      COALESCE(NEW.waitlisted_at, now()),
      jsonb_build_object(
        'marketing_opt_in', CASE WHEN TG_OP = 'INSERT'
                                 THEN NEW.school_of_gaming_marketing_opt_in
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

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — enrolled when it arrives at active (by insert or from the waitlist) on a product of any billing mode, with klaviyo_seat_holder_facts, the seat''s UTM tag and — on the insert that books the seat only — its School of Gaming marketing answer (null on a later activation, so a re-activated seat never re-subscribes); waitlisted when it arrives at waitlisted, with — on the insert that joins the waitlist only — the same answer (null when a seat is demoted onto it); seat_offered when a seat offer is first stamped on it. Granted to nobody.';

-- The purchases still waiting are enrolments now: they take the new facts
-- from their seat, and one whose seat is gone can no longer be described.
UPDATE public.klaviyo_event_outbox e
   SET facts =public.klaviyo_seat_holder_facts(part.participant_id, part.customer_id)
                 || jsonb_build_object(
                      'utm_source',       part.utm_source,
                      'utm_medium',       part.utm_medium,
                      'utm_campaign',     part.utm_campaign,
                      'utm_content',      part.utm_content,
                      'utm_term',         part.utm_term,
                      'marketing_opt_in', part.school_of_gaming_marketing_opt_in
                    )
  FROM public.participations part
 WHERE e.kind = 'enrolled'::public.klaviyo_event_kind
   AND part.id = e.source_id;

DELETE FROM public.klaviyo_event_outbox e
 WHERE e.kind = 'enrolled'::public.klaviyo_event_kind
   AND NOT EXISTS (
         SELECT 1 FROM public.participations part WHERE part.id = e.source_id
       );

-- The waitlist joins still waiting were filed before any join asked the
-- question, so each records that it carries no answer.
UPDATE public.klaviyo_event_outbox
   SET facts = jsonb_build_object('marketing_opt_in', NULL)
 WHERE kind = 'waitlisted'::public.klaviyo_event_kind;

-- ---------------------------------------------------------------------------
-- 8. An attendance mark files a session event
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.klaviyo_attendance_marked() RETURNS trigger
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
  -- but the seat may have moved or gone since; an active one is preferred,
  -- and with none at all there is nobody to tell.
  SELECT part.customer_id
    INTO v_customer_id
    FROM public.participations part
   WHERE part.product_id = v_product_id
     AND part.participant_id = NEW.participant_id
   ORDER BY (part.status = 'active'::public.participation_status) DESC,
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

COMMENT ON FUNCTION public.klaviyo_attendance_marked() IS 'Trigger on session_attendance, after an insert or a change of status: files a session event for the parent of the seat the participant holds on the session''s product (an active seat preferred; none, nothing filed), under the unique id `session:<session id>:<participant id>:<status>`, occurring at the mark''s recorded_at, with attended, the session''s session_date and session_starts_at, and klaviyo_seat_holder_facts. A deleted mark files nothing. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_attendance_marked() FROM PUBLIC;

CREATE TRIGGER session_attendance_klaviyo_written
  AFTER INSERT ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_attendance_marked();

CREATE TRIGGER session_attendance_klaviyo_changed
  AFTER UPDATE OF status ON public.session_attendance
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM new.status)
  EXECUTE FUNCTION public.klaviyo_attendance_marked();

-- ---------------------------------------------------------------------------
-- 9. The read the sync sends events from
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) RETURNS TABLE(event_id uuid, kind public.klaviyo_event_kind, unique_id text, customer_id uuid, occurred_at timestamp with time zone, properties jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT e.id,
         e.kind,
         e.unique_id,
         e.customer_id,
         e.occurred_at,
         e.facts || jsonb_build_object(
           'source_id', e.source_id,
           'product',   CASE
                          WHEN e.product_id IS NULL THEN NULL
                          ELSE public.klaviyo_product_document(e.product_id)
                        END
         )
    FROM public.klaviyo_event_outbox e
    JOIN public.profiles p ON p.id = e.customer_id
   WHERE e.id = ANY (p_event_ids)
     AND p.role = 'customer'::public.user_role;
$$;

COMMENT ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) IS 'The named Klaviyo events, ready to send: event_id, kind, unique_id (the outbox row''s, which Klaviyo deduplicates on), the parent, occurred_at (the source row''s own moment) and properties — the facts recorded when the event was filed (klaviyo_event_outbox.facts says which, per kind) plus source_id and product (klaviyo_product_document, null when the event names none or the product is gone). An event whose parent is no longer a parent is left out, and the sync finishes it unsent. Service role only.';

-- ---------------------------------------------------------------------------
-- 10. The seat writers take the booking's tag and answer
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[]);

CREATE FUNCTION public.create_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
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

  -- THE ENROLMENT CONDITIONS. Every gate above has passed and a seat is
  -- available, so this signup is one the platform will accept — which is
  -- precisely when the product's required consents bind. Raises check_violation
  -- naming any document the caller did not agree to; otherwise writes one
  -- acceptance row per required document at that document's current version.
  -- Runs for EVERY purchase shape, the paid ones included: they write no
  -- participation row here, but the parent agreed here, so the record belongs
  -- here. A no-op for the overwhelming majority of products, which require
  -- nothing.
  --
  -- The customer is BOTH the agreeing party and the actor on this path:
  -- a parent enrolling their own child ticked the boxes themselves, which is
  -- exactly what distinguishes these rows from the ones an admin writes through
  -- admin_enroll_participant.
  PERFORM public.record_required_consents(
    p_product_id, p_customer_id, p_participant_id, p_customer_id,
    p_consented_documents
  );

  -- AUTOMATIC PLACEMENT, for the two branches below that seat somebody
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
      product_id, participant_id, customer_id, status, group_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      school_of_gaming_marketing_opt_in
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      p_school_of_gaming_marketing_opt_in
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
      product_id, participant_id, customer_id, status, group_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      school_of_gaming_marketing_opt_in
    ) VALUES (
      p_product_id, p_participant_id, p_customer_id, 'active', v_auto_group_id,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      p_school_of_gaming_marketing_opt_in
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

COMMENT ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) IS 'The family self-enrollment gate: validates one signup against the product (audience, effective status, registration window, currency, purchase shape, duplicate seat, seat cap) and then either writes the seat or reports that the caller may go and take the money. The two no-charge shapes — free and external (municipality, invoiced off-platform) — insert an active row here and now; the paid shapes return kind=''validated'' and nothing is written until confirm_paid_participation runs from the Stripe webhook, so an abandoned Checkout leaves nothing behind. Holds the product row FOR UPDATE from its first statement, which is what makes the seat-cap count and the group read below race-free against a concurrent signup or group edit. The two instant-active branches place the seat automatically when the product charges nothing AND has exactly one group: that combination has no placement decision left in it, so the row lands in that group rather than in the unassigned inbox. Zero groups, two or more groups, or any paid product land group_id NULL — the inbox — and whether the single group has a gedu assigned is not consulted. group_joined_at is never written here; a trigger stamps it from group_id. It takes p_consented_documents and, just after the seat-cap gate, calls record_required_consents: an enrolment onto a product with required consent documents is refused with check_violation unless the array covers all of them, and otherwise records one acceptance row per required document at that document''s current version. That runs for EVERY purchase shape — the paid ones write no participation row here, but the parent agreed here, so the record is made here, and an acceptance behind an abandoned Checkout is a harmless true statement. A full product returns kind=''full'' before any of it, because nobody enrolled. It names p_customer_id as the acceptance''s accepted_by as well as its customer: on this path the parent ticked the boxes themselves, which is what tells these rows apart from the ones admin_enroll_participant writes. service_role only: this function has no auth.uid() and trusts the calling route to have pinned p_customer_id to the session user. The booking''s UTM tag (p_utm_source … p_utm_term, which the route passes only under marketing cookie consent) and the parent''s answer to the product''s School of Gaming mailing ask (p_school_of_gaming_marketing_opt_in, NULL when not asked) are written onto the seat, where the Klaviyo enrolled event reads them.';

REVOKE ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_participation(uuid, uuid, uuid, text, text, text[], text, text, text, text, text, boolean) TO service_role;

DROP FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text);

CREATE FUNCTION public.confirm_paid_participation(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_checkout_session_id text, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_conflict_id      UUID;
  v_conflict_session TEXT;
  v_conflict_status  public.participation_status;
  v_participation_id UUID;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pre-check the partial UNIQUE on (product_id, participant_id): under the gate lock
  -- this decides the outcome, and the index itself is left as the backstop.
  SELECT id, status, stripe_checkout_session_id
    INTO v_conflict_id, v_conflict_status, v_conflict_session
    FROM public.participations
    WHERE product_id = p_product_id
      AND participant_id = p_participant_id
      AND status    IN ('active', 'waitlisted', 'completed')
    LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    IF v_conflict_session IS NOT NULL
       AND v_conflict_session = p_checkout_session_id THEN
      RETURN jsonb_build_object(
        'kind', 'confirmed',
        'participation_id', v_conflict_id,
        'idempotent', TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'kind', 'duplicate_payment',
      'existing_participation_id', v_conflict_id,
      'existing_status', v_conflict_status::text
    );
  END IF;

  INSERT INTO public.participations (
    product_id, participant_id, customer_id, status, stripe_checkout_session_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'active', p_checkout_session_id,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
  )
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'kind', 'confirmed',
    'participation_id', v_participation_id,
    'idempotent', FALSE
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean) IS 'Creates the active participation for a paid signup once Stripe confirms payment. service_role only — the arguments come from Checkout Session metadata we wrote. Deliberately audience-ungated: validation happened before the money, and this after-money recorder refusing would strand a charge with no seat. Returns kind=confirmed with participation_id (idempotent=true when this same session already bought the seat), or kind=duplicate_payment with existing_participation_id when a different payment already put this participant on this product. The booking''s UTM tag (p_utm_source … p_utm_term, which the route passes only under marketing cookie consent) and the parent''s answer to the product''s School of Gaming mailing ask (p_school_of_gaming_marketing_opt_in, NULL when not asked) are written onto the seat, where the Klaviyo enrolled event reads them.';

REVOKE ALL ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_paid_participation(uuid, uuid, uuid, text, text, text, text, text, text, boolean) TO service_role;

-- A waitlist join is a booking too: the place in line records the same tag
-- and answer, and the waitlisted event its insert files carries the answer.

DROP FUNCTION public.join_product_waitlist(uuid, uuid, text[]);
DROP FUNCTION public.join_waitlist(uuid, uuid, uuid, text[]);

CREATE FUNCTION public.join_waitlist(p_product_id uuid, p_participant_id uuid, p_customer_id uuid, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
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

  -- THE ENROLMENT CONDITIONS, below the idempotency return so a replay
  -- records nothing: the same enrolment agreed once. Raises check_violation
  -- naming any required document the caller did not agree to; otherwise writes
  -- one acceptance row per required document at its current version. Joining a
  -- queue IS the enrolment moment on this path — meeting the conditions for the
  -- first time at promotion would ask a family to agree at the moment they are
  -- least able to decline.
  --
  -- The customer is both the agreeing party and the actor, for the
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
    product_id, participant_id, customer_id, status, waitlisted_at,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    school_of_gaming_marketing_opt_in
  ) VALUES (
    p_product_id, p_participant_id, p_customer_id, 'waitlisted', v_now,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
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

COMMENT ON FUNCTION public.join_waitlist(uuid, uuid, uuid, text[], text, text, text, text, text, boolean) IS 'Waitlist engine behind join_product_waitlist: gates the audience, refuses a product with the waitlist off, and either writes a waitlisted participation stamped with clock_timestamp() or returns the waitlisted/reserving/active row already there. Returns participation_id, waitlist_position (0 when the row already holds a seat rather than a place in line), status, and idempotent — false only on the call that ran the INSERT, true on a call that recognised an existing row. Anything that must happen exactly once per place in line (the confirmation email) keys on idempotent=false; the flag is the only way to tell a replay apart, since both answers are otherwise identical. It takes p_consented_documents and calls record_required_consents just below the idempotency return, so joining a queue is held to the same enrolment conditions as taking a seat — a family that could queue unconsented would first meet the conditions at promotion, which is the moment they are least able to decline — and a replay records nothing, because it is the same enrolment agreed once. It names p_customer_id as the acceptance''s accepted_by as well as its customer, the parent having ticked the boxes themselves. The join''s UTM tag (p_utm_source … p_utm_term) and School of Gaming mailing answer (p_school_of_gaming_marketing_opt_in, NULL when not asked) are written onto the row it inserts, as create_participation writes them onto a seat, where the Klaviyo waitlisted and enrolled events read them; a replay writes neither. No EXECUTE grant to anyone: the guarded wrapper is the only caller.';

REVOKE ALL ON FUNCTION public.join_waitlist(uuid, uuid, uuid, text[], text, text, text, text, text, boolean) FROM PUBLIC;

CREATE FUNCTION public.join_product_waitlist(p_product_id uuid, p_participant_id uuid, p_consented_documents text[] DEFAULT NULL::text[], p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text, p_school_of_gaming_marketing_opt_in boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('customer');

  -- Everything else — product lock, parent-of-gamer check, waitlist_enabled
  -- gate, idempotency, the consent gate, the clock_timestamp() ordering stamp,
  -- the row's tag and answer — lives in the engine. This function's whole job
  -- is authorization plus pinning the actor to the session.
  RETURN public.join_waitlist(
    p_product_id, p_participant_id, (SELECT auth.uid()), p_consented_documents,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_school_of_gaming_marketing_opt_in
  );
END;
$$;

COMMENT ON FUNCTION public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean) IS 'Guarded, authenticated-facing entry point for joining a product waitlist. The customer is auth.uid(); the parent-of-gamer check and the required-consent gate both live in join_waitlist. The UTM tag and School of Gaming mailing answer are written onto the row a fresh join inserts. The waitlist route passes the tag only under the request''s marketing cookie consent; a parent calling this function directly can label only their own place in line, with values they typed themselves rather than ones read off a tracked visit, and the label grants nothing.';

REVOKE ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.join_product_waitlist(uuid, uuid, text[], text, text, text, text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. A product may ask the School of Gaming mailing question
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused BEFORE the replacing DELETE, the rule every
  -- array-replacing writer in this schema follows: `NOT (col = ANY (array))`
  -- is three-valued, so an array holding a NULL makes the predicate match
  -- nothing and quietly degrades a wipe-and-replace into a merge.
  -- `unnest(NULL::…[])` yields no rows, so an omitted array — the ordinary
  -- "asks nothing" shape — passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consent_types) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the marketing-consent list contains a NULL entry, which is not a consent'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The product must exist. Unlike the required-consents writer, whose foreign
  -- key into the document whitelist does its validating for it, this one's only
  -- FK is the product itself — and on a call that clears the set there is no
  -- INSERT for that FK to fire on, so a typo'd id would silently delete nothing
  -- and report success.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.product_marketing_consents
   WHERE product_id = p_product_id
     AND NOT (consent_type = ANY (
       COALESCE(p_consent_types, ARRAY[]::public.marketing_consent_type[])
     ));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair is a SET replacement, and leaving an unchanged row in place keeps the
  -- delete from churning rows an admin did not touch.
  IF p_consent_types IS NOT NULL
     AND array_length(p_consent_types, 1) > 0 THEN
    INSERT INTO public.product_marketing_consents (product_id, consent_type)
    SELECT p_product_id, c
      FROM unnest(p_consent_types) AS c
    ON CONFLICT (product_id, consent_type) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_product_marketing_consents(p_product_id uuid, p_consent_types public.marketing_consent_type[]) IS 'Replace the set of marketing consents a product''s signup panel asks about, admin-only and guard-first on assert_admin. The only writer of product_marketing_consents: that table carries no write grant for any Data API role, and an inline INSERT from the admin product form would need one, because the form reaches this as the admin''s own session role. NULL and an empty array both mean "asks nothing", which is how a set is cleared. A NULL ELEMENT is refused before the replacing DELETE runs, for the reason one system over refuses one: `NOT (col = ANY (array))` is three-valued, so a NULL inside the array would match nothing and turn the wipe-and-replace into a merge. Either consent may be asked: lynx_educate, whose answer set_marketing_consent records, and school_of_gaming, whose answer is stored on the seat (participations.school_of_gaming_marketing_opt_in) and goes to Klaviyo. An unknown product is refused explicitly rather than by a foreign key, because a call that CLEARS the set performs no insert for an FK to fire on and would otherwise report success for a product that does not exist.';

COMMENT ON TABLE public.product_marketing_consents IS 'The admin-picked set: which marketing consents a product''s signup panel ASKS a parent about. Empty for most products. A row here is an ask and never a requirement: declining is a complete answer and the seat is unaffected, which is the whole line between this table and product_required_consents. A lynx_educate answer is recorded account-wide by set_marketing_consent; a school_of_gaming answer is recorded on the seat it was given with (participations.school_of_gaming_marketing_opt_in) and goes to Klaviyo, which owns School of Gaming''s mailing consent. Written only by admin_set_product_marketing_consents; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices, schedule_slots and product_required_consents are, because the shop has to tell a stranger what signing up would ask them. ON DELETE CASCADE from products: an ask is a property of a product and means nothing without it.';

COMMENT ON COLUMN public.product_marketing_consents.consent_type IS 'Which permission the panel asks for. This column decides whether the question is PUT, never where the answer is stored: a lynx_educate consent is account-level, so a parent who already answered on another product is asked once and their existing answer stands; a school_of_gaming answer is asked with every booking and stored on that seat.';

COMMENT ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) IS 'The one writer of a marketing consent: the settings toggle and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer'') — gamers and gedus hold no marketing consents, and an admin toggles their own on their own parent account rather than through here, because the answer belongs to whoever owns the mailbox. The customer is auth.uid() and is never a parameter, so there is nothing for a caller to aim at another family. p_source must be `settings` or `enrolment`, the two surfaces that call it. Only lynx_educate is accepted: School of Gaming''s own list is answered in Klaviyo — a product signup panel''s school_of_gaming answer is stored on the seat and sent there — and the school_of_gaming rows written before it moved are kept unread. IDEMPOTENT AND HONEST ABOUT IT — submitting the state already on file succeeds and appends NO event, because a change log that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. A first explicit "no" IS a change: an absent row means never answered, which is not the same state as a recorded refusal.';
