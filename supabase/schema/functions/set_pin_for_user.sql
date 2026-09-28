--
-- Name: set_pin_for_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update customer_profiles
    set pin_hash = crypt(p_pin, gen_salt('bf'))
    where user_id = p_user_id;

  if not found then
    raise exception 'No customer profile for user %', p_user_id;
  end if;
end;
$_$;


--
-- Name: FUNCTION set_pin_for_user(p_user_id uuid, p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_pin_for_user(p_user_id uuid, p_pin text) TO service_role;


