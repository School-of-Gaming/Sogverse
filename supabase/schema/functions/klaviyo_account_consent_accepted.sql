--
-- Name: klaviyo_account_consent_accepted(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION klaviyo_account_consent_accepted(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_account_consent_accepted() IS 'Trigger on account_consent_acceptances, after every insert: files the parent in the Klaviyo profile outbox and, on their first acceptance, files the account_created event, timed at the profile''s creation. The terms are recorded only by a parent''s registration — the register route, or the finish page for a Google account — so this is the first moment a customer row is known to be a parent: a gamer or a gedu is a customer row too until its promotion, and files nothing. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_account_consent_accepted(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_account_consent_accepted() FROM PUBLIC;


