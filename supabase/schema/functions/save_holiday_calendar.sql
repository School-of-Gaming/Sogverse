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
  v_breaks jsonb := COALESCE(p_breaks, '[]'::jsonb);
  v_clash  record;
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

  IF jsonb_typeof(v_breaks) <> 'array' THEN
    RAISE EXCEPTION 'The breaks must be a list'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The payload as rows, once, so every check below reads the same values.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.holiday_calendar_payload (
    ordinal    integer,
    break_id   uuid,
    start_date date,
    end_date   date,
    names      jsonb
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.holiday_calendar_payload;

  INSERT INTO pg_temp.holiday_calendar_payload
  SELECT e.ordinal,
         NULLIF(e.value->>'id', '')::uuid,
         NULLIF(e.value->>'start_date', '')::date,
         NULLIF(e.value->>'end_date', '')::date,
         COALESCE(e.value->'names', '[]'::jsonb)
    FROM jsonb_array_elements(v_breaks) WITH ORDINALITY AS e(value, ordinal);

  FOR v_entry IN SELECT * FROM pg_temp.holiday_calendar_payload ORDER BY ordinal
  LOOP
    IF v_entry.start_date IS NULL OR v_entry.end_date IS NULL THEN
      RAISE EXCEPTION 'Every break needs a first and a last day'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry.end_date < v_entry.start_date THEN
      RAISE EXCEPTION 'A break cannot end (%) before it begins (%)',
                      v_entry.end_date, v_entry.start_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_typeof(v_entry.names) <> 'array'
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_entry.names)) THEN
      RAISE EXCEPTION 'The break from % to % needs a name in at least one language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
         SELECT 1
           FROM jsonb_array_elements(v_entry.names) AS n(value)
          WHERE btrim(COALESCE(n.value->>'locale', '')) = ''
             OR btrim(COALESCE(n.value->>'name', '')) = ''
       ) THEN
      RAISE EXCEPTION 'A name of the break from % to % is blank, or has no language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
         SELECT 1
           FROM jsonb_array_elements(v_entry.names) AS n(value)
          GROUP BY btrim(n.value->>'locale')
         HAVING count(*) > 1
       ) THEN
      RAISE EXCEPTION 'The break from % to % has two names in one language',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;

    -- A stored break is edited only by its own calendar's save: an id from
    -- another calendar, or one no break has, is refused rather than moved or
    -- recreated.
    IF v_entry.break_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.holiday_breaks b
              WHERE b.id          = v_entry.break_id
                AND b.calendar_id = v_id
           ) THEN
      RAISE EXCEPTION 'The break from % to % is not one of this calendar''s breaks',
                      v_entry.start_date, v_entry.end_date
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF EXISTS (
       SELECT 1
         FROM pg_temp.holiday_calendar_payload
        WHERE break_id IS NOT NULL
        GROUP BY break_id
       HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'A break appears twice in the list'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The payload is the calendar's whole set of breaks afterwards, so checking
  -- it against itself is checking the calendar.
  SELECT a.start_date AS a_start, a.end_date AS a_end,
         b.start_date AS b_start, b.end_date AS b_end
    INTO v_clash
    FROM pg_temp.holiday_calendar_payload a
    JOIN pg_temp.holiday_calendar_payload b
      ON a.ordinal < b.ordinal
     AND a.start_date <= b.end_date
     AND b.start_date <= a.end_date
   ORDER BY a.ordinal, b.ordinal
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'The breaks from % to % and from % to % overlap',
                    v_clash.a_start, v_clash.a_end, v_clash.b_start, v_clash.b_end
      USING ERRCODE = 'check_violation';
  END IF;

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

COMMENT ON FUNCTION public.save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) IS 'Internal: the body both calendar writers share — validate a whole calendar (its name, and every break it should hold afterwards), then write it. NULL p_id creates; otherwise that calendar is edited, and its caller has already checked it exists and locked it. A break with an id is that stored break, its dates updated only when they changed; one without is inserted; a stored break missing from the payload is deleted; each break''s names are replaced by the payload''s. Refuses with a check_violation sentence: a blank or taken name, a break with a missing day, ending before it begins, with no name or a blank one or two in one language, an id that is not one of this calendar''s breaks or appears twice, and two breaks of the calendar that overlap. Makes no role test and is granted to nobody: create_holiday_calendar and update_holiday_calendar are its only callers, and each guards first.';


--
-- Name: FUNCTION save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_holiday_calendar(p_id uuid, p_name text, p_breaks jsonb) FROM PUBLIC;


