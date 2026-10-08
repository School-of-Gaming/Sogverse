--
-- Name: enqueue_passed_substitution_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_passed_substitution_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request_id uuid;
  v_count      integer := 0;
BEGIN
  -- Nothing writes to a request when its date passes, so without this its
  -- messages would keep offering buttons the write would refuse. "Yesterday"
  -- in the product's own zone catches every request exactly once, on the
  -- first run after its local midnight.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
      JOIN public.substitution_notifications n ON n.request_id = r.id
      JOIN public.product_groups g             ON g.id = r.group_id
      JOIN public.products p                   ON p.id = g.product_id
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date = (now() AT TIME ZONE p.timezone)::date - 1
     ORDER BY r.id
  LOOP
    PERFORM public.enqueue_substitution_notification(v_request_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION enqueue_passed_substitution_notifications(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_passed_substitution_notifications() IS 'The daily close-out: files in the notification outbox every ANNOUNCED request still open whose session date was yesterday in its product''s zone, so the sync redraws its messages as past and their buttons close. Returns how many it filed. Run by the pg_cron job substitution-notifications-close-out at 00:15 UTC, after local midnight in every European zone (UTC+0 to UTC+3) all year; a product in a zone west of UTC is closed out up to a day after its local midnight, never missed. A run that does not happen leaves that day''s requests with buttons the write refuses. Granted to the service role, so it can be run by hand and by the DB tests.';


--
-- Name: FUNCTION enqueue_passed_substitution_notifications(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_passed_substitution_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_passed_substitution_notifications() TO service_role;


