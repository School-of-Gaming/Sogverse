--
-- Name: pin_is_set(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pin_is_set() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(
    (select pin_hash is not null
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;


--
-- Name: FUNCTION pin_is_set(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pin_is_set() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pin_is_set() TO authenticated;
GRANT ALL ON FUNCTION public.pin_is_set() TO service_role;


