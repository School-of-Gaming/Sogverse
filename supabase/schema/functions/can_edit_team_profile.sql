--
-- Name: can_edit_team_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_team_profile(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- Their own, for the two roles that have one.
    (p_user_id = (SELECT auth.uid())
       AND (SELECT public.get_user_role()) IN ('admin', 'gedu'))
    -- A Gedu's, for an admin. Never another admin's: an office title and the
    -- words under it are that admin's own.
    OR ((SELECT public.is_admin())
        AND EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = p_user_id AND p.role = 'gedu')),
    false);
$$;


--
-- Name: FUNCTION can_edit_team_profile(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_edit_team_profile(p_user_id uuid) IS 'Whether the caller may write this person''s team profile content and photo: their own as an admin or a Gedu, or a Gedu''s as an admin — never another admin''s. A total boolean (false for NULL). SECURITY INVOKER: it reads only the caller''s own role and a profiles row the caller''s RLS already shows them (an admin reads every profile), so it cannot answer about anything the caller could not see. The team-photos storage policies and save_team_profile both ask it.';


--
-- Name: FUNCTION can_edit_team_profile(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_edit_team_profile(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_edit_team_profile(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_edit_team_profile(p_user_id uuid) TO service_role;


