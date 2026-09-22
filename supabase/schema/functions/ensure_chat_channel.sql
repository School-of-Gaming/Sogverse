--
-- Name: ensure_chat_channel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_chat_channel(p_group_id uuid) RETURNS SETOF public.chat_channels
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  -- The voice join margins, as SQL literals and named as such. They mirror
  -- VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES / _AFTER_MINUTES, which SQL
  -- cannot see; the db test that pins these windows against the TypeScript
  -- fixtures is what keeps the two honest.
  c_open_margin  constant interval := interval '5 minutes';
  c_close_margin constant interval := interval '5 minutes';

  v_zone       text;
  v_product_id uuid;
  v_opens      timestamptz;
  v_ends       timestamptz;
  v_id         uuid;
BEGIN
  -- Guard first. A NULL group is refused outright rather than allowed to fall
  -- through the predicate — an admin passes is_voice_group_member(NULL), and a
  -- refusal is the only correct answer to "which group?" with no group named.
  IF p_group_id IS NULL OR NOT public.is_voice_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.timezone
    INTO v_product_id, v_zone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_zone IS NOT NULL THEN
    SELECT o.opens_at, o.closes_at
      INTO v_opens, v_ends
      FROM (
        SELECT
          -- `timestamp AT TIME ZONE zone` resolves a wall clock in that zone to
          -- the right instant, so nothing here does arithmetic of its own on a
          -- local day.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone) - c_open_margin
            AS opens_at,
          -- The duration is added to the INSTANT, not to the wall clock, so a
          -- session straddling a transition keeps its real length.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone)
            + make_interval(mins => s.duration_minutes) + c_close_margin
            AS closes_at
          FROM (
            -- Yesterday, today and tomorrow AS CALENDAR DATES in the product's
            -- zone. Stepping a date is exact on any runtime; stepping an
            -- instant by 24 hours is what breaks twice a year.
            SELECT ((now() AT TIME ZONE v_zone)::date + probe.offset_days)
                     AS session_date
              FROM generate_series(-1, 1) AS probe(offset_days)
          ) cd
          JOIN public.schedule_slots s ON s.product_id = v_product_id
           -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
           WHERE s.weekday = (EXTRACT(ISODOW FROM cd.session_date)::integer - 1)
      ) o
     WHERE now() >= o.opens_at
       AND now() <  o.closes_at
     -- Two slots' windows can overlap. The TypeScript path takes whichever slot
     -- PostgREST happened to return first; this takes the earliest-opening one,
     -- deterministically, so two callers a millisecond apart cannot materialize
     -- two different channels for one room.
     ORDER BY o.opens_at, o.closes_at
     LIMIT 1;
  END IF;

  IF v_opens IS NULL THEN
    RAISE EXCEPTION 'No session window is open for this group'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insert-or-reselect, the established idempotent shape. Two joiners racing on
  -- mount is the normal case, not the exception.
  INSERT INTO public.chat_channels (
    type, group_id, session_opens_at, session_ends_at
  )
  VALUES (
    'group_session'::public.chat_channel_type, p_group_id, v_opens, v_ends
  )
  ON CONFLICT (group_id, session_opens_at) DO NOTHING
  RETURNING chat_channels.id INTO v_id;

  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM public.chat_channels c
     WHERE c.group_id = p_group_id
       AND c.session_opens_at = v_opens;
  END IF;

  RETURN QUERY
  SELECT c.* FROM public.chat_channels c WHERE c.id = v_id;
END;
$$;


--
-- Name: FUNCTION ensure_chat_channel(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_chat_channel(p_group_id uuid) IS 'The current session window''s chat channel for a group, materialized if it does not exist yet. Guarded on is_voice_group_member, so exactly the people who may join the room may open its chat. Both window instants are derived HERE, from the product''s schedule, and are never accepted from the caller: they feed the family read bound, so a client-supplied value would let a member mint an arbitrary read window over the group''s history. The window search is this function''s own PL/pgSQL port of the voice token route''s TypeScript search — join margins as SQL literals and DST-safe by stepping CALENDAR dates in the product''s zone and probing the adjacent days, never by 24-hour arithmetic. Deliberately never calls ensure_group_session and never touches group_sessions: that function is unguarded behind staff-only callers, and a participant reaching it would manufacture phantom session rows in the staff feeds. Raises P0002 when no window is open, which the container renders as its one quiet "chat unavailable" line.';


--
-- Name: FUNCTION ensure_chat_channel(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_chat_channel(p_group_id uuid) TO service_role;


