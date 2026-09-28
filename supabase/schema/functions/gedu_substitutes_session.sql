--
-- Name: gedu_substitutes_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.gedu_holds_unexpired_substitution(p_group_id, p_session_date)
     AND EXISTS (
       SELECT 1
         FROM public.product_groups g
         JOIN public.products p ON p.id = g.product_id
        WHERE g.id = p_group_id
          AND now() >= COALESCE(
                         lower(public.derive_group_session_window(g.id, p_session_date)),
                         (p_session_date::timestamp AT TIME ZONE p.timezone)
                       ) - interval '48 hours'
     );
$$;


--
-- Name: FUNCTION gedu_substitutes_session(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) IS 'Internal predicate: may the CALLER reach this group for this exact date? Their substitution is unexpired (gedu_holds_unexpired_substitution, which carries the window''s END) AND the session has come within 48 hours — now() >= the session''s own scheduled start, derived from the current schedule, minus 48 hours. The single definition of the window''s START; every other substitution access test reaches both bounds through here or through gedu_substitutes_group. A date the schedule no longer projects has no start, and falls back to product-local midnight of the session date, which opens EARLIER than any real session that day would: an orphaned date must not lock a sub out of a session they ran and still owe a report for. Not granted to `authenticated`: it is called from inside SECURITY DEFINER functions only, the two voice predicates among them.';


--
-- Name: FUNCTION gedu_substitutes_session(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_substitutes_session(p_group_id uuid, p_session_date date) TO service_role;


