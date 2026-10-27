-- Parents announce their changes, so the app can keep Klaviyo in step with them.
--
-- WHAT THIS CHANGES
--
-- 1. A PROFILE OUTBOX, `klaviyo_profile_outbox`: one row per parent whose
--    Klaviyo profile has something not yet told. Triggers on every table the
--    parent's Klaviyo picture is read from file the parent's id there through
--    `enqueue_klaviyo_profiles`, in the writer's own transaction. The database
--    announces ids only; what Klaviyo is told is read through
--    `get_klaviyo_parent_snapshots`, which answers only for a REGISTERED
--    parent — a customer row whose registration_completed_at is set. Anything
--    else (an unregistered Google sign-up, an account promoted to gedu, a row
--    deleted) gets no snapshot, and the sync deletes its Klaviyo profile or
--    never creates one. No foreign key: a deleted parent stays filed, so the
--    sync can delete their Klaviyo profile.
-- 2. An EVENT OUTBOX, `klaviyo_event_outbox`: one row per thing that happened
--    to a parent that Klaviyo should hear about as an event — the account
--    opened, a seat bought on a paid product, a waitlist joined, a seat
--    offered, a subscription cancelled — keyed by (kind, source row), with the
--    facts of the moment recorded beside it. `get_klaviyo_events` adds the
--    product. Payments are no event: renewals reach Klaviyo through Stripe's
--    own integration, and the profile carries the totals.
-- 3. A KICK: the first enqueue in a transaction, into either outbox, asks
--    pg_net to POST the app's Klaviyo sync route, whose URL and bearer secret
--    live in Vault (`klaviyo_sync_url`, `klaviyo_sync_secret`). pg_net sends
--    only after commit, and nothing is sent where Vault holds no URL — a local
--    stack, CI — so there a write fills the outboxes and nothing more.
-- 4. A LEASE the sync route works each outbox under, with the backoff and the
--    parking of the substitution notification outbox. Nothing runs on a clock:
--    a failed row waits for the next kick, which any write anywhere sends and
--    which drains every row that is due. An event waits, unclaimed, while its
--    parent still owes their registration.
-- 5. Every existing registered parent is filed once, so the first sync after
--    deploy brings Klaviyo up to date. No historical event is filed.

-- ---------------------------------------------------------------------------
-- 1. The outboxes
-- ---------------------------------------------------------------------------

CREATE TABLE public.klaviyo_profile_outbox (
    customer_id uuid PRIMARY KEY,
    seq bigint NOT NULL DEFAULT 1,
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    leased_until timestamp with time zone,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    CONSTRAINT klaviyo_profile_outbox_seq_positive CHECK (seq >= 1),
    CONSTRAINT klaviyo_profile_outbox_attempts_nonnegative CHECK (attempts >= 0)
);

CREATE INDEX klaviyo_profile_outbox_next_attempt_at_idx
  ON public.klaviyo_profile_outbox (next_attempt_at);

COMMENT ON TABLE public.klaviyo_profile_outbox IS 'Parents whose Klaviyo profile has something not yet told: one row per parent, filed by enqueue_klaviyo_profiles from triggers on every table the Klaviyo snapshot reads, and deleted by finish_klaviyo_profile_job once a sync has told everything up to the row''s seq. NO foreign key to profiles, on purpose: a deleted parent stays filed, the snapshot then returns nothing for them, and the sync deletes their Klaviyo profile (found by its external id, the profile id). The sync route works it through claim_klaviyo_profile_jobs, which leases rows, because no lock can be held across the HTTP calls a sync makes. A row whose sync has failed 12 times in a row stays, with next_attempt_at at infinity, until the parent changes again. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.customer_id IS 'The parent''s profile id, which is also their Klaviyo external id. Not a foreign key: the row must outlive the profile it names.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.seq IS 'Bumped on every enqueue. A sync claims a seq and finishes against it: a finish that finds a different seq knows the parent changed while it ran, and runs again.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.next_attempt_at IS 'When the row is next due: now on every enqueue, pushed out by the backoff on a failed sync, and infinity once 12 syncs in a row have failed.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.leased_until IS 'Set when a sync claims the row and cleared when it finishes. While it is in the future no other sync claims the row; one in the past is a sync that died, and the row is claimable again.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.attempts IS 'Claims since the last enqueue; reset to 0 by every enqueue. Drives the backoff and the 12-attempt stop.';
COMMENT ON COLUMN public.klaviyo_profile_outbox.last_error IS 'What the last failed sync reported, kept for whoever investigates a stuck row.';

ALTER TABLE public.klaviyo_profile_outbox ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated and anon hold no grant, and the service role and
-- the functions below bypass RLS.
REVOKE ALL ON TABLE public.klaviyo_profile_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.klaviyo_profile_outbox TO service_role;

