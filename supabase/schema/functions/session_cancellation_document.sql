--
-- Name: session_cancellation_document(public.session_cancellations, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One shape for every reader, with the admin-only keys emitted as JSON null
  -- rather than omitted — the substitution document's convention, so no client
  -- schema branches on which keys arrived.
  SELECT jsonb_build_object(
    'session_date', p_cancellation.session_date,
    'reason',
      CASE WHEN p_include_detail THEN p_cancellation.reason END,
    'cancelled_at',
      CASE WHEN p_include_detail THEN p_cancellation.cancelled_at END,
    'cancelled_by',
      CASE WHEN p_include_detail THEN p_cancellation.cancelled_by END,
    'cancelled_by_first_name',
      CASE WHEN p_include_detail THEN (
        SELECT pr.first_name
          FROM public.profiles pr
         WHERE pr.id = p_cancellation.cancelled_by
      ) END
  );
$$;


--
-- Name: FUNCTION session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) IS 'The one wire shape of a cancellation on the staff documents: {session_date, reason, cancelled_at, cancelled_by, cancelled_by_first_name}. The last four are JSON null unless p_include_detail, which every caller sets from the CALLER being an admin: the reason is admin-only, exactly as a substitution reason is.';


--
-- Name: FUNCTION session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) TO service_role;


