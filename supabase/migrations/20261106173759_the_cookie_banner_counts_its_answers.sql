-- The cookie banner counts its answers.
--
-- Nothing recorded a refusal, and Vercel Web Analytics sees only the visitors
-- who accepted analytics, so the banner's acceptance rate could not be read
-- anywhere. The banner now reports a device's first answer to our own route,
-- which counts it here: per UTC day, per answer, per page, a number. Nothing
-- that identifies anyone is stored or can be, which is why the tally needs no
-- consent of its own (owner's ruling, 2026-11-06).
--
-- 1. `consent_answer`: the four answers the two purposes can make together.
-- 2. `consent_answer_counts`: one row per (day, answer, page), with its count.
-- 3. `count_consent_answer`: the one writer, service role only — the public
--    route that hears the banner is the funnel.
-- 4. `consent_answer_totals`: the tally over a range of days, for the
--    service-role readers (the partner API).
-- 5. `get_admin_consent_answer_totals`: the same read for an admin's own
--    session, guard-first.

CREATE TYPE public.consent_answer AS ENUM (
  'all',
  'analytics_only',
  'marketing_only',
  'none'
);

COMMENT ON TYPE public.consent_answer IS 'One answer to the cookie banner, from the two purposes it asks about: all (analytics and marketing), analytics_only, marketing_only, none (both refused).';

-- `page` NULL is "not a marketing page", and NULLS NOT DISTINCT makes it one row
-- per day and answer like any page. A sentinel string in a NOT NULL column would
-- do the same for the key, but every reader would then have to know the
-- sentinel; NULL already means "no page" to anyone reading the table.
CREATE TABLE public.consent_answer_counts (
  day date NOT NULL,
  answer public.consent_answer NOT NULL,
  page text,
  count integer NOT NULL,
  CONSTRAINT consent_answer_counts_key UNIQUE NULLS NOT DISTINCT (day, answer, page),
  CONSTRAINT consent_answer_counts_count_check CHECK (count > 0),
  CONSTRAINT consent_answer_counts_page_check CHECK (
    page IS NULL OR (page ~ '^/' AND char_length(page) <= 2048)
  )
);

COMMENT ON TABLE public.consent_answer_counts IS 'The cookie banner''s answers, counted: how many devices gave each answer on each UTC day, on each page. Only a device''s first answer is counted, never a change of an existing one. Holds no identifier of any kind — no IP, user agent, cookie, session or account — so a row says how many and never who. Anyone can inflate a count through the public route that writes it; that is accepted. Written only by count_consent_answer; service role only.';
COMMENT ON COLUMN public.consent_answer_counts.day IS 'The UTC day the answers were given.';
COMMENT ON COLUMN public.consent_answer_counts.page IS 'The marketing page the banner was answered on, as its internal path (locale stripped, slug untranslated, ids kept, never a query); NULL for any page that is not a marketing page.';
COMMENT ON COLUMN public.consent_answer_counts.count IS 'How many answers this row stands for. A row exists only once one has been counted.';

ALTER TABLE public.consent_answer_counts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.consent_answer_counts TO service_role;

-- `p_page` defaults to NULL so a caller with no marketing page leaves it out:
-- the generated type cannot say that a text argument may be NULL.
CREATE FUNCTION public.count_consent_answer(
  p_answer public.consent_answer,
  p_page text DEFAULT NULL
) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  INSERT INTO public.consent_answer_counts AS c (day, answer, page, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, p_answer, p_page, 1)
  ON CONFLICT ON CONSTRAINT consent_answer_counts_key
  DO UPDATE SET count = c.count + 1;
$$;

COMMENT ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) IS 'Counts one cookie-banner answer on today''s UTC day for the page given (NULL for no marketing page). The only writer of consent_answer_counts. Service role only: the public consent-answers route vets the page and calls it.';

REVOKE EXECUTE ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_consent_answer(p_answer public.consent_answer, p_page text) TO service_role;

CREATE FUNCTION public.consent_answer_totals(
  p_from date,
  p_to date
) RETURNS TABLE(page text, answer public.consent_answer, count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.page, c.answer, sum(c.count)::bigint
    FROM public.consent_answer_counts c
   WHERE c.day BETWEEN p_from AND p_to
   GROUP BY c.page, c.answer
   ORDER BY c.page NULLS FIRST, c.answer;
$$;

COMMENT ON FUNCTION public.consent_answer_totals(p_from date, p_to date) IS 'The cookie banner''s answers counted over the UTC days p_from to p_to, both included: one row per (page, answer) that has any, page NULL standing for every page that is not a marketing page. Service role only, for readers with no Sogverse user (the partner API); an admin''s session reads the same through get_admin_consent_answer_totals.';

REVOKE EXECUTE ON FUNCTION public.consent_answer_totals(p_from date, p_to date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consent_answer_totals(p_from date, p_to date) TO service_role;

CREATE FUNCTION public.get_admin_consent_answer_totals(
  p_from date,
  p_to date
) RETURNS TABLE(page text, answer public.consent_answer, count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY SELECT t.page, t.answer, t.count
                 FROM public.consent_answer_totals(p_from, p_to) t;
END;
$$;

COMMENT ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) IS 'consent_answer_totals for an admin''s own session (the analytics page, the MCP tools): the same rows in the same order. Admin-only, guard-first on assert_admin; it crosses the boundary of consent_answer_counts, which grants authenticated nothing.';

REVOKE EXECUTE ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_consent_answer_totals(p_from date, p_to date) TO authenticated;
