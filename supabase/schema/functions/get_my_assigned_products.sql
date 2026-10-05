--
-- Name: get_my_assigned_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, cancelled_dates date[], substitution_cancelled boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- Three arms, discriminated by `kind`: a standing ASSIGNMENT (one row per
  -- assignment, `substitution_date` null), an unexpired SUBSTITUTION (one row
  -- per substituted date, `substitution_date` set), and a TRAINEE seat. They
  -- share every product fact, which is why they are one RPC rather than three —
  -- the card the dashboard draws differs in its chrome, not in the facts it
  -- needs — and every arm states the product through the same shell every
  -- substitution surface uses.
  RETURN QUERY
  SELECT
    a.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'assignment'::text,
    NULL::date,
    public.group_upcoming_cancelled_dates(a.group_id),
    false
  FROM public.gedu_group_assignments a
  JOIN public.products p ON p.id = a.product_id
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
    r.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'substitution'::text,
    r.session_date,
    public.group_upcoming_cancelled_dates(r.group_id),
    -- Asked of the substituted date itself rather than read out of
    -- `cancelled_dates`: that window starts the day before today, and the card
    -- stands for days after its date, so a cancelled substitution would
    -- otherwise read as running once its date fell out of the window.
    public.group_session_is_cancelled(r.group_id, r.session_date)
  FROM public.session_substitution_requests r
  JOIN public.product_groups g ON g.id = r.group_id
  JOIN public.products p       ON p.id = g.product_id
  WHERE r.substitute_id = v_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(r.group_id, r.session_date)

  UNION ALL

  -- The caller's TRAINEE seats, one row per seat, shaped like an assignment
  -- row. The card links to the trainee's own workspace.
  SELECT
    t.group_id,
    public.session_product_document(p),
    (
      SELECT count(*)::integer
        FROM public.product_groups pg
       WHERE pg.product_id = p.id
    ),
    (
      SELECT count(*)::integer
        FROM public.participations part
       WHERE part.product_id = p.id
         AND part.status     = 'active'
    ),
    'trainee'::text,
    NULL::date,
    public.group_upcoming_cancelled_dates(t.group_id),
    false
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = v_gedu_id;
END;
$$;


--
-- Name: FUNCTION get_my_assigned_products(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_assigned_products() IS 'Every product the calling gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). Gedu-gated on its first statement. THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts, and `cancelled_dates` — the row''s group''s upcoming cancelled dates (group_upcoming_cancelled_dates), dates only, which the card skips when naming the next session and the absence picker never offers; and `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date rather than of that window because the substitution card stands for days after it, and false on an assignment row. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';


--
-- Name: FUNCTION get_my_assigned_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_assigned_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_assigned_products() TO service_role;


