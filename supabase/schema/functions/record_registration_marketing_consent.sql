--
-- Name: record_registration_marketing_consent(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current boolean;
BEGIN
  IF p_customer_id IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION
      'a registration marketing consent needs both a customer and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role invariant `set_marketing_consent` gets from assert_role, read off
  -- the named profile instead because there is no session here to ask about.
  -- A missing profile fails the same test and gets the same refusal: both mean
  -- "this is not a parent's mailbox".
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION
      'marketing consent belongs to a customer profile (% is not one)',
      p_customer_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- FOR UPDATE so a retry racing the original serializes rather than both
  -- concluding they are the change. A row that does not exist locks nothing,
  -- which is the harmless half — the ON CONFLICT below settles a first-answer
  -- race, and the losing side writes an event for a state it genuinely set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = p_customer_id
     AND mc.consent_type = 'school_of_gaming'
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL, and NULL is
  -- distinct from both true and false, which is the intended reading. Never
  -- answered is not the same state as answered no, so a parent declining on the
  -- sign-up form is a change and gets its event.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, 'registration');
END;
$$;


--
-- Name: FUNCTION record_registration_marketing_consent(p_customer_id uuid, p_granted boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) IS 'Record the marketing answer given on the parent sign-up form — the state row and its event row together, in one transaction. The register route called PostgREST twice for this and two calls are two transactions, so a failed second write left marketing_consents asserting an answer that marketing_consent_events could not corroborate; on the one consent whose value is provable provenance, an opt-in nobody can evidence is worse than none. Deliberately narrower than set_marketing_consent: the consent type is hardcoded to school_of_gaming (ours is the only list asked for at registration — the partner''s is asked on products) and the source is hardcoded to `registration`, so neither can be forged through this function. The customer IS a parameter because no session exists yet, which is why the only EXECUTE grant is to service_role: a parameter naming the subject can be aimed at somebody, so nothing reachable may call it. It still tests that the named profile is a `customer`, which is the invariant assert_role gives the self-service writer, read from the only place available here. Appends an event only when the state actually MOVES, so a retried registration request records nothing twice — and a first explicit "no" IS a move, because an absent row means never asked.';


--
-- Name: FUNCTION record_registration_marketing_consent(p_customer_id uuid, p_granted boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_registration_marketing_consent(p_customer_id uuid, p_granted boolean) TO service_role;


