--
-- Name: get_admin_consent_answer_totals(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) RETURNS TABLE(page text, answer public.consent_answer, count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY SELECT t.page, t.answer, t.count
                 FROM public.consent_answer_totals(p_from, p_to) t;
END;
$$;


--
-- Name: FUNCTION get_admin_consent_answer_totals(p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) IS 'consent_answer_totals for an admin''s own session (the analytics page, the MCP tools): the same rows in the same order. Admin-only, guard-first on assert_admin; it crosses the boundary of consent_answer_counts, which grants authenticated nothing.';


--
-- Name: FUNCTION get_admin_consent_answer_totals(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) TO authenticated;


