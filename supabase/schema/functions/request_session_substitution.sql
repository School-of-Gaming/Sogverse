--
-- Name: request_session_substitution(uuid, date, public.substitution_reason, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.file_session_substitution_request(
    (SELECT auth.uid()), p_group_id, p_session_date, p_reason, p_reason_note
  );
END;
$$;


--
-- Name: FUNCTION request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed by the calling gedu from a future session''s card or the Substitutions page''s picker. Gedu-gated on its first statement, then file_session_substitution_request for auth.uid(), which holds every check, refusal and the returned document. The reason parameters carry SQL defaults so a caller with no note omits the key.';


--
-- Name: FUNCTION request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO authenticated;
GRANT ALL ON FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) TO service_role;


