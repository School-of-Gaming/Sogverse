--
-- Name: get_open_substitution_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_open_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The pool list: every open request the caller could actually take. The
  -- exclusion is the `may substitute` predicate itself rather than a hand-written
  -- copy of its clauses, so the list and the offer button can never disagree —
  -- a session the gedu is expected at, one they have their own request on, and
  -- their own absence are all out by construction.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being substituted belongs to the
  -- group rather than to a person the volunteer needs to know about.
  --
  -- Bounded to the next 60 days, which is a list bound and not a rule: a request
  -- further out than that exists and is staffable from the admin queue.
  --
  -- The client owns the calendar math, exactly as both feeds do — this emits the
  -- date plus the product's slots and timezone and computes no instant.
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'request_id',   r.id,
               'group_id',     r.group_id,
               'group_name',   g.name,
               'session_date', r.session_date,
               'role',         r.role,
               -- The fee for THIS role, and null when the product has not set
               -- one. Null is a blank field rather than a volunteer session: the
               -- surface shows nothing and flags nothing, which is the existing
               -- treatment of a missing assistant fee.
               'fee_cents',
                 CASE r.role
                   WHEN 'primary'::public.gedu_assignment_role
                     THEN p.primary_gedu_fee_cents
                   ELSE p.assistant_gedu_fee_cents
                 END,
               'has_offered', EXISTS (
                 SELECT 1
                   FROM public.session_substitution_offers o
                  WHERE o.request_id = r.id
                    AND o.gedu_id    = v_caller
               ),
               'product', jsonb_build_object(
                 'id',                   p.id,
                 'product_type',         p.product_type,
                 'topic',                p.topic,
                 'spoken_language_code', p.spoken_language_code,
                 'timezone',             p.timezone,
                 'is_remote',            p.is_remote,
                 'start_date',           p.start_date,
                 'end_date',             p.end_date,
                 -- The venue, on in-person products only — the same test every
                 -- other read on this surface makes, because a remote
                 -- municipality club carries a location_id (a municipality, by
                 -- CHECK) and has no building.
                 'site_name', (
                   SELECT l.name
                     FROM public.locations l
                    WHERE l.id = p.location_id
                      AND p.is_remote = false
                 ),
                 'translations', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'locale',      pt.locale,
                              'name',        pt.name,
                              'description', pt.short_description
                            )
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = p.id
                 ), '[]'::jsonb),
                 'schedule_slots', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = p.id
                 ), '[]'::jsonb)
               )
             )
             ORDER BY r.session_date, p.id, g.name, r.id
           )
      FROM public.session_substitution_requests r
      JOIN public.product_groups g ON g.id = r.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND r.session_date <= (now() AT TIME ZONE p.timezone)::date + 60
       AND public.gedu_may_substitute_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_open_substitution_requests(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, within the next 60 days, that the CALLER could actually take. The exclusion is gedu_may_substitute_session itself rather than a copy of its clauses, so this list and the offer button can never disagree. Each line carries the product shell (type, topic, spoken language, timezone, remote flag or site name, term dates, translations, schedule slots), the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and whether the caller has already offered. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the predicate''s four refusals.';


--
-- Name: FUNCTION get_open_substitution_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_open_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_open_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_open_substitution_requests() TO service_role;


