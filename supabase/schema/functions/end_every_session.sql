--
-- Name: end_every_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION end_every_session(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.end_every_session(p_user_id uuid) IS 'Ends every session the named auth user holds, on every device: their refresh tokens and session rows are deleted, so no refresh succeeds and the auth server refuses any access token already issued. Raises when no such user exists. Called by the admin route that moves an account''s sign-in address, through the service role, because GoTrue''s own sign-out can only end the sessions of the token asking. service_role only: it bypasses every check on who is asking.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: FUNCTION end_every_session(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_every_session(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_every_session(p_user_id uuid) TO service_role;


