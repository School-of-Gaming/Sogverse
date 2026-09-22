--
-- Name: assert_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_admin() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('admin');
END;
$$;


--
-- Name: FUNCTION assert_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_admin() TO authenticated;
GRANT ALL ON FUNCTION public.assert_admin() TO service_role;


