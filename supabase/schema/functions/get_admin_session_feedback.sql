--
-- Name: get_admin_session_feedback(date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_admin();

  IF p_from IS NULL OR p_to IS NULL OR p_window_before_minutes IS NULL THEN
    RAISE EXCEPTION 'A range and a window are required' USING ERRCODE = '22004';
  END IF;

  IF p_from > p_to THEN
    RAISE EXCEPTION 'The range ends before it starts' USING ERRCODE = '22023';
  END IF;

  WITH
  -- Every non-empty gamer answer whose session day falls in the range. The
  -- opening instant is first narrowed by a two-day slack around the range,
  -- which no timezone offset can exceed, so the exact day is computed only for
  -- rows that can match. Seat state is deliberately not consulted: a gamer who
  -- has since left the group still answered about a session they were in.
  answered AS (
    SELECT sf.group_id,
           sf.participant_id,
           sf.answers,
           sf.note,
           sf.updated_at,
           ((sf.session_opens_at + make_interval(mins => p_window_before_minutes))
              AT TIME ZONE p.timezone)::date AS session_date
      FROM public.session_feedback sf
      JOIN public.product_groups g ON g.id = sf.group_id
      JOIN public.products p       ON p.id = g.product_id
      JOIN public.profiles pr      ON pr.id = sf.participant_id
     WHERE pr.role = 'gamer'::public.user_role
       -- A note of nothing but whitespace (newlines and tabs too, as the
       -- client's trim() reads it) is blank.
       AND NOT (sf.answers = '{}'::jsonb AND sf.note ~ '^\s*$')
       AND sf.session_opens_at >= (p_from::timestamp AT TIME ZONE 'UTC') - interval '2 days'
       AND sf.session_opens_at <  (p_to::timestamp   AT TIME ZONE 'UTC') + interval '3 days'
  ),
  responses_in_range AS (
    SELECT * FROM answered a WHERE a.session_date BETWEEN p_from AND p_to
  ),
  -- Every recorded session of an online product in the range, with how many
  -- gamers were marked present. A cancelled session is left out: it is not a
  -- session anybody could have answered about.
  sessions_in_range AS (
    SELECT s.group_id,
           s.session_date,
           (SELECT count(*)
              FROM public.session_attendance sa
              JOIN public.profiles pr ON pr.id = sa.participant_id
             WHERE sa.session_id = s.id
               AND sa.status = 'present'
               AND pr.role = 'gamer'::public.user_role) AS eligible_count
      FROM public.group_sessions s
      JOIN public.product_groups g ON g.id = s.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE p.is_remote
       AND s.session_date BETWEEN p_from AND p_to
       AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
  ),
  session_keys AS (
    SELECT group_id, session_date FROM responses_in_range
    UNION
    SELECT group_id, session_date FROM sessions_in_range
  ),
  -- The candidates who can be expected at (group, day): the group's assigned
  -- gedus, and the substitutes seated on that day who are not also assigned.
  -- The predicate decides which of them are expected.
  key_gedus AS (
    SELECT k.group_id,
           k.session_date,
           jsonb_agg(
             jsonb_build_object(
               'id',   gp.id,
               'name', concat_ws(' ', gp.first_name, NULLIF(gp.last_name, '')),
               'role', c.role
             )
             ORDER BY CASE c.role WHEN 'primary' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END,
                      gp.first_name, gp.last_name, gp.id
           ) AS gedus
      FROM session_keys k
      CROSS JOIN LATERAL (
        SELECT ga.gedu_id, ga.role::text AS role
          FROM public.gedu_group_assignments ga
         WHERE ga.group_id = k.group_id
        UNION
        SELECT r.substitute_id, 'substitute'
          FROM public.session_substitution_requests r
         WHERE r.group_id     = k.group_id
           AND r.session_date = k.session_date
           AND r.status       = 'substituted'::public.substitution_request_status
           AND NOT EXISTS (
                 SELECT 1
                   FROM public.gedu_group_assignments ga
                  WHERE ga.group_id = k.group_id
                    AND ga.gedu_id  = r.substitute_id
               )
      ) c
      JOIN public.profiles gp ON gp.id = c.gedu_id
     WHERE public.gedu_is_expected_at_session(c.gedu_id, k.group_id, k.session_date)
     GROUP BY k.group_id, k.session_date
  ),
  -- The group and product every entry names. The product's name is per
  -- locale, so every translation travels and the reader picks one.
  group_refs AS (
    SELECT g.id AS group_id,
           jsonb_build_object(
             'groupId',     g.id,
             'groupName',   g.name,
             'productId',   p.id,
             'productType', p.product_type,
             'isRemote',    p.is_remote,
             'productTranslations', COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object('locale', pt.locale, 'name', pt.name)
                        ORDER BY pt.locale
                      )
                 FROM public.product_translations pt
                WHERE pt.product_id = p.id
             ), '[]'::jsonb)
           ) AS ref
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
     WHERE g.id IN (SELECT group_id FROM session_keys)
  )
  SELECT jsonb_build_object(
    'responses', COALESCE((
      SELECT jsonb_agg(
               gr.ref || jsonb_build_object(
                 'source',      'gamer_online',
                 'sessionDate', r.session_date,
                 'respondent',  jsonb_build_object(
                   'id',   pr.id,
                   'name', concat_ws(' ', pr.first_name, NULLIF(pr.last_name, ''))
                 ),
                 'gedus',       COALESCE(kg.gedus, '[]'::jsonb),
                 'answers',     r.answers,
                 'note',        r.note,
                 -- The response rate is "of the gamers marked present, how
                 -- many answered", so only an answer from a gamer the session's
                 -- register marks present counts toward it, and a cancelled
                 -- session has no register, exactly as the sessions list reads it.
                 'countsTowardRate', EXISTS (
                   SELECT 1
                     FROM public.group_sessions s
                     JOIN public.session_attendance sa ON sa.session_id = s.id
                    WHERE s.group_id        = r.group_id
                      AND s.session_date    = r.session_date
                      AND sa.participant_id = r.participant_id
                      AND sa.status         = 'present'
                      AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
                 ),
                 'submittedAt', r.updated_at
               )
               ORDER BY r.session_date, r.group_id, r.updated_at, r.participant_id
             )
        FROM responses_in_range r
        JOIN group_refs gr      ON gr.group_id = r.group_id
        JOIN public.profiles pr ON pr.id = r.participant_id
        LEFT JOIN key_gedus kg  ON kg.group_id = r.group_id AND kg.session_date = r.session_date
    ), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(
               gr.ref || jsonb_build_object(
                 'source',        'gamer_online',
                 'sessionDate',   s.session_date,
                 'eligibleCount', s.eligible_count,
                 'gedus',         COALESCE(kg.gedus, '[]'::jsonb)
               )
               ORDER BY s.session_date, s.group_id
             )
        FROM sessions_in_range s
        JOIN group_refs gr     ON gr.group_id = s.group_id
        LEFT JOIN key_gedus kg ON kg.group_id = s.group_id AND kg.session_date = s.session_date
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$_$;


--
-- Name: FUNCTION get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) IS 'The admin feedback page''s whole read: every gamer''s feedback answer whose session day falls in [p_from, p_to], and every recorded online session in that range as the response rate''s denominator. Admin-only, guard-first on assert_admin; it crosses the boundary that session_feedback''s policies draw around each child''s own row. A row''s session day is its opening instant shifted forward by p_window_before_minutes, read in its product''s timezone — the caller passes the voice window constant so the number has one home. RESPONSES are gamers'' rows only, never an empty one (no answer and a blank note), and never filtered by whether the gamer still holds a seat: history is the point. Each carries its group and product, the respondent''s id and full name, every gedu expected at that (group, day) as decided by gedu_is_expected_at_session over the assigned gedus and the day''s seated substitutes (an assigned gedu keeps the assignment''s role; a substitute is ''substitute''), the stored answers verbatim with retired keys included, the note, the last save as submittedAt, and countsTowardRate: true exactly when a non-cancelled group_sessions row exists for that (group, day) and its session_attendance marks the respondent present, so the response rate reads "of the gamers marked present, how many answered" and can never pass 100%. SESSIONS are group_sessions rows on remote products in the range, cancelled ones left out, each with the count of gamers marked present and the same expected gedus; a session nobody was marked present at still travels. A response whose session has no recorded row travels without a partner in sessions. Every entry carries all of its product''s name translations, and the reader picks one by locale. Keys are camelCase in the shape the page''s contract parses.';


--
-- Name: FUNCTION get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_session_feedback(p_from date, p_to date, p_window_before_minutes integer) TO service_role;


