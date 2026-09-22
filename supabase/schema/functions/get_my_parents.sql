--
-- Name: get_my_parents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_parents() RETURNS SETOF public.profiles
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  INNER JOIN parent_gamer pg ON p.id = pg.parent_id
  WHERE pg.gamer_id = auth.uid();
END;
$$;


--
-- Name: FUNCTION get_my_parents(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_parents() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_parents() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_parents() TO service_role;


