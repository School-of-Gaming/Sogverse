--
-- Name: holiday_change_impact(uuid, daterange[], daterange[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]) RETURNS jsonb
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
  -- holiday is judged by the date alone. A (group, date) a cancellation sits on
  -- is left out of both: the holiday coming or going does not change that it
  -- is not running, since the cancellation stays in force wherever the plan
  -- projects the date or a record is stored on it.
  stored AS (
    SELECT gs.group_id, g.name AS group_name, gs.session_date
      FROM public.product_groups g
      JOIN public.group_sessions gs ON gs.group_id = g.id
     WHERE g.product_id = p_product_id
       AND EXISTS (SELECT 1 FROM changed c WHERE c.r @> gs.session_date)
       AND NOT EXISTS (
             SELECT 1 FROM public.session_cancellations sc
              WHERE sc.group_id = gs.group_id
                AND sc.session_date = gs.session_date
           )
  ),
  requested AS (
    SELECT r.id AS request_id, r.group_id, g.name AS group_name,
           r.session_date, r.status
      FROM public.product_groups g
      JOIN public.session_substitution_requests r ON r.group_id = g.id
     WHERE g.product_id = p_product_id
       AND r.status <> 'withdrawn'
       AND EXISTS (SELECT 1 FROM changed c WHERE c.r @> r.session_date)
       AND NOT EXISTS (
             SELECT 1 FROM public.session_cancellations sc
              WHERE sc.group_id = r.group_id
                AND sc.session_date = r.session_date
           )
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


--
-- Name: FUNCTION holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]) IS 'Internal: what replacing a product''s holiday ranges p_before with p_after would change, as one entry of preview_holiday_calendar_change''s products — {product_id, product_type, timezone, today (product-local), translations [{locale, name}], removed and restored [{session_date, starts_at, ends_at}], records [{group_id, group_name, session_date, effect hidden|shown}], requests [{request_id, group_id, group_name, session_date, status, effect no_session|reopened}]} — or NULL when nothing changes. A date changes when it is inside some range of one set and no range of the other; a date both sets cover, through another calendar, does not. removed and restored are the planned sessions on such dates, read from planned_session_dates with its holidays included, so the term and the schedule clip them, past and future alike; records are the stored group_sessions rows on them and requests the session_substitution_requests that are not withdrawn, whether or not the plan still projects the date, since a holiday is judged by the date alone — except where a session_cancellations row sits on that group and date, which is not running either way and so changes nothing. Each list soonest first. Reads every row as its caller; granted to service_role only, and called by the admin-gated preview.';


--
-- Name: FUNCTION holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.holiday_change_impact(p_product_id uuid, p_before daterange[], p_after daterange[]) TO service_role;


