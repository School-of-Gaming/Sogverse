--
-- Name: get_my_waitlist_positions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_waitlist_positions() RETURNS TABLE(participation_id uuid, waitlist_position integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT mine.id,
         -- Same derivation as join_waitlist and get_waitlist_position: count the
         -- waitlisted rows ordered at-or-before this one by (waitlisted_at, id).
         -- Recomputed live, so it shrinks as people ahead of them leave.
         -- waitlisted_at is never NULL on a waitlisted row
         -- (chk_participations_waitlisted_has_timestamp), so neither comparison
         -- can go three-valued and swallow a peer.
         (SELECT COUNT(*)::INTEGER
            FROM public.participations peer
           WHERE peer.product_id = mine.product_id
             AND peer.status = 'waitlisted'::public.participation_status
             AND (peer.waitlisted_at < mine.waitlisted_at
                  OR (peer.waitlisted_at = mine.waitlisted_at
                      AND peer.id <= mine.id)))
    FROM public.participations mine
   WHERE mine.status = 'waitlisted'::public.participation_status
     AND (mine.customer_id = (SELECT auth.uid())
          OR mine.participant_id = (SELECT auth.uid()));
$$;


--
-- Name: FUNCTION get_my_waitlist_positions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_waitlist_positions() IS 'Every waitlist position the caller is party to (purchasing parent or the gamer), in one snapshot. SECURITY DEFINER to count past the caller''s RLS; returns only their own participation ids and an integer each.';


--
-- Name: FUNCTION get_my_waitlist_positions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_waitlist_positions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO service_role;


