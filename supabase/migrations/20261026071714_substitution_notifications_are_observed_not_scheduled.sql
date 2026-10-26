-- Substitution notifications are caught up when somebody looks, not on a clock.
--
-- WHAT THIS CHANGES
--
-- 1. Neither substitution-notification pg_cron job is scheduled any more. The
--    app's observation route — called when an admin opens the Substitutions
--    page or a gedu opens their pool of open requests — does both of their
--    jobs instead: it files the passed requests, and it kicks the sync when an
--    outbox row is due and unleased.
-- 2. `substitution_notifications.drawn_state`: the state a request's messages
--    were last drawn in, written by the sync. It is what lets the close-out
--    tell a passed request whose messages still offer buttons from one already
--    drawn as past, so an observation files each passed request once rather
--    than on every page load.
-- 3. `enqueue_passed_substitution_notifications` files every request whose
--    messages were last drawn open and whose date is before today in its
--    product's zone — not only yesterday's, since observations are irregular —
--    and skips one already in the outbox, so a failing row keeps its backoff.
-- 4. `kick_substitution_notification_sync_if_due` is granted to the service
--    role, which the observation route runs as.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'substitution-notifications-retry') THEN
    PERFORM cron.unschedule('substitution-notifications-retry');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'substitution-notifications-close-out') THEN
    PERFORM cron.unschedule('substitution-notifications-close-out');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The state the messages were last drawn in
-- ---------------------------------------------------------------------------

CREATE TYPE public.substitution_notification_state AS ENUM (
  'open',
  'filled',
  'withdrawn',
  'cancelled',
  'past'
);

COMMENT ON TYPE public.substitution_notification_state IS 'Where a substitution request stands, as its notifications tell it: open (taking offers), filled, withdrawn, cancelled (its session is) or past (still open, its product-local date gone by). The app derives it from the notification snapshot; the database only stores the one last drawn.';

ALTER TABLE public.substitution_notifications
  ADD COLUMN drawn_state public.substitution_notification_state;

-- A request's messages are kept current by every change to it, so its current
-- state is what they show — except an open request whose date has gone by,
-- which is recorded open: the first observation then files it once, and a sync
-- whose rendering has not changed sends nothing.
UPDATE public.substitution_notifications n
   SET drawn_state = CASE
                       WHEN r.status = 'withdrawn'::public.substitution_request_status
                         THEN 'withdrawn'::public.substitution_notification_state
                       WHEN public.group_session_is_cancelled(r.group_id, r.session_date)
                         THEN 'cancelled'::public.substitution_notification_state
                       WHEN r.status = 'substituted'::public.substitution_request_status
                         THEN 'filled'::public.substitution_notification_state
                       ELSE 'open'::public.substitution_notification_state
                     END
  FROM public.session_substitution_requests r
 WHERE r.id = n.request_id;

ALTER TABLE public.substitution_notifications
  ALTER COLUMN drawn_state SET NOT NULL;

COMMENT ON COLUMN public.substitution_notifications.drawn_state IS 'The state the request''s messages were last drawn in, written by the sync once it has brought them up to date: open at the announcement, and whatever the request stands at after every later sync. Time alone moves only an open request, to past, and nothing writes when a date passes, so the close-out files the requests drawn open whose date has gone by.';

COMMENT ON TABLE public.substitution_notifications IS 'A substitution request that has been ANNOUNCED — the row''s existence is the fact — the state its messages were last drawn in, and the Slack message that announces it. Written by the sync, as the service role, the first time it finds the request open; a request filed already substituted and never open is never announced and gets no row. Once a row exists every later change to the request updates the messages, whatever state the request is in. Service role only; RLS on with no policy.';

-- ---------------------------------------------------------------------------
-- 2. The close-out, run when somebody looks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_passed_substitution_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request_id uuid;
  v_count      integer := 0;
BEGIN
  -- Nothing writes to a request when its date passes, so without this its
  -- messages would keep offering buttons the write would refuse. Drawn open
  -- and dated before the product's today is exactly a request whose messages
  -- are behind the clock; once the sync draws it past, it is never filed here
  -- again. A request already in the outbox is left alone: it will be synced
  -- anyway, and filing it again would reset a failing row's backoff.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
      JOIN public.substitution_notifications n ON n.request_id = r.id
      JOIN public.product_groups g             ON g.id = r.group_id
      JOIN public.products p                   ON p.id = g.product_id
     WHERE n.drawn_state = 'open'::public.substitution_notification_state
       AND r.session_date < (now() AT TIME ZONE p.timezone)::date
       AND NOT EXISTS (
             SELECT 1
               FROM public.substitution_notification_outbox o
              WHERE o.request_id = r.id
           )
     ORDER BY r.id
  LOOP
    PERFORM public.enqueue_substitution_notification(v_request_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.enqueue_passed_substitution_notifications() IS 'The close-out: files in the notification outbox every ANNOUNCED request whose messages were last drawn open (substitution_notifications.drawn_state) and whose session date is before today in its product''s zone, so the sync redraws them as past and their buttons close. A request already in the outbox is skipped, so a failing row keeps its backoff. Each passed request is filed once: the sync then records it drawn past. Returns how many it filed. Run by the app''s observation route whenever an admin opens the Substitutions page or a gedu opens their pool, so a request''s buttons stay up until somebody looks. Granted to the service role.';

REVOKE ALL ON FUNCTION public.enqueue_passed_substitution_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_passed_substitution_notifications() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The kick when a row is due, and the comments that named the jobs
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.kick_substitution_notification_sync_if_due() IS 'Kicks the sync when some outbox row is due and not leased — a kick that was lost, a sync that died holding its lease, or a failed sync whose backoff has run out. Called by the app''s observation route whenever an admin opens the Substitutions page or a gedu opens their pool, so a stuck row waits for somebody to look. Granted to the service role.';

REVOKE ALL ON FUNCTION public.kick_substitution_notification_sync_if_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kick_substitution_notification_sync_if_due() TO service_role;

COMMENT ON FUNCTION public.kick_substitution_notification_sync() IS 'Asks the app to drain the substitution notification outbox: queues a pg_net POST to the URL in the Vault secret substitution_sync_url, bearing the Vault secret substitution_sync_secret. pg_net sends it after the transaction commits and never if it rolls back. A no-op when either secret is missing — every local stack and CI — and it never raises: any failure is a WARNING, because a notification problem must never fail the write that caused it; the row stays due, and the next observation kicks again. Granted to nobody.';

COMMENT ON FUNCTION public.enqueue_substitution_notification(p_request_id uuid) IS 'Files a substitution request in the notification outbox: a new row, or seq bumped, the row due now and its attempts reset. Then, once per transaction (the transaction-local setting sogverse.sub_sync_kicked), kick_substitution_notification_sync. A request that no longer exists — the case of an offer deleted by its request''s own delete — is skipped. Called by the triggers on session_substitution_requests, session_substitution_offers and session_cancellations, and by the close-out. Granted to nobody.';