CREATE TYPE public.klaviyo_event_kind AS ENUM (
  'account_created',
  'purchase',
  'waitlisted',
  'seat_offered',
  'subscription_cancelled'
);

COMMENT ON TYPE public.klaviyo_event_kind IS 'What happened to a parent, as a Klaviyo event: account_created (they accepted the terms for the first time, which only a parent''s registration does), purchase (a participation on a paid product became active), waitlisted (a participation joined a waitlist), seat_offered (a waitlisted participation was offered a seat) and subscription_cancelled (a family subscription moved to canceling or cancelled). The sync sends each with the unique id `<kind>:<source id>`, so a retry, or the same transition happening twice, is never counted twice.';

CREATE TABLE public.klaviyo_event_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind public.klaviyo_event_kind NOT NULL,
    source_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    product_id uuid,
    occurred_at timestamp with time zone NOT NULL,
    facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    enqueued_at timestamp with time zone NOT NULL DEFAULT now(),
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    leased_until timestamp with time zone,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    CONSTRAINT klaviyo_event_outbox_source_unique UNIQUE (kind, source_id),
    CONSTRAINT klaviyo_event_outbox_attempts_nonnegative CHECK (attempts >= 0),
    CONSTRAINT klaviyo_event_outbox_facts_object CHECK (jsonb_typeof(facts) = 'object')
);

CREATE INDEX klaviyo_event_outbox_next_attempt_at_idx
  ON public.klaviyo_event_outbox (next_attempt_at);
CREATE INDEX klaviyo_event_outbox_customer_id_idx
  ON public.klaviyo_event_outbox (customer_id);

COMMENT ON TABLE public.klaviyo_event_outbox IS 'Things that happened to a parent that Klaviyo has not yet been told as events: one row per (kind, source row), filed by enqueue_klaviyo_event from the triggers that see them happen, and deleted by finish_klaviyo_event_job once sent. An event is a fact about a moment, so its row records that moment''s facts when it is filed and never changes; filing the same (kind, source) again while it waits does nothing, and Klaviyo''s unique id `<kind>:<source id>` absorbs one filed again after it was sent. No foreign keys: the source row may be gone by the time the event is sent (a cancelled seat), and the event still happened. A parent''s waiting events are deleted with the parent, because an event about somebody Klaviyo is about to forget is pointless. Leased, backed off and parked exactly as klaviyo_profile_outbox is. Service role only; RLS on with no policy.';
COMMENT ON COLUMN public.klaviyo_event_outbox.id IS 'The outbox row''s own id, which claim_klaviyo_event_jobs hands out and get_klaviyo_events and finish_klaviyo_event_job take.';
COMMENT ON COLUMN public.klaviyo_event_outbox.source_id IS 'The row the event is about: the parent''s profile id for account_created, a participation for purchase, waitlisted and seat_offered, a family subscription for subscription_cancelled.';
COMMENT ON COLUMN public.klaviyo_event_outbox.customer_id IS 'The parent the event happened to. Not a foreign key; the parent''s delete deletes the row.';
COMMENT ON COLUMN public.klaviyo_event_outbox.product_id IS 'The product the event concerns, when one does — read when it was filed. Not a foreign key: a product deleted since leaves the event without one.';
COMMENT ON COLUMN public.klaviyo_event_outbox.occurred_at IS 'When it happened, taken from the source row: the profile''s creation, the participation''s activation, waitlisting or seat offer, the subscription''s update.';
COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS 'The facts of the moment, as they stood when the event was filed: for a purchase, first_purchase — whether the parent held no other seat on a paid product then; the subscription''s status and current_period_end. Empty for account_created, waitlisted and seat_offered.';

ALTER TABLE public.klaviyo_event_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.klaviyo_event_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.klaviyo_event_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The kick and the enqueues
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.kick_klaviyo_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  -- A Klaviyo problem must never fail the write that caused it — a payment, a
  -- seat, a registration — so nothing here may raise.
  BEGIN
    SELECT s.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets s
     WHERE s.name = 'klaviyo_sync_url';
    SELECT s.decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets s
     WHERE s.name = 'klaviyo_sync_secret';

    -- Only a hosted project carries the two secrets. Without them — a local
    -- stack, CI — the outboxes fill and nothing is sent.
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
    RAISE WARNING 'kick_klaviyo_sync: % (%)', SQLERRM, SQLSTATE;
  END;
END;
$$;

COMMENT ON FUNCTION public.kick_klaviyo_sync() IS 'Asks the app to drain the Klaviyo outboxes: queues a pg_net POST to the URL in the Vault secret klaviyo_sync_url, bearing the Vault secret klaviyo_sync_secret. pg_net sends it after the transaction commits and never if it rolls back. A no-op when either secret is missing — every local stack and CI — and it never raises: any failure is a WARNING, because a Klaviyo problem must never fail the write that caused it; the row stays due, and the next write''s kick drains it with everything else due. Granted to nobody.';

