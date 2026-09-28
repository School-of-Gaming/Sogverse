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

COMMENT ON FUNCTION public.forfeit_password(p_user_id uuid) IS 'Sets the named auth user''s password to NULL, the state an account created through Google is in, so a password sign-in to it fails as invalid credentials; raises when no such user exists. NULL, never a random value: an unknown password is still a credential, and NULL is none; password sign-in fails against it until a new password is deliberately set. Called through the service role wherever a credential must stop working: the Google claim, when a Google identity proves the address of an account whose address was never proven (the password may belong to someone who registered under another person''s address); and a parent changing how a child signs in: moving the child to a mailbox or to parent sign-in, or withdrawing a credential that landed when any sign-in change the parent made then failed. The account''s `email` identity is left in place. service_role only: it bypasses every check on who is asking.';


--
-- Name: FUNCTION forfeit_password(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.forfeit_password(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forfeit_password(p_user_id uuid) TO service_role;


