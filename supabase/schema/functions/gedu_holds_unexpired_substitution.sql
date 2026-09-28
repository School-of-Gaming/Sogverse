--
-- Name: gedu_holds_unexpired_substitution(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
      JOIN public.product_groups g  ON g.id = r.group_id
      JOIN public.products p        ON p.id = g.product_id
      JOIN public.gedu_profiles gp  ON gp.user_id = r.substitute_id
      -- The session row is LAZILY materialized, so there may be none — which is
      -- exactly the case the 15-day arm of the COALESCE is for.
      LEFT JOIN public.group_sessions gs
             ON gs.group_id     = r.group_id
            AND gs.session_date = r.session_date
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status       = 'substituted'::public.substitution_request_status
       AND r.substitute_id   = (SELECT auth.uid())
       -- Still certified. De-certifying an educator ends their substitution access
       -- mid-window, which is the point of checking it here rather than only at
       -- approval time.
       AND gp.certified
       -- 24 hours after the report was mailed, or 15 days after the session date
       -- if it never was. The fallback is compared against PRODUCT-LOCAL
       -- midnight, so a club in Helsinki and one in Los Angeles both get fifteen
       -- of their own days.
       AND now() < COALESCE(
                     gs.report_emailed_at + interval '24 hours',
                     ((r.session_date + 15)::timestamp AT TIME ZONE p.timezone)
                   )
  );
$$;


--
-- Name: FUNCTION gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date) IS 'Internal predicate: does the CALLER still hold this (group, date) substitution at all? True when they are the substitute_id of a `substituted` request for it, are still certified, and it has not EXPIRED — now() < COALESCE(report_emailed_at + 24 hours, product-local midnight 15 days after the session date). The single definition of the window''s END. It makes NO start test, which is what separates it from gedu_substitutes_session: this one answers whether the substitution is still the caller''s to SEE, and the gedu dashboard''s two reads ask it so that an accepted substitution appears on My SOG from approval rather than from the moment its workspace opens. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_holds_unexpired_substitution(p_group_id uuid, p_session_date date) TO service_role;


