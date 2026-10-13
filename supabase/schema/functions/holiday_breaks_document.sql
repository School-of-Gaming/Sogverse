--
-- Name: holiday_breaks_document(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- The plan with its holidays, over the span, read once: the holiday rows
  -- are the sessions each break withdrew.
  WITH withdrawn AS (
    SELECT psd.session_date, psd.starts_at, psd.ends_at, psd.holiday_break_id
      FROM public.planned_session_dates(p_product_id, p_from, p_to, true) AS psd
     WHERE psd.holiday_break_id IS NOT NULL
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         hb.break_id,
               'start_date', hb.start_date,
               'end_date',   hb.end_date,
               'names', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object('locale', t.locale, 'name', t.name)
                          ORDER BY t.locale
                        )
                   FROM public.holiday_break_translations t
                  WHERE t.break_id = hb.break_id
               ), '[]'::jsonb),
               'withdrawn_sessions', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'session_date', w.session_date,
                            'starts_at',    w.starts_at,
                            'ends_at',      w.ends_at
                          )
                          ORDER BY w.session_date, w.starts_at
                        )
                   FROM withdrawn w
                  WHERE w.holiday_break_id = hb.break_id
               ), '[]'::jsonb)
             )
             ORDER BY hb.start_date, hb.break_id
           ),
           '[]'::jsonb
         )
    FROM public.product_holiday_breaks(p_product_id, p_from, p_to) AS hb;
$$;


--
-- Name: FUNCTION holiday_breaks_document(p_product_id uuid, p_from date, p_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) IS 'The `holiday_breaks` member every session document carries beside its plan: a JSON array, [] when there are none, of every break of a holiday calendar the product follows that touches [p_from, p_to] (product_holiday_breaks), ordered by first day then id, each as {id, start_date, end_date, names: [{locale, name}] in every locale written, ordered by locale, withdrawn_sessions: [{session_date, starts_at, ends_at}]}. withdrawn_sessions are the plan rows inside the span that the break removed — planned_session_dates with its holidays, tagged with this break — so a break the term or the schedule never reaches withdraws nothing, and where two calendars'' breaks overlap a date is withdrawn by the earlier one alone. The reader picks the name for its own locale; the database never chooses one. Never a calendar''s own name, which is admin-only. SECURITY INVOKER over tables whose read policies admit every followed calendar''s breaks and names to anon and authenticated alike, so it answers every caller identically.';


--
-- Name: FUNCTION holiday_breaks_document(p_product_id uuid, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.holiday_breaks_document(p_product_id uuid, p_from date, p_to date) TO service_role;


