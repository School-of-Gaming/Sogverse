--
-- Name: gedu_live_substitution_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             public.substitution_request_document(r, false, p_gedu_id)
             ORDER BY r.session_date, r.group_id
           ),
           '[]'::jsonb
         )
    FROM public.session_substitution_requests r
    JOIN public.product_groups g ON g.id = r.group_id
    JOIN public.products p       ON p.id = g.product_id
   WHERE r.requested_by = p_gedu_id
     -- The first clause of gedu_is_expected_at_session: a non-withdrawn
     -- request, open or substituted, means its filer is not coming.
     AND r.status <> 'withdrawn'::public.substitution_request_status
     -- The filing write's own past-session bound, in the product's zone.
     AND r.session_date >= (now() AT TIME ZONE p.timezone)::date;
$$;


--
-- Name: FUNCTION gedu_live_substitution_requests(p_gedu_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) IS 'Internal: the given gedu''s LIVE substitution requests — every request they filed whose status is not withdrawn (open or substituted), dated today or later in the product''s timezone — as an array of request documents read as the requester reads their own (substitution_request_document with no reason, the viewer being the gedu), ordered by date then group. "Live" is the first clause of gedu_is_expected_at_session, so a (group, date) here is exactly one file_session_substitution_request refuses with 42501, and a withdrawn request, which lets the gedu ask again, is never here. A request on a cancelled session is included, because cancelling hides a request rather than withdrawing it and the write still refuses a second filing there. The lower bound is the write''s own past-session bound. Behind get_my_live_substitution_requests (the web, for auth.uid()) and get_live_substitution_requests_for_discord_user (the Discord bot, for the linked gedu); makes no role test of its own. Granted to nobody.';


--
-- Name: FUNCTION gedu_live_substitution_requests(p_gedu_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) FROM PUBLIC;


