--
-- Name: get_my_session_cancellations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_session_cancellations() RETURNS TABLE(participation_id uuid, session_date date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id, d.session_date
    FROM public.participations p
   CROSS JOIN LATERAL unnest(public.group_upcoming_cancelled_dates(p.group_id)) AS d(session_date)
   WHERE p.status = 'active'::public.participation_status
     AND p.group_id IS NOT NULL
     AND (
           p.customer_id    = (SELECT auth.uid())
        OR p.participant_id = (SELECT auth.uid())
         );
$$;


--
-- Name: FUNCTION get_my_session_cancellations(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_session_cancellations() IS 'The upcoming cancelled session dates (group_upcoming_cancelled_dates) of every placed, active seat the caller is party to — as the buyer or as the one in the seat — one row per (participation, date). Dates only: a family never learns the reason or who cancelled. Takes no argument, so the set is defined by auth.uid() alone. Feeds the My SOG enrollment cards, which skip a cancelled date when naming the next session and name the cancelled ones before it.';


--
-- Name: FUNCTION get_my_session_cancellations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_session_cancellations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_session_cancellations() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_session_cancellations() TO service_role;


