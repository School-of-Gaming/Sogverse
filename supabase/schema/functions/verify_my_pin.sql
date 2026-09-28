--
-- Name: verify_my_pin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_my_pin(p_pin text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(
    (select pin_hash = crypt(p_pin, pin_hash)
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;


--
-- Name: FUNCTION verify_my_pin(p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.verify_my_pin(p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.verify_my_pin(p_pin text) TO service_role;


