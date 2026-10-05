--
-- Name: get_assigned_products_for_discord_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN QUERY
  SELECT * FROM public.gedu_assigned_products(v_gedu_id);
END;
$$;


--
-- Name: FUNCTION get_assigned_products_for_discord_user(p_discord_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) IS 'get_my_assigned_products for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_assigned_products for that gedu, so the rows are the very rows the web reads. For the Discord bot, on the service-role client: granted to service_role alone.';


--
-- Name: FUNCTION get_assigned_products_for_discord_user(p_discord_user_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_assigned_products_for_discord_user(p_discord_user_id text) TO service_role;


