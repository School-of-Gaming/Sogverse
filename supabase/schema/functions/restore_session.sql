--
-- Name: restore_session(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RAISE EXCEPTION 'restore_session needs a group and a date'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  DELETE FROM public.session_cancellations c
   WHERE c.group_id     = p_group_id
     AND c.session_date = p_session_date;

  RETURN FOUND;
END;
$$;


--
-- Name: FUNCTION restore_session(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) IS 'An admin restores a cancelled session by removing its cancellation, which reopens every write on that date and brings back any record kept on it. Idempotent: returns true when a cancellation was removed and false when there was none. Deliberately no schedule check, so an inert cancellation on a date the schedule no longer projects can still be cleared. Admin-only, guard-first.';


--
-- Name: FUNCTION restore_session(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) TO service_role;


