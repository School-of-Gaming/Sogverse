--
-- Name: gedu_assigned_products(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gedu_assigned_products(p_gedu_id uuid) RETURNS TABLE(group_id uuid, product jsonb, group_count integer, participant_count integer, kind text, substitution_date date, substitution_cancelled boolean, upcoming_sessions jsonb, substitution_starts_at timestamp with time zone, substitution_ends_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
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
    false,
    public.group_upcoming_planned_sessions(a.group_id),
    NULL::timestamptz,
    NULL::timestamptz
  FROM public.gedu_group_assignments a
  JOIN public.products p ON p.id = a.product_id
  WHERE a.gedu_id = p_gedu_id

  UNION ALL

  -- The gedu's UNEXPIRED substitutions: one row per substituted (group, date) the gedu
  -- still holds. `gedu_holds_unexpired_substitution` carries the whole of that — it is
  -- keyed to the gedu asked about, requires the holder to still be certified, and applies
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
    -- Asked of the substituted date itself: the card stands for days after
    -- its date, so the flag has to hold once the date is behind today.
    public.group_session_is_cancelled(r.group_id, r.session_date),
    -- A substitution is one afternoon, not a run: its card and the picker read
    -- the substituted session's own instants below, never the group's plan.
    '[]'::jsonb,
    lower(sw.session_window),
    upper(sw.session_window)
  FROM public.session_substitution_requests r
  JOIN public.product_groups g ON g.id = r.group_id
  JOIN public.products p       ON p.id = g.product_id
  -- NULL on a date the plan no longer has: the card then states the date alone.
  CROSS JOIN LATERAL public.derive_group_session_window(r.group_id, r.session_date) AS sw(session_window)
  WHERE r.substitute_id = p_gedu_id
    AND r.status     = 'substituted'::public.substitution_request_status
    AND public.gedu_holds_unexpired_substitution(p_gedu_id, r.group_id, r.session_date)

  UNION ALL

  -- The gedu's TRAINEE seats, one row per seat, shaped like an assignment
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
    false,
    public.group_upcoming_planned_sessions(t.group_id),
    NULL::timestamptz,
    NULL::timestamptz
  FROM public.gedu_group_trainees t
  JOIN public.products p ON p.id = t.product_id
  WHERE t.gedu_id = p_gedu_id;
END;
$$;


--
-- Name: FUNCTION gedu_assigned_products(p_gedu_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) IS 'Every product the given gedu has a seat on, one row per seat, with the product as session_product_document describes it — the one shell every substitution surface shares, slots included — how many groups it has and how many active seats (participant_count — a seat may be held by an adult as well as by a child). THREE KINDS OF SEAT, discriminated by `kind`: an `assignment` row per gedu_group_assignments row, with `substitution_date` null; a `substitution` row per UNEXPIRED substitution date, with `substitution_date` set — a `substituted` request whose holder is still certified and whose window has not closed, which is the whole of what gedu_holds_unexpired_substitution decides; and a `trainee` row per gedu_group_trainees seat, shaped like an assignment row (substitution_date null, substitution_cancelled false). gedu_holds_unexpired_substitution rather than gedu_substitutes_session, and the difference is the point: this read draws the substitution CARD on My SOG, which stands from approval, where the workspace the card links to opens 48 hours before the substituted session. A substitution row therefore reaches a sub who cannot yet open the group, and carries nothing that would not be theirs to read then: the product shell, a date, two head counts; `substitution_cancelled` — whether the substituted date itself is cancelled (group_session_is_cancelled), asked of the date because the substitution card stands for days after it, and false on the other kinds; and `substitution_starts_at`/`substitution_ends_at` — the substituted session''s instants, derive_group_session_window''s bounds, NULL where the plan has no session on the date (an orphaned date, or one outside the term) and NULL on the other kinds. `upcoming_sessions` is the standing seat''s group''s plan (group_upcoming_planned_sessions: {session_date, starts_at, ends_at, cancelled} from the day before the product-local today to the group''s plan horizon), which the card names its next session from and the absence picker lists; the empty array on a substitution row, which is one afternoon rather than a run. One RPC rather than three because the kinds share every product fact and the dashboard card differs in its chrome rather than in the facts it needs.';


--
-- Name: FUNCTION gedu_assigned_products(p_gedu_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gedu_assigned_products(p_gedu_id uuid) FROM PUBLIC;


