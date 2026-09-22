--
-- Name: get_my_gamers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_gamers() RETURNS SETOF public.profiles
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.gamer_id
  WHERE pg.parent_id = auth.uid();
END;
$$;


--
-- Name: FUNCTION get_my_gamers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_gamers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_gamers() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_gamers() TO service_role;


