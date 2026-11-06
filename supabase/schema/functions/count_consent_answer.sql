--
-- Name: count_consent_answer(public.consent_answer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  INSERT INTO public.consent_answer_counts AS c (day, answer, page, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, p_answer, p_page, 1)
  ON CONFLICT ON CONSTRAINT consent_answer_counts_key
  DO UPDATE SET count = c.count + 1;
$$;


--
-- Name: FUNCTION count_consent_answer(p_answer public.consent_answer, p_page text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) IS 'Counts one cookie-banner answer on today''s UTC day for the page given (NULL for no marketing page). The only writer of consent_answer_counts. Service role only: the public consent-answers route vets the page and calls it.';


--
-- Name: FUNCTION count_consent_answer(p_answer public.consent_answer, p_page text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) TO service_role;


