--
-- Name: set_team_profile_approval(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current boolean;
  v_ready   boolean;
  v_role    public.user_role;
BEGIN
  PERFORM public.assert_admin();

  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'set_team_profile_approval needs a yes or a no'
      USING ERRCODE = '22004';
  END IF;

  SELECT tp.approved, tp.opted_in, p.role INTO v_current, v_ready, v_role
    FROM public.team_profiles tp
    JOIN public.profiles p ON p.id = tp.user_id
   WHERE tp.user_id = p_user_id
     FOR UPDATE OF tp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team profile for this person' USING ERRCODE = 'P0002';
  END IF;

  IF v_role IS DISTINCT FROM 'gedu' THEN
    RAISE EXCEPTION 'Only a Gedu''s profile is made public by an admin' USING ERRCODE = '22023';
  END IF;

  -- Saying it again changes nothing, and keeps who last changed it.
  IF v_current = p_approved THEN
    RETURN;
  END IF;

  -- An admin makes public what has been marked ready, never ahead of it.
  -- Hiding is open whenever the profile is public.
  IF p_approved AND NOT v_ready THEN
    RAISE EXCEPTION 'A profile is made public only once it is marked ready'
      USING ERRCODE = 'P0028';
  END IF;

  UPDATE public.team_profiles
     SET approved            = p_approved,
         approval_decided_by = (SELECT auth.uid()),
         approval_decided_at = now()
   WHERE user_id = p_user_id;
END;
$$;


--
-- Name: FUNCTION set_team_profile_approval(p_user_id uuid, p_approved boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) IS 'An admin''s two actions on a Gedu''s team profile: make it public (true) or hide it (false), stamping who did it and when. Admin-only, guard-first. Making public needs the profile marked ready (opted_in) and refuses one that is not with P0028; hiding is open whenever it is public. Repeating the current value is a no-op that keeps the stamp. Refuses a NULL decision (22004), an admin''s profile (22023) and a person with no profile row (P0002). Never touches the checkbox; unticking it (save_team_profile) hides the profile itself, so ticking it again waits for an admin to make it public.';


--
-- Name: FUNCTION set_team_profile_approval(p_user_id uuid, p_approved boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) TO service_role;


