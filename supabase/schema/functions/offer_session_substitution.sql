--
-- Name: offer_session_substitution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.offer_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.respond_to_session_substitution(
    (SELECT auth.uid()), p_request_id, 'offer'::public.substitution_offer_response
  );
END;
$$;


--
-- Name: FUNCTION offer_session_substitution(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.offer_session_substitution(p_request_id uuid) IS '"Offer to substitute", from the gedu''s pool: gedu-gated on its first statement, then respond_to_session_substitution with the caller and `offer` — the same refusals, codes and messages, and the same concealed document. An offer replaces the caller''s decline on the same request; offering twice is one offer. There is deliberately no ranking and no eligibility beyond certification, qualifications, spoken language and coverage; the office decides, and auto-approving the first offer was rejected because the admin step IS the product.';


--
-- Name: FUNCTION offer_session_substitution(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO service_role;


