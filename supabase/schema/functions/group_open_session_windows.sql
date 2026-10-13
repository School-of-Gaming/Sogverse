--
-- Name: group_open_session_windows(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamp with time zone DEFAULT now()) RETURNS TABLE(session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone, opens_at timestamp with time zone, closes_at timestamp with time zone, cancelled boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT windowed.session_date,
         windowed.starts_at,
         windowed.ends_at,
         windowed.opens_at,
         windowed.closes_at,
         windowed.cancelled
    FROM (
          SELECT planned.session_date,
                 planned.starts_at,
                 planned.ends_at,
                 planned.starts_at - margin.lead_in AS opens_at,
                 planned.ends_at   + margin.tail    AS closes_at,
                 g.id = ANY (planned.cancelled_group_ids) AS cancelled
            FROM public.product_groups g
            JOIN public.products p ON p.id = g.product_id
                 -- The voice join margins: the room opens this long before a
                 -- session starts and stays open this long after it ends. The
                 -- client's countdown reads the same two values from its own
                 -- voice constants, and a db test pins the two together.
           CROSS JOIN (
                 SELECT interval '5 minutes' AS lead_in,
                        interval '5 minutes' AS tail
                 ) AS margin
                 -- The day before and the day after the product-local date of
                 -- `at`, as calendar dates: a session dated yesterday can still
                 -- be running past midnight, and one dated tomorrow can have
                 -- its lead-in before midnight.
           CROSS JOIN LATERAL public.planned_group_sessions(
                 p.id,
                 (p_at AT TIME ZONE p.timezone)::date - 1,
                 (p_at AT TIME ZONE p.timezone)::date + 1
                 ) AS planned
           WHERE g.id = p_group_id
         ) AS windowed
   WHERE windowed.opens_at <= p_at
     AND p_at < windowed.closes_at
   -- Two slots' windows can overlap. The earliest-opening one comes first,
   -- deterministically, so two callers a moment apart agree on the room.
   ORDER BY windowed.opens_at, windowed.closes_at;
$$;


--
-- Name: FUNCTION group_open_session_windows(p_group_id uuid, p_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamp with time zone) IS 'The group''s planned sessions (planned_group_sessions) whose voice join window — five minutes before the start to five minutes after the end — contains p_at, earliest-opening first, with whether the group has cancelled that date. The one definition of "the session window open now": the voice token route and ensure_chat_channel both take its first row. A date outside the product''s term has no session and so no window. p_at defaults to now() and is a parameter so a test can set the clock. Service role only: the cancellation flag is staff data, and every caller that needs the answer on a participant''s behalf reaches it through its own guard.';


--
-- Name: FUNCTION group_open_session_windows(p_group_id uuid, p_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamp with time zone) TO service_role;


