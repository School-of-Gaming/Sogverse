--
-- Name: is_parent_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_parent_of(gamer_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM parent_gamer
    WHERE parent_id = auth.uid() AND gamer_id = gamer_uuid
  );
END;
$$;


--
-- Name: FUNCTION is_parent_of(gamer_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_parent_of(gamer_uuid uuid) TO service_role;


