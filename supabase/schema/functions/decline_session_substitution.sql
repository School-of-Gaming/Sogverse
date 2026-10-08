--
-- Name: decline_session_substitution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.respond_to_session_substitution(
    (SELECT auth.uid()), p_request_id, 'decline'::public.substitution_offer_response
  );
END;
$$;


--
-- Name: FUNCTION decline_session_substitution(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.decline_session_substitution(p_request_id uuid) IS '"I cannot", from the gedu''s pool: gedu-gated on its first statement, then respond_to_session_substitution with the caller and `decline` — which replaces the caller''s offer on the same request, and is how an offer is taken back. Refused once the caller is the approved substitute, once the request is no longer open, for a past session, and for a gedu who could not be asked and holds no answer on it (42501, the same answer an unknown id gets). Returns the request document with the absent gedu concealed.';


--
-- Name: FUNCTION decline_session_substitution(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decline_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decline_session_substitution(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decline_session_substitution(p_request_id uuid) TO service_role;


