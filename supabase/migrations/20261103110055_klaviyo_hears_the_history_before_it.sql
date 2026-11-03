-- Klaviyo hears what happened before the sync went live.
--
-- The triggers file an event as it happens, so everything that happened before
-- they existed reached Klaviyo only as a profile: a parent who booked an event
-- in October has no `SV Enrolled`, and no segment on a product finds them.
--
-- WHAT THIS CHANGES
--
-- 1. Every event the triggers would have filed, had they existed, and whose
--    source row is still there, is filed once through enqueue_klaviyo_event —
--    under the unique id the trigger gives it, at the moment it happened, with
--    the facts the trigger records. An event already waiting is left as it is
--    (the outbox is unique on the id), and one already sent is deduplicated by
--    Klaviyo on the same id. The drain then sends them like any other:
--    - account_created for every registered parent, at the profile's creation;
--    - enrolled for every seat held (active or completed), at its signed_up_at,
--      with klaviyo_seat_holder_facts and its booking's UTM tag;
--    - waitlisted for every place in line, at its waitlisted_at, with its
--      booking's UTM tag;
--    - session for every attendance mark, at its recorded_at, under
--      `session:<session id>:<participant id>:<status>` for the status it holds
--      now, with the seat holder found exactly as the trigger finds them;
--    - subscription_cancelled for every subscription canceling or cancelled, at
--      its updated_at, with the status and paid period end it holds now.
--    No seat_offered is filed: every offer still standing is on a waitlisted
--    seat, whose waitlisted event is filed, and the offer itself was mailed
--    when it was made; an offer heard of days late could only start a flow
--    chasing an answer it may no longer accept.
-- 2. Every one of them carries `backfilled: true` and no consent: a parent's
--    yes was given then, and they may have unsubscribed in Klaviyo since, so
--    the drain must never send it again. enrolled and waitlisted record
--    marketing_opt_in null, and the contract sends no subscription with any
--    event that is backfilled — the one that matters is account_created, whose
--    registration answer is read from the snapshot at send time.
-- 3. The outbox's facts comment names the new fact.

-- ---------------------------------------------------------------------------
-- 1. The history
-- ---------------------------------------------------------------------------

-- The account opening. The trigger files it on the parent's first terms
-- acceptance; a registered parent is the one who has given it.
SELECT public.enqueue_klaviyo_event(
         'account_created'::public.klaviyo_event_kind,
         p.id, p.id, NULL,
         p.created_at,
         jsonb_build_object('backfilled', true)
       )
  FROM public.profiles p
 WHERE p.role = 'customer'::public.user_role
   AND p.registration_completed_at IS NOT NULL;

-- A seat held. A completed seat was held too.
SELECT public.enqueue_klaviyo_event(
         'enrolled'::public.klaviyo_event_kind,
         part.id, part.customer_id, part.product_id,
         part.signed_up_at,
         public.klaviyo_seat_holder_facts(part.participant_id, part.customer_id)
           || jsonb_build_object(
                'utm_source',       b.utm_source,
                'utm_medium',       b.utm_medium,
                'utm_campaign',     b.utm_campaign,
                'utm_content',      b.utm_content,
                'utm_term',         b.utm_term,
                'marketing_opt_in', NULL,
                'backfilled',       true
              )
       )
  FROM public.participations part
  LEFT JOIN public.bookings b ON b.id = part.booking_id
 WHERE part.status IN ('active'::public.participation_status,
                       'completed'::public.participation_status);

-- A place in line.
SELECT public.enqueue_klaviyo_event(
         'waitlisted'::public.klaviyo_event_kind,
         part.id, part.customer_id, part.product_id,
         COALESCE(part.waitlisted_at, part.signed_up_at),
         jsonb_build_object(
           'utm_source',       b.utm_source,
           'utm_medium',       b.utm_medium,
           'utm_campaign',     b.utm_campaign,
           'utm_content',      b.utm_content,
           'utm_term',         b.utm_term,
           'marketing_opt_in', NULL,
           'backfilled',       true
         )
       )
  FROM public.participations part
  LEFT JOIN public.bookings b ON b.id = part.booking_id
 WHERE part.status = 'waitlisted'::public.participation_status;

-- An attendance mark, told to the parent of the seat the participant holds on
-- the session's product: an active one preferred, and none, nothing filed.
SELECT public.enqueue_klaviyo_event(
         'session'::public.klaviyo_event_kind,
         sa.id, seat.customer_id, g.product_id,
         sa.recorded_at,
         public.klaviyo_seat_holder_facts(sa.participant_id, seat.customer_id)
           || jsonb_build_object(
                'attended',          sa.status = 'present',
                'session_date',      gs.session_date,
                'session_starts_at', gs.starts_at,
                'backfilled',        true
              ),
         'session:' || sa.session_id::text || ':' || sa.participant_id::text || ':' || sa.status
       )
  FROM public.session_attendance sa
  JOIN public.group_sessions gs ON gs.id = sa.session_id
  JOIN public.product_groups g ON g.id = gs.group_id
 CROSS JOIN LATERAL (
         SELECT part.customer_id
           FROM public.participations part
          WHERE part.product_id = g.product_id
            AND part.participant_id = sa.participant_id
          ORDER BY (part.status = 'active'::public.participation_status) DESC,
                   part.signed_up_at DESC, part.id
          LIMIT 1
       ) AS seat;

-- A subscription the parent asked to end, or that ended.
SELECT public.enqueue_klaviyo_event(
         'subscription_cancelled'::public.klaviyo_event_kind,
         fs.id, fs.customer_id, part.product_id,
         fs.updated_at,
         jsonb_build_object(
           'status',             fs.status,
           'current_period_end', fs.current_period_end,
           'backfilled',         true
         )
       )
  FROM public.family_subscriptions fs
  JOIN public.participations part ON part.id = fs.participation_id
 WHERE fs.status IN ('canceling', 'cancelled');

-- ---------------------------------------------------------------------------
-- 2. The facts comment
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS 'The facts of the moment, as they stood when the event was filed. enrolled: seat_holder (parent or gamer), gamer_birth_year and gamer_gender (null on a parent''s own seat), the utm_source of the seat''s booking, utm_medium, utm_campaign, utm_content, utm_term and marketing_opt_in (its school_of_gaming_marketing_opt_in on the booking itself, null on every later activation). session: attended, session_date, session_starts_at, and the same seat_holder, gamer_birth_year and gamer_gender. subscription_cancelled: the subscription''s status and current_period_end. waitlisted: the utm_source of the row''s booking, utm_medium, utm_campaign, utm_content, utm_term and marketing_opt_in (its school_of_gaming_marketing_opt_in on the waitlist join itself, null when a seat is demoted onto the waitlist). Empty for account_created and seat_offered. Any kind may also carry backfilled, true on an event filed after the fact for what happened before the sync existed: such an event carries no consent — its marketing_opt_in is null — and the sync sends no subscription with it.';
