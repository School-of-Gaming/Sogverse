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
  -- their own absence are all out by construction. The qualification and
  -- language predicates are the offer's other two tests and are asked here for
  -- the same reason: a request on a product the caller is not qualified for,
  -- or that is run in a language they have not listed, is not in their pool.
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
               -- The session, described exactly as every other substitution
               -- surface describes it.
               'product', public.session_product_document(p)
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
       AND public.gedu_holds_session_qualifications(v_caller, r.group_id)
       AND public.gedu_speaks_session_language(v_caller, r.group_id)
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_open_substitution_requests(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, within the next 60 days, that the CALLER could actually take. The exclusion is the offer''s own three tests — gedu_may_substitute_session, gedu_holds_session_qualifications and gedu_speaks_session_language — rather than a copy of their clauses, so this list and the offer button can never disagree: a request on a product whose qualifications the caller does not hold, or that is run in a language the caller has not listed, is not in their pool, and a gedu who has listed no language sees none. Each line carries the session''s product as session_product_document describes it — the one shell every substitution surface shares — plus the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and whether the caller has already offered. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the may-substitute predicate''s refusals.';


--
-- Name: FUNCTION get_open_substitution_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_open_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_open_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_open_substitution_requests() TO service_role;


