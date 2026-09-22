--
-- Name: set_gamer_photo_consent(uuid, public.gamer_photo_consent_type, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_parent_id uuid;
  v_current   boolean;
BEGIN
  PERFORM public.assert_role('customer');

  IF p_gamer_id IS NULL OR p_consent_type IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION
      'a gamer photo consent needs a gamer, a type and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- No 'registration': a gamer does not exist when the sign-up form is filled
  -- in, so there is no surface that could honestly claim it. NULL is refused by
  -- the same statement rather than by a NOT NULL further down, so the message
  -- names the real problem.
  IF p_source IS NULL OR p_source NOT IN ('settings', 'enrolment') THEN
    RAISE EXCEPTION
      'gamer photo consent source must be settings or enrolment (got %)',
      COALESCE(p_source, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  v_parent_id := (SELECT auth.uid());

  -- The target half of the authorization, and the reason the role guard alone
  -- is not enough: without this, any parent could answer for any child. A
  -- gamer who is not this caller's and a uuid belonging to nobody are refused
  -- identically, so neither answer is an oracle.
  IF NOT EXISTS (
    SELECT 1
      FROM public.parent_gamer pg
     WHERE pg.parent_id = v_parent_id
       AND pg.gamer_id  = p_gamer_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE so two submissions racing on the same answer serialize rather
  -- than both concluding they are the change — two parents of one child on two
  -- devices is the ordinary shape of that race here, not a stale tab. A row
  -- that does not exist locks nothing, which is the harmless half: the ON
  -- CONFLICT below settles a first-answer race, and the losing side writes an
  -- event for a state it genuinely did set.
  SELECT gpc.granted
    INTO v_current
    FROM public.gamer_photo_consents gpc
   WHERE gpc.gamer_id = p_gamer_id
     AND gpc.consent_type = p_consent_type
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL here, and NULL is
  -- distinct from both true and false, which is the intended reading. "Never
  -- asked" is not the same state as "asked and declined" — both keep the child
  -- out of the photograph, and only one of them is a decision a parent made —
  -- so a first explicit "no" is a CHANGE and earns its event, while a
  -- re-submission of the answer already on file does not.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.gamer_photo_consents (
    gamer_id, consent_type, granted, updated_at
  )
  VALUES (p_gamer_id, p_consent_type, p_granted, now())
  ON CONFLICT (gamer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.gamer_photo_consent_events (
    gamer_id, consent_type, granted, source, answered_by
  )
  VALUES (p_gamer_id, p_consent_type, p_granted, p_source, v_parent_id);
END;
$$;


--
-- Name: FUNCTION set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text) IS 'The one writer of a gamer photo consent: the card on the gamer''s page under the parent''s My SOG and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer''), which keeps out gamers — a child may never grant permission to photograph themselves, and the read policy letting them SEE the answer is the whole of their access — gedus, and ADMINS, the last deliberately and for 00220''s reason: an admin editing another family''s answer about their own child is not a thing this platform does. Unlike its marketing twin the SUBJECT is a parameter, because a parent has several children and the answer is about one of them; the parameter is defended by a parent_gamer link from auth.uid() to the named gamer, checked before anything is written, and "not your child" and "no such gamer" are refused with the same 42501 so the function is not an oracle for which uuids are children here. Accepts only the `settings` and `enrolment` sources — there is no `registration`, because no gamer exists when a sign-up form is filled in. IDEMPOTENT AND HONEST ABOUT IT: submitting the state already on file succeeds and appends NO event, which matters more here than anywhere, because every enrolment writes every asked box whether or not the parent touched it. A first explicit "no" IS a change — an absent row means never asked, and only one of those two is a decision.';


--
-- Name: FUNCTION set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.set_gamer_photo_consent(p_gamer_id uuid, p_consent_type public.gamer_photo_consent_type, p_granted boolean, p_source text) TO service_role;


