--
-- Name: forfeit_password(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forfeit_password(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- NULL, not a random value: it is the state an account created through
  -- Google is in, and the auth server refuses a password sign-in against it
  -- as invalid credentials.
  UPDATE auth.users
     SET encrypted_password = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  -- Named, so the caller learns the forfeit did not happen and withholds
  -- whatever it would have recorded on the strength of it.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forfeit_password: no auth user %', p_user_id;
  END IF;
END;
$$;


--
-- Name: FUNCTION forfeit_password(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.forfeit_password(p_user_id uuid) IS 'Sets the named auth user''s password to NULL, the state an account created through Google is in, so a password sign-in to it fails as invalid credentials; raises when no such user exists. Called only by the OAuth callback, through the service role, when a Google identity reporting the account''s own address verified signs into an account whose address was never proven: password registration does not prove the address, so the password may belong to someone who registered under another person''s address, and it is taken away along with every other session. The account''s `email` identity is left in place. A password comes back only through the ordinary reset email, which reaches the proven owner. service_role only: it bypasses every check on who is asking.';


--
-- Name: FUNCTION forfeit_password(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.forfeit_password(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forfeit_password(p_user_id uuid) TO service_role;


