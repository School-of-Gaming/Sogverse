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
    RAISE EXCEPTION 'Only a Gedu''s profile is approved' USING ERRCODE = '22023';
  END IF;

  -- Saying it again changes nothing, and keeps who last changed it — an
  -- approval standing on a profile whose ready has since been unticked
  -- included: repeating it is not a new approval.
  IF v_current = p_approved THEN
    RETURN;
  END IF;

  -- An admin approves what the profile's editor has marked ready, never ahead
  -- of it. Taking an approval back is open at any time.
  IF p_approved AND NOT v_ready THEN
    RAISE EXCEPTION 'A profile is approved only once it is marked ready'
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

COMMENT ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) IS 'An admin approves a Gedu''s team profile (true) or takes the approval back (false), stamping who changed it and when. Admin-only, guard-first. Approving needs the profile marked ready (opted_in) and refuses one that is not with P0028; taking the approval back is open at any time. Repeating the current value is a no-op that keeps the stamp, even for an approval whose profile has since been unmarked. Refuses a NULL decision (22004), an admin''s profile (22023) and a person with no profile row (P0002). Never touches the checkbox, and unticking it leaves the approval standing, so ticking it again makes the profile public with no second approval.';


--
-- Name: FUNCTION set_team_profile_approval(p_user_id uuid, p_approved boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approved boolean) TO service_role;


