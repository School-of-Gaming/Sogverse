--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS public.user_role
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: FUNCTION get_user_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role() TO service_role;


