--
-- Name: require_discord_linked_gedu(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  -- One Discord account may be linked to several Sogverse accounts. Only an
  -- account that is a gedu NOW counts, so a profile whose role has changed
  -- since it was linked never answers; among several gedu accounts the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id INTO v_gedu_id
    FROM public.discord_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.discord_user_id = p_discord_user_id
     AND p.role = 'gedu'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;

  IF v_gedu_id IS NULL THEN
    RAISE EXCEPTION 'DISCORD_GEDU_NOT_LINKED' USING ERRCODE = 'P0031';
  END IF;

  RETURN v_gedu_id;
END;
$$;


--
-- Name: FUNCTION require_discord_linked_gedu(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as: the profile linked to it in discord_links whose role is gedu at the moment of asking, and among several such the most recently linked (linked_at, then profile id). Refuses with P0031 (DISCORD_GEDU_NOT_LINKED) when there is none — no link at all, links only to non-gedu accounts, or a NULL id — which the bot answers by asking the person to link their account. Every Discord wrapper calls it first. Granted to nobody.';


--
-- Name: FUNCTION require_discord_linked_gedu(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) FROM PUBLIC;


