--
-- Name: set_team_profile_approval(uuid, public.team_profile_approval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current public.team_profile_approval;
  v_role    public.user_role;
BEGIN
  PERFORM public.assert_admin();

  SELECT tp.approval, p.role INTO v_current, v_role
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

  IF p_approval IS NULL OR p_approval = 'pending' THEN
    RAISE EXCEPTION 'A profile is approved or withdrawn; it never goes back to pending'
      USING ERRCODE = '22023';
  END IF;

  IF p_approval = 'withdrawn' AND v_current = 'pending' THEN
    RAISE EXCEPTION 'Only an approved profile can be withdrawn' USING ERRCODE = '22023';
  END IF;

  -- Saying it again changes nothing, and keeps who decided it first.
  IF v_current = p_approval THEN
    RETURN;
  END IF;

  UPDATE public.team_profiles
     SET approval            = p_approval,
         approval_decided_by = (SELECT auth.uid()),
         approval_decided_at = now()
   WHERE user_id = p_user_id;
END;
$$;


--
-- Name: FUNCTION set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval) IS 'An admin approves a Gedu''s team profile, or withdraws an approved one. Admin-only, guard-first. pending → approved, approved → withdrawn, withdrawn → approved; never back to pending, and a pending profile cannot be withdrawn (22023). Repeating the current value is a no-op. Refuses an admin''s profile (22023) and a person with no profile row (P0002). Independent of the Gedu''s own checkbox, which it never touches.';


--
-- Name: FUNCTION set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval) TO authenticated;
GRANT ALL ON FUNCTION public.set_team_profile_approval(p_user_id uuid, p_approval public.team_profile_approval) TO service_role;


