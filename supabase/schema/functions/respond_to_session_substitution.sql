--
-- Name: respond_to_session_substitution(uuid, uuid, public.substitution_offer_response); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone   text;
  v_product_id uuid;
  v_row        public.session_substitution_requests;
BEGIN
  -- Locked, so an answer and an approval on one request serialize: an answer
  -- written after the approval sees the request substituted and is refused.
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  -- An unknown id answers exactly as somebody else's request does, so this
  -- cannot be used to tell a real request from an invented one.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Taking back an answer somebody has already been staffed on is a new
  -- absence, not a change of mind.
  IF v_row.status = 'substituted'::public.substitution_request_status
     AND v_row.substitute_id = p_gedu_id THEN
    RAISE EXCEPTION 'you are the approved substitute for this session; file a substitution request instead'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and is no longer taking offers', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone, p.id INTO v_timezone, v_product_id
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = v_row.group_id;

  IF v_row.session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'this session (%) is in the past', v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_response = 'offer'::public.substitution_offer_response THEN
    IF NOT public.gedu_may_substitute_session(
             p_gedu_id, v_row.group_id, v_row.session_date, v_row.requested_by
           ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    -- Its own message, so the client can say why: the gedu is otherwise able
    -- to take the session, and the qualification is the one thing missing.
    IF NOT public.gedu_holds_session_qualifications(p_gedu_id, v_row.group_id) THEN
      RAISE EXCEPTION 'this gedu is not qualified for this session''s product'
        USING ERRCODE = '42501';
    END IF;

    -- Likewise its own message: the language is the one thing missing.
    IF NOT public.gedu_speaks_session_language(p_gedu_id, v_row.group_id) THEN
      RAISE EXCEPTION 'this gedu does not speak the language this session is run in'
        USING ERRCODE = '42501';
    END IF;

    -- Likewise its own message: the site is the one thing missing.
    IF NOT public.gedu_covers_product_site(p_gedu_id, v_product_id) THEN
      RAISE EXCEPTION 'this gedu does not cover the site this session is run at'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- A decline asks less than an offer: a gedu who could be asked, or one
    -- who has already answered. The second arm is what lets a gedu who has
    -- since dropped a language or an area take their offer back; without it,
    -- a decline from anybody else would be a read of the request wearing a
    -- write's clothes, so it is refused like an unknown id.
    IF NOT public.gedu_may_substitute_session(
             p_gedu_id, v_row.group_id, v_row.session_date, v_row.requested_by
           )
       AND NOT EXISTS (
             SELECT 1
               FROM public.session_substitution_offers o
              WHERE o.request_id = p_request_id
                AND o.gedu_id    = p_gedu_id
           ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotent: giving the same answer twice changes nothing, not even when
  -- it was given; a different answer replaces the old one.
  INSERT INTO public.session_substitution_offers AS o
         (request_id, gedu_id, response, responded_at)
  VALUES (p_request_id, p_gedu_id, p_response, clock_timestamp())
  ON CONFLICT (request_id, gedu_id) DO UPDATE
     SET response     = EXCLUDED.response,
         responded_at = EXCLUDED.responded_at
   WHERE o.response IS DISTINCT FROM EXCLUDED.response;

  -- CONCEALED, explicitly: a gedu answering never learns whose absence this is.
  RETURN public.substitution_request_document(v_row, false, p_gedu_id, false);
END;
$$;


--
-- Name: FUNCTION respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) IS 'Internal: a gedu''s answer to one substitution request, `offer` or `decline`, the body behind offer_session_substitution, decline_session_substitution and their two Discord wrappers. Locks the request FOR UPDATE, so an answer and an approval serialize. Refuses, in order: an unknown request (42501, the same answer somebody else''s gets); the gedu being the approved substitute ("you are the approved substitute", check_violation); a request that is not `open` ("no longer taking offers", check_violation); a session dated before today in the product''s timezone ("is in the past", check_violation). An OFFER then asks the four eligibility tests, each with its own refusal: gedu_may_substitute_session (42501 Forbidden), gedu_holds_session_qualifications ("is not qualified"), gedu_speaks_session_language ("does not speak the language") and gedu_covers_product_site ("does not cover the site"), all 42501. A DECLINE asks only that the gedu passes gedu_may_substitute_session OR already holds a row on the request — so a gedu who has since dropped a language or an area can still take their offer back, while anybody else is refused 42501 rather than handed the document. Writes one row per (request, gedu): a new answer, or the other answer replacing the old one with responded_at = clock_timestamp(); the same answer twice changes nothing. Returns the request document with the absent gedu CONCEALED and no offer_count — who is away and who else answered are not the answerer''s business. Granted to nobody.';


--
-- Name: FUNCTION respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) FROM PUBLIC;


