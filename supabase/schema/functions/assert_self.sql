--
-- Name: assert_self(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_self(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF p_user_id IS NULL OR (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: FUNCTION assert_self(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_self(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_self(p_user_id uuid) TO service_role;


