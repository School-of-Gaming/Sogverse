--
-- Name: request_gamer_verification_email(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Guard first. A gamer id that does not exist and one belonging to another
  -- family are refused identically, so this cannot be used to ask whether an id
  -- is somebody's child.
  IF p_gamer_id IS NULL OR NOT public.is_parent_of(p_gamer_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock keyed to the SUBJECT, matching the key the count below uses:
  -- two concurrent requests about the same child must serialize; two about
  -- different children need not.
  PERFORM pg_advisory_xact_lock(hashtext(p_gamer_id::text));

  SELECT count(*) INTO v_count
  FROM public.verification_email_requests
  WHERE user_id = p_gamer_id
    AND created_at > now() - interval '1 hour';

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429. The same six as the self-serve sibling.
  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO public.verification_email_requests (user_id)
  VALUES (p_gamer_id);

  -- The same self-prune on the same terms: nothing reads these rows but the
  -- count above, and one outside the window can never change it again. Scoped to
  -- the subject, under the lock already held.
  DELETE FROM public.verification_email_requests
  WHERE user_id = p_gamer_id
    AND created_at <= now() - interval '1 hour';

  RETURN true;
END;
$$;


--
-- Name: FUNCTION request_gamer_verification_email(p_gamer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) IS 'The parent-scoped sibling of request_my_verification_email: a PARENT asks for the verification mail on behalf of a named child, because a child in sign-in mode `email` cannot sign in until that address is verified and so cannot ask for themselves. Guard-first on is_parent_of, so another family''s child and an id that does not exist are refused identically (42501) and neither answer can be read as an oracle. The rate-limit state is keyed on the GAMER rather than on the caller — a parent of four gets four independent hourly allowances, because the shared mail quota this protects is spent per address — and is otherwise the same six-per-hour window, the same false-rather-than-raise refusal the route maps to 429, and the same prune of the subject''s own expired rows.';


--
-- Name: FUNCTION request_gamer_verification_email(p_gamer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) TO service_role;


