-- Klaviyo hears of a seat ending, not of a subscription being cancelled.
--
-- `SV Cancelled` is filed when a participation arrives at ended, for every
-- product type and billing mode: one event per seat, the counterpart of
-- `SV Enrolled`, carrying the same seat facts plus why it ended. The family
-- subscription trigger keeps filing the parent's profile and files no event.
--
-- The kind is renamed rather than added beside the old one, since nothing in
-- Klaviyo uses the old metric. A waiting row of the old kind names a family
-- subscription and carries the old facts, which the new contract cannot read,
-- so it is deleted before the rename; the seat it stood for files its own
-- event if it has not ended yet.

DELETE FROM public.klaviyo_event_outbox
 WHERE kind = 'subscription_cancelled'::public.klaviyo_event_kind;

CREATE OR REPLACE FUNCTION public.klaviyo_family_subscription_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
  ELSE
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_family_subscription_changed() IS 'Trigger on family_subscriptions, after an insert, a delete, or an update of status or current_period_end that changes it: files the parent in the Klaviyo profile outbox. It files no event: the seat ending is the event, filed by klaviyo_participation_changed. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_family_subscription_changed() FROM PUBLIC;

ALTER TYPE public.klaviyo_event_kind RENAME VALUE 'subscription_cancelled' TO 'cancelled';

COMMENT ON TYPE public.klaviyo_event_kind IS 'What happened to a parent, as a Klaviyo event: account_created (they accepted the terms for the first time, which only a parent''s registration does), enrolled (a participation on a product of any billing mode became active), waitlisted (a participation joined a waitlist), seat_offered (a waitlisted participation was offered a seat), cancelled (a participation on a product of any billing mode ended) and session (an attendance mark was written, or its status changed). The sync sends each with the unique id stored on its outbox row, so a retry, or the same transition happening twice, is never counted twice.';

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

  -- The seat's own end, whatever ended it: end_participation writes the
  -- status, ended_at and end_reason in one update. The booking's tag and
  -- answer belong to the moment of booking, so they are not repeated here.
  IF NEW.status = 'ended'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'cancelled'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      NEW.ended_at,
      public.klaviyo_seat_holder_facts(NEW.participant_id, NEW.customer_id)
        || jsonb_build_object('reason', NEW.end_reason)
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

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — enrolled when it arrives at active (by insert or from the waitlist) on a product of any billing mode, with klaviyo_seat_holder_facts, the UTM tag of the seat''s booking and — on the insert that books the seat only — its School of Gaming marketing answer (null on a later activation, so a re-activated seat never re-subscribes); waitlisted when it arrives at waitlisted, with the booking''s UTM tag and — on the insert that joins the waitlist only — the same answer (null when a seat is demoted onto it); cancelled when it arrives at ended, on a product of any billing mode, with klaviyo_seat_holder_facts and its end_reason as reason, at its ended_at; seat_offered when a seat offer is first stamped on it. A seat with no booking files every booking answer null. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_participation_changed() FROM PUBLIC;

COMMENT ON COLUMN public.klaviyo_event_outbox.source_id IS 'The row the event is about: the parent''s profile id for account_created, a participation for enrolled, waitlisted, seat_offered and cancelled, a session_attendance row for session.';

COMMENT ON COLUMN public.klaviyo_event_outbox.occurred_at IS 'When it happened, taken from the source row: the profile''s creation, the participation''s activation, waitlisting, seat offer or ended_at, the attendance mark''s recorded_at.';

COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS 'The facts of the moment, as they stood when the event was filed. enrolled: seat_holder (parent or gamer), gamer_birth_year and gamer_gender (null on a parent''s own seat), the utm_source, utm_medium, utm_campaign, utm_content and utm_term of the seat''s booking, and marketing_opt_in (its school_of_gaming_marketing_opt_in on the booking itself, null on every later activation). session: attended, session_date, session_starts_at, and the same seat_holder, gamer_birth_year and gamer_gender. cancelled: the same seat_holder, gamer_birth_year and gamer_gender, and reason (the seat''s end_reason). waitlisted: the utm_source, utm_medium, utm_campaign, utm_content and utm_term of the row''s booking, and marketing_opt_in (its school_of_gaming_marketing_opt_in on the waitlist join itself, null when a seat is demoted onto the waitlist). Empty for account_created and seat_offered.';
