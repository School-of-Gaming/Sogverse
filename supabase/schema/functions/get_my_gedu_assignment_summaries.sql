--
-- Name: get_my_gedu_assignment_summaries(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.gedu_assignment_summaries((SELECT auth.uid()), p_epoch_date);
END;
$$;


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'The calling gedu''s seat summaries, exactly as gedu_assignment_summaries describes them for that gedu: gedu-gated on its first statement, then that function for auth.uid(). What a summary carries and what its attention count counts are that function''s; this is the web''s way in, and get_gedu_assignment_summaries_for_discord_user is the Discord bot''s.';


--
-- Name: FUNCTION get_my_gedu_assignment_summaries(p_epoch_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) TO service_role;


