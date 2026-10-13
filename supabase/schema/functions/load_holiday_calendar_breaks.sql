--
-- Name: load_holiday_calendar_breaks(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.load_holiday_calendar_breaks(p_calendar_id uuid, p_breaks jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_breaks jsonb := COALESCE(p_breaks, '[]'::jsonb);
  v_clash  record;
  v_entry  record;
BEGIN
  IF jsonb_typeof(v_breaks) <> 'array' THEN
    RAISE EXCEPTION 'The breaks must be a list'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The payload as rows, once, so every check below — and the caller after
  -- it — reads the same values.
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
                AND b.calendar_id = p_calendar_id
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
END;
$$;


--
-- Name: FUNCTION load_holiday_calendar_breaks(p_calendar_id uuid, p_breaks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.load_holiday_calendar_breaks(p_calendar_id uuid, p_breaks jsonb) IS 'Internal: validate a holiday calendar''s whole break payload — each {id|null, start_date, end_date, names: [{locale, name}]} — and leave it, one row per break in payload order, in the transaction''s temp table pg_temp.holiday_calendar_payload (ordinal, break_id, start_date, end_date, names) for the caller to read. p_calendar_id is the calendar the breaks would belong to, NULL for one not yet created, so a break id is accepted only when it is one of that calendar''s own. Refuses with a check_violation sentence: a payload that is not a list, a break with a missing day, ending before it begins, with no name or a blank one or two in one language, an id that is not one of this calendar''s breaks or appears twice, and two breaks that overlap. Writes nothing but the temp table. Makes no role test and is granted to nobody: save_holiday_calendar and preview_holiday_calendar_change are its only callers, so the preview refuses exactly what the save would.';


--
-- Name: FUNCTION load_holiday_calendar_breaks(p_calendar_id uuid, p_breaks jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.load_holiday_calendar_breaks(p_calendar_id uuid, p_breaks jsonb) FROM PUBLIC;


