--
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer, kind text, substitution_date date)
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
    NULL::date         AS substitution_date
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
    r.session_date  AS substitution_date
  FROM session_substitution_requests r
  JOIN product_groups g ON g.id = r.group_id
  JOIN products p       ON p.id = g.product_id
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date);
END;
$$;


--
-- Name: FUNCTION get_my_assigned_products(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu has a seat on, one row per seat, with the product shell, its schedule slots, how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). Gedu-gated on its first statement. TWO KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; and a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides. That predicate rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: names, a type, a date, the schedule, and two head counts. One RPC rather than two because the two kinds share every product-shell column and the dashboard card differs in its chrome rather than in the facts it needs.';


--
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;


