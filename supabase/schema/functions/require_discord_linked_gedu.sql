--
-- Name: require_discord_linked_gedu(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid := public.discord_acting_gedu(p_discord_user_id);
BEGIN
  IF v_gedu_id IS NULL THEN
    RAISE EXCEPTION 'DISCORD_GEDU_NOT_LINKED' USING ERRCODE = 'P0031';
  END IF;

  RETURN v_gedu_id;
END;
$$;


--
-- Name: FUNCTION require_discord_linked_gedu(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as (discord_acting_gedu), refusing with P0031 (DISCORD_GEDU_NOT_LINKED) when there is none — no link at all, links only to non-gedu accounts, or a NULL id — which the bot answers by asking the person to link their account. Every Discord wrapper calls it first. Granted to nobody.';


--
-- Name: FUNCTION require_discord_linked_gedu(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) FROM PUBLIC;


