-- end_every_session: sign one account out of every device.
--
-- GoTrue's own sign-out is keyed on the access token of the session asking, so
-- it can only end the caller's sessions. An admin moving another account's
-- sign-in address has no token of that account's, and a sign-in that moved
-- must not leave a device holding the old one, so the sessions are ended here.

CREATE FUNCTION public.end_every_session(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Named, so the caller learns nothing was ended and does not report the
  -- change it was part of as done.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'end_every_session: no auth user %', p_user_id;
  END IF;

  -- The refresh tokens first, by user, because a token minted before sessions
  -- existed carries no session to cascade from; the rest go with their session.
  -- An access token already issued stays readable until it expires, but the
  -- auth server refuses it the moment its session row is gone.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.end_every_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_every_session(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_every_session(uuid) TO service_role;

-- forfeit_password now has three callers, and its comment names who they are.
COMMENT ON FUNCTION public.forfeit_password(uuid) IS 'Sets the named auth user''s password to NULL, the state an account created through Google is in, so a password sign-in to it fails as invalid credentials; raises when no such user exists. NULL, never a random value: an unknown password is still a credential, and NULL is none; a password comes back only through a recovery link. Called through the service role wherever a credential must stop working: by the OAuth callback when a Google identity proves the address of an account whose address was never proven (the password may belong to someone who registered under another person''s address); by the parent''s gamer route when a child leaves username sign-in, or enters email sign-in, and when a failure there must withdraw a credential the record does not know; and by the admin route that moves an email-mode child to another mailbox. The account''s `email` identity is left in place. service_role only: it bypasses every check on who is asking.';

COMMENT ON FUNCTION public.end_every_session(uuid) IS 'Ends every session the named auth user holds, on every device: their refresh tokens and session rows are deleted, so no refresh succeeds and the auth server refuses any access token already issued. Raises when no such user exists. Called by the admin route that moves an account''s sign-in address, through the service role, because GoTrue''s own sign-out can only end the sessions of the token asking. service_role only: it bypasses every check on who is asking.';
