-- The admin Substitutions page lists the sessions that already have a substitute.
--
-- WHAT THIS CHANGES
--
-- get_admin_substitution_requests returned the OPEN requests only, so the page
-- answered "who cannot make it" and never "who stood in": an admin who had just
-- approved a sub had nowhere to check which person they picked. The read now
-- also returns every SUBSTITUTED request dated today or later in its product's
-- timezone, and the page draws those in a second section below the open queue.
--
-- One read rather than two, so the page keeps one query key and one
-- invalidation: an approval moves a row from one section to the other, and two
-- reads would have to be refetched in step for the move to happen in one frame.
--
-- THE DOCUMENT
--
-- Every row now carries `status` ('open' or 'substituted') and, for a
-- substituted row, the substitute (`substitute_id`, first and last name),
-- `approved_at`, and the approving admin (`approved_by`, first and last name).
-- Those keys are present on open rows too, as JSON null, so the document keeps
-- one shape. An open row is otherwise exactly what it was. A substituted row's
-- `offers` is always the empty array: the offers were the question, and the
-- approval answered it.
--
-- chk_substitution_state guarantees substitute_id, approved_by and approved_at
-- are all set on a substituted row, and the approver's foreign key cannot null
-- itself under that CHECK, so the two LEFT JOINs always resolve on a
-- substituted row; they are LEFT only because an open row has nothing to join.
--
-- WHAT DID NOT CHANGE
--
-- The guard (assert_admin, first statement), the grants, the ordering (date,
-- product, id) and the lower date bound. Withdrawn requests stay out.

CREATE OR REPLACE FUNCTION public.get_admin_substitution_requests() RETURNS jsonb
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
      ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_substitution_requests() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_substitution_requests() TO service_role;

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN and every SUBSTITUTED request dated today or later in its product''s timezone, ordered by date then product then id; the client splits it by `status` into the queue still to staff and the sessions that already have a substitute. Each row carries the group, the product shell (type, timezone, remote flag, translations and schedule_slots), the requester''s name, the role being substituted, the reason and note, and — on a substituted row — the substitute''s id and name, approved_at, and the approving admin''s id and name; those keys are JSON null on an open row, so the document keeps one shape. An open row carries every offer with its offerer''s NAME AND NOTHING ELSE; a substituted row''s offers are always the empty array, because the approval answered them. One read for both lists, so an approval moves a row between them in one refetch. An empty array is the all-clear. A request whose date has PASSED drops out on its own: "unfilled" is a derived state of an open request and not something an admin can still act on, and a past substitution is history the group''s own page carries. A request the schedule no longer projects stays in, because this orders by DATE and never by a derived instant. Withdrawn requests are history and never appear. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approve_session_substitution_offer re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. SLOTS and not an instant: the client owns the calendar maths on every substitution surface, exactly as both session feeds do. This is the ONLY gedu-visible-reason surface besides the admin session document — a `sick` category is health data about a contractor.';
