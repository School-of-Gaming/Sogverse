--
-- Name: require_slack_linked_admin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_slack_linked_admin(p_slack_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Only an account that is an admin NOW counts, and among several the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id INTO v_admin_id
    FROM public.slack_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.slack_user_id = p_slack_user_id
     AND p.role = 'admin'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'SLACK_ADMIN_NOT_LINKED' USING ERRCODE = 'P0034';
  END IF;

  RETURN v_admin_id;
END;
$$;


--
-- Name: FUNCTION require_slack_linked_admin(p_slack_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.require_slack_linked_admin(p_slack_user_id text) IS 'The admin account a Slack user id acts as: the profile linked to it in slack_links whose role is admin at the moment of asking, and among several such the most recently linked (linked_at, then profile id). Refuses with P0034 (SLACK_ADMIN_NOT_LINKED) when there is none — no link at all, links only to non-admin accounts, or a NULL id — which the Slack app answers by asking the person to link their account. Every Slack wrapper calls it first. Granted to nobody.';


--
-- Name: FUNCTION require_slack_linked_admin(p_slack_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_slack_linked_admin(p_slack_user_id text) FROM PUBLIC;


