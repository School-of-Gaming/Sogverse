--
-- Name: request_my_verification_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_my_verification_email() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_count   integer;
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but a request row attributed to nobody would count
  -- against nobody, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock keyed to the caller: without it two concurrent requests both
  -- read the same count and both pass, which is precisely the bypass a
  -- database-side limit exists to close.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT count(*) INTO v_count
  FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at > now() - interval '1 hour';

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO public.verification_email_requests (user_id)
  VALUES (v_user_id);

  -- These rows are pure bookkeeping — nothing reads them but the count above,
  -- and one older than the window can never change that count again — so the
  -- RPC self-prunes instead of leaving a table to grow forever. Scoped to the
  -- caller, under the lock already held.
  DELETE FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at <= now() - interval '1 hour';

  RETURN true;
END;
$$;


--
-- Name: FUNCTION request_my_verification_email(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_my_verification_email() IS 'Self-scoping rate-limit gate for the verification-email send: takes no argument and writes a verification_email_requests row for auth.uid(), refusing with false once the caller has six rows in the trailing hour. Prunes the caller''s expired rows on the way past, because nothing reads them but its own count. The route maps false to 429.';


--
-- Name: FUNCTION request_my_verification_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_my_verification_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_my_verification_email() TO authenticated;


