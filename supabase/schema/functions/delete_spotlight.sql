--
-- Name: delete_spotlight(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_spotlight(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  DELETE FROM public.spotlights WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spotlight not found'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: FUNCTION delete_spotlight(p_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_spotlight(p_id uuid) IS 'Admin-gated removal of a spotlight outright, its versions with it (ON DELETE CASCADE). Its picture stays in the catalogue. An id no spotlight has raises no_data_found. SECURITY DEFINER because spotlights carries no write grant.';


--
-- Name: FUNCTION delete_spotlight(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_spotlight(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_spotlight(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_spotlight(p_id uuid) TO service_role;


