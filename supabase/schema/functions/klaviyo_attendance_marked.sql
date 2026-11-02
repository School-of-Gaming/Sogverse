--
-- Name: klaviyo_attendance_marked(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.klaviyo_attendance_marked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_session_date date;
  v_starts_at    timestamp with time zone;
  v_product_id   uuid;
  v_customer_id  uuid;
BEGIN
  SELECT gs.session_date, gs.starts_at, g.product_id
    INTO v_session_date, v_starts_at, v_product_id
    FROM public.group_sessions gs
    JOIN public.product_groups g ON g.id = gs.group_id
   WHERE gs.id = NEW.session_id;

  -- The parent is the customer of the seat the participant holds on the
  -- session's product. A mark is only written for a seat held in the group,
  -- but the seat may have moved or gone since; an active one is preferred,
  -- and with none at all there is nobody to tell.
  SELECT part.customer_id
    INTO v_customer_id
    FROM public.participations part
   WHERE part.product_id = v_product_id
     AND part.participant_id = NEW.participant_id
   ORDER BY (part.status = 'active'::public.participation_status) DESC,
            part.signed_up_at DESC, part.id
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.enqueue_klaviyo_event(
    'session'::public.klaviyo_event_kind,
    NEW.id, v_customer_id, v_product_id,
    NEW.recorded_at,
    public.klaviyo_seat_holder_facts(NEW.participant_id, v_customer_id)
      || jsonb_build_object(
           'attended',          NEW.status = 'present',
           'session_date',      v_session_date,
           'session_starts_at', v_starts_at
         ),
    'session:' || NEW.session_id::text || ':' || NEW.participant_id::text || ':' || NEW.status
  );

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION klaviyo_attendance_marked(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.klaviyo_attendance_marked() IS 'Trigger on session_attendance, after an insert or a change of status: files a session event for the parent of the seat the participant holds on the session''s product (an active seat preferred; none, nothing filed), under the unique id `session:<session id>:<participant id>:<status>`, occurring at the mark''s recorded_at, with attended, the session''s session_date and session_starts_at, and klaviyo_seat_holder_facts. A deleted mark files nothing. Granted to nobody.';


--
-- Name: FUNCTION klaviyo_attendance_marked(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.klaviyo_attendance_marked() FROM PUBLIC;


