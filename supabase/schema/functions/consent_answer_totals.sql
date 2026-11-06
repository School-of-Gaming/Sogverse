--
-- Name: consent_answer_totals(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consent_answer_totals(p_from date, p_to date) RETURNS TABLE(page text, answer public.consent_answer, count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.page, c.answer, sum(c.count)::bigint
    FROM public.consent_answer_counts c
   WHERE c.day BETWEEN p_from AND p_to
   GROUP BY c.page, c.answer
   ORDER BY c.page NULLS FIRST, c.answer;
$$;


--
-- Name: FUNCTION consent_answer_totals(p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consent_answer_totals(p_from date, p_to date) IS 'The cookie banner''s answers counted over the UTC days p_from to p_to, both included: one row per (page, answer) that has any, page NULL standing for every page that is not a marketing page. Service role only, for readers with no Sogverse user (the partner API); an admin''s session reads the same through get_admin_consent_answer_totals.';


--
-- Name: FUNCTION consent_answer_totals(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consent_answer_totals(p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consent_answer_totals(p_from date, p_to date) TO service_role;


