--
-- Name: gedu_writes_group_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- A current period on the group writes every session of it…
  SELECT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
              AND ga.ended_at IS NULL
         )
      -- …so does a live substitution, which writes group-wide and mails only
      -- its own date…
      OR public.gedu_holds_live_substitution_on_group(p_group_id)
      -- …and an ended assignment writes only the sessions still in its window.
      OR public.gedu_holds_unexpired_ended_assignment((SELECT auth.uid()), p_group_id, p_session_date);
$$;


--
-- Name: FUNCTION gedu_writes_group_session(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) IS 'Internal predicate: may the caller write THIS session of the group — its report and gedu note, its register, its photos? A CURRENT assignment period on the group, or a live substitution on any of its dates (gedu_holds_live_substitution_on_group), writes every session, as gedu_teaches_group admits them; a gedu taken off the group writes only a date they still hold through the ended assignment (gedu_holds_unexpired_ended_assignment), never the group''s other sessions and never one ahead. The gate behind set_group_session_notes, record_attendance, add_group_session_image, delete_group_session_image and assert_can_delete_session_image; the group-level writes stay on gedu_teaches_group, and the report mail asks its own date-scoped gate. Not granted to `authenticated`.';


--
-- Name: FUNCTION gedu_writes_group_session(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gedu_writes_group_session(p_group_id uuid, p_session_date date) TO service_role;


