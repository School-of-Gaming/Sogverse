--
-- Name: planned_session_dates(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) RETURNS TABLE(session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT span.first_day + step.n AS session_date,
         -- `timestamp AT TIME ZONE zone` resolves a wall-clock time in that
         -- zone to the correct instant, so this is DST-correct without any
         -- arithmetic of our own. Adding the duration to the INSTANT (not to
         -- the wall clock) keeps a session that straddles a transition the
         -- right length.
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone AS starts_at,
         ((span.first_day + step.n) + s.start_time) AT TIME ZONE p.timezone
           + make_interval(mins => s.duration_minutes) AS ends_at
    FROM public.products p
         -- The requested span clipped to the term, both ends inclusive. An
         -- open-ended product's term has no end, so the span's own end stands.
   CROSS JOIN LATERAL (
         SELECT LEAST(p_to, COALESCE(p.end_date, p_to))       AS last_day
         ) AS term_end
         -- At most the 3661 days ending at last_day: anon can call this, and
         -- ten years is past any term while bounding what one call can ask
         -- for. The clamp moves the START, so a span reaching back to the
         -- start_date of a product older than that loses its oldest dates,
         -- never its newest.
   CROSS JOIN LATERAL (
         SELECT GREATEST(p_from, p.start_date, term_end.last_day - 3660) AS first_day,
                term_end.last_day                                         AS last_day
         ) AS span
         -- Calendar days as offsets from the first one, so stepping a day is
         -- exact.
   CROSS JOIN LATERAL generate_series(0, span.last_day - span.first_day) AS step(n)
    JOIN public.schedule_slots s
      ON s.product_id = p.id
     -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
     AND s.weekday = EXTRACT(ISODOW FROM span.first_day + step.n)::integer - 1
   WHERE p.id = p_product_id
     -- GREATEST and LEAST skip a NULL argument, so a NULL bound would quietly
     -- become the term's own. A span with a missing end is no span.
     AND p_from IS NOT NULL
     AND p_to IS NOT NULL
   ORDER BY session_date, starts_at;
$$;


--
-- Name: FUNCTION planned_session_dates(p_product_id uuid, p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) IS 'The ONLY expansion of a product''s plan into dated sessions: every date in [p_from, p_to] that falls inside the product''s term (start_date to end_date, both inclusive, end open for an open-ended club) on a weekday its schedule has a slot for, with the session''s start and end instants. Instants are resolved in products.timezone, so they are DST-correct, and a session that crosses midnight belongs to the date it starts on. No rows when either bound is NULL. The span is clamped at its start, to no earlier than 3660 days before its last day, so an over-long span loses its oldest dates and keeps its newest. SECURITY INVOKER over products and schedule_slots, which every caller, anon included, already reads in full — so it answers every caller identically. Every other reader of the plan asks this function; a catalog test fails on any other function that walks weekdays.';


--
-- Name: FUNCTION planned_session_dates(p_product_id uuid, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.planned_session_dates(p_product_id uuid, p_from date, p_to date) TO service_role;