REVOKE ALL ON FUNCTION public.kick_klaviyo_sync() FROM PUBLIC;

CREATE FUNCTION public.kick_klaviyo_sync_once() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- One kick per transaction, however many rows it files into either outbox:
  -- the setting is transaction-local, so it is gone again at commit or
  -- rollback.
  IF current_setting('sogverse.klaviyo_sync_kicked', true) IS DISTINCT FROM 'on' THEN
    PERFORM set_config('sogverse.klaviyo_sync_kicked', 'on', true);
    PERFORM public.kick_klaviyo_sync();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.kick_klaviyo_sync_once() IS 'kick_klaviyo_sync, at most once per transaction (the transaction-local setting sogverse.klaviyo_sync_kicked), whichever outbox the transaction filed into. Granted to nobody.';

REVOKE ALL ON FUNCTION public.kick_klaviyo_sync_once() FROM PUBLIC;

CREATE FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.klaviyo_profile_outbox AS o (customer_id)
  SELECT DISTINCT ids.id
    FROM unnest(p_customer_ids) AS ids(id)
   WHERE ids.id IS NOT NULL
  ON CONFLICT (customer_id) DO UPDATE
     SET seq             = o.seq + 1,
         next_attempt_at = now(),
         attempts        = 0;

  IF FOUND THEN
    PERFORM public.kick_klaviyo_sync_once();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) IS 'Files the given ids in the Klaviyo profile outbox whatever their role: a new row each, or seq bumped, the row due now and its attempts reset; then, once per transaction, the kick. The unfiltered half of enqueue_klaviyo_profiles, called directly only for a row that is no longer a parent — its delete, and its role leaving customer — so that the snapshot''s silence deletes its Klaviyo profile. Granted to nobody.';

REVOKE ALL ON FUNCTION public.file_klaviyo_profiles(p_customer_ids uuid[]) FROM PUBLIC;

CREATE FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- Only customer rows. A gamer or a gedu is never in Klaviyo, so the role is
  -- read now rather than trusted from the caller. A customer who has not
  -- finished registering is filed all the same: the snapshot, which answers
  -- only for a registered parent, decides whether they reach Klaviyo. A row
  -- leaving customer, or deleted, is filed through file_klaviyo_profiles.
  SELECT public.file_klaviyo_profiles(ARRAY(
    SELECT p.id
      FROM public.profiles p
     WHERE p.id = ANY (p_customer_ids)
       AND p.role = 'customer'::public.user_role
  ));
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) IS 'Files customer rows in the Klaviyo profile outbox through file_klaviyo_profiles: only ids whose profile exists with role customer, registered or not — get_klaviyo_parent_snapshots decides who reaches Klaviyo. Called by the triggers on every table the Klaviyo snapshot reads. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_profiles(p_customer_ids uuid[]) FROM PUBLIC;

CREATE FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT pg.parent_id FROM public.parent_gamer pg WHERE pg.gamer_id = p_gamer_id
  ));
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) IS 'Files every parent of a gamer in the Klaviyo profile outbox, because a parent''s Klaviyo profile describes their gamers. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_gamer(p_gamer_id uuid) FROM PUBLIC;

CREATE FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT DISTINCT part.customer_id
      FROM public.participations part
     WHERE part.product_id = p_product_id
  ));
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) IS 'Files every parent holding any participation in a product in the Klaviyo profile outbox, because a parent''s Klaviyo profile lists their products by name, topic, type and dates. A fan-out over one product''s participations. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_product(p_product_id uuid) FROM PUBLIC;

CREATE FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.enqueue_klaviyo_profiles(ARRAY(
    SELECT p.id
      FROM public.profiles p
     WHERE p.home_location_id = p_location_id
       AND p.registration_completed_at IS NOT NULL
  ));
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) IS 'Files every registered parent whose home location this is in the Klaviyo profile outbox, because a parent''s Klaviyo profile carries their home location''s name and country. A fan-out over one location''s parents. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_parents_of_location(p_location_id uuid) FROM PUBLIC;

CREATE FUNCTION public.enqueue_klaviyo_event(
  p_kind public.klaviyo_event_kind,
  p_source_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_occurred_at timestamp with time zone,
  p_facts jsonb DEFAULT '{}'::jsonb
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
    kind, source_id, customer_id, product_id, occurred_at, facts
  )
  VALUES (
    p_kind, p_source_id, p_customer_id, p_product_id, p_occurred_at,
    COALESCE(p_facts, '{}'::jsonb)
  )
  ON CONFLICT (kind, source_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.kick_klaviyo_sync_once();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb) IS 'Files one event in the Klaviyo event outbox — unless the parent is not a customer, or the same (kind, source) is already waiting — and then, once per transaction, the kick. Called by the triggers that see an event happen. Granted to nobody.';

