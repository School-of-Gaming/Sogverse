--
-- Name: offer_session_substitution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.offer_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_timezone text;
  v_row      public.session_substitution_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and is no longer taking offers', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = v_row.group_id;

  IF v_row.session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'this session (%) is in the past', v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.gedu_may_substitute_session(
           v_caller, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Idempotent on the unique key: offering twice is one offer, and a double-tap
  -- is not an error worth surfacing.
  INSERT INTO public.session_substitution_offers (request_id, gedu_id)
  VALUES (p_request_id, v_caller)
  ON CONFLICT (request_id, gedu_id) DO NOTHING;

  -- CONCEALED, explicitly: a volunteer never learns whose absence this is.
  RETURN public.substitution_request_document(v_row, false, v_caller, false);
END;
$$;


--
-- Name: FUNCTION offer_session_substitution(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.offer_session_substitution(p_request_id uuid) IS '"Offer to substitute", from the gedu dashboard''s pool list. Guarded on gedu_may_substitute_session — certified, not the absent gedu, not already expected at that session, and holding no non-withdrawn request of their own on that (group, date) — plus the request being `open` and dated today or later in the product''s timezone. Idempotent on (request, gedu): offering twice is one offer. There is deliberately no ranking, no eligibility beyond certification, and no notification on any channel; the office decides, and auto-approving the first offer was rejected because the admin step IS the product. Returns the request document, which carries no offer_count for an offerer — who else volunteered is not their business. The document it returns CONCEALS the absent gedu: requested_by and requested_by_first_name arrive as JSON null, because otherwise offering would be a way to unmask the absent person on any pool row, leaving the pool''s own "names the session, never the person" rule one button-press deep.';


--
-- Name: FUNCTION offer_session_substitution(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO service_role;


