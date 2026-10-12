-- A holiday calendar edit is previewed.
--
-- Editing a calendar is live: every club following it gains or loses the dates
-- at once, past months included. So before an admin saves a calendar some club
-- follows, the dialog asks what the save would do, per club: which planned
-- sessions disappear and which come back, which stored session records become
-- hidden or shown again, and which substitution requests stop having a session
-- or have one again. The question is asked with the same break payload the
-- save takes, validated by the same code, so a payload the save would refuse
-- is refused at the preview too.
--
-- A date changes only when it changes for the club: a date another followed
-- calendar already covers is a holiday before and after, and nothing is
-- listed for it.


-- ---------------------------------------------------------------------------
-- 1. The break payload is validated in one place
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.load_holiday_calendar_breaks(
  p_calendar_id uuid,
  p_breaks      jsonb
) RETURNS void
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

COMMENT ON FUNCTION public.load_holiday_calendar_breaks(uuid, jsonb) IS
  'Internal: validate a holiday calendar''s whole break payload — each '
  '{id|null, start_date, end_date, names: [{locale, name}]} — and leave it, one '
  'row per break in payload order, in the transaction''s temp table '
  'pg_temp.holiday_calendar_payload (ordinal, break_id, start_date, end_date, '
  'names) for the caller to read. p_calendar_id is the calendar the breaks would '
  'belong to, NULL for one not yet created, so a break id is accepted only when '
  'it is one of that calendar''s own. Refuses with a check_violation sentence: a '
  'payload that is not a list, a break with a missing day, ending before it '
  'begins, with no name or a blank one or two in one language, an id that is '
  'not one of this calendar''s breaks or appears twice, and two breaks that '
  'overlap. Writes nothing but the temp table. Makes no role test and is granted '
  'to nobody: save_holiday_calendar and preview_holiday_calendar_change are its '
  'only callers, so the preview refuses exactly what the save would.';

REVOKE ALL ON FUNCTION public.load_holiday_calendar_breaks(uuid, jsonb) FROM PUBLIC;


-- The save keeps its name checks and its writes, and validates the breaks
-- through the loader: the same checks in the same order, with the same
-- sentences.
CREATE OR REPLACE FUNCTION public.save_holiday_calendar(
  p_id     uuid,
  p_name   text,
  p_breaks jsonb
) RETURNS uuid
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

COMMENT ON FUNCTION public.save_holiday_calendar(uuid, text, jsonb) IS
  'Internal: the body both calendar writers share — validate a whole calendar '
  '(its name here, and every break it should hold afterwards through '
  'load_holiday_calendar_breaks), then write it. NULL p_id creates; otherwise '
  'that calendar is edited, and its caller has already checked it exists and '
  'locked it. A break with an id is that stored break, its dates updated only '
  'when they changed; one without is inserted; a stored break missing from the '
  'payload is deleted; each break''s names are replaced by the payload''s. '
  'Refuses with a check_violation sentence: a blank or taken name, and whatever '
  'load_holiday_calendar_breaks refuses. Makes no role test and is granted to '
  'nobody: create_holiday_calendar and update_holiday_calendar are its only '
  'callers, and each guards first.';