REVOKE ALL ON FUNCTION public.enqueue_klaviyo_event(p_kind public.klaviyo_event_kind, p_source_id uuid, p_customer_id uuid, p_product_id uuid, p_occurred_at timestamp with time zone, p_facts jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. The triggers
-- ---------------------------------------------------------------------------

-- profiles: the parent themself. Only the columns the snapshot reads or
-- decides on, so a bookkeeping write (updated_at) files nothing. The role and
-- the registration stamp decide whether there is a snapshot at all: a
-- registration completed files the parent, and a row whose role leaves
-- customer (register_gedu's promotion) is filed one last time, so the
-- snapshot's silence deletes whatever Klaviyo holds for it.
CREATE FUNCTION public.klaviyo_parent_profile_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.role = 'customer'::public.user_role THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.id]);
  ELSE
    PERFORM public.file_klaviyo_profiles(ARRAY[NEW.id]);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_parent_profile_changed() IS 'Trigger on profiles, after an update of a row that is or was a customer and that changes a column the Klaviyo snapshot reads or decides on (role and registration_completed_at among them): files it in the Klaviyo profile outbox — through file_klaviyo_profiles when its role has just left customer, since enqueue_klaviyo_profiles files customers only. A profile''s insert files nothing: a password parent is filed when their registration records the terms (klaviyo_account_consent_accepted), a Google parent when the completion route stamps registration_completed_at. Whether the row reaches Klaviyo is the snapshot''s to say, and only a registered customer has one. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_parent_profile_changed() FROM PUBLIC;

CREATE TRIGGER profiles_klaviyo_parent_changed
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    (OLD.role = 'customer'::public.user_role OR NEW.role = 'customer'::public.user_role)
    AND (
      OLD.email, OLD.first_name, OLD.last_name, OLD.phone, OLD.locale,
      OLD.spoken_languages, OLD.home_location_id, OLD.currency,
      OLD.email_verified_at, OLD.role, OLD.registration_completed_at,
      OLD.utm_source, OLD.utm_medium, OLD.utm_campaign, OLD.utm_content, OLD.utm_term,
      OLD.signup_intent_kind, OLD.signup_intent_id,
      OLD.registration_marketing_consent
    ) IS DISTINCT FROM (
      NEW.email, NEW.first_name, NEW.last_name, NEW.phone, NEW.locale,
      NEW.spoken_languages, NEW.home_location_id, NEW.currency,
      NEW.email_verified_at, NEW.role, NEW.registration_completed_at,
      NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.utm_content, NEW.utm_term,
      NEW.signup_intent_kind, NEW.signup_intent_id,
      NEW.registration_marketing_consent
    )
  )
  EXECUTE FUNCTION public.klaviyo_parent_profile_changed();

-- profiles: a parent deleted. Filed whatever the snapshot will say — it will
-- say nothing, which is what tells the sync to delete the Klaviyo profile —
-- and their waiting events go with them.
CREATE FUNCTION public.klaviyo_parent_profile_deleted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.file_klaviyo_profiles(ARRAY[OLD.id]);

  DELETE FROM public.klaviyo_event_outbox e WHERE e.customer_id = OLD.id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_parent_profile_deleted() IS 'Trigger on profiles, after a parent row is deleted: files the parent in the Klaviyo profile outbox, where the snapshot''s silence about them tells the sync to delete their Klaviyo profile, and deletes their waiting events, which nobody will be told. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_parent_profile_deleted() FROM PUBLIC;

CREATE TRIGGER profiles_klaviyo_parent_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'customer'::public.user_role)
  EXECUTE FUNCTION public.klaviyo_parent_profile_deleted();

-- account_consent_acceptances: the account opened. Only a parent's
-- registration records account terms, so the first acceptance is the account
-- opening. A Google parent's terms are recorded a moment before their
-- registration is stamped, and the event waits unclaimed until it is.
CREATE FUNCTION public.klaviyo_account_consent_accepted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_created_at timestamp with time zone;
BEGIN
  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  -- The first acceptance only: a later revision accepted is a new agreement,
  -- not a new account. The documents accepted in one statement share their
  -- stamp, so "nothing earlier" holds for each of them.
  IF NOT EXISTS (
       SELECT 1
         FROM public.account_consent_acceptances a
        WHERE a.customer_id = NEW.customer_id
          AND a.accepted_at < NEW.accepted_at
     ) THEN
    SELECT p.created_at INTO v_created_at
      FROM public.profiles p
     WHERE p.id = NEW.customer_id;

    PERFORM public.enqueue_klaviyo_event(
      'account_created'::public.klaviyo_event_kind,
      NEW.customer_id,
      NEW.customer_id,
      NULL,
      COALESCE(v_created_at, NEW.accepted_at)
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_account_consent_accepted() IS 'Trigger on account_consent_acceptances, after every insert: files the parent in the Klaviyo profile outbox and, on their first acceptance, files the account_created event, timed at the profile''s creation. The terms are recorded only by a parent''s registration — the register route, or the finish page for a Google account — never by a gamer''s or a gedu''s. The finish page records them before it stamps registration_completed_at, so a Google parent''s event is filed while they still owe their registration, and claim_klaviyo_event_jobs leaves it waiting until the stamp lands. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_account_consent_accepted() FROM PUBLIC;

CREATE TRIGGER account_consent_acceptances_klaviyo
  AFTER INSERT ON public.account_consent_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_account_consent_accepted();

-- parent_gamer: a gamer joins or leaves the family.
CREATE FUNCTION public.klaviyo_parent_gamer_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.parent_id]);
  ELSE
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.parent_id]);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_parent_gamer_changed() IS 'Trigger on parent_gamer, after every insert and delete: files the parent in the Klaviyo profile outbox, because their gamers are on their Klaviyo profile. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_parent_gamer_changed() FROM PUBLIC;

