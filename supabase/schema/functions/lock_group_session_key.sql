--
-- Name: lock_group_session_key(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  -- The two-int form keeps this keyspace apart from the single-bigint locks
  -- other functions take on a user id.
  SELECT pg_advisory_xact_lock(hashtext(p_group_id::text), hashtext(p_session_date::text));
$$;


--
-- Name: FUNCTION lock_group_session_key(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) IS 'Transaction-scoped advisory lock on one (group, date) session key. Taken by ensure_group_session on every session write and by cancel_session / restore_session, so no write can land past a cancellation committed beside it.';


--
-- Name: FUNCTION lock_group_session_key(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) TO service_role;


