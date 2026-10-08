--
-- Name: discord_acting_gedu(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.discord_acting_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One Discord account may be linked to several Sogverse accounts. Only an
  -- account that is a gedu NOW counts, so a profile whose role has changed
  -- since it was linked never answers; among several gedu accounts the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id
    FROM public.discord_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.discord_user_id = p_discord_user_id
     AND p.role = 'gedu'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;
$$;


--
-- Name: FUNCTION discord_acting_gedu(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.discord_acting_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as, or NULL: the profile linked to it in discord_links whose role is gedu at the moment of asking, and among several such the most recently linked (linked_at, then profile id). The one definition of "the acting gedu" — require_discord_linked_gedu raises over it, and a reader that must know whether a gedu is the one their Discord account acts as compares against it. Granted to nobody.';


--
-- Name: FUNCTION discord_acting_gedu(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.discord_acting_gedu(p_discord_user_id text) FROM PUBLIC;