CREATE TRIGGER parent_gamer_klaviyo
  AFTER INSERT OR DELETE ON public.parent_gamer
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_parent_gamer_changed();

-- gamer_profiles, minecraft_accounts, roblox_accounts: facts about a gamer.
CREATE FUNCTION public.klaviyo_gamer_fact_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_parents_of_gamer(OLD.user_id);
  ELSE
    PERFORM public.enqueue_klaviyo_parents_of_gamer(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_gamer_fact_changed() IS 'Trigger on gamer_profiles (gender and birth year), minecraft_accounts and roblox_accounts (a game linked or unlinked): files each of the gamer''s parents in the Klaviyo profile outbox. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_gamer_fact_changed() FROM PUBLIC;

CREATE TRIGGER gamer_profiles_klaviyo
  AFTER UPDATE OF gender, birth_year ON public.gamer_profiles
  FOR EACH ROW
  WHEN ((OLD.gender, OLD.birth_year) IS DISTINCT FROM (NEW.gender, NEW.birth_year))
  EXECUTE FUNCTION public.klaviyo_gamer_fact_changed();

CREATE TRIGGER minecraft_accounts_klaviyo_written
  AFTER INSERT OR DELETE ON public.minecraft_accounts
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_gamer_fact_changed();

CREATE TRIGGER minecraft_accounts_klaviyo_renamed
  AFTER UPDATE OF minecraft_username ON public.minecraft_accounts
  FOR EACH ROW
  WHEN ((OLD.minecraft_username IS NULL) IS DISTINCT FROM (NEW.minecraft_username IS NULL))
  EXECUTE FUNCTION public.klaviyo_gamer_fact_changed();

CREATE TRIGGER roblox_accounts_klaviyo_written
  AFTER INSERT OR DELETE ON public.roblox_accounts
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_gamer_fact_changed();

CREATE TRIGGER roblox_accounts_klaviyo_renamed
  AFTER UPDATE OF roblox_username ON public.roblox_accounts
  FOR EACH ROW
  WHEN ((OLD.roblox_username IS NULL) IS DISTINCT FROM (NEW.roblox_username IS NULL))
  EXECUTE FUNCTION public.klaviyo_gamer_fact_changed();

-- participations: the family's products, and three of the events.
CREATE FUNCTION public.klaviyo_participation_changed() RETURNS trigger
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
  -- leaves the status where it was is not one. Only a seat on a paid product
  -- is a purchase: a free seat and a municipality's contracted one are not.
  IF NEW.status = 'active'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status
     AND EXISTS (
           SELECT 1
             FROM public.products pr
            WHERE pr.id = NEW.product_id
              AND pr.billing_mode = 'paid'::public.billing_mode
         ) THEN
    PERFORM public.enqueue_klaviyo_event(
      'purchase'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.signed_up_at ELSE now() END,
      jsonb_build_object(
        -- Of the seats the parent holds now: a cancelled seat is deleted, so a
        -- family that left and came back buys a first seat again.
        'first_purchase', NOT EXISTS (
          SELECT 1
            FROM public.participations other
            JOIN public.products pr ON pr.id = other.product_id
           WHERE other.customer_id = NEW.customer_id
             AND other.id <> NEW.id
             AND other.status IN ('active'::public.participation_status,
                                  'completed'::public.participation_status)
             AND pr.billing_mode = 'paid'::public.billing_mode
        )
      )
    );
  END IF;

  IF NEW.status = 'waitlisted'::public.participation_status
     AND v_old_status IS DISTINCT FROM NEW.status THEN
    PERFORM public.enqueue_klaviyo_event(
      'waitlisted'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, NEW.product_id,
      COALESCE(NEW.waitlisted_at, now())
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

COMMENT ON FUNCTION public.klaviyo_participation_changed() IS 'Trigger on participations, after an insert, a delete, or an update of status, product_id or seat_offer_sent_at that changes it: files the participation''s parent in the Klaviyo profile outbox, and files the events it shows — purchase when it arrives at active (by insert or from the waitlist) on a product whose billing_mode is paid, with first_purchase saying whether the parent then held no other active or completed seat on a paid product; waitlisted when it arrives at waitlisted; seat_offered when a seat offer is first stamped on it. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_participation_changed() FROM PUBLIC;

CREATE TRIGGER participations_klaviyo_written
  AFTER INSERT OR DELETE ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_participation_changed();

CREATE TRIGGER participations_klaviyo_changed
  AFTER UPDATE OF status, product_id, seat_offer_sent_at ON public.participations
  FOR EACH ROW
  WHEN (
    (OLD.status, OLD.product_id, OLD.seat_offer_sent_at)
      IS DISTINCT FROM (NEW.status, NEW.product_id, NEW.seat_offer_sent_at)
  )
  EXECUTE FUNCTION public.klaviyo_participation_changed();

-- family_subscriptions: the subscription on the profile, and its cancellation.
CREATE FUNCTION public.klaviyo_family_subscription_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_profiles(ARRAY[OLD.customer_id]);
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);

  -- Into a cancelled state from outside one: `canceling` is the parent asking
  -- for it, `cancelled` is it ending, and whichever comes first is the event.
  IF NEW.status IN ('canceling', 'cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('canceling', 'cancelled')) THEN
    SELECT part.product_id INTO v_product_id
      FROM public.participations part
     WHERE part.id = NEW.participation_id;

    PERFORM public.enqueue_klaviyo_event(
      'subscription_cancelled'::public.klaviyo_event_kind,
      NEW.id, NEW.customer_id, v_product_id,
      NEW.updated_at,
      jsonb_build_object(
        'status',             NEW.status,
        'current_period_end', NEW.current_period_end
      )
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_family_subscription_changed() IS 'Trigger on family_subscriptions, after an insert, a delete, or an update of status or current_period_end that changes it: files the parent in the Klaviyo profile outbox, and files subscription_cancelled when the status first arrives at canceling or cancelled. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_family_subscription_changed() FROM PUBLIC;

CREATE TRIGGER family_subscriptions_klaviyo_written
  AFTER INSERT OR DELETE ON public.family_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_family_subscription_changed();

CREATE TRIGGER family_subscriptions_klaviyo_changed
  AFTER UPDATE OF status, current_period_end ON public.family_subscriptions
  FOR EACH ROW
  WHEN (
    (OLD.status, OLD.current_period_end) IS DISTINCT FROM (NEW.status, NEW.current_period_end)
  )
  EXECUTE FUNCTION public.klaviyo_family_subscription_changed();

-- payments: the totals on the profile. A payment is no event: renewals reach
-- Klaviyo through Stripe's own integration.
CREATE FUNCTION public.klaviyo_payment_recorded() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_profiles(ARRAY[NEW.customer_id]);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_payment_recorded() IS 'Trigger on payments, after every insert: files the parent in the Klaviyo profile outbox, whose snapshot carries their first and last payment and their totals. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_payment_recorded() FROM PUBLIC;

CREATE TRIGGER payments_klaviyo
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_payment_recorded();

-- products and product_translations: what a parent's products are called and
-- when they run.
CREATE FUNCTION public.klaviyo_product_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    PERFORM public.enqueue_klaviyo_parents_of_product(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_klaviyo_parents_of_product(OLD.product_id);
  ELSE
    PERFORM public.enqueue_klaviyo_parents_of_product(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_product_changed() IS 'Trigger on products (topic, type, billing mode, dates, zone) and product_translations (a name written, changed or removed): files every parent holding a participation in the product in the Klaviyo profile outbox. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_product_changed() FROM PUBLIC;

CREATE TRIGGER products_klaviyo
  AFTER UPDATE OF topic, product_type, billing_mode, start_date, end_date, timezone ON public.products
  FOR EACH ROW
  WHEN (
    (OLD.topic, OLD.product_type, OLD.billing_mode, OLD.start_date, OLD.end_date, OLD.timezone)
      IS DISTINCT FROM
    (NEW.topic, NEW.product_type, NEW.billing_mode, NEW.start_date, NEW.end_date, NEW.timezone)
  )
  EXECUTE FUNCTION public.klaviyo_product_changed();

CREATE TRIGGER product_translations_klaviyo_written
  AFTER INSERT OR DELETE ON public.product_translations
  FOR EACH ROW EXECUTE FUNCTION public.klaviyo_product_changed();

CREATE TRIGGER product_translations_klaviyo_renamed
  AFTER UPDATE OF name ON public.product_translations
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.klaviyo_product_changed();

-- locations: a parent's home location, by name and country.
CREATE FUNCTION public.klaviyo_location_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.enqueue_klaviyo_parents_of_location(NEW.id);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.klaviyo_location_changed() IS 'Trigger on locations, after its name or country_code changes: files every registered parent whose home location it is in the Klaviyo profile outbox. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_location_changed() FROM PUBLIC;

CREATE TRIGGER locations_klaviyo
  AFTER UPDATE OF name, country_code ON public.locations
  FOR EACH ROW
  WHEN ((OLD.name, OLD.country_code) IS DISTINCT FROM (NEW.name, NEW.country_code))
  EXECUTE FUNCTION public.klaviyo_location_changed();

-- ---------------------------------------------------------------------------
-- 4. The leases
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'::public.user_role
       AND p.registration_completed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) IS 'Whether this id is a customer row still owing its registration. Such a parent''s events wait unclaimed: the finish page records a Google parent''s terms — filing account_created — a moment before it stamps the registration, and a sync claiming the event in between would find no snapshot and drop it, and with it the one subscription Sogverse ever sends. A row that is gone or not a customer answers false, so its events are claimed and dropped. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_parent_owes_registration(p_customer_id uuid) FROM PUBLIC;

CREATE FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[] DEFAULT NULL) RETURNS TABLE(customer_id uuid, seq bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT o.customer_id
      FROM public.klaviyo_profile_outbox o
     WHERE o.next_attempt_at <= now()
       AND (o.leased_until IS NULL OR o.leased_until <= now())
       AND (p_customer_ids IS NULL OR o.customer_id = ANY (p_customer_ids))
     ORDER BY o.next_attempt_at, o.customer_id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.klaviyo_profile_outbox o
     SET leased_until = now() + interval '2 minutes',
         attempts     = o.attempts + 1
    FROM due
   WHERE o.customer_id = due.customer_id
  RETURNING o.customer_id, o.seq;
$$;

COMMENT ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) IS 'Leases up to p_limit due rows of the Klaviyo profile outbox for two minutes and returns each parent id with the seq the sync must finish against. Due means next_attempt_at has come and no live lease is held; SKIP LOCKED lets two syncs claim at once without waiting on each other. p_customer_ids narrows the claim to named parents. Each claim counts one attempt. Service role only.';

REVOKE ALL ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_klaviyo_profile_jobs(p_limit integer, p_customer_ids uuid[]) TO service_role;

CREATE FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text DEFAULT NULL) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_error IS NULL THEN
    DELETE FROM public.klaviyo_profile_outbox o
     WHERE o.customer_id = p_customer_id
       AND o.seq         = p_seq;
    IF FOUND THEN
      RETURN false;
    END IF;

    -- The parent changed while the sync ran: hand the row back, due now, and
    -- tell the caller to run it again. No row at all means another sync
    -- already finished it, and there is nothing left to tell.
    UPDATE public.klaviyo_profile_outbox o
       SET leased_until = NULL
     WHERE o.customer_id = p_customer_id;
    RETURN FOUND;
  END IF;

  -- Backoff of 2^attempts minutes, capped at an hour; after 12 attempts the
  -- row stops being scheduled, and stays until the parent changes again.
  UPDATE public.klaviyo_profile_outbox o
     SET leased_until    = NULL,
         last_error      = left(p_error, 2000),
         next_attempt_at = CASE
                             WHEN o.attempts >= 12 THEN 'infinity'::timestamp with time zone
                             ELSE now() + make_interval(mins => least(power(2, o.attempts), 60)::integer)
                           END
   WHERE o.customer_id = p_customer_id;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) IS 'Ends a sync of one claimed Klaviyo profile outbox row, and answers whether to run it again. Success (p_error null) deletes the row when its seq is still p_seq and answers false; when the seq moved — the parent changed while the sync ran — it releases the lease, leaving the row due, and answers true. Failure releases the lease, records p_error (cut to 2000 characters) and pushes next_attempt_at out by 2^attempts minutes, capped at an hour; once the row has been claimed 12 times it is pushed to infinity and stays until the next enqueue resets it. Failure answers false. Service role only.';

REVOKE ALL ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_klaviyo_profile_job(p_customer_id uuid, p_seq bigint, p_error text) TO service_role;

CREATE FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[] DEFAULT NULL) RETURNS TABLE(event_id uuid, kind public.klaviyo_event_kind, customer_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH due AS (
    SELECT e.id
      FROM public.klaviyo_event_outbox e
     WHERE e.next_attempt_at <= now()
       AND (e.leased_until IS NULL OR e.leased_until <= now())
       AND (p_customer_ids IS NULL OR e.customer_id = ANY (p_customer_ids))
       AND NOT public.klaviyo_parent_owes_registration(e.customer_id)
     ORDER BY e.next_attempt_at, e.occurred_at, e.id
     LIMIT greatest(p_limit, 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.klaviyo_event_outbox e
     SET leased_until = now() + interval '2 minutes',
         attempts     = e.attempts + 1
    FROM due
   WHERE e.id = due.id
  RETURNING e.id, e.kind, e.customer_id;
$$;

COMMENT ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) IS 'Leases up to p_limit due rows of the Klaviyo event outbox for two minutes, oldest first, and returns each row''s id, kind and parent. p_customer_ids narrows the claim to named parents. An event whose parent still owes their registration is not claimed: it waits for the stamp, which files the parent and kicks the sync, rather than meeting no snapshot and being dropped. Due, SKIP LOCKED and the attempt count work as claim_klaviyo_profile_jobs''s do. Service role only.';

REVOKE ALL ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_klaviyo_event_jobs(p_limit integer, p_customer_ids uuid[]) TO service_role;

CREATE FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_error IS NULL THEN
    DELETE FROM public.klaviyo_event_outbox e WHERE e.id = p_event_id;
    RETURN;
  END IF;

  -- The profile outbox's backoff; a parked event stays parked, since nothing
  -- files an event again.
  UPDATE public.klaviyo_event_outbox e
     SET leased_until    = NULL,
         last_error      = left(p_error, 2000),
         next_attempt_at = CASE
                             WHEN e.attempts >= 12 THEN 'infinity'::timestamp with time zone
                             ELSE now() + make_interval(mins => least(power(2, e.attempts), 60)::integer)
                           END
   WHERE e.id = p_event_id;
END;
$$;

COMMENT ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) IS 'Ends a send of one claimed Klaviyo event. Success (p_error null) deletes the row — and so does the sync for an event get_klaviyo_events no longer returns, whose parent is gone. Failure releases the lease, records p_error (cut to 2000 characters) and backs off 2^attempts minutes, capped at an hour; after 12 claims the row is parked at infinity, where it stays: an event is never filed again. Service role only.';

REVOKE ALL ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_klaviyo_event_job(p_event_id uuid, p_error text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. What Klaviyo is told
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.klaviyo_product_document(p_product_id uuid) RETURNS jsonb
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
           'start_date',   p.start_date,
           'end_date',     p.end_date,
           'timezone',     p.timezone
         )
    FROM public.products p
   WHERE p.id = p_product_id;
$$;

COMMENT ON FUNCTION public.klaviyo_product_document(p_product_id uuid) IS 'One product as Klaviyo is told about it: id, every name with its locale (the app picks the reader''s through resolveTranslation, never SQL), topic, product_type, billing_mode, start_date, end_date and timezone. NULL for a product that does not exist. Granted to nobody.';

REVOKE ALL ON FUNCTION public.klaviyo_product_document(p_product_id uuid) FROM PUBLIC;

CREATE FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) RETURNS TABLE(customer_id uuid, snapshot jsonb)
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
                AND part.status <> 'reserving'::public.participation_status
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