REVOKE ALL ON FUNCTION public.save_holiday_calendar(uuid, text, jsonb) FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- 2. What a change of holiday ranges does to one club
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.holiday_change_impact(
  p_product_id uuid,
  p_before     daterange[],
  p_after      daterange[]
) RETURNS jsonb
  LANGUAGE sql STABLE
  SET search_path TO ''
  AS $$
  -- The ranges in one set and not the other. Every date whose holiday standing
  -- flips lies in one of them, so nothing outside them is looked at.
  WITH changed AS (
    (SELECT u.r FROM unnest(COALESCE(p_before, '{}'::daterange[])) AS u(r)
     EXCEPT
     SELECT u.r FROM unnest(COALESCE(p_after, '{}'::daterange[])) AS u(r))
    UNION
    (SELECT u.r FROM unnest(COALESCE(p_after, '{}'::daterange[])) AS u(r)
     EXCEPT
     SELECT u.r FROM unnest(COALESCE(p_before, '{}'::daterange[])) AS u(r))
  ),
  -- The plan over each changed range, holidays included, so the term and the
  -- schedule clip it; two changed ranges may overlap, hence DISTINCT.
  planned AS (
    SELECT DISTINCT psd.session_date, psd.starts_at, psd.ends_at
      FROM changed c
     CROSS JOIN LATERAL public.planned_session_dates(
             p_product_id, lower(c.r), upper(c.r) - 1, true
           ) AS psd
  ),
  -- Every stored record and every live substitution request on a date some
  -- changed range touches, whether or not the plan still projects it: a
  -- holiday is judged by the date alone.
  stored AS (
    SELECT gs.group_id, g.name AS group_name, gs.session_date
      FROM public.product_groups g
      JOIN public.group_sessions gs ON gs.group_id = g.id
     WHERE g.product_id = p_product_id
       AND EXISTS (SELECT 1 FROM changed c WHERE c.r @> gs.session_date)
  ),
  requested AS (
    SELECT r.id AS request_id, r.group_id, g.name AS group_name,
           r.session_date, r.status
      FROM public.product_groups g
      JOIN public.session_substitution_requests r ON r.group_id = g.id
     WHERE g.product_id = p_product_id
       AND r.status <> 'withdrawn'
       AND EXISTS (SELECT 1 FROM changed c WHERE c.r @> r.session_date)
  ),
  -- Each date's standing before and after, read against the two whole sets.
  dates AS (
    SELECT d.session_date,
           EXISTS (
             SELECT 1 FROM unnest(p_before) AS b(r) WHERE b.r @> d.session_date
           ) AS was_holiday,
           EXISTS (
             SELECT 1 FROM unnest(p_after) AS a(r) WHERE a.r @> d.session_date
           ) AS is_holiday
      FROM (
             SELECT session_date FROM planned
             UNION SELECT session_date FROM stored
             UNION SELECT session_date FROM requested
           ) AS d
  ),
  impact AS (
    SELECT
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'session_date', p.session_date,
                   'starts_at',    p.starts_at,
                   'ends_at',      p.ends_at
                 )
                 ORDER BY p.session_date, p.starts_at
               )
          FROM planned p
          JOIN dates d USING (session_date)
         WHERE d.is_holiday AND NOT d.was_holiday
      ), '[]'::jsonb) AS removed,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'session_date', p.session_date,
                   'starts_at',    p.starts_at,
                   'ends_at',      p.ends_at
                 )
                 ORDER BY p.session_date, p.starts_at
               )
          FROM planned p
          JOIN dates d USING (session_date)
         WHERE d.was_holiday AND NOT d.is_holiday
      ), '[]'::jsonb) AS restored,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'group_id',     s.group_id,
                   'group_name',   s.group_name,
                   'session_date', s.session_date,
                   'effect',       CASE WHEN d.is_holiday THEN 'hidden' ELSE 'shown' END
                 )
                 ORDER BY s.session_date, s.group_name, s.group_id
               )
          FROM stored s
          JOIN dates d USING (session_date)
         WHERE d.is_holiday <> d.was_holiday
      ), '[]'::jsonb) AS records,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'request_id',   q.request_id,
                   'group_id',     q.group_id,
                   'group_name',   q.group_name,
                   'session_date', q.session_date,
                   'status',       q.status,
                   'effect',       CASE WHEN d.is_holiday THEN 'no_session' ELSE 'reopened' END
                 )
                 ORDER BY q.session_date, q.group_name, q.request_id
               )
          FROM requested q
          JOIN dates d USING (session_date)
         WHERE d.is_holiday <> d.was_holiday
      ), '[]'::jsonb) AS requests
  )
  SELECT jsonb_build_object(
           'product_id',   p.id,
           'product_type', p.product_type,
           'timezone',     p.timezone,
           'today',        (now() AT TIME ZONE p.timezone)::date,
           'translations', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object('locale', pt.locale, 'name', pt.name)
                      ORDER BY pt.locale
                    )
               FROM public.product_translations pt
              WHERE pt.product_id = p.id
           ), '[]'::jsonb),
           'removed',  i.removed,
           'restored', i.restored,
           'records',  i.records,
           'requests', i.requests
         )
    FROM public.products p
   CROSS JOIN impact i
   WHERE p.id = p_product_id
     AND (   i.removed  <> '[]'::jsonb
          OR i.restored <> '[]'::jsonb
          OR i.records  <> '[]'::jsonb
          OR i.requests <> '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.holiday_change_impact(uuid, daterange[], daterange[]) IS
  'Internal: what replacing a product''s holiday ranges p_before with p_after '
  'would change, as one entry of preview_holiday_calendar_change''s products — '
  '{product_id, product_type, timezone, today (product-local), translations '
  '[{locale, name}], removed and restored [{session_date, starts_at, ends_at}], '
  'records [{group_id, group_name, session_date, effect hidden|shown}], requests '
  '[{request_id, group_id, group_name, session_date, status, effect '
  'no_session|reopened}]} — or NULL when nothing changes. A date changes when it '
  'is inside some range of one set and no range of the other; a date both sets '
  'cover, through another calendar, does not. removed and restored are the '
  'planned sessions on such dates, read from planned_session_dates with its '
  'holidays included, so the term and the schedule clip them, past and future '
  'alike; records are the stored group_sessions rows on them and requests the '
  'session_substitution_requests that are not withdrawn, whether or not the plan '
  'still projects the date, since a holiday is judged by the date alone. Each '
  'list soonest first. Reads every row as its caller; granted to service_role '
  'only, and called by the admin-gated preview.';

REVOKE ALL ON FUNCTION public.holiday_change_impact(uuid, daterange[], daterange[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.holiday_change_impact(uuid, daterange[], daterange[]) TO service_role;


-- ---------------------------------------------------------------------------
-- 3. The preview
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.preview_holiday_calendar_change(
  p_calendar_id uuid,
  p_breaks      jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_proposed daterange[];
  v_products jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
       SELECT 1 FROM public.holiday_calendars WHERE id = p_calendar_id
     ) THEN
    RAISE EXCEPTION 'Holiday calendar not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.load_holiday_calendar_breaks(p_calendar_id, p_breaks);

  SELECT COALESCE(
           array_agg(daterange(e.start_date, e.end_date, '[]')),
           '{}'::daterange[]
         )
    INTO v_proposed
    FROM pg_temp.holiday_calendar_payload e;

  -- Per following club: before is every break of every calendar it follows;
  -- after swaps this calendar's breaks for the proposed ones.
  SELECT COALESCE(jsonb_agg(x.impact ORDER BY x.product_id), '[]'::jsonb)
    INTO v_products
    FROM (
      SELECT phc.product_id,
             public.holiday_change_impact(
               phc.product_id, before.ranges, after.ranges || v_proposed
             ) AS impact
        FROM public.product_holiday_calendars phc
       CROSS JOIN LATERAL (
             SELECT COALESCE(
                      array_agg(daterange(b.start_date, b.end_date, '[]')),
                      '{}'::daterange[]
                    ) AS ranges
               FROM public.product_holiday_calendars o
               JOIN public.holiday_breaks b ON b.calendar_id = o.calendar_id
              WHERE o.product_id = phc.product_id
             ) AS before
       CROSS JOIN LATERAL (
             SELECT COALESCE(
                      array_agg(daterange(b.start_date, b.end_date, '[]')),
                      '{}'::daterange[]
                    ) AS ranges
               FROM public.product_holiday_calendars o
               JOIN public.holiday_breaks b ON b.calendar_id = o.calendar_id
              WHERE o.product_id = phc.product_id
                AND o.calendar_id <> p_calendar_id
             ) AS after
       WHERE phc.calendar_id = p_calendar_id
    ) AS x
   WHERE x.impact IS NOT NULL;

  RETURN jsonb_build_object('products', v_products);
END;
$$;

COMMENT ON FUNCTION public.preview_holiday_calendar_change(uuid, jsonb) IS
  'Admin-gated preview of saving a holiday calendar''s breaks as p_breaks — the '
  'payload update_holiday_calendar takes, validated by the same '
  'load_holiday_calendar_breaks, so a payload the save would refuse is refused '
  'here with the same sentence. Writes nothing. Returns {products: [...]}, one '
  'holiday_change_impact entry per club following the calendar on which '
  'something would change, ordered by product id: before is every break of '
  'every calendar the club follows, after is the other calendars'' breaks plus '
  'the proposed ones, so a date another followed calendar covers changes '
  'nothing. A calendar no club follows, or an edit that changes no club''s '
  'dates, answers an empty list. An id no calendar has raises no_data_found. '
  'SECURITY DEFINER with an empty search_path — crossing into the stored '
  'session records and substitution requests, which carry no authenticated '
  'grant — guard-first on assert_admin(), not STRICT so a NULL argument cannot '
  'skip the guard.';

REVOKE ALL ON FUNCTION public.preview_holiday_calendar_change(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_holiday_calendar_change(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_holiday_calendar_change(uuid, jsonb) TO service_role;
