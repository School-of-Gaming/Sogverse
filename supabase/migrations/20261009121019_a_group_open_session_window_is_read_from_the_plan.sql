-- A group's open session window is read from the plan.
--
-- The voice room's join window — a session's start less a lead-in to its end
-- plus a tail — was computed twice: by the voice token route in TypeScript,
-- walking each weekly slot back and forward a week, and by ensure_chat_channel
-- in PL/pgSQL, probing yesterday, today and tomorrow against the slots. Both
-- now read one function over the database's plan.
--
-- WHAT THIS CHANGES
--
-- 1. group_open_session_windows(group, at) — the group's planned sessions
--    whose join window contains `at`, earliest-opening first, each marked
--    cancelled or not. `at` defaults to now() and exists so a test can set the
--    clock.
-- 2. ensure_chat_channel takes the first of those windows that is not
--    cancelled, in place of its own probe of the slots. Everything else it
--    does is unchanged.
--
-- Behaviour that moves with the plan, for the voice room and the chat alike:
-- a date outside the product's term opens no window, where a matching slot
-- weekday used to open one whatever the term said; a wall-clock start that a
-- DST transition skips or repeats resolves to the instant Postgres gives it;
-- and the chat already took the earliest-opening of two overlapping windows,
-- which the voice room now does too.

-- ---------------------------------------------------------------------------
-- 1. The open windows
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamptz DEFAULT now())
    RETURNS TABLE(session_date date, starts_at timestamptz, ends_at timestamptz, opens_at timestamptz, closes_at timestamptz, cancelled boolean)
    LANGUAGE sql STABLE SECURITY INVOKER
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

COMMENT ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamptz) IS 'The group''s planned sessions (planned_group_sessions) whose voice join window — five minutes before the start to five minutes after the end — contains p_at, earliest-opening first, with whether the group has cancelled that date. The one definition of "the session window open now": the voice token route and ensure_chat_channel both take its first row. A date outside the product''s term has no session and so no window. p_at defaults to now() and is a parameter so a test can set the clock. Service role only: the cancellation flag is staff data, and every caller that needs the answer on a participant''s behalf reaches it through its own guard.';

REVOKE ALL ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_open_session_windows(p_group_id uuid, p_at timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The chat channel's window is the open window
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_chat_channel(p_group_id uuid) RETURNS SETOF public.chat_channels
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_opens timestamptz;
  v_ends  timestamptz;
  v_id    uuid;
BEGIN
  -- Guard first. A NULL group is refused outright rather than allowed to fall
  -- through the predicate — an admin passes is_voice_group_member(NULL), and a
  -- refusal is the only correct answer to "which group?" with no group named.
  IF p_group_id IS NULL OR NOT public.is_voice_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The earliest-opening window open now that the group has not cancelled: a
  -- cancelled session opens no chat, as it opens no voice room.
  SELECT w.opens_at, w.closes_at
    INTO v_opens, v_ends
    FROM public.group_open_session_windows(p_group_id) AS w
   WHERE NOT w.cancelled
   ORDER BY w.opens_at, w.closes_at
   LIMIT 1;

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

COMMENT ON FUNCTION public.ensure_chat_channel(p_group_id uuid) IS 'The current session window''s chat channel for a group, materialized if it does not exist yet. Guarded on is_voice_group_member, so exactly the people who may join the room may open its chat. Both window instants come from group_open_session_windows — the first open window the group has not cancelled — and are never accepted from the caller: they feed the family read bound, so a client-supplied value would let a member mint an arbitrary read window over the group''s history. The voice token route reads the same function, so a room and its chat agree on the window and so on the channel, whose key is (group, opening instant). Deliberately never calls ensure_group_session and never touches group_sessions: that function is unguarded behind staff-only callers, and a participant reaching it would manufacture phantom session rows in the staff feeds. Raises P0002 when no window is open, which the container renders as its one quiet "chat unavailable" line.';
