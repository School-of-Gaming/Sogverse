--
-- Name: get_gedu_for_discord_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN (
    SELECT jsonb_build_object(
             'profile_id', p.id,
             'locale',     p.locale
           )
      FROM public.profiles p
     WHERE p.id = v_gedu_id
  );
END;
$$;


--
-- Name: FUNCTION get_gedu_for_discord_user(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) IS 'Which gedu a Discord user id acts as (require_discord_linked_gedu, refusing with P0031 when none), as {profile_id, locale}: locale is profiles.locale as stored, NULL when the gedu has never chosen one, so the bot can fall back to the language Discord reports. For the Discord bot, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION get_gedu_for_discord_user(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_gedu_for_discord_user(p_discord_user_id text) TO service_role;


