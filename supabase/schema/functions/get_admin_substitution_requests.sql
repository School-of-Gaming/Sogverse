--
-- Name: get_admin_substitution_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN COALESCE((
    SELECT jsonb_agg(q.doc ORDER BY q.session_date, q.product_id, q.id)
      FROM (
        SELECT r.id,
               r.session_date,
               p.id AS product_id,
               jsonb_build_object(
                 'id',           r.id,
                 'status',       r.status,
                 'group_id',     r.group_id,
                 'group_name',   g.name,
                 'session_date', r.session_date,
                 'role',         r.role,
                 'reason',       r.reason,
                 'reason_note',  r.reason_note,
                 'created_at',   r.created_at,
                 'requested_by', r.requested_by,
                 'requested_by_first_name', rq.first_name,
                 'requested_by_last_name',  rq.last_name,
                 'substitute_id',           r.substitute_id,
                 'substitute_first_name',   sp.first_name,
                 'substitute_last_name',    sp.last_name,
                 'approved_at',             r.approved_at,
                 'approved_by',             r.approved_by,
                 'approved_by_first_name',  ap.first_name,
                 'approved_by_last_name',   ap.last_name,
                 -- The session, described exactly as every other substitution
                 -- surface describes it — venue or remote included.
                 'product', public.session_product_document(p),
                 -- Offers are the open question; a substituted row has had it
                 -- answered, so it carries none.
                 'offers', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id',         o.id,
                                'gedu_id',    o.gedu_id,
                                'first_name', op.first_name,
                                'last_name',  op.last_name,
                                'created_at', o.created_at
                              )
                              ORDER BY o.created_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
                   ), '[]'::jsonb)
                   ELSE '[]'::jsonb
                 END
               ) AS doc
          FROM public.session_substitution_requests r
          JOIN public.product_groups g ON g.id = r.group_id
          JOIN public.products p       ON p.id = g.product_id
          JOIN public.profiles rq      ON rq.id = r.requested_by
          -- LEFT only because an open row has no substitute and no approver;
          -- chk_substitution_state sets both on every substituted row.
          LEFT JOIN public.profiles sp ON sp.id = r.substitute_id
          LEFT JOIN public.profiles ap ON ap.id = r.approved_by
         WHERE r.status IN (
                 'open'::public.substitution_request_status,
                 'substituted'::public.substitution_request_status
               )
           AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
           -- Cancellation: a cancelled session needs no cover, so its requests
           -- leave both lists. They are kept, not withdrawn, so restoring the
           -- session brings them back as they were.
           AND NOT public.group_session_is_cancelled(r.group_id, r.session_date)
      ) q
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_admin_substitution_requests(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN and every SUBSTITUTED request dated today or later in its product''s timezone, ordered by date then product then id; the client splits it by `status` into the queue still to staff and the sessions that already have a substitute. Each row carries the group, the session''s product as session_product_document describes it — the one shell every substitution surface shares, so the remote flag, the venue, the topic and the language reach the office exactly as they reach a volunteer — the requester''s name, the role being substituted, the reason and note, and — on a substituted row — the substitute''s id and name, approved_at, and the approving admin''s id and name; those keys are JSON null on an open row, so the document keeps one shape. An open row carries every offer with its offerer''s NAME AND NOTHING ELSE; a substituted row''s offers are always the empty array, because the approval answered them. One read for both lists, so an approval moves a row between them in one refetch. An empty array is the all-clear. A request whose date has PASSED drops out on its own: "unfilled" is a derived state of an open request and not something an admin can still act on, and a past substitution is history the group''s own page carries. A request the schedule no longer projects stays in, because this orders by DATE and never by a derived instant. Withdrawn requests are history and never appear. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approve_session_substitution_offer re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. SLOTS and not an instant: the client owns the calendar maths on every substitution surface, exactly as both session feeds do. This is the ONLY gedu-visible-reason surface besides the admin session document — a `sick` category is health data about a contractor.';


--
-- Name: FUNCTION get_admin_substitution_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO service_role;


