-- Klaviyo hears what happened before the sync went live.
--
-- The triggers file an event as it happens, so everything that happened before
-- they existed reached Klaviyo only as a profile: a parent who booked an event
-- in October has no `SV Enrolled`, and no segment on a product finds them.
--
-- WHAT THIS CHANGES
--
-- Every event the triggers would have filed, had they existed, and whose
-- source row is still there, is filed once through enqueue_klaviyo_event —
-- under the unique id the trigger gives it, at the moment it happened, with the
-- facts the trigger records. An event already waiting is left as it is (the
-- outbox is unique on the id), and one already sent is deduplicated by Klaviyo
-- on the same id. The drain then sends them like any other:
-- - enrolled for every seat held (active or completed), at its signed_up_at,
--   with klaviyo_seat_holder_facts and its booking's UTM tag;
-- - waitlisted for every place in line, at its waitlisted_at, with its
--   booking's UTM tag;
-- - session for every attendance mark, at its recorded_at, under
--   `session:<session id>:<participant id>:<status>` for the status it holds
--   now, with the seat holder found exactly as the trigger finds them;
-- - subscription_cancelled for every subscription canceling or cancelled, at
--   its updated_at, with the status and paid period end it holds now.
--
-- None of them carries consent. A parent's yes was given then, and they may
-- have unsubscribed in Klaviyo since, so enrolled and waitlisted record
-- marketing_opt_in null, which every deployment of the drain reads as no; the
-- migration runs before the code that ships with it is deployed, and the
-- enqueue starts the drain at once.
--
-- No account_created is filed: its registration answer is read from the
-- parent when it is sent, so a backfilled one would subscribe every parent who
-- once ticked the box, and the account's creation date is already on the
-- profile as sog_account_created_at for any segment that wants it.
--
-- No seat_offered is filed: every offer still standing is on a waitlisted
-- seat, whose waitlisted event is filed, and the offer itself was mailed when
-- it was made; an offer heard of days late could only start a flow chasing an
-- answer it may no longer accept.

-- ---------------------------------------------------------------------------
-- The history
-- ---------------------------------------------------------------------------

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
                'marketing_opt_in', NULL
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
         part.waitlisted_at,
         jsonb_build_object(
           'utm_source',       b.utm_source,
           'utm_medium',       b.utm_medium,
           'utm_campaign',     b.utm_campaign,
           'utm_content',      b.utm_content,
           'utm_term',         b.utm_term,
           'marketing_opt_in', NULL
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
                'session_starts_at', gs.starts_at
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
           'current_period_end', fs.current_period_end
         )
       )
  FROM public.family_subscriptions fs
  JOIN public.participations part ON part.id = fs.participation_id
 WHERE fs.status IN ('canceling', 'cancelled');
