--
-- Name: get_oauth_client(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_oauth_client(p_id uuid) RETURNS TABLE(id uuid, client_name text, client_uri text, logo_uri text, created_at timestamp with time zone, deleted_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT c.id, c.client_name, c.client_uri, c.logo_uri, c.created_at, c.deleted_at
    FROM auth.oauth_clients c
   WHERE c.id = p_id;
END;
$$;


--
-- Name: FUNCTION get_oauth_client(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_oauth_client(p_id uuid) IS 'Admin-gated read of one OAuth client registered with the project''s Supabase Auth OAuth server — an AI app that connects to the MCP endpoint — by its id, the client_id claim its tokens carry: its public description only (name, homepage, logo, when registered, when deleted), never its secret or redirect URIs. Every field but the id is what the registrant typed. A soft-deleted client is still returned, with deleted_at set; an id no client has returns no row. SECURITY DEFINER because auth.oauth_clients carries no grant for any Data API role, which is the boundary it crosses.';


--
-- Name: FUNCTION get_oauth_client(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_oauth_client(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_oauth_client(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_oauth_client(p_id uuid) TO service_role;


