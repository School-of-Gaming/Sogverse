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
  -- messages would keep offering buttons the write would refuse. Drawn open
  -- and dated before the product's today is exactly a request whose messages
  -- are behind the clock; once the sync draws it past, it is never filed here
  -- again. A request already in the outbox is left alone: it will be synced
  -- anyway, and filing it again would reset a failing row's backoff.
  FOR v_request_id IN
    SELECT r.id
      FROM public.session_substitution_requests r
      JOIN public.substitution_notifications n ON n.request_id = r.id
      JOIN public.product_groups g             ON g.id = r.group_id
      JOIN public.products p                   ON p.id = g.product_id
     WHERE n.drawn_state = 'open'::public.substitution_notification_state
       AND r.session_date < (now() AT TIME ZONE p.timezone)::date
       AND NOT EXISTS (
             SELECT 1
               FROM public.substitution_notification_outbox o
              WHERE o.request_id = r.id
           )
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

COMMENT ON FUNCTION public.enqueue_passed_substitution_notifications() IS 'The close-out: files in the notification outbox every ANNOUNCED request whose messages were last drawn open (substitution_notifications.drawn_state) and whose session date is before today in its product''s zone, so the sync redraws them as past and their buttons close. A request already in the outbox is skipped, so a failing row keeps its backoff. Each passed request is filed once: the sync then records it drawn past. Returns how many it filed. Run by the app''s observation route whenever an admin opens the Substitutions page or a gedu opens their pool, so a request''s buttons stay up until somebody looks. Granted to the service role.';


--
-- Name: FUNCTION enqueue_passed_substitution_notifications(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enqueue_passed_substitution_notifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_passed_substitution_notifications() TO service_role;


