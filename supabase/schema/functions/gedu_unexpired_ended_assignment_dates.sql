--
-- Name: gedu_unexpired_ended_assignment_dates(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) RETURNS TABLE(session_date date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT candidate.session_date
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
    CROSS JOIN LATERAL (
      -- Every date whose window can still be open. The planned dates from 16
      -- product-local days back — the 15-day fallback cannot reach further —
      -- to today, since a session in an ended period started before the end…
      SELECT planned.session_date
        FROM public.planned_session_dates(
               g.product_id,
               (now() AT TIME ZONE p.timezone)::date - 16,
               (now() AT TIME ZONE p.timezone)::date
             ) AS planned
      UNION
      -- …the stored rows over the same days, a date the plan has since dropped
      -- included, and any older row whose report was mailed within the last 24
      -- hours, since the mailed report is what the window counts from.
      SELECT gs.session_date
        FROM public.group_sessions gs
       WHERE gs.group_id = g.id
         AND (gs.session_date >= (now() AT TIME ZONE p.timezone)::date - 16
              OR gs.report_emailed_at > now() - interval '24 hours')
    ) AS candidate
   WHERE g.id = p_group_id
     -- Constant for the call, so it is decided once: almost every group has no
     -- ended period of this gedu on it, and is answered without the plan.
     AND EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = p_gedu_id
              AND ga.ended_at IS NOT NULL
         )
     AND public.gedu_holds_unexpired_ended_assignment(p_gedu_id, p_group_id, candidate.session_date);
$$;


--
-- Name: FUNCTION gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) IS 'Internal: the dates of this group on which the gedu still holds it through an ended assignment — gedu_holds_unexpired_ended_assignment asked of every date whose window can still be open: the planned dates from 16 product-local days back to today, and the stored rows over those days or whose report was mailed in the last 24 hours. The group-wide form of that predicate: EXISTS over it is "an ended assignment still in its window", the arm gedu_substitutes_group and the seat reads compose, so the card and the workspace stay open until the LATEST of those windows closes. Empty for a gedu still current on the group. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_unexpired_ended_assignment_dates(p_gedu_id uuid, p_group_id uuid) TO service_role;


