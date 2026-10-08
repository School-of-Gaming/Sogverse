-- Substitution requests announce their changes, so the app can tell gedus on
-- Discord and admins on Slack.
--
-- WHAT THIS CHANGES
--
-- 1. An OUTBOX, `substitution_notification_outbox`: one row per request with
--    something not yet told. Every write that can change what a notification
--    says — the request itself, a gedu's answer to it, a cancellation of its
--    session — files the request's id there through
--    `enqueue_substitution_notification`, by trigger, in the writer's own
--    transaction. The database announces ids only; what a message says is the
--    app's business, read through `get_substitution_notification_snapshot`.
-- 2. A KICK: the first enqueue in a transaction asks pg_net to POST the app's
--    sync route, whose URL and bearer secret live in Vault. pg_net sends only
--    after commit, and nothing is sent where Vault holds no URL — a local
--    stack, CI — so there a write fills the outbox and nothing more.
-- 3. TWO pg_cron JOBS: a retry every minute that kicks again while a row is
--    due and unleased, and a daily close-out that files every announced
--    request still open on a date that has just passed, so its buttons close.
-- 4. A LEASE the sync route works the outbox under —
--    `claim_substitution_notification_jobs` and
--    `finish_substitution_notification_job` — because no lock can be held
--    across HTTP calls through the Data API.
-- 5. Where the messages already sent are recorded:
--    `substitution_notifications` (the request was announced, and its Slack
--    message) and `substitution_notification_dms` (each gedu's Discord DM).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. The outbox and the message records
-- ---------------------------------------------------------------------------

CREATE TABLE public.substitution_notification_outbox (
    request_id uuid PRIMARY KEY
      REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE,
    seq bigint NOT NULL DEFAULT 1,
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    leased_until timestamp with time zone,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    CONSTRAINT substitution_notification_outbox_seq_positive CHECK (seq >= 1),
    CONSTRAINT substitution_notification_outbox_attempts_nonnegative CHECK (attempts >= 0)
);

CREATE INDEX substitution_notification_outbox_next_attempt_at_idx
  ON public.substitution_notification_outbox (next_attempt_at);

COMMENT ON TABLE public.substitution_notification_outbox IS 'Substitution requests whose notifications have something not yet told: one row per request, filed by enqueue_substitution_notification from triggers on the request, its offers and its session''s cancellation, and deleted by finish_substitution_notification_job once a sync has told everything up to the row''s seq. The sync route works it through claim_substitution_notification_jobs, which leases rows, because no lock can be held across the HTTP calls a sync makes. A row whose sync has failed 12 times in a row stays, with next_attempt_at at infinity, until the request changes again. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.substitution_notification_outbox.seq IS 'Bumped on every enqueue. A sync claims a seq and finishes against it: a finish that finds a different seq knows the request changed while it ran, and runs again.';
COMMENT ON COLUMN public.substitution_notification_outbox.next_attempt_at IS 'When the row is next due: now on every enqueue, pushed out by the backoff on a failed sync, and infinity once 12 syncs in a row have failed.';
COMMENT ON COLUMN public.substitution_notification_outbox.leased_until IS 'Set when a sync claims the row and cleared when it finishes. While it is in the future no other sync claims the row; one in the past is a sync that died, and the row is claimable again.';
COMMENT ON COLUMN public.substitution_notification_outbox.attempts IS 'Claims since the last enqueue; reset to 0 by every enqueue. Drives the backoff and the 12-attempt stop.';
COMMENT ON COLUMN public.substitution_notification_outbox.last_error IS 'What the last failed sync reported, kept for whoever investigates a stuck row.';

ALTER TABLE public.substitution_notification_outbox ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated and anon hold no grant, and the service role and
-- the functions below bypass RLS.
REVOKE ALL ON TABLE public.substitution_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.substitution_notification_outbox TO service_role;

CREATE TABLE public.substitution_notifications (
    request_id uuid PRIMARY KEY
      REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE,
    announced_at timestamp with time zone NOT NULL,
    slack_channel_id text,
    slack_message_ts text,
    slack_rendered_hash text,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.substitution_notifications IS 'A substitution request that has been ANNOUNCED — the row''s existence is the fact — and the Slack message that announces it. Written by the sync, as the service role, the first time it finds the request open; a request filed already substituted and never open is never announced and gets no row. Once a row exists every later change to the request updates the messages, whatever state the request is in. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.substitution_notifications.announced_at IS 'When the sync first found the request open and announced it.';
COMMENT ON COLUMN public.substitution_notifications.slack_channel_id IS 'The Slack channel the message was posted to; null until it is posted, or when Slack is not configured.';
COMMENT ON COLUMN public.substitution_notifications.slack_message_ts IS 'The Slack message''s ts, its id within the channel, stored straight after posting so later syncs edit the message rather than post another.';
COMMENT ON COLUMN public.substitution_notifications.slack_rendered_hash IS 'A hash of the message as last sent, so a sync whose rendering has not changed skips the edit.';

ALTER TABLE public.substitution_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.substitution_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.substitution_notifications TO service_role;

CREATE TRIGGER substitution_notifications_updated_at BEFORE UPDATE ON public.substitution_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.substitution_notification_dms (
    request_id uuid NOT NULL
      REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE,
    gedu_id uuid NOT NULL
      REFERENCES public.profiles(id) ON DELETE CASCADE,
    discord_user_id text,
    channel_id text,
    message_id text,
    rendered_hash text,
    delivery_error text,
    accepted_dm_claimed_at timestamp with time zone,
    accepted_dm_message_id text,
    accepted_dm_sent_at timestamp with time zone,
    PRIMARY KEY (request_id, gedu_id)
);

CREATE INDEX substitution_notification_dms_gedu_id_idx
  ON public.substitution_notification_dms (gedu_id);

COMMENT ON TABLE public.substitution_notification_dms IS 'The Discord DM a gedu was sent about a substitution request, one row per (request, gedu), and the "you are the substitute" DM sent to whoever was seated. A row is never deleted while the request stands: a sent DM follows the request''s state from then on, even after its gedu stops being eligible. Written by the sync as the service role. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.substitution_notification_dms.discord_user_id IS 'The Discord user the DM went to — the account that acted as this gedu when it was sent.';
COMMENT ON COLUMN public.substitution_notification_dms.channel_id IS 'The DM channel the message is in.';
COMMENT ON COLUMN public.substitution_notification_dms.message_id IS 'The DM''s message id, which later syncs edit.';
COMMENT ON COLUMN public.substitution_notification_dms.rendered_hash IS 'A hash of the DM as last sent, so a sync whose rendering has not changed skips the edit.';
COMMENT ON COLUMN public.substitution_notification_dms.delivery_error IS 'Why Discord refused the DM for good (the user takes no DMs, or is unknown). A row carrying one is never retried.';
COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_claimed_at IS 'Claimed before the "you are the substitute" DM is sent, so it goes at most once per (request, gedu); nulled again when a send fails in a way worth retrying.';
COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_message_id IS 'The "you are the substitute" DM''s message id.';
COMMENT ON COLUMN public.substitution_notification_dms.accepted_dm_sent_at IS 'When the "you are the substitute" DM was sent.';

ALTER TABLE public.substitution_notification_dms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.substitution_notification_dms FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.substitution_notification_dms TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The kick
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.kick_substitution_notification_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  -- A notification problem must never fail the write that caused it — an
  -- approval, an offer, a cancellation — so nothing here may raise.
  BEGIN
    SELECT s.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets s
     WHERE s.name = 'substitution_sync_url';
    SELECT s.decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets s
     WHERE s.name = 'substitution_sync_secret';

    -- Only a hosted project carries the two secrets. Without them — a local
    -- stack, CI — the outbox fills and nothing is sent.
    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN;
    END IF;

    -- Queued, not sent: pg_net sends after this transaction commits, and never
    -- if it rolls back, so the route always finds the change committed.
    PERFORM net.http_post(
      url                  := v_url,
      body                 := '{}'::jsonb,
      headers              := jsonb_build_object(
                                'Authorization', 'Bearer ' || v_secret,
                                'Content-Type',  'application/json'
                              ),
      timeout_milliseconds := 3000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kick_substitution_notification_sync: % (%)', SQLERRM, SQLSTATE;
  END;
END;
$$;

COMMENT ON FUNCTION public.kick_substitution_notification_sync() IS 'Asks the app to drain the substitution notification outbox: queues a pg_net POST to the URL in the Vault secret substitution_sync_url, bearing the Vault secret substitution_sync_secret. pg_net sends it after the transaction commits and never if it rolls back. A no-op when either secret is missing — every local stack and CI — and it never raises: any failure is a WARNING, because a notification problem must never fail the write that caused it; the retry job kicks again. Granted to nobody.';

REVOKE ALL ON FUNCTION public.kick_substitution_notification_sync() FROM PUBLIC;

CREATE FUNCTION public.enqueue_substitution_notification(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- The EXISTS is for deletes: a request being deleted cascades to its offers,
  -- whose trigger lands here after the request is gone, and a row for it would
  -- break the delete on the foreign key.
  INSERT INTO public.substitution_notification_outbox AS o (request_id)
  SELECT p_request_id
   WHERE EXISTS (
           SELECT 1
             FROM public.session_substitution_requests r
            WHERE r.id = p_request_id
         )
  ON CONFLICT (request_id) DO UPDATE
     SET seq             = o.seq + 1,
         next_attempt_at = now(),
         attempts        = 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- One kick per transaction, however many rows it files: the setting is
  -- transaction-local, so it is gone again at commit or rollback.
  IF current_setting('sogverse.sub_sync_kicked', true) IS DISTINCT FROM 'on' THEN
    PERFORM set_config('sogverse.sub_sync_kicked', 'on', true);
    PERFORM public.kick_substitution_notification_sync();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.enqueue_substitution_notification(p_request_id uuid) IS 'Files a substitution request in the notification outbox: a new row, or seq bumped, the row due now and its attempts reset. Then, once per transaction (the transaction-local setting sogverse.sub_sync_kicked), kick_substitution_notification_sync. A request that no longer exists — the case of an offer deleted by its request''s own delete — is skipped. Called by the triggers on session_substitution_requests, session_substitution_offers and session_cancellations, and by the daily close-out. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_substitution_notification(p_request_id uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. The triggers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.notify_substitution_request_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_substitution_notification(NEW.id);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.notify_substitution_request_changed() IS 'Trigger on session_substitution_requests, after every insert and update: files the request in the notification outbox. Every state a request can take — filed, substituted, cleared back to open, withdrawn — is something its notifications may have to say. Granted to nobody.';

REVOKE ALL ON FUNCTION public.notify_substitution_request_changed() FROM PUBLIC;

CREATE TRIGGER session_substitution_requests_notify
  AFTER INSERT OR UPDATE ON public.session_substitution_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_substitution_request_changed();

CREATE FUNCTION public.notify_substitution_offer_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_substitution_notification(OLD.request_id);
  ELSE
    PERFORM public.enqueue_substitution_notification(NEW.request_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.notify_substitution_offer_changed() IS 'Trigger on session_substitution_offers, after every insert, update and delete: files the answered request in the notification outbox, because a gedu''s answer shows on the Slack message and on that gedu''s own DM. Granted to nobody.';

REVOKE ALL ON FUNCTION public.notify_substitution_offer_changed() FROM PUBLIC;

CREATE TRIGGER session_substitution_offers_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.session_substitution_offers
  FOR EACH ROW EXECUTE FUNCTION public.notify_substitution_offer_changed();

CREATE FUNCTION public.notify_session_cancellation_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
  v_request_id   uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;
    v_session_date := OLD.session_date;
  ELSE
    v_group_id := NEW.group_id;
    v_session_date := NEW.session_date;
  END IF;

  -- A withdrawn request's notifications already say it is no longer needed,
  -- and the session being called off or restored changes nothing about that.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
     WHERE r.group_id     = v_group_id
       AND r.session_date = v_session_date
       AND r.status <> 'withdrawn'::public.substitution_request_status
     ORDER BY r.id
  LOOP
    PERFORM public.enqueue_substitution_notification(v_request_id);
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.notify_session_cancellation_changed() IS 'Trigger on session_cancellations, after every insert and delete (a cancellation, a restore): files every non-withdrawn substitution request on that (group, date) in the notification outbox, because a cancelled session closes its request''s buttons and a restored one reopens them. A re-worded cancellation changes nothing a notification shows and fires nothing. Granted to nobody.';

REVOKE ALL ON FUNCTION public.notify_session_cancellation_changed() FROM PUBLIC;

CREATE TRIGGER session_cancellations_notify
  AFTER INSERT OR DELETE ON public.session_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.notify_session_cancellation_changed();

-- ---------------------------------------------------------------------------
-- 4. The scheduled jobs
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.kick_substitution_notification_sync_if_due() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
       SELECT 1
         FROM public.substitution_notification_outbox o
        WHERE o.next_attempt_at <= now()
          AND (o.leased_until IS NULL OR o.leased_until <= now())
     ) THEN
    PERFORM public.kick_substitution_notification_sync();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.kick_substitution_notification_sync_if_due() IS 'The retry: kicks the sync when some outbox row is due and not leased — a kick that was lost, a sync that died holding its lease, or a failed sync whose backoff has run out. Run every minute by the pg_cron job substitution-notifications-retry. Granted to nobody.';

REVOKE ALL ON FUNCTION public.kick_substitution_notification_sync_if_due() FROM PUBLIC;

CREATE FUNCTION public.enqueue_passed_substitution_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request_id uuid;
  v_count      integer := 0;
BEGIN
  -- Nothing writes to a request when its date passes, so without this its
  -- messages would keep offering buttons the write would refuse. "Yesterday"
  -- in the product's own zone catches every request exactly once, on the
  -- first run after its local midnight.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
      JOIN public.substitution_notifications n ON n.request_id = r.id
      JOIN public.product_groups g             ON g.id = r.group_id
      JOIN public.products p                   ON p.id = g.product_id
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date = (now() AT TIME ZONE p.timezone)::date - 1
     ORDER BY r.id
  LOOP
    PERFORM public.enqueue_substitution_notification(v_request_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.enqueue_passed_substitution_notifications() IS 'The daily close-out: files in the notification outbox every ANNOUNCED request still open whose session date was yesterday in its product''s zone, so the sync redraws its messages as past and their buttons close. Returns how many it filed. Run by the pg_cron job substitution-notifications-close-out at 00:15 UTC, after local midnight in every European zone (UTC+0 to UTC+3) all year; a product in a zone west of UTC is closed out up to a day after its local midnight, never missed. A run that does not happen leaves that day''s requests with buttons the write refuses. Granted to the service role, so it can be run by hand and by the DB tests.';

REVOKE ALL ON FUNCTION public.enqueue_passed_substitution_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_passed_substitution_notifications() TO service_role;

SELECT cron.schedule(
  'substitution-notifications-retry',
  '* * * * *',
  'SELECT public.kick_substitution_notification_sync_if_due()'
);

SELECT cron.schedule(
  'substitution-notifications-close-out',
  '15 0 * * *',
  'SELECT public.enqueue_passed_substitution_notifications()'
);

-- ---------------------------------------------------------------------------
-- 5. The lease
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[] DEFAULT NULL) RETURNS TABLE(request_id uuid, seq bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT o.request_id
      FROM public.substitution_notification_outbox o
     WHERE o.next_attempt_at <= now()
       AND (o.leased_until IS NULL OR o.leased_until <= now())
       AND (p_request_ids IS NULL OR o.request_id = ANY (p_request_ids))
     ORDER BY o.next_attempt_at, o.request_id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.substitution_notification_outbox o
     SET leased_until = now() + interval '2 minutes',
         attempts     = o.attempts + 1
    FROM due
   WHERE o.request_id = due.request_id
  RETURNING o.request_id, o.seq;
$$;

COMMENT ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) IS 'Leases up to p_limit due outbox rows for two minutes and returns each request id with the seq the sync must finish against. Due means next_attempt_at has come and no live lease is held; SKIP LOCKED lets two syncs claim at once without waiting on each other. p_request_ids narrows the claim to the requests a button press just changed, so the press can redraw its own message in-process. Each claim counts one attempt. Service role only.';

REVOKE ALL ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_substitution_notification_jobs(p_limit integer, p_request_ids uuid[]) TO service_role;

CREATE FUNCTION public.finish_substitution_notification_job(p_request_id uuid, p_seq bigint, p_error text DEFAULT NULL) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_error IS NULL THEN
    DELETE FROM public.substitution_notification_outbox o
     WHERE o.request_id = p_request_id
       AND o.seq        = p_seq;
    IF FOUND THEN
      RETURN false;
    END IF;

    -- The request changed while the sync ran: hand the row back, due now, and
    -- tell the caller to run it again. No row at all is a request deleted
    -- meanwhile, and there is nothing left to tell.
    UPDATE public.substitution_notification_outbox o
       SET leased_until = NULL
     WHERE o.request_id = p_request_id;
    RETURN FOUND;
  END IF;

  -- Backoff of 2^attempts minutes, capped at an hour; after 12 attempts the
  -- row stops being scheduled, and stays until the request changes again.
  UPDATE public.substitution_notification_outbox o
     SET leased_until    = NULL,
         last_error      = left(p_error, 2000),
         next_attempt_at = CASE
                             WHEN o.attempts >= 12 THEN 'infinity'::timestamp with time zone
                             ELSE now() + make_interval(mins => least(power(2, o.attempts), 60)::integer)
                           END
   WHERE o.request_id = p_request_id;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.finish_substitution_notification_job(p_request_id uuid, p_seq bigint, p_error text) IS 'Ends a sync of one claimed outbox row, and answers whether to run it again. Success (p_error null) deletes the row when its seq is still p_seq and answers false; when the seq moved — the request changed while the sync ran — it releases the lease, leaving the row due, and answers true. Failure releases the lease, records p_error (cut to 2000 characters) and pushes next_attempt_at out by 2^attempts minutes, capped at an hour; once the row has been claimed 12 times it is pushed to infinity and stays until the next enqueue resets it. Failure answers false. Service role only.';

REVOKE ALL ON FUNCTION public.finish_substitution_notification_job(p_request_id uuid, p_seq bigint, p_error text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_substitution_notification_job(p_request_id uuid, p_seq bigint, p_error text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The snapshot the sync renders from
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row     public.session_substitution_requests;
  v_group   public.product_groups;
  v_product public.products;
BEGIN
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_group FROM public.product_groups g WHERE g.id = v_row.group_id;
  SELECT * INTO v_product FROM public.products p WHERE p.id = v_group.product_id;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id',           v_row.id,
      'status',       v_row.status,
      'group_id',     v_row.group_id,
      'group_name',   v_group.name,
      'session_date', v_row.session_date,
      'role',         v_row.role,
      -- The fee for THIS role, null when the product has not set one — the
      -- pool's own rule.
      'fee_cents',
        CASE v_row.role
          WHEN 'primary'::public.gedu_assignment_role
            THEN v_product.primary_gedu_fee_cents
          ELSE v_product.assistant_gedu_fee_cents
        END,
      'reason',       v_row.reason,
      'reason_note',  v_row.reason_note,
      'created_at',   v_row.created_at,
      'approved_at',  v_row.approved_at,
      'requester', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.requested_by
      ),
      'substitute', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.substitute_id
      ),
      'approver', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.approved_by
      )
    ),
    'product',                 public.session_product_document(v_product),
    'required_qualifications', to_jsonb(public.product_required_qualifications(v_product.product_type, v_product.tag)),
    'is_cancelled',            public.group_session_is_cancelled(v_row.group_id, v_row.session_date),
    'product_today',           (now() AT TIME ZONE v_product.timezone)::date,
    'candidates', COALESCE((
      WITH eligible AS (
        -- Exactly the pool's four tests, so a DM goes to exactly the gedus
        -- whose pool lists the request.
        SELECT pr.id
          FROM public.profiles pr
         WHERE pr.role = 'gedu'::public.user_role
           AND public.gedu_may_substitute_session(
                 pr.id, v_row.group_id, v_row.session_date, v_row.requested_by
               )
           AND public.gedu_holds_session_qualifications(pr.id, v_row.group_id)
           AND public.gedu_speaks_session_language(pr.id, v_row.group_id)
           AND public.gedu_covers_product_site(pr.id, v_product.id)
      ),
      candidate AS (
        SELECT e.id AS gedu_id FROM eligible e
        UNION
        SELECT o.gedu_id
          FROM public.session_substitution_offers o
         WHERE o.request_id = v_row.id
        UNION
        SELECT d.gedu_id
          FROM public.substitution_notification_dms d
         WHERE d.request_id = v_row.id
      )
      SELECT jsonb_agg(
               jsonb_build_object(
                 'gedu_id',    c.gedu_id,
                 'first_name', pr.first_name,
                 'last_name',  pr.last_name,
                 'locale',     pr.locale,
                 -- Only the Discord account that ACTS as this gedu: one linked
                 -- to a second gedu account more recently answers for that
                 -- account, and a DM to it would be answered as the wrong
                 -- person.
                 'discord_user_id', (
                   SELECT l.discord_user_id
                     FROM public.discord_links l
                    WHERE l.profile_id = c.gedu_id
                      AND public.discord_acting_gedu(l.discord_user_id) = c.gedu_id
                 ),
                 'eligible',     EXISTS (SELECT 1 FROM eligible e WHERE e.id = c.gedu_id),
                 'response',     o.response,
                 'offer_id',     o.id,
                 'responded_at', o.responded_at
               )
               ORDER BY pr.first_name, pr.last_name, c.gedu_id
             )
        FROM candidate c
        JOIN public.profiles pr ON pr.id = c.gedu_id
        LEFT JOIN public.session_substitution_offers o
               ON o.request_id = v_row.id
              AND o.gedu_id    = c.gedu_id
    ), '[]'::jsonb),
    'notification', (
      SELECT to_jsonb(n)
        FROM public.substitution_notifications n
       WHERE n.request_id = v_row.id
    ),
    'dms', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.gedu_id)
        FROM public.substitution_notification_dms d
       WHERE d.request_id = v_row.id
    ), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) IS 'Everything the notification sync renders a substitution request''s Slack message and Discord DMs from, or NULL when the request does not exist. `request`: the row with its group name, the fee for its role (null when unset), the reason and note, and the requester, substitute and approver as {id, first_name, last_name} (null when unset). `product`: session_product_document, the shell every substitution surface shares. `required_qualifications`, `is_cancelled` (group_session_is_cancelled), and `product_today`, the date in the product''s zone, which tells a passed request from an open one. `candidates`: every gedu eligible now — exactly the pool''s four tests, gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — together with every gedu who has answered and every gedu who was sent a DM, each with their name, locale, `eligible`, their answer (response, offer_id, responded_at; null when none) and discord_user_id, which is non-null only when that Discord account acts as this gedu (discord_acting_gedu). `notification` and `dms`: the message records as stored. Carries the reason, so it is for the service role alone.';

REVOKE ALL ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) TO service_role;