COMMENT ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) IS 'The single definition of what Klaviyo is told about a parent: one row per named id that is a registered parent (role customer, registration_completed_at set), and none for any other — a parent deleted, a Google sign-up that never finished registering, an account promoted to gedu, or one that was never a parent — which tells the sync to delete that Klaviyo profile, or never create it. `profile`: id, email, names, phone, locale, spoken_languages, currency, created_at, email_verified_at and home_location ({id, name, country_code}, null when unset; the canonical name only). `attribution`: the five utm_* values, signup_intent_kind and signup_intent_id, and registration_marketing_consent — all write-once. `gamers`: every linked gamer as {birth_year, gender, minecraft, roblox}, the last two whether a username is linked — no name and no birth month. `participations`: every seat the parent holds or waits for (the retired reserving status left out) as {id, status, product}, product being klaviyo_product_document. `subscriptions`: every family subscription as {participation_id, current_period_end}. `payments`: {first_at, last_at, lifetime_cents}, lifetime_cents an object of summed amount_cents per currency, refunded duplicates (reservation_duplicate) left out of all three. Gamer facts and the parent''s phone are in it, so it is for the service role alone.';

REVOKE ALL ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) TO service_role;

CREATE FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) RETURNS TABLE(event_id uuid, kind public.klaviyo_event_kind, unique_id text, customer_id uuid, occurred_at timestamp with time zone, properties jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT e.id,
         e.kind,
         e.kind::text || ':' || e.source_id::text,
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

COMMENT ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) IS 'The named Klaviyo events, ready to send: event_id, kind, unique_id (`<kind>:<source id>`, which Klaviyo deduplicates on), the parent, occurred_at (the source row''s own moment) and properties — the facts recorded when the event was filed (first_purchase for a purchase; status and current_period_end for a cancellation) plus source_id and product (klaviyo_product_document, null when the event names none or the product is gone). An event whose parent is no longer a parent is left out, and the sync finishes it unsent. Service role only.';

REVOKE ALL ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_klaviyo_events(p_event_ids uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Every existing registered parent, once
-- ---------------------------------------------------------------------------

SELECT public.enqueue_klaviyo_profiles(ARRAY(
  SELECT p.id
    FROM public.profiles p
   WHERE p.role = 'customer'::public.user_role
     AND p.registration_completed_at IS NOT NULL
));
