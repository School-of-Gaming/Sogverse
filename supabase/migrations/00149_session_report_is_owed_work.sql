-- A session report is owed work, exactly the way attendance is.
--
-- 00138 defined "needs attention" as one thing: a finished session, on or after
-- the enforcement epoch, some of whose CURRENT roster still has no answer. The
-- report had no say in it, deliberately — the argument at the time was that a
-- write-up was optional, so flagging its absence would be nagging a gedu for
-- work nobody had asked them for.
--
-- That argument is now out of date. The family-facing surfaces render the
-- session report as the main thing a parent or a gamer opens their page to
-- read: it is what the session *was*, as far as everyone outside staff is
-- concerned. A week marked off with nothing written is therefore not a finished
-- week — it is a week the families were told nothing about, and it is the more
-- visible of the two gaps rather than the lesser one.
--
-- So the count becomes a two-part test. An owed session is outstanding while
-- EITHER half is missing:
--
--   * some current roster member is unmarked, or
--   * no non-empty report has been written for it.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
-- The owed gate itself. An occurrence still has to be dated on or after
-- max(product start, epoch) and to have actually finished before it can be
-- counted at all, and a group with nobody on its roster still counts nothing.
-- Raising the standard must not reach backwards into the history the epoch
-- exists to exempt, and this migration touches only the predicate applied to
-- occurrences that were already inside the window.
--
-- Nor does anything about *writing*. A pre-epoch session is as recordable and as
-- reportable as it ever was; what changed is only which finished sessions the
-- platform asks after.
--
-- WHY WHITESPACE IS NOT A REPORT. The column is nullable and the write path
-- collapses an emptied editor back to NULL, so NULL is the ordinary "nothing
-- written" value — but a row can still hold '' or a stray space, and a space is
-- not a write-up. btrim() makes all three the same answer, and the client's own
-- derivation trims for the same reason, so the badge and the feed behind it
-- cannot disagree over a blank line.
--
-- Same signature, so CREATE OR REPLACE keeps the 00138 grants
-- (authenticated + service_role) and the authorization-spine classification.
CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(
  p_epoch_date date DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',         a.product_id,
               'group_id',           a.group_id,
               'group_name',         g.name,
               'group_gamer_count',  roster.roster_size,
               'site_name',          site.name,
               'attention_count',    COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name
           )
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence
         WHERE roster.roster_size > 0
           -- "Needs attention" is two questions joined by OR, and either one
           -- alone keeps the session on the list.
           AND (
             -- (1) Some of the CURRENT roster has no answer yet. Measured
             -- against the current roster, never against the stored map's keys
             -- — which is why a child joining a long-running group reopens
             -- previously-complete sessions. That is the honest reading and it
             -- is chosen with eyes open.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.gamer_id = att.gamer_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < roster.roster_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, '')) <> ''
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS
  'One row per gedu assignment for the dashboard cards: group name, that group''s gamer count, the venue name on in-person products, and how many past sessions still owe a register or a family-facing report. A finished session on or after the epoch counts until BOTH are in. The enforcement epoch travels in as an argument because it is a code constant, not a column.';
