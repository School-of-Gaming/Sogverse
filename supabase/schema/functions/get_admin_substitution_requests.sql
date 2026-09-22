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
                 'product', jsonb_build_object(
                   'id',           p.id,
                   'product_type', p.product_type,
                   'timezone',     p.timezone,
                   'is_remote',    p.is_remote,
                   'translations', COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object('locale', pt.locale, 'name', pt.name)
                              ORDER BY pt.locale
                            )
                       FROM public.product_translations pt
                      WHERE pt.product_id = p.id
                   ), '[]'::jsonb),
                   'schedule_slots', COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'weekday',          ss.weekday,
                                'start_time',       to_char(ss.start_time, 'HH24:MI'),
                                'duration_minutes', ss.duration_minutes
                              )
                              ORDER BY ss.weekday, ss.start_time
                            )
                       FROM public.schedule_slots ss
                      WHERE ss.product_id = p.id
                   ), '[]'::jsonb)
                 ),
                 'offers', COALESCE((
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
               ) AS doc
          FROM public.session_substitution_requests r
          JOIN public.product_groups g ON g.id = r.group_id
          JOIN public.products p       ON p.id = g.product_id
          JOIN public.profiles rq      ON rq.id = r.requested_by
         WHERE r.status = 'open'::public.substitution_request_status
           AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
      ) q
  ), '[]'::jsonb);
END;
$$;


--
-- Name: FUNCTION get_admin_substitution_requests(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN request dated today or later in its product''s timezone, ordered by date then product then id, each with the group, the product shell (type, timezone, remote flag, translations and schedule_slots), the requester''s name, the role being substituted, the reason and note, and every offer with its offerer''s NAME AND NOTHING ELSE. An empty array is the all-clear. A request whose date has PASSED drops out on its own, because "unfilled" is a derived state of an open request and not something an admin can still act on; a request the schedule no longer projects stays in, because this orders by DATE and never by a derived instant. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approve_session_substitution_offer re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. SLOTS and not an instant: the client owns the calendar maths on every substitution surface, exactly as both session feeds do. This is the ONLY gedu-visible-reason surface besides the admin session document — a `sick` category is health data about a contractor.';


--
-- Name: FUNCTION get_admin_substitution_requests(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_admin_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO service_role;


