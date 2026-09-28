-- The My SOG cards know which upcoming sessions are cancelled.
--
-- A family's and a gedu's My SOG card names the next session from the
-- product's schedule, client-side. It now skips a cancelled one, names the
-- cancelled dates that fall before the next session that runs, and never
-- lights the Join for a cancelled session; the gedu's "can't make this
-- session" picker stops offering a cancelled date. Both need the group's
-- upcoming cancelled dates beside the schedule they already read, and they get
-- the dates alone: the reason and who cancelled stay admin-only.
--
-- THE WINDOW
--
-- From the day before product-local today onwards. The day before is there so
-- a session that began before local midnight and is still running (or still
-- inside its voice window) is still known to be cancelled; nothing earlier is
-- a card's business. There is no upper bound: an admin cancels a handful of
-- dates, and the picker walks a dated run to its last day.
--
-- Every date carried is one group_session_is_cancelled holds true for, so an
-- inert cancellation (a date the schedule stopped projecting, with no record)
-- is never surfaced here either.

-- ---------------------------------------------------------------------------
-- The shared window
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) RETURNS date[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(array_agg(c.session_date ORDER BY c.session_date), '{}'::date[])
    FROM public.session_cancellations c
    JOIN public.product_groups g ON g.id = c.group_id
    JOIN public.products p       ON p.id = g.product_id
   WHERE c.group_id = p_group_id
     AND c.session_date >= (now() AT TIME ZONE p.timezone)::date - 1
     AND public.group_session_is_cancelled(c.group_id, c.session_date);
$$;

COMMENT ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) IS 'The group''s cancelled session dates in effect (group_session_is_cancelled) from the day before product-local today onwards, ascending; empty when there are none. Dates only — no reason, stamp or author — because it feeds the gedu and family My SOG reads. The day before is kept so a session still running past local midnight is known to be cancelled. Private: called only from the SECURITY DEFINER reads that carry it.';

REVOKE ALL ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_upcoming_cancelled_dates(p_group_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- The gedu's seats carry their group's upcoming cancelled dates
-- ---------------------------------------------------------------------------
--
-- New output columns change the RETURNS TABLE, which CREATE OR REPLACE
-- cannot do, so the function is dropped and recreated with its grants
-- re-issued. Its body is otherwise unchanged.
--
-- A substitution row also says whether its own date is cancelled. The window
-- above ends where a card's interest in the NEXT session does, but a
-- substitution card stands for days after the substituted date, so it asks the
-- predicate of that date directly.

DROP FUNCTION public.get_my_assigned_products();

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- Two arms, discriminated by `kind`, because a gedu's dashboard now has two
  -- kinds of thing on it: a standing ASSIGNMENT (one row per assignment, as
  -- before, `substitution_date` null) and an unexpired SUBSTITUTION (one row per substituted
  -- date, `substitution_date` set). They share every product-shell column, which is why
  -- they are one RPC rather than two — the card the dashboard draws differs in
  -- its chrome, not in the facts it needs.
  RETURN QUERY
  SELECT
    p.id            AS product_id,
    a.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'assignment'::text AS kind,
    NULL::date         AS substitution_date,
    public.group_upcoming_cancelled_dates(a.group_id) AS cancelled_dates,
    false              AS substitution_cancelled
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id

  UNION ALL

  -- The caller's UNEXPIRED substitutions: one row per substituted (group, date) the caller
  -- still holds. `gedu_holds_unexpired_substitution` carries the whole of that — it is
  -- keyed to auth.uid(), requires the holder to still be certified, and applies
  -- the window's END — so nothing here restates any of it. The status test
  -- beside it is not redundant either: it is what makes the join read as "a
  -- substituted request", and the predicate then decides whether it is still
  -- current.
  --
  -- Deliberately NOT gedu_substitutes_session, which would also require the session
  -- to be within 48 hours: this is the row the substitution card on My SOG is drawn
  -- from, and a sub has to see the afternoon they accepted from the moment it
  -- is theirs, not from the moment they can open the group. The workspace the
  -- card links to is the thing that stays shut, and it is gated on
  -- gedu_substitutes_session like every other access surface.
  SELECT
    p.id            AS product_id,
    r.group_id      AS group_id,
    p.timezone      AS timezone,
    p.start_date    AS start_date,
    p.end_date      AS end_date,
    p.is_remote     AS is_remote,
    p.product_type  AS product_type,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb) AS product_translations,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb) AS schedule_slots,
    (
      SELECT COUNT(*)::INTEGER
        FROM product_groups pg
       WHERE pg.product_id = p.id
    ) AS group_count,
    (
      SELECT COUNT(*)::INTEGER
        FROM participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ) AS participant_count,
    'substitution'::text   AS kind,
    r.session_date  AS substitution_date,
    public.group_upcoming_cancelled_dates(r.group_id) AS cancelled_dates,
    -- Asked of the substituted date itself rather than read out of
    -- `cancelled_dates`: that window starts the day before today, and the card
    -- stands for days after its date, so a cancelled substitution would
    -- otherwise read as running once its date fell out of the window.
    public.group_session_is_cancelled(r.group_id, r.session_date) AS substitution_cancelled
  FROM session_substitution_requests r
  JOIN product_groups g ON g.id = r.group_id
  JOIN products p       ON p.id = g.product_id
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date);
END;
$$;

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu has a seat on, one row per seat, with the product shell, its schedule slots, how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). Gedu-gated on its first statement. TWO KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; and a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides. That predicate rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: names, a type, a date, the schedule, two head counts, and `cancelled_dates` — the row''s group''s upcoming cancelled dates (group_upcoming_cancelled_dates), dates only, which the card skips when naming the next session and the absence picker never offers; and `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date rather than of that window because the substitution card stands for days after it, and false on an assignment row. One RPC rather than two because the two kinds share every product-shell column and the dashboard card differs in its chrome rather than in the facts it needs.';

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;

-- ---------------------------------------------------------------------------
-- A family's seats: the upcoming cancelled dates of each placed seat's group
-- ---------------------------------------------------------------------------
--
-- The family dashboards read their seats through RLS on participations, and no
-- client role can read session_cancellations, so the dates come from a
-- self-scoped read beside it, keyed by participation exactly as the
-- subscription-state signals are.

CREATE FUNCTION public.get_my_session_cancellations() RETURNS TABLE(participation_id uuid, session_date date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id, d.session_date
    FROM public.participations p
   CROSS JOIN LATERAL unnest(public.group_upcoming_cancelled_dates(p.group_id)) AS d(session_date)
   WHERE p.status = 'active'::public.participation_status
     AND p.group_id IS NOT NULL
     AND (
           p.customer_id    = (SELECT auth.uid())
        OR p.participant_id = (SELECT auth.uid())
         );
$$;

COMMENT ON FUNCTION public.get_my_session_cancellations() IS 'The upcoming cancelled session dates (group_upcoming_cancelled_dates) of every placed, active seat the caller is party to — as the buyer or as the one in the seat — one row per (participation, date). Dates only: a family never learns the reason or who cancelled. Takes no argument, so the set is defined by auth.uid() alone. Feeds the My SOG enrollment cards, which skip a cancelled date when naming the next session and name the cancelled ones before it.';

REVOKE ALL ON FUNCTION public.get_my_session_cancellations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_session_cancellations() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_session_cancellations() TO service_role;
