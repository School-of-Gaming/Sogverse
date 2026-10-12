--
-- Name: save_holiday_calendar(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_id     uuid := p_id;
  v_name   text := btrim(COALESCE(p_name, ''));
  v_entry  record;
  v_break  uuid;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'A calendar needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
       SELECT 1
         FROM public.holiday_calendars c
        WHERE lower(btrim(c.name)) = lower(v_name)
          AND c.id IS DISTINCT FROM p_id
     ) THEN
    RAISE EXCEPTION 'Another calendar is already called "%"', v_name
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.load_holiday_calendar_breaks(p_id, p_breaks);

  -- Validated; now written.
  IF v_id IS NULL THEN
    INSERT INTO public.holiday_calendars (name)
    VALUES (v_name)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.holiday_calendars
       SET name = v_name
     WHERE id = v_id;
  END IF;

  DELETE FROM public.holiday_breaks b
   WHERE b.calendar_id = v_id
     AND NOT EXISTS (
           SELECT 1
             FROM pg_temp.holiday_calendar_payload e
            WHERE e.break_id = b.id
         );

  FOR v_entry IN SELECT * FROM pg_temp.holiday_calendar_payload ORDER BY ordinal
  LOOP
    IF v_entry.break_id IS NULL THEN
      INSERT INTO public.holiday_breaks (calendar_id, start_date, end_date)
      VALUES (v_id, v_entry.start_date, v_entry.end_date)
      RETURNING id INTO v_break;
    ELSE
      v_break := v_entry.break_id;
      UPDATE public.holiday_breaks
         SET start_date = v_entry.start_date,
             end_date   = v_entry.end_date
       WHERE id = v_break
         AND (start_date, end_date)
             IS DISTINCT FROM (v_entry.start_date, v_entry.end_date);
    END IF;

    -- The names are replaced: the payload's set, and nothing else.
    INSERT INTO public.holiday_break_translations (break_id, locale, name)
    SELECT v_break, btrim(n.value->>'locale'), btrim(n.value->>'name')
      FROM jsonb_array_elements(v_entry.names) AS n(value)
    ON CONFLICT (break_id, locale) DO UPDATE
      SET name = EXCLUDED.name
      WHERE holiday_break_translations.name IS DISTINCT FROM EXCLUDED.name;

    DELETE FROM public.holiday_break_translations t
     WHERE t.break_id = v_break
       AND NOT EXISTS (
             SELECT 1
               FROM jsonb_array_elements(v_entry.names) AS n(value)
              WHERE btrim(n.value->>'locale') = t.locale
           );
  END LOOP;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) IS 'Internal: the body both calendar writers share — validate a whole calendar (its name here, and every break it should hold afterwards through load_holiday_calendar_breaks), then write it. NULL p_id creates; otherwise that calendar is edited, and its caller has already checked it exists and locked it. A break with an id is that stored break, its dates updated only when they changed; one without is inserted; a stored break missing from the payload is deleted; each break''s names are replaced by the payload''s. Refuses with a check_violation sentence: a blank or taken name, and whatever load_holiday_calendar_breaks refuses. Makes no role test and is granted to nobody: create_holiday_calendar and update_holiday_calendar are its only callers, and each guards first.';


--
-- Name: FUNCTION save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) FROM PUBLIC;


