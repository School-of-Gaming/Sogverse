--
-- Name: set_marketing_consent(public.marketing_consent_type, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_customer_id uuid;
  v_current     boolean;
BEGIN
  PERFORM public.assert_role('customer');

  IF p_consent_type IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION 'a marketing consent needs both a type and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 'registration' is refused here and only ever written by the register route
  -- through the service-role client, before the account has a session at all.
  -- See the header: source is the one field on an event that nothing else can
  -- corroborate, so the source with no live caller is the one a live caller may
  -- not claim. NULL is refused by the same statement rather than by a NOT NULL
  -- further down, so the message names the real problem.
  IF p_source IS NULL OR p_source NOT IN ('settings', 'enrolment') THEN
    RAISE EXCEPTION
      'marketing consent source must be settings or enrolment (got %)',
      COALESCE(p_source, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  v_customer_id := (SELECT auth.uid());

  -- FOR UPDATE so two submissions racing on the same toggle serialize rather
  -- than both concluding they are the change. A row that does not exist locks
  -- nothing, which is the harmless half: the ON CONFLICT below is what settles
  -- a first-answer race, and the losing side writes an event for a state it
  -- genuinely did set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = v_customer_id
     AND mc.consent_type = p_consent_type
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL here, and NULL is
  -- distinct from both true and false — which is the intended reading. "Never
  -- answered" is not the same state as "answered no", so a parent explicitly
  -- declining for the first time is a CHANGE and gets its event, while a
  -- re-submission of an answer already on file is not and does not.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (v_customer_id, p_consent_type, p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (v_customer_id, p_consent_type, p_granted, p_source);
END;
$$;


--
-- Name: FUNCTION set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) IS 'The one self-service writer of a marketing consent: the settings toggle and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer'') — gamers and gedus hold no marketing consents, and an admin toggles their own on their own parent account rather than through here, because the answer belongs to whoever owns the mailbox. The customer is auth.uid() and is never a parameter, so there is nothing for a caller to aim at another family. REFUSES p_source = ''registration'': that source is written only by the register route through the service-role client, before a session exists, and it is the one field on an event nothing else can corroborate. IDEMPOTENT AND HONEST ABOUT IT — submitting the state already on file succeeds and appends NO event, because a change log that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. A first explicit "no" IS a change: an absent row means never answered, which is not the same state as a recorded refusal.';


--
-- Name: FUNCTION set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) TO service_role;


