-- A session cover is a request somebody answered.
--
-- WHAT THIS IS FOR
--
-- A gedu who cannot attend a session tells the office by a Discord ticket and
-- the office finds a replacement by hand. Nothing in Sogverse records that the
-- session was covered or by whom, and two things break because of that: the
-- cover gets the group's workspace only by being PERMANENTLY assigned to the
-- group — a fiction in the data nobody cleans up — and gedu invoicing, next on
-- the roadmap, cannot say who actually ran each session or in which role.
--
-- This migration is the whole database half: roles on assignments, the request
-- and offer tables, the derivation of who is expected at a session, the access
-- window a cover holds, the widening of every gate that asked "are you assigned
-- to this group", and the RPCs the three surfaces call.
--
-- THE MODEL, IN FIVE SENTENCES
--
--   1. Every assignment carries a ROLE, `primary` or `assistant`. The column's
--      DEFAULT is the backfill; the only difference between the two is pay.
--   2. One REQUEST per absent person per session: the seat is the PERSON, not
--      the role, because two primaries of one group may both be out the same
--      day. A request is keyed (group, session_date, requested_by).
--   3. Any certified gedu may OFFER; an admin APPROVES one offer, and the other
--      offers are simply not selected. An admin can also set a sub outright,
--      with no offer, on any date including a past one — that is the existing
--      office-arranged path, and invoicing needs it recorded.
--   4. WHO IS EXPECTED AT A SESSION IS DERIVED, NEVER STORED. In one sentence:
--      a gedu is expected at (group, date) iff they hold no non-withdrawn
--      request for it, AND they are either assigned to the group or hold a
--      `covered` request for it. That one sentence handles the sub-of-sub chain,
--      an open sub-of-sub request, and a cleared cover alike.
--   5. A cover holds everything the group's gedus hold — workspace, feed, notes,
--      roster, member flair, game accounts, site notes — until 24 hours after
--      the session's report is mailed, or 15 days after the session date if it
--      never is, and only while they are still certified.
--
-- TWO THINGS ARE NARROWER THAN THAT, ON PURPOSE
--
-- The VOICE ROOM (and therefore the in-call chat, which is gated by the same
-- pair of predicates) and the FAMILY REPORT MAIL admit a cover for the COVERED
-- DATE alone. The room because a sub has no business in the group's other
-- sessions; the mail because it is at-most-once with no resend, so a sub must
-- not be able to send the families a write-up of a session they did not run.
--
-- WHY THERE IS NO `session_covers` TABLE, AND NO CHAIN COLUMN
--
-- Every cover exists because somebody was absent, so the REQUEST is the natural
-- row — "set a sub with no request" is a request the admin files on the absent
-- gedu's behalf, created already covered. And the sub-of-sub chain needs no
-- column: a gedu appearing as one row's `covered_by` and another row's
-- `requested_by` on the same (group, date) IS the link, so a
-- `supersedes_request_id` would be a second, staleable expression of a relation
-- the rows already encode.
--
-- WHY NO SESSION ROW IS MATERIALIZED
--
-- A cover set on a PAST date would otherwise write a past-dated `group_sessions`
-- row, and municipality invoicing counts a past-dated row as "the session ran".
-- Requests key on (group, date) like every other session record and create no
-- row at all.
--
-- THE ACCESS SURFACE, AND HOW IT IS KEPT COMPLETE
--
-- The thing to widen is not a list of predicate names — it is EVERY function
-- body and EVERY policy expression that references `gedu_group_assignments`.
-- The block at the foot of this file enumerates that set from the catalogs and
-- requires each member either to carry a cover branch (a reference to
-- `session_cover_requests`, `gedu_covers_group` or `gedu_covers_session`) or to
-- appear in its annotated assignment-only list. The same check is the permanent
-- one in tests/db/session-cover.test.ts; this copy asserts this migration's own
-- end state, which is what catches a member added between authoring and merge.
--
-- WHY THE COVER PREDICATE IS GRANTED TO `authenticated` (a deviation, recorded)
--
-- The plan said the cover EXISTS would be INLINED into the
-- `gedus_read_assigned_groups` policy so the predicate could stay internal. It
-- cannot: a policy expression is evaluated as the QUERYING ROLE, so an inlined
-- read of `session_cover_requests` would need both a table SELECT grant for
-- `authenticated` AND a read policy on the table — strictly more Data API
-- surface than one boolean, and the opposite of the intent behind keeping the
-- table ungranted. So `gedu_covers_group` is SECURITY DEFINER, granted EXECUTE
-- to `authenticated`, and classified self-scoping in the authorization spine —
-- which is exactly what the three sibling policies on this same table already do
-- with `has_active_participation_in_group`, and what `gedu_teaches_gamer`'s own
-- comment says it was granted for. The two new TABLES still grant `authenticated`
-- nothing at all, which is the invariant that was actually load-bearing.

-- ---------------------------------------------------------------------------
-- 1. Roles on assignments
-- ---------------------------------------------------------------------------

CREATE TYPE public.gedu_assignment_role AS ENUM ('primary', 'assistant');

-- The DEFAULT *is* the backfill: every assignment that exists today is a
-- primary, and the default is KEPT rather than dropped afterwards because the
-- sole writer (apply_group_changes) always sends a role and a future writer that
-- forgets should land a primary rather than fail.
ALTER TABLE public.gedu_group_assignments
  ADD COLUMN role public.gedu_assignment_role NOT NULL DEFAULT 'primary';

COMMENT ON COLUMN public.gedu_group_assignments.role IS
  'Which capacity this educator holds the group in: `primary` or `assistant`. '
  'A group holds ANY NUMBER of each — there is deliberately no '
  'exactly-one-primary rule, and an `assistant` on a product whose assistant '
  'fee is unset is allowed (the fee simply reads as not set wherever a fee is '
  'shown, and the admin attention queue goes on treating a missing assistant '
  'fee as "no assistant role" rather than as a defect). The ONLY thing the role '
  'decides is PAY: products carry a per-session fee for each. Readable wherever '
  'assignments already are, parents included through the existing policy, '
  'because it is a pay CLASS label and not a figure — the fee columns on '
  '`products` are already public. Written only by apply_group_changes, where a '
  'role change is one add that upserts this column.';

-- ---------------------------------------------------------------------------
-- 2. The request and the offer
-- ---------------------------------------------------------------------------

CREATE TYPE public.cover_reason AS ENUM ('sick', 'other');
CREATE TYPE public.cover_request_status AS ENUM ('open', 'covered', 'withdrawn');

CREATE TABLE public.session_cover_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  -- ON DELETE RESTRICT on both people, matching gedu_group_assignments: a
  -- request is the record of who was absent and who stood in, and invoicing
  -- reads it. A sub must hold a gedu account, and every gedu does.
  requested_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role          public.gedu_assignment_role NOT NULL,
  -- Required on the GEDU path and enforced there by the RPC rather than by a
  -- NOT NULL, because an admin recording an off-platform cover for invoicing may
  -- genuinely not know why the gedu was away. A column that admitted no unknown
  -- would be filled with a guess.
  reason        public.cover_reason,
  reason_note   text,
  status        public.cover_request_status NOT NULL DEFAULT 'open',
  covered_by    uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- The status and the three cover columns are one fact stated twice, and this
  -- is what keeps them in step in BOTH directions: `covered` cannot lack a sub,
  -- an approver or a stamp, and a row that is not `covered` cannot carry any of
  -- them. The second direction is the one with teeth — it is why clearing a
  -- cover and withdrawing a covered request have to blank the three columns,
  -- and therefore why a withdrawn row is history about an ABSENCE rather than
  -- about a substitution.
  CONSTRAINT chk_cover_state CHECK (
    (status = 'covered'::public.cover_request_status)
    = (covered_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  -- Nobody covers their own absence. The `may cover` predicate refuses it too;
  -- this is the constraint that makes the refusal a property of the data rather
  -- than of the one code path that happens to check.
  CONSTRAINT chk_cover_not_self CHECK (covered_by IS DISTINCT FROM requested_by),
  -- The cap the constraint owns, so no client re-measures it differently.
  CONSTRAINT chk_cover_reason_note_length CHECK (char_length(reason_note) <= 500)
);

COMMENT ON TABLE public.session_cover_requests IS
  'One row per (group, session date, ABSENT GEDU): "I cannot make this session", '
  'and — once an admin has answered it — who is standing in. The seat is the '
  'PERSON rather than the role, because two primaries of one group may both be '
  'out the same day and "who did which job" has to stay answerable. There is no '
  'separate covers table: every cover exists because somebody was absent, so the '
  'request IS the row, and an admin setting a sub with no request files one on '
  'the absent gedu''s behalf, created already `covered`. WITHDRAWN ROWS ARE '
  'HISTORY and do not block a new request for the same seat — the live-seat '
  'unique index is partial on exactly that. A request nobody covers becomes '
  'UNFILLED once its date is past, which is a DERIVED state of an open request '
  'and not a stored one: the date already says it, and a stored status would need '
  'a clock. The SUB-OF-SUB CHAIN needs no column either — a gedu appearing as one '
  'row''s covered_by and another row''s requested_by on the same (group, date) IS '
  'the link. Nothing here materializes a group_sessions row, deliberately: a '
  'cover set on a PAST date would write a past-dated row, and municipality '
  'invoicing reads a past-dated row as "the session ran". Neither `authenticated` '
  'nor `anon` holds any grant — every read and write goes through the SECURITY '
  'DEFINER RPCs below, the same posture as group_sessions.';

COMMENT ON COLUMN public.session_cover_requests.role IS
  'The role being covered, snapshotted at filing time from the requester''s '
  'assignment role — or, when the requester is themselves a sub, from the role '
  'on the covered request they hold. Snapshotted rather than joined because '
  'invoicing asks what job was done on the day, and an admin editing the '
  'permanent assignment months later must not rewrite that answer.';

COMMENT ON COLUMN public.session_cover_requests.reason IS
  'Why the gedu is away — `sick` or `other` — and ADMIN-VISIBLE ONLY: it reaches '
  'the admin dashboard and the admin session document, and every gedu-facing '
  'document emits it as null. A `sick` category is health-related data about a '
  'contractor; the Discord tickets it replaces carry the same, so nothing new is '
  'disclosed, but no retention rule exists for either yet. Nullable because the '
  'gedu path requires it (RPC-enforced) and the admin''s off-platform-cover path '
  'cannot.';

COMMENT ON COLUMN public.session_cover_requests.covered_by IS
  'The sub, once an admin has approved one — and null in every other state, by '
  'the chk_cover_state CHECK. Clearing a cover or withdrawing a covered request '
  'blanks it, so this column answers "who is covering" and never "who once was"; '
  'the latter is not a question the platform promises to answer, because an admin '
  'correcting a mistake should leave no phantom substitution behind for invoicing '
  'to bill.';

-- One LIVE request per absent person per session. Partial on status because a
-- withdrawn row is history: a gedu who withdraws and files again is not fighting
-- their own past row for the key.
CREATE UNIQUE INDEX session_cover_requests_live_seat
  ON public.session_cover_requests (group_id, session_date, requested_by)
  WHERE status <> 'withdrawn'::public.cover_request_status;

-- The feeds' read: every non-withdrawn request on one group, and the derivation's
-- read: everything about one (group, date).
CREATE INDEX idx_session_cover_requests_group_date
  ON public.session_cover_requests (group_id, session_date);

-- The dashboard's "my live covers" read, and the access predicate's.
CREATE INDEX idx_session_cover_requests_covered_by
  ON public.session_cover_requests (covered_by)
  WHERE status = 'covered'::public.cover_request_status;

CREATE TRIGGER session_cover_requests_updated_at
  BEFORE UPDATE ON public.session_cover_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.session_cover_requests ENABLE ROW LEVEL SECURITY;

-- The admin arm, and the ONLY policy either new table carries. It decides
-- nothing today, because `authenticated` holds no grant on the table and so
-- never reaches a policy at all — it is written now so that if a Data API grant
-- is ever added, the table fails closed for everyone but an admin rather than
-- opening wholesale. Every other reader goes through a SECURITY DEFINER RPC.
CREATE POLICY admin_full_access_session_cover_requests
  ON public.session_cover_requests
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT ALL ON TABLE public.session_cover_requests TO service_role;

CREATE TABLE public.session_cover_offers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.session_cover_requests(id) ON DELETE CASCADE,
  -- CASCADE rather than RESTRICT, unlike the request's two people: an offer is
  -- an intention, not a record of work done, so an account going away should
  -- take its unanswered offers with it.
  gedu_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, gedu_id)
);

COMMENT ON TABLE public.session_cover_offers IS
  '"I can cover this" — one row per (request, offering gedu). Offering is '
  'idempotent on the unique key and WITHDRAWING AN OFFER DELETES THE ROW, '
  'because an offer nobody accepted is not a fact worth keeping. Approving one '
  'offer does not touch the others: "not selected" is DERIVED from the request '
  'being covered by somebody else, and which offer was approved is the covering '
  'gedu''s own row — which is why there is no approved_offer_id anywhere. '
  'Offerers never learn who else offered; only the admin queue reads this table, '
  'and it reads it through get_admin_dashboard. No updated_at and no trigger: a '
  'row is created and deleted, never edited. Nothing is granted to '
  '`authenticated` or `anon`.';

ALTER TABLE public.session_cover_offers ENABLE ROW LEVEL SECURITY;

-- The same inert admin arm as the requests table above, for the same reason.
CREATE POLICY admin_full_access_session_cover_offers
  ON public.session_cover_offers
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT ALL ON TABLE public.session_cover_offers TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The four predicates
-- ---------------------------------------------------------------------------

-- The access window, in one place. Everything that asks "may this cover reach
-- this group" reaches it through here, so the window expression exists once.
CREATE FUNCTION public.gedu_covers_session(p_group_id uuid, p_session_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_cover_requests r
      JOIN public.product_groups g  ON g.id = r.group_id
      JOIN public.products p        ON p.id = g.product_id
      JOIN public.gedu_profiles gp  ON gp.user_id = r.covered_by
      -- The session row is LAZILY materialized, so there may be none — which is
      -- exactly the case the 15-day arm of the COALESCE is for.
      LEFT JOIN public.group_sessions gs
             ON gs.group_id     = r.group_id
            AND gs.session_date = r.session_date
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status       = 'covered'::public.cover_request_status
       AND r.covered_by   = (SELECT auth.uid())
       -- Still certified. De-certifying an educator ends their cover access
       -- mid-window, which is the point of checking it here rather than only at
       -- approval time.
       AND gp.certified
       -- 24 hours after the report was mailed, or 15 days after the session date
       -- if it never was. The fallback is compared against PRODUCT-LOCAL
       -- midnight, so a club in Helsinki and one in Los Angeles both get fifteen
       -- of their own days.
       AND now() < COALESCE(
                     gs.report_emailed_at + interval '24 hours',
                     ((r.session_date + 15)::timestamp AT TIME ZONE p.timezone)
                   )
  );
$$;

-- "Covers this group" is "covers any of its dates". Written as one EXISTS over
-- the date predicate rather than as a second copy of the window arithmetic:
-- there is exactly one definition of the window, and this is not it.
CREATE FUNCTION public.gedu_covers_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_cover_requests r
     WHERE r.group_id   = p_group_id
       AND r.covered_by = (SELECT auth.uid())
       AND r.status     = 'covered'::public.cover_request_status
       AND public.gedu_covers_session(r.group_id, r.session_date)
  );
$$;

-- The derivation sentence, as one predicate. It takes the gedu as an ARGUMENT
-- rather than reading auth.uid(), because every writer has to ask it about
-- somebody else: an admin asks whether the absent gedu is expected, and the
-- `may cover` predicate asks whether the proposed sub is NOT.
CREATE FUNCTION public.gedu_is_expected_at_session(
  p_gedu_id uuid,
  p_group_id uuid,
  p_session_date date
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- "…they hold no non-withdrawn request for it…" — an open request and a
     -- covered one both mean the same thing about the person who FILED it: they
     -- are not coming.
     AND NOT EXISTS (
           SELECT 1
             FROM public.session_cover_requests r
            WHERE r.group_id     = p_group_id
              AND r.session_date = p_session_date
              AND r.requested_by = p_gedu_id
              AND r.status <> 'withdrawn'::public.cover_request_status
         )
     -- "…and they are either assigned to the group…"
     AND (
           EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments a
              WHERE a.group_id = p_group_id
                AND a.gedu_id  = p_gedu_id
           )
           -- "…or hold a `covered` request for it." No window test and no
           -- certification test here: this predicate answers WHO IS DOING THE
           -- JOB, which is a staffing fact, not an access one. The access
           -- question is gedu_covers_session's, and conflating the two would
           -- make a session's staffing silently change fifteen days later.
           OR EXISTS (
             SELECT 1
               FROM public.session_cover_requests r2
              WHERE r2.group_id     = p_group_id
                AND r2.session_date = p_session_date
                AND r2.covered_by   = p_gedu_id
                AND r2.status       = 'covered'::public.cover_request_status
           )
         );
$$;

-- The four refusals every path that seats a sub has to make, in one place.
CREATE FUNCTION public.gedu_may_cover_session(
  p_gedu_id uuid,
  p_group_id uuid,
  p_session_date date,
  p_absent_gedu_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- (1) Not the absent gedu. Also a CHECK on the table, and stated here so
     -- the refusal reads the same as the other three at every call site.
     AND p_gedu_id IS DISTINCT FROM p_absent_gedu_id
     -- (2) A CERTIFIED gedu. This is the third thing gedu_profiles.certified
     -- gates, and the only eligibility test there is: no coverage area, no
     -- language match, no schedule-clash check. Those are follow-ups.
     AND EXISTS (
           SELECT 1
             FROM public.profiles pr
             JOIN public.gedu_profiles gp ON gp.user_id = pr.id
            WHERE pr.id   = p_gedu_id
              AND pr.role = 'gedu'::public.user_role
              AND gp.certified
         )
     -- (3) NOT ALREADY EXPECTED at that session. Stops one person holding two
     -- seats on one session, which would make "who did which job" unanswerable.
     AND NOT public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date)
     -- (4) Holding no non-withdrawn request of their own on that (group, date).
     -- Stops a sub covering their own substitute — the person who said they
     -- cannot be there cannot be the answer to somebody else's absence on the
     -- same day.
     AND NOT EXISTS (
           SELECT 1
             FROM public.session_cover_requests r
            WHERE r.group_id     = p_group_id
              AND r.session_date = p_session_date
              AND r.requested_by = p_gedu_id
              AND r.status <> 'withdrawn'::public.cover_request_status
         );
$$;

-- ---------------------------------------------------------------------------
-- 4. One document shape for a request, and one cascade
-- ---------------------------------------------------------------------------

-- Every write returns this, and both staff feeds' `covers` element is this. One
-- definition, because six copies of a jsonb_build_object is how six surfaces
-- come to disagree about what a cover request is.
--
-- Takes the ROW rather than an id, so a feed aggregates it over a query and a
-- writer passes the row it just wrote — no re-read, and no way for the two to
-- drift apart.
CREATE FUNCTION public.cover_request_document(
  p_request public.session_cover_requests,
  p_include_reason boolean,
  p_viewer_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'id',           p_request.id,
    'group_id',     p_request.group_id,
    'session_date', p_request.session_date,
    'role',         p_request.role,
    'status',       p_request.status,
    'created_at',   p_request.created_at,
    'requested_by', p_request.requested_by,
    'requested_by_first_name', (
      SELECT pr.first_name FROM public.profiles pr WHERE pr.id = p_request.requested_by
    ),
    'covered_by',   p_request.covered_by,
    'covered_by_first_name', (
      SELECT pr.first_name FROM public.profiles pr WHERE pr.id = p_request.covered_by
    ),
    'approved_at',  p_request.approved_at,
    -- Whether the VIEWER is the absent gedu. The card shows a status line and a
    -- Withdraw button off this, and nothing else needs it.
    'is_requester', COALESCE(p_request.requested_by = p_viewer_id, false),
    -- How many offers are waiting — for the REQUESTER (their own status line)
    -- and for an admin (the queue). A colleague sees null: how many people
    -- volunteered for somebody else's absence is not their business, and
    -- offerers never learn who else offered.
    'offer_count',
      CASE WHEN p_include_reason OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT count(*)::integer
               FROM public.session_cover_offers o
              WHERE o.request_id = p_request.id
           )
      END,
    -- Admin-only, and emitted as JSON null rather than omitted so the document
    -- keeps ONE shape for both readers — a client schema that had to branch on
    -- which keys are present would be a second place the rule lives.
    'reason',      CASE WHEN p_include_reason THEN p_request.reason END,
    'reason_note', CASE WHEN p_include_reason THEN p_request.reason_note END
  );
$$;

-- The sweep that runs after every admin edit which can UNSEAT somebody: clear,
-- withdraw, and the replace inside set_session_cover.
--
-- It is a FIXPOINT, not a single statement, and the chain is why: clearing X's
-- cover unseats X, which withdraws X's own request, which unseats whoever was
-- covering THAT, and so on. Each pass withdraws every non-withdrawn request
-- whose requester no longer holds a seat on that (group, date) — neither
-- assigned nor the covered_by of a live covered request — and the loop stops
-- when a pass changes nothing.
--
-- Withdrawing a COVERED row blanks its three cover columns, because
-- chk_cover_state forbids a withdrawn row from carrying a sub. That is the
-- deliberate consequence of the bidirectional CHECK: an admin unwinding a
-- mistake leaves no phantom substitution behind for invoicing to find.
CREATE FUNCTION public.cascade_withdraw_orphaned_cover_requests(
  p_group_id uuid,
  p_session_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_changed integer;
BEGIN
  LOOP
    UPDATE public.session_cover_requests r
       SET status      = 'withdrawn'::public.cover_request_status,
           covered_by  = NULL,
           approved_by = NULL,
           approved_at = NULL
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status <> 'withdrawn'::public.cover_request_status
       AND NOT EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments a
              WHERE a.group_id = p_group_id
                AND a.gedu_id  = r.requested_by
           )
       AND NOT EXISTS (
             SELECT 1
               FROM public.session_cover_requests r2
              WHERE r2.group_id     = p_group_id
                AND r2.session_date = p_session_date
                AND r2.status       = 'covered'::public.cover_request_status
                AND r2.covered_by   = r.requested_by
           );

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gedu_covers_session(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_covers_session(uuid, date) TO service_role;

-- The one predicate of the four that IS granted to `authenticated`, because the
-- gedus_read_assigned_groups policy calls it and a policy is evaluated as the
-- querying role. See this file's header for why that beats inlining the EXISTS.
-- Classified self-scoping in the authorization spine: it answers only about the
-- caller, no argument can name a different asker, and it is total.
REVOKE EXECUTE ON FUNCTION public.gedu_covers_group(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.gedu_covers_group(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_covers_group(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gedu_is_expected_at_session(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_is_expected_at_session(uuid, uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gedu_may_cover_session(uuid, uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_may_cover_session(uuid, uuid, date, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cover_request_document(public.session_cover_requests, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cover_request_document(public.session_cover_requests, boolean, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cascade_withdraw_orphaned_cover_requests(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cascade_withdraw_orphaned_cover_requests(uuid, date) TO service_role;

COMMENT ON FUNCTION public.gedu_covers_session(p_group_id uuid, p_session_date date) IS
  'Internal predicate: does the CALLER hold a live cover on this exact (group, date)? True when they are the covered_by of a `covered` request for it, are still certified, and the access window is open — now() < COALESCE(report_emailed_at + 24 hours, product-local midnight 15 days after the session date). The SINGLE definition of that window; every other cover access test reaches it through here or through gedu_covers_group. Not granted to `authenticated`: it is called from inside SECURITY DEFINER functions only, the two voice predicates among them.';

COMMENT ON FUNCTION public.gedu_covers_group(p_group_id uuid) IS
  'Internal-by-intent predicate: does the CALLER hold a live cover on ANY date of this group? One EXISTS over gedu_covers_session, so the access window has exactly one definition. This is the arm added to every GROUP-WIDE gate on gedu_group_assignments — the workspace, the feed, notes, roster, member flair, the game-account editors and the site notes — on the owner''s rule that a sub sees everything the main gedu sees for as long as their window is open. It is NOT the arm used by the two date-scoped exceptions (the voice room and the family report mail), which call gedu_covers_session directly. EXPOSED TO `authenticated`, unlike the other three cover predicates, and for one reason: the gedus_read_assigned_groups policy on product_groups calls it, and an RLS policy is evaluated as the querying role, so it cannot call a private helper. Inlining the EXISTS instead would have needed a table SELECT grant AND a read policy on session_cover_requests — strictly more Data API surface than one boolean — which is the same trade the three sibling policies on that table already made with has_active_participation_in_group. Self-scoping: it answers only about the caller, no argument can name a different asker, and it is total, so a USING clause is never handed a three-valued answer.';

COMMENT ON FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS
  'Internal predicate, and the derivation the whole feature rests on: a gedu is expected at (group, date) iff they hold no non-withdrawn request for it, AND they are either assigned to the group or hold a `covered` request for it. That one sentence handles the sub-of-sub chain, an open sub-of-sub request and a cleared cover alike, which is why nothing stores "who is running this session" anywhere. Takes the gedu as an argument rather than reading auth.uid(), because every writer asks it about somebody else. Deliberately makes NO access-window and NO certification test: it answers who is DOING THE JOB, a staffing fact, where gedu_covers_session answers who may REACH the group, an access fact — conflating them would make a past session''s staffing silently change fifteen days later. Where a gedu is both assigned and holds a cover on the same group (only an admin edit can produce that), the assignment supplies the role. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.gedu_may_cover_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) IS
  'Internal predicate: may this gedu be seated as the sub for this (group, date)? Four refusals, and the last two are the interesting ones: (1) not the absent gedu, (2) a certified gedu — the ONLY eligibility test there is, with coverage area, language and schedule clash all deliberately left to follow-ups, (3) not already expected at that session, and (4) holding no non-withdrawn request of their own on that (group, date). Together (3) and (4) stop a sub covering their own substitute and stop two seats collapsing onto one person, which would make "who did which job" unanswerable. Asked by offer_session_cover, again by approve_session_cover_offer under the request''s lock, by set_session_cover, and by get_open_cover_requests as its exclusion — the pool list shows a gedu exactly the requests they could actually take. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.cover_request_document(p_request public.session_cover_requests, p_include_reason boolean, p_viewer_id uuid) IS
  'Internal: the ONE wire shape of a cover request. Every cover write returns it and both staff feeds'' `covers` arrays are built from it, so no surface can drift about what a request is. Takes the ROW rather than an id, so a feed aggregates it over a query and a writer hands over the row it just wrote. `p_include_reason` is the ADMIN flag — reason and reason_note travel only when it is true, and are emitted as JSON null otherwise rather than omitted, so the document keeps one shape for both readers. `offer_count` travels for an admin and for the requester themselves and is null for anybody else, because how many people volunteered for a colleague''s absence is not their business. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.cascade_withdraw_orphaned_cover_requests(p_group_id uuid, p_session_date date) IS
  'Internal: after an admin edit that can unseat somebody — clear, withdraw, or the replace inside set_session_cover — withdraw every non-withdrawn request on that (group, date) whose requester no longer holds a seat there, meaning neither assigned nor the covered_by of a live covered request. A FIXPOINT sweep rather than one statement, because unseating cascades: clearing X''s cover withdraws X''s own request, which unseats whoever was covering that, and so on until a pass changes nothing. Withdrawing a covered row blanks its three cover columns — chk_cover_state forbids a withdrawn row from carrying a sub — which is deliberate: an admin unwinding a mistake leaves no phantom substitution behind for invoicing to bill. Withdrawing a request whose requester was meanwhile unassigned restores nobody and is allowed. Not granted to `authenticated`; called only from inside the admin RPCs.';

-- ---------------------------------------------------------------------------
-- 5. Every gate on gedu_group_assignments, widened
--
-- The surface is not a list of predicate names — it is every function body and
-- every policy expression that references the table. The completeness block at
-- the foot of this file enumerates that set from the catalogs; what follows is
-- the decision for each member that IS a gate.
--
-- Group-wide, window-boxed (`assigned OR gedu_covers_group`):
--   * gedu_teaches_group          — and therefore every writer and reader that
--                                   composes it: the session notes, the register,
--                                   the session photos and their delete check,
--                                   the group notes, and the group feed itself.
--   * gedu_teaches_group_product  — cover arm GROUP-only, not product-wide; and
--                                   therefore the member flair and the voice
--                                   room's staff overlay.
--   * gedu_teaches_gamer          — needs no edit: it is COMPOSED from
--                                   gedu_teaches_group, which is the whole
--                                   reason it was written that way.
--   * the two game-account writers on group members.
--   * set_site_notes              — with a LOCATION-shaped cover arm of its own.
--   * gedus_read_assigned_groups  — the policy, below.
--   * get_gedu_assigned_product   — gate AND "which group is mine", further down.
--
-- Date-scoped (`assigned OR gedu_covers_session`):
--   * is_voice_group_member, is_voice_group_moderator — and therefore the chat
--     channel, which is gated by the same pair.
--   * claim_group_session_report_email — which is why it stops calling
--     gedu_teaches_group and spells the assignment half out inline.
--
-- Deliberately assignment-only, each annotated in the completeness list at the
-- foot of this file with its reason.
--
-- One member is in TypeScript and is Step 2's: the gedu branch of
-- src/app/api/voice/token/route.ts, which reads the table on the service-role
-- client. Its route posture and roles do not change; its body and its test do.
-- ---------------------------------------------------------------------------

-- The policy is replaced rather than altered so the whole expression reads as
-- one thing. The cover arm CALLS the predicate rather than inlining an EXISTS
-- over session_cover_requests, and that is a considered deviation from the plan:
-- a policy is evaluated as the querying role, so an inlined read would need a
-- table SELECT grant AND a read policy on session_cover_requests — more Data API
-- surface, not less. The three sibling policies on this same table already
-- compose a granted SECURITY DEFINER predicate for exactly this reason.
DROP POLICY gedus_read_assigned_groups ON public.product_groups;

CREATE POLICY gedus_read_assigned_groups
  ON public.product_groups
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'gedu'::public.user_role
    AND (
      id IN (
        SELECT ga.group_id
          FROM public.gedu_group_assignments ga
         WHERE ga.gedu_id = (SELECT auth.uid())
      )
      OR (SELECT public.gedu_covers_group(product_groups.id))
    )
  );

CREATE OR REPLACE FUNCTION public.gedu_teaches_group(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
     WHERE ga.group_id = p_group_id
       AND ga.gedu_id  = (SELECT auth.uid())
  )
  -- The cover branch: a live, certified cover on this group reaches everything
  -- the group's assigned gedus reach, for as long as their access window is
  -- open. Group-wide rather than per-date on purpose — the workspace, the
  -- roster, the notes and the report are all one surface, and a sub who may
  -- write the report has to be able to open the page it is written on. The two
  -- date-scoped exceptions (the voice room and the report MAIL) do not go
  -- through this predicate; see their own bodies.
  OR public.gedu_covers_group(p_group_id);
$$;
CREATE OR REPLACE FUNCTION public.gedu_teaches_group_product(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One join, because gedu_group_assignments carries product_id alongside
  -- group_id: "any group of this group's product" is a single-table EXISTS
  -- rather than a walk back through products.
  SELECT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.gedu_group_assignments a ON a.product_id = g.product_id
     WHERE g.id = p_group_id
       AND a.gedu_id = (SELECT auth.uid())
  )
  -- The cover branch is deliberately GROUP-ONLY, not product-wide. An
  -- assignment is a standing relationship with a product, which is what earns
  -- the cross-group mobility above; a cover is one date on one group, and
  -- widening it to the product would hand a sub the member flair of every
  -- sibling group they were never asked to stand in for.
  OR public.gedu_covers_group(p_group_id);
$$;
CREATE OR REPLACE FUNCTION public.is_voice_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.participant_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    )
    -- The cover branch, and the one place on this surface where it is DATE-
    -- SCOPED: a sub reaches the room on the date they are covering and on no
    -- other date of the group. "The session in question" is today in the
    -- PRODUCT's timezone, evaluated at call time, because the predicate is
    -- handed a group and nothing else. It ADDS to the assignment arm above
    -- rather than narrowing it — a gedu assigned to the product keeps the
    -- product-wide mobility they already had.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and public.gedu_covers_session(
              p_group_id, (now() at time zone p2.timezone)::date
            )
    );
$$;
CREATE OR REPLACE FUNCTION public.is_voice_group_moderator(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    )
    -- Date-scoped, exactly as the membership predicate beside it is and for the
    -- same reason: a sub moderates the room on the date they are covering, not
    -- on the group's other dates. The two move together — the chat channel is
    -- gated by this pair, so a cover is in the channel on their own date only.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and public.gedu_covers_session(
              p_group_id, (now() at time zone p2.timezone)::date
            )
    );
$$;
CREATE OR REPLACE FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row public.group_sessions;
BEGIN
  -- The same two-part gate every write on this surface opens with: the role
  -- first, then the assignment. Guard-first is what the authorization spine
  -- reads, and the assignment half is what makes a NULL group a refusal rather
  -- than a lookup — for a gedu. An admin passes the second half by role.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half is spelled out INLINE here rather than through
  -- gedu_teaches_group, and that is the whole point of this migration's edit to
  -- this function. gedu_teaches_group now admits a live cover on ANY of the
  -- group's dates; the family report mail is at-most-once and has no resend, so
  -- a sub must not be able to send the mail for a session they did not run.
  -- The cover arm is therefore DATE-SCOPED to the session being claimed.
  IF NOT public.is_admin()
     AND NOT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
         )
     AND NOT public.gedu_covers_session(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE is the whole of the concurrency argument. Two writers (or one
  -- writer with two tabs) serialize here; the second reads the marker the first
  -- committed and is refused below rather than claiming a second time.
  SELECT * INTO v_row
    FROM public.group_sessions s
   WHERE s.group_id     = p_group_id
     AND s.session_date = p_session_date
     FOR UPDATE;

  -- A session row is lazily materialized, so "no row" and "a row with a blank
  -- report" are the same answer to the only question that matters: there is
  -- nothing here to send. The character list matches the summaries SQL exactly
  -- — bare btrim() strips spaces only, and a report of one newline is not a
  -- report.
  IF NOT FOUND
     OR btrim(COALESCE(v_row.report, ''), E' \t\r\n\v\f') = '' THEN
    RAISE EXCEPTION 'No report to email for group % on %', p_group_id, p_session_date
      USING ERRCODE = 'P0021';
  END IF;

  IF v_row.report_emailed_at IS NOT NULL THEN
    RAISE EXCEPTION 'The report for group % on % was already emailed at %',
                    p_group_id, p_session_date, v_row.report_emailed_at
      USING ERRCODE = 'P0022';
  END IF;

  -- `updated_by` is deliberately NOT stamped: claiming the send is not an edit
  -- of the write-up, and moving the author chip onto whoever pressed the button
  -- would misattribute somebody else's report. The updated_at trigger still
  -- fires, which is the honest record that the row changed.
  UPDATE public.group_sessions
     SET report_emailed_at = now(),
         report_emailed_by = (SELECT auth.uid())
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  -- The report travels back so the route composes the mail from what the claim
  -- committed, not from what the client believed was saved.
  RETURN jsonb_build_object(
    'id',                v_row.id,
    'group_id',          v_row.group_id,
    'session_date',      v_row.session_date,
    'starts_at',         v_row.starts_at,
    'ends_at',           v_row.ends_at,
    'report',            v_row.report,
    'report_emailed_at', v_row.report_emailed_at
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.set_group_member_minecraft(p_participant_id uuid, p_minecraft_username text, p_minecraft_uuid text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_uuid     text;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else.
  --
  -- An admin passes this outright (00205). The admin group details page renders
  -- the gedu workspace's roster body — this editor included — for any group of
  -- any product, and an admin already holds the same edit on /admin/users/[id],
  -- so the group question was never a statement about them.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  )
  -- The cover branch: the participant sits in a group the caller holds a live
  -- cover on. Group-wide within the window, exactly as the assignment arm is
  -- product-wide within the assignment — a sub who is running the session is
  -- the person who has the child in front of them and can read the handle off
  -- their screen.
  AND NOT EXISTS (
    SELECT 1
      FROM public.participations part2
     WHERE part2.participant_id = p_participant_id
       AND part2.status = 'active'::public.participation_status
       AND part2.group_id IS NOT NULL
       AND public.gedu_covers_group(part2.group_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Target must be a GAMER (00177). A Minecraft link is a child's; an adult
  -- seat carries no game account and the roster renders that slot empty by
  -- design, so a row keyed to a customer would be an orphan the admin twin
  -- already refuses to write. The scope check above does not care about the
  -- target's role, so this stands on its own — and it binds an admin too, being
  -- about the integrity of the row rather than about who is looking.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_minecraft_username, '')), '');
  -- Clearing the username clears the uuid with it: a uuid without a name is a
  -- verified link to nothing.
  v_uuid := CASE WHEN v_username IS NULL
                 THEN NULL
                 ELSE NULLIF(btrim(COALESCE(p_minecraft_uuid, '')), '')
            END;

  INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
  VALUES (p_participant_id, v_username, v_uuid)
  ON CONFLICT (user_id) DO UPDATE
    SET minecraft_username = EXCLUDED.minecraft_username,
        minecraft_uuid     = EXCLUDED.minecraft_uuid;

  RETURN jsonb_build_object(
    'participant_id',     p_participant_id,
    'minecraft_username', v_username,
    'minecraft_uuid',     v_uuid
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.set_group_member_roblox(p_participant_id uuid, p_roblox_username text, p_roblox_user_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_username text;
  v_user_id  bigint;
BEGIN
  -- Guard-first, in the shape the authorization spine reads: the role half
  -- admits an admin or a gedu and refuses everyone else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Actor AND target: the participant must be actively participating in a group
  -- the caller is assigned to. A gedu may fix a username for the people they
  -- teach and for nobody else. An admin passes it outright (00205) — see the
  -- Minecraft twin above for why.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.participations part
      JOIN public.gedu_group_assignments ga ON ga.group_id = part.group_id
     WHERE part.participant_id = p_participant_id
       AND part.status   = 'active'::public.participation_status
       AND ga.gedu_id    = (SELECT auth.uid())
  )
  -- The cover branch, byte for byte the Minecraft twin's — one roster editor
  -- serves both platforms, so widening one alone would ship a control that
  -- saves on a Minecraft group and refuses on a Roblox one.
  AND NOT EXISTS (
    SELECT 1
      FROM public.participations part2
     WHERE part2.participant_id = p_participant_id
       AND part2.status = 'active'::public.participation_status
       AND part2.group_id IS NOT NULL
       AND public.gedu_covers_group(part2.group_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Target must be a GAMER (00177). A game account is a child's; an adult seat
  -- carries none and the roster renders that slot empty by design, so a row
  -- keyed to a customer would be an orphan the admin twin already refuses to
  -- write. The scope check above does not care about the target's role, so this
  -- stands on its own — and it binds an admin too.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_participant_id
       AND pr.role = 'gamer'
  ) THEN
    RAISE EXCEPTION 'participant % is not a gamer', p_participant_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_username := NULLIF(btrim(COALESCE(p_roblox_username, '')), '');
  -- Clearing the username clears the account id with it: an id without a name
  -- is a verified link to nothing. An omitted (or NULL) id alongside a name is
  -- the UNVERIFIED save — the calling route stores the name it was sent and
  -- takes the id only from its own server-side lookup, so a name Roblox could
  -- not resolve lands here with nothing beside it.
  v_user_id := CASE WHEN v_username IS NULL
                    THEN NULL
                    ELSE p_roblox_user_id
               END;

  INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
  VALUES (p_participant_id, v_username, v_user_id)
  ON CONFLICT (user_id) DO UPDATE
    SET roblox_username = EXCLUDED.roblox_username,
        roblox_user_id  = EXCLUDED.roblox_user_id;

  RETURN jsonb_build_object(
    'participant_id',  p_participant_id,
    'roblox_username', v_username,
    'roblox_user_id',  v_user_id
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.set_site_notes(p_location_id uuid, p_public_note text, p_gedu_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_public_note text;
  v_gedu_note   text;
  v_address     text;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- "You run something at this building" — the site-scoped analogue of the
  -- assignment check, and the half an admin is exempt from.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments ga
      JOIN public.products p ON p.id = ga.product_id
     WHERE ga.gedu_id     = (SELECT auth.uid())
       AND p.location_id  = p_location_id
       AND p.is_remote    = false
  )
  -- The cover branch, shaped like the assignment one above rather than borrowed
  -- from a group predicate: the question this function asks is about a BUILDING,
  -- so the cover arm is "I hold a live cover on some group of an in-person
  -- product at this site". The owner's rule is that a sub sees everything the
  -- main gedu sees, and a site note is low-risk enough not to earn a special
  -- case of its own.
  AND NOT EXISTS (
    SELECT 1
      FROM public.product_groups g
      JOIN public.products p2 ON p2.id = g.product_id
     WHERE p2.location_id = p_location_id
       AND p2.is_remote   = false
       AND public.gedu_covers_group(g.id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_public_note := NULLIF(btrim(COALESCE(p_public_note, '')), '');
  v_gedu_note   := NULLIF(btrim(COALESCE(p_gedu_note, '')), '');

  INSERT INTO public.site_details (location_id, address, notes)
  VALUES (p_location_id, NULL, v_public_note)
  ON CONFLICT (location_id) DO UPDATE
    -- `address` is deliberately absent from this SET list: whatever an admin
    -- put there stays there.
    SET notes = EXCLUDED.notes
  RETURNING address INTO v_address;

  INSERT INTO public.site_staff_details (location_id, notes)
  VALUES (p_location_id, v_gedu_note)
  ON CONFLICT (location_id) DO UPDATE
    SET notes = EXCLUDED.notes;

  RETURN jsonb_build_object(
    'location_id', p_location_id,
    'address',     v_address,
    'public_note', v_public_note,
    'gedu_note',   v_gedu_note
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. The writes and the pool list
--
-- All SECURITY DEFINER, all guard-first, all returning the ONE request document
-- so the client parses one shape wherever it came from. No new HTTP routes: every
-- one of these is called with the browser client and gated in the database,
-- which is the transport the gedu session writes already use.
--
-- The admin writes take the GROUP ROW's lock before touching anything, and all
-- four take it in the same order. That is the serialization point for a whole
-- (group, date): without it two admins approving two different requests for one
-- session could each pass `may cover` for the same sub and seat one person in two
-- seats, which is precisely the state the derivation cannot describe.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.request_session_cover(
  p_group_id uuid,
  p_session_date date,
  p_reason public.cover_reason,
  p_reason_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_cover_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The authorization IS the derivation: you may file an absence only for a
  -- session you are expected at. That admits an assigned gedu and an approved
  -- sub alike — which is the whole of "a sub can ask for a sub" — and refuses
  -- somebody who already has a live request, so filing twice is impossible
  -- before the unique index has to say so.
  IF NOT public.gedu_is_expected_at_session(v_caller, p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL THEN
    RAISE EXCEPTION 'a cover request needs a reason category'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- Today or later in the PRODUCT's timezone. Date granularity on purpose: the
  -- handbook's own norm is same-day filing, and a date comparison needs no
  -- schedule expansion. This is deliberately LOOSER than the card, which hides
  -- the action once the session's end has passed — same posture as every other
  -- write validator here.
  IF p_session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'a cover request cannot be filed for a past session (%)', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role being covered: the filer's assignment role, or — when the filer is
  -- themselves a sub — the role stored on the cover they hold.
  SELECT a.role INTO v_role
    FROM public.gedu_group_assignments a
   WHERE a.group_id = p_group_id
     AND a.gedu_id  = v_caller;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_cover_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.covered_by   = v_caller
       AND r.status       = 'covered'::public.cover_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to cover for gedu % on group % (%)', v_caller, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_cover_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, v_caller, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.cover_request_document(v_row, false, v_caller);
END;
$$;

CREATE FUNCTION public.withdraw_session_cover_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_cover_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  -- A request that is not there and a request that is somebody else's are
  -- refused identically, so this cannot be used as an oracle for real ids.
  IF NOT FOUND OR v_row.requested_by IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- `open` only. The requester cannot withdraw after approval — once an admin
  -- has staffed the session, changing it back is the admin's call, which is what
  -- the session-card editor is for.
  IF v_row.status <> 'open'::public.cover_request_status THEN
    RAISE EXCEPTION 'this cover request is % and can no longer be withdrawn by its requester', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.session_cover_requests
     SET status = 'withdrawn'::public.cover_request_status
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public.cover_request_document(v_row, false, v_caller);
END;
$$;

CREATE FUNCTION public.offer_session_cover(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_timezone text;
  v_row      public.session_cover_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'open'::public.cover_request_status THEN
    RAISE EXCEPTION 'this cover request is % and is no longer taking offers', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone INTO v_timezone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = v_row.group_id;

  IF v_row.session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'this session (%) is in the past', v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.gedu_may_cover_session(
           v_caller, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Idempotent on the unique key: offering twice is one offer, and a double-tap
  -- is not an error worth surfacing.
  INSERT INTO public.session_cover_offers (request_id, gedu_id)
  VALUES (p_request_id, v_caller)
  ON CONFLICT (request_id, gedu_id) DO NOTHING;

  RETURN public.cover_request_document(v_row, false, v_caller);
END;
$$;

CREATE FUNCTION public.withdraw_session_cover_offer(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_cover_requests;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Keyed on the REQUEST rather than the offer, because the pool list's button
  -- knows which request it is looking at and an offer id would be a second
  -- identifier for the caller's one row. Refused only when the caller is the
  -- approved cover — taking back an offer somebody already staffed you on is a
  -- new absence, not an un-offer. Withdrawing a LOSING offer on a request
  -- covered by somebody else is allowed and does nothing visible.
  IF v_row.status = 'covered'::public.cover_request_status
     AND v_row.covered_by = v_caller THEN
    RAISE EXCEPTION 'you are the approved cover for this session; file a cover request instead'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.session_cover_offers o
   WHERE o.request_id = p_request_id
     AND o.gedu_id    = v_caller;

  RETURN public.cover_request_document(v_row, false, v_caller);
END;
$$;

CREATE FUNCTION public.get_open_cover_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The pool list: every open request the caller could actually take. The
  -- exclusion is the `may cover` predicate itself rather than a hand-written
  -- copy of its clauses, so the list and the offer button can never disagree —
  -- a session the gedu is expected at, one they have their own request on, and
  -- their own absence are all out by construction.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being covered belongs to the
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
                   FROM public.session_cover_offers o
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
      FROM public.session_cover_requests r
      JOIN public.product_groups g ON g.id = r.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE r.status = 'open'::public.cover_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND r.session_date <= (now() AT TIME ZONE p.timezone)::date + 60
       AND public.gedu_may_cover_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.approve_session_cover_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller     uuid := (SELECT auth.uid());
  v_request_id uuid;
  v_sub_id     uuid;
  v_group_id   uuid;
  v_row        public.session_cover_requests;
BEGIN
  PERFORM public.assert_admin();

  SELECT o.request_id, o.gedu_id INTO v_request_id, v_sub_id
    FROM public.session_cover_offers o
   WHERE o.id = p_offer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cover offer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.group_id INTO v_group_id
    FROM public.session_cover_requests r
   WHERE r.id = v_request_id;

  -- The (group, date) serialization point, taken first by every admin write.
  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = v_request_id
     FOR UPDATE;

  IF v_row.status <> 'open'::public.cover_request_status THEN
    RAISE EXCEPTION 'this cover request is already %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-asked under the lock, because an offer can go stale between being made
  -- and being approved: the offerer may since have been assigned to the group,
  -- been seated as somebody else's sub on the same date, filed an absence of
  -- their own, or been de-certified.
  IF NOT public.gedu_may_cover_session(
           v_sub_id, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'gedu % can no longer cover group % on %',
                    v_sub_id, v_row.group_id, v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The other offers are deliberately untouched: "not selected" is derived from
  -- the request being covered by somebody else.
  UPDATE public.session_cover_requests
     SET status      = 'covered'::public.cover_request_status,
         covered_by  = v_sub_id,
         approved_by = v_caller,
         approved_at = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public.cover_request_document(v_row, true, v_caller);
END;
$$;

CREATE FUNCTION public.set_session_cover(
  p_group_id uuid,
  p_session_date date,
  p_absent_gedu_id uuid,
  p_sub_gedu_id uuid,
  p_reason public.cover_reason,
  p_reason_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_cover_requests;
  v_exists boolean;
  v_role   public.gedu_assignment_role;
  v_note   text;
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL
     OR p_absent_gedu_id IS NULL OR p_sub_gedu_id IS NULL THEN
    RAISE EXCEPTION 'set_session_cover needs a group, a date, an absent gedu and a sub'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.product_groups g WHERE g.id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  -- The ordinary writable-date check and NOTHING MORE: there is deliberately no
  -- today-or-later requirement here. This is the retroactive path — an
  -- off-platform cover that has already happened has to be recordable, because
  -- gedu invoicing reads these rows.
  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.group_id     = p_group_id
     AND r.session_date = p_session_date
     AND r.requested_by = p_absent_gedu_id
     AND r.status <> 'withdrawn'::public.cover_request_status
     FOR UPDATE;
  v_exists := FOUND;

  IF NOT v_exists THEN
    -- No request: the admin is filing one on the absent gedu's behalf, so the
    -- absent gedu has to actually be expected at the session.
    IF NOT public.gedu_is_expected_at_session(
             p_absent_gedu_id, p_group_id, p_session_date
           ) THEN
      RAISE EXCEPTION 'gedu % is not expected at group % on %',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT a.role INTO v_role
      FROM public.gedu_group_assignments a
     WHERE a.group_id = p_group_id
       AND a.gedu_id  = p_absent_gedu_id;

    IF v_role IS NULL THEN
      SELECT r2.role INTO v_role
        FROM public.session_cover_requests r2
       WHERE r2.group_id     = p_group_id
         AND r2.session_date = p_session_date
         AND r2.covered_by   = p_absent_gedu_id
         AND r2.status       = 'covered'::public.cover_request_status
       LIMIT 1;
    END IF;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'no role to cover for gedu % on group % (%)',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT public.gedu_may_cover_session(
           p_sub_gedu_id, p_group_id, p_session_date, p_absent_gedu_id
         ) THEN
    RAISE EXCEPTION 'gedu % cannot cover group % on %',
                    p_sub_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_exists THEN
    -- An OPEN request becomes covered — which is what "set a sub" reads as when
    -- the absent gedu has already asked. A request that is ALREADY COVERED is
    -- RE-POINTED at the new sub, so replacing a sub is one action rather than a
    -- clear followed by a set. `approved_by` is the acting admin either way.
    -- Reason and note are only overwritten when this call supplies them, so an
    -- admin replacing a sub does not blank what the gedu wrote.
    UPDATE public.session_cover_requests
       SET status      = 'covered'::public.cover_request_status,
           covered_by  = p_sub_gedu_id,
           approved_by = v_caller,
           approved_at = now(),
           reason      = COALESCE(p_reason, reason),
           reason_note = COALESCE(v_note, reason_note)
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.session_cover_requests
      (group_id, session_date, requested_by, role, reason, reason_note,
       status, covered_by, approved_by, approved_at)
    VALUES (p_group_id, p_session_date, p_absent_gedu_id, v_role, p_reason, v_note,
            'covered'::public.cover_request_status, p_sub_gedu_id, v_caller, now())
    RETURNING * INTO v_row;
  END IF;

  -- The replace case can UNSEAT the sub who was there, and a displaced sub who
  -- had filed their own absence no longer holds a seat to be absent from.
  PERFORM public.cascade_withdraw_orphaned_cover_requests(p_group_id, p_session_date);

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = v_row.id;

  RETURN public.cover_request_document(v_row, true, v_caller);
END;
$$;

CREATE FUNCTION public.clear_session_cover(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_group_id     uuid;
  v_session_date date;
  v_row          public.session_cover_requests;
BEGIN
  PERFORM public.assert_admin();

  SELECT r.group_id, r.session_date INTO v_group_id, v_session_date
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cover request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Group first, then the row: one lock order across all four admin writes.
  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  IF v_row.status <> 'covered'::public.cover_request_status THEN
    RAISE EXCEPTION 'this cover request is % and has no cover to clear', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back to `open`, so the session returns to the pool and to the admin queue.
  -- The offers are left alone: they are still people who said they could come.
  UPDATE public.session_cover_requests
     SET status      = 'open'::public.cover_request_status,
         covered_by  = NULL,
         approved_by = NULL,
         approved_at = NULL
   WHERE id = p_request_id
  RETURNING * INTO v_row;

  PERFORM public.cascade_withdraw_orphaned_cover_requests(v_group_id, v_session_date);

  -- Re-read: the sweep can have withdrawn THIS row too, when its own requester
  -- was themselves a sub who has just been unseated.
  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  RETURN public.cover_request_document(v_row, true, v_caller);
END;
$$;

CREATE FUNCTION public.withdraw_session_cover_request_as_admin(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_group_id     uuid;
  v_session_date date;
  v_row          public.session_cover_requests;
BEGIN
  PERFORM public.assert_admin();

  SELECT r.group_id, r.session_date INTO v_group_id, v_session_date
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cover request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  IF v_row.status = 'withdrawn'::public.cover_request_status THEN
    RAISE EXCEPTION 'this cover request is already withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;

  -- "The absent gedu is attending after all." The three cover columns are
  -- blanked with the status because chk_cover_state forbids a withdrawn row from
  -- carrying a sub — so withdrawing a COVERED request unwinds the substitution
  -- rather than freezing it, and the cascade then cleans up after the sub.
  UPDATE public.session_cover_requests
     SET status      = 'withdrawn'::public.cover_request_status,
         covered_by  = NULL,
         approved_by = NULL,
         approved_at = NULL
   WHERE id = p_request_id
  RETURNING * INTO v_row;

  PERFORM public.cascade_withdraw_orphaned_cover_requests(v_group_id, v_session_date);

  SELECT * INTO v_row
    FROM public.session_cover_requests r
   WHERE r.id = p_request_id;

  RETURN public.cover_request_document(v_row, true, v_caller);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_session_cover(uuid, date, public.cover_reason, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_session_cover(uuid, date, public.cover_reason, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.request_session_cover(uuid, date, public.cover_reason, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_cover_request(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_request(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_request(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.offer_session_cover(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.offer_session_cover(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.offer_session_cover(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_open_cover_requests() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_open_cover_requests() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_open_cover_requests() TO service_role;

REVOKE EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_session_cover(uuid, date, uuid, uuid, public.cover_reason, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_session_cover(uuid, date, uuid, uuid, public.cover_reason, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_session_cover(uuid, date, uuid, uuid, public.cover_reason, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.clear_session_cover(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.clear_session_cover(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.clear_session_cover(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_cover_request_as_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_request_as_admin(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_request_as_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.request_session_cover(p_group_id uuid, p_session_date date, p_reason public.cover_reason, p_reason_note text) IS
  '"I cannot make this session", filed by a gedu from a future session''s card. The AUTHORIZATION IS THE DERIVATION: the caller must be EXPECTED at that session, which admits an assigned gedu and an approved sub alike (that is the whole of "a sub can ask for a sub") and refuses anyone who already holds a live request. The reason category is required here and only here — an admin recording an off-platform cover may not know it. The date must pass the ordinary writable-date check AND be today or later in the PRODUCT''s timezone; date granularity is deliberate, the handbook''s own norm being same-day filing, and it is deliberately looser than the card, which hides the action once the session''s end has passed. The role covered is snapshotted from the caller''s assignment role, or from the role on the cover they hold when the caller is themselves a sub. reason_note is trimmed, nulled when empty, and capped at 500 characters by the table''s own CHECK. Returns the request document without reason or reason_note: the filer''s own words come back from the form, and every other gedu-facing document keeps them off the wire.';

COMMENT ON FUNCTION public.withdraw_session_cover_request(p_request_id uuid) IS
  '"I can make it after all", while the request is still `open`. Caller must be the requester, and a request that is somebody else''s is refused exactly as one that does not exist is, so this cannot be used as an oracle for real ids. Refused once an admin has approved a cover: after that, unwinding it is the admin''s call through clear_session_cover or withdraw_session_cover_request_as_admin, because somebody has been told they are working. A withdrawn row is history and does not block a fresh request for the same seat — the live-seat unique index is partial on exactly that.';

COMMENT ON FUNCTION public.offer_session_cover(p_request_id uuid) IS
  '"I can cover this", from the gedu dashboard''s pool list. Guarded on gedu_may_cover_session — certified, not the absent gedu, not already expected at that session, and holding no non-withdrawn request of their own on that (group, date) — plus the request being `open` and dated today or later in the product''s timezone. Idempotent on (request, gedu): offering twice is one offer. There is deliberately no ranking, no eligibility beyond certification, and no notification on any channel; the office decides, and auto-approving the first offer was rejected because the admin step IS the product. Returns the request document, which carries no offer_count for an offerer — who else volunteered is not their business.';

COMMENT ON FUNCTION public.withdraw_session_cover_offer(p_request_id uuid) IS
  'Deletes the caller''s offer on one request — an offer nobody accepted is not a fact worth keeping, so there is no withdrawn state for one. Keyed on the REQUEST rather than the offer, because the button knows which request it is looking at and an offer id would be a second identifier for the caller''s one row. Refused only when the caller IS the approved cover: taking back an offer somebody has already been staffed on is a new absence, which is request_session_cover''s job. Withdrawing a LOSING offer on a request covered by somebody else is allowed and changes nothing visible.';

COMMENT ON FUNCTION public.get_open_cover_requests() IS
  'The gedu dashboard''s "Sessions needing cover": every `open` request dated today or later in the product''s timezone, within the next 60 days, that the CALLER could actually take. The exclusion is gedu_may_cover_session itself rather than a copy of its clauses, so this list and the offer button can never disagree. Each line carries the product shell (type, topic, spoken language, timezone, remote flag or site name, term dates, translations, schedule slots), the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and whether the caller has already offered. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the predicate''s four refusals.';

COMMENT ON FUNCTION public.approve_session_cover_offer(p_offer_id uuid) IS
  'An admin picks one offer, and its gedu becomes the cover: `open` -> `covered`, stamping covered_by, approved_by = the acting admin, and approved_at. Takes the group row''s lock and then the request''s FOR UPDATE, so two admins approving two offers on one session serialize and the second is refused; and re-asks gedu_may_cover_session UNDER THAT LOCK, because an offer goes stale (the offerer gets assigned to the group, gets seated as somebody else''s sub on the same date, files an absence of their own, or is de-certified). The OTHER OFFERS ARE NOT TOUCHED: "not selected" is derived from the request being covered by somebody else, and which offer was approved is the covering gedu''s own offer row — which is why no approved_offer_id exists.';

COMMENT ON FUNCTION public.set_session_cover(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.cover_reason, p_reason_note text) IS
  'The office-arranged path: an admin names the absent gedu and the sub outright, with no offer involved. Three shapes in one function. With NO request for that seat it files one on the absent gedu''s behalf, created already `covered` — and the absent gedu must actually be EXPECTED at the session, with the role taken from their assignment or from the cover they hold. With an OPEN request it covers that request, which is what the admin queue''s approve reads as. With an ALREADY COVERED one it RE-POINTS the cover, so replacing a sub is one action rather than a clear and a set, and the displaced sub''s own absence is then swept by the cascade. There is deliberately NO today-or-later requirement — this is the retroactive path, and an off-platform cover that already happened has to be recordable because gedu invoicing reads these rows. The date still passes the ordinary writable-date check. Reason is optional and is only overwritten when supplied, so an admin replacing a sub does not blank what the gedu wrote. approved_by is the acting admin on every admin path.';

COMMENT ON FUNCTION public.clear_session_cover(p_request_id uuid) IS
  '"That sub is not coming": `covered` -> `open`, blanking covered_by, approved_by and approved_at, so the session returns to the pool list and to the admin queue. The offers are left alone — they are still people who said they could come. Then the fixpoint cascade runs over that (group, date), which is what withdraws the cleared sub''s OWN request if they had filed one: they no longer hold a seat there to be absent from. The cascade can also withdraw THIS row, when its requester was themselves a sub who has just been unseated, which is why the document is re-read before it is returned.';

COMMENT ON FUNCTION public.withdraw_session_cover_request_as_admin(p_request_id uuid) IS
  '"The absent gedu is attending after all": any non-withdrawn request -> `withdrawn`, from the admin session-card editor. The three cover columns are blanked with the status, because chk_cover_state forbids a withdrawn row from carrying a sub — so withdrawing a COVERED request unwinds the substitution rather than freezing it, and the same fixpoint cascade as clear_session_cover then cleans up after the displaced sub. Distinct from withdraw_session_cover_request, which is the gedu''s own and works on an `open` request only.';

-- ---------------------------------------------------------------------------
-- 7. The reads, widened in place
--
-- Widened IN PLACE rather than under versioned names. The gedu and admin
-- documents' client schemas are tolerant of unknown keys, so the deploy window
-- costs a stripped field and nothing else; the one STRICT schema in the app is
-- the family product feed's, and this migration deliberately does not touch that
-- document — a family learns nothing new about staffing, and the report
-- attribution chip already names whoever wrote it.
--
-- Two of these are DROP + CREATE rather than replaces, and each says why at its
-- own DROP: get_my_assigned_products because RETURNS TABLE gains two columns, and
-- get_gedu_assigned_product because it gains a parameter. Both are re-GRANTed at
-- the foot of this file, because a recreated function comes back
-- PUBLIC-executable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
  v_covers    jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats can be NULL rather than 0, and the difference is the point.
  -- `verified` is NULL for a role none of whose accounts holds a REAL address: a
  -- gamer in sign-in mode `parent` or `username` carries a synthetic
  -- @gamer.sogverse.internal handle nobody will ever click a link in, so "0
  -- verified" would report a problem that does not exist. A gamer in mode
  -- `email` holds a real mailbox and counts exactly like everyone else — which
  -- is why the test below is the ADDRESS and not the role (00235). `certified`
  -- is the same NULL-means-no-meaning shape for a simpler reason: only an
  -- educator can be certified.
  --
  -- A role with no accounts at all still reports 0 rather than NULL — the
  -- addressable test only speaks about accounts that exist, and an empty tile
  -- has nothing to say either way.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN COALESCE(c.total, 0) > 0
                                 AND COALESCE(c.addressable, 0) = 0 THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             -- "Holds an address a human reads." True of every non-gamer, and
             -- of a gamer exactly when their parent chose sign-in mode `email`.
             -- A gamer row missing from gamer_profiles is a data error and
             -- lands on the conservative side: not addressable.
             count(*) FILTER (
               WHERE pr.role <> 'gamer' OR gmr.sign_in = 'email'
             )                                                        AS addressable,
             count(*) FILTER (
               WHERE pr.email_verified_at IS NOT NULL
                 AND (pr.role <> 'gamer' OR gmr.sign_in = 'email')
             )                                                        AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp   ON gp.user_id  = pr.id
        LEFT JOIN public.gamer_profiles gmr ON gmr.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` (00213) is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               ),
               'criminal_record_check_at', gp.criminal_record_check_at
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Six kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `empty_groups_without_gedu` (00241) — a group with no educator AND no
  --                           active member. An admin pre-building next term's
  --                           groups has not made a mistake, which is why this is
  --                           a SEPARATE and LOWER-ranked kind rather than part
  --                           of the one above — but it is still a loose end
  --                           somebody has to come back to, so it is named rather
  --                           than carved out of the group check, which is what
  --                           it was before this migration.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'empty_groups_without_gedu', eg.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
             ) AS doc
        FROM candidate c
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The same question asked of the OTHER half of the unstaffed groups
        -- (00241): no educator, and nobody in it either. Deliberately a second
        -- lateral with an inverted membership test rather than a flag on the one
        -- above, because the page ranks the two differently and one wire fact per
        -- kind of wrong is what its ranking maps over. The EXISTS / NOT EXISTS
        -- pair is what makes the two arrays disjoint: no group can be in both,
        -- and a group somebody teaches is in neither.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND NOT EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) eg
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state" (00207). An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR jsonb_array_length(eg.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
    ) s;

  -- ---------------------------------------------------------------------------
  -- 5. The cover queue: open cover requests an admin has to staff.
  --
  -- Dated TODAY OR LATER in the product's own timezone — a request whose date
  -- has passed is UNFILLED, which is a derived state of an open request and not
  -- something an admin can still act on, so it drops out on its own with no
  -- clock anywhere. The whole reason travels here (category and note), because
  -- this is the one surface the reason was collected for; everywhere else it is
  -- admin-only or absent.
  --
  -- Each offer ships the certification queue's own two standing facts —
  -- certified and criminal_record_check_at — so the panel draws the same chips
  -- it draws there rather than inventing a second vocabulary for the same two
  -- questions. An empty array is the all-clear, exactly as the attention queue
  -- reads its own.
  --
  -- An orphaned request (the schedule's weekday moved after it was filed) is
  -- still here, and that is deliberate: it orders by DATE and never by a
  -- derived instant, so a date the schedule no longer projects sorts like any
  -- other and an admin can clear it.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(q.doc ORDER BY q.session_date, q.product_id, q.id), '[]'::jsonb)
    INTO v_covers
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
                 ), '[]'::jsonb)
               ),
               'offers', COALESCE((
                 SELECT jsonb_agg(
                          jsonb_build_object(
                            'id',         o.id,
                            'gedu_id',    o.gedu_id,
                            'first_name', op.first_name,
                            'last_name',  op.last_name,
                            'certified',  COALESCE(ogp.certified, false),
                            'criminal_record_check_at', ogp.criminal_record_check_at,
                            'created_at', o.created_at
                          )
                          ORDER BY o.created_at, o.id
                        )
                   FROM public.session_cover_offers o
                   JOIN public.profiles op ON op.id = o.gedu_id
                   LEFT JOIN public.gedu_profiles ogp ON ogp.user_id = o.gedu_id
                  WHERE o.request_id = r.id
               ), '[]'::jsonb)
             ) AS doc
        FROM public.session_cover_requests r
        JOIN public.product_groups g ON g.id = r.group_id
        JOIN public.products p       ON p.id = g.product_id
        JOIN public.profiles rq      ON rq.id = r.requested_by
       WHERE r.status = 'open'::public.cover_request_status
         AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
    ) q;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule,
    'cover_requests',     v_covers
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
  v_gedus      jsonb;
  v_covers     jsonb;
  v_viewer     uuid    := (SELECT auth.uid());
  v_is_admin   boolean;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  v_is_admin := public.is_admin();

  IF NOT v_is_admin
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    -- 00227. Staff-facing only, and the one thing a client needs before it can
    -- decide that the final session owes creations: the condition is derived on
    -- the client from this flag, the schedule and the roster's creations, so no
    -- document carries an "owed" field of its own.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel (00203): the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair (00203), in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- 00227, and the one field on this roster that is NOT staff-only: the
        -- member's own family reads the same list on their product page. It
        -- rides here because the roster is where the per-gamer dialog is opened
        -- from, and because the client derives the final session's fourth
        -- completeness condition by tallying it against this same roster.
        -- Always an array, never null.
        'creations',                  COALESCE(gc.creations, '[]'::jsonb)
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
        -- Same key, same guarantee.
        LEFT JOIN public.gamer_group_creations gc
               ON gc.group_id       = part.group_id
              AND gc.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- The session's photos (00222). `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  -- The group's STAFF, with roles. The client's staffing derivation needs two
  -- inputs — who is assigned and in what role, and the non-withdrawn requests
  -- for the date — and this is the first of them. First name only, exactly as
  -- every other staff list on this surface: a workspace names colleagues, it
  -- does not carry their records.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name,
        'role',       ga.role
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = p_group_id
    ) AS gedu_rows;

  -- Every NON-WITHDRAWN cover request on the group, unbounded — exactly as this
  -- document already returns every stored session row. A withdrawn request is
  -- history that changes nothing about who is expected, so it is the one status
  -- that does not travel. The client merges these onto its entries by date; a
  -- projected date with no session row carries its requests like any other.
  --
  -- `reason` and `reason_note` ride only for an ADMIN. This document is served
  -- to an admin too (the admin group details page renders the gedu workspace's
  -- body), so the flag is the CALLER's role rather than a property of the RPC —
  -- which is what keeps a `sick` category, which is health data about a
  -- contractor, off a colleague's screen while the one document stays one
  -- document.
  SELECT COALESCE(
           jsonb_agg(
             public.cover_request_document(r, v_is_admin, v_viewer)
             ORDER BY r.session_date DESC, r.created_at, r.id
           ),
           '[]'::jsonb
         )
    INTO v_covers
    FROM public.session_cover_requests r
   WHERE r.group_id = p_group_id
     AND r.status <> 'withdrawn'::public.cover_request_status;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions,
    'gedus',    v_gedus,
    'covers',   v_covers
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_admin_product_sessions(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product jsonb;
  v_site    jsonb;
  v_groups  jsonb;
  v_viewer  uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The schedule parameters and nothing else. The page already holds the
  -- product row from the admin product read; what it cannot get from there is
  -- the slot list in the shape the client's calendar walk takes, which is why
  -- these four fields travel and the rest do not.
  SELECT jsonb_build_object(
    'id',         p.id,
    'timezone',   p.timezone,
    'start_date', p.start_date,
    'end_date',   p.end_date,
    'is_remote',  p.is_remote,
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  -- The venue, on in-person products only — the same test
  -- `get_gedu_group_feed` makes, and for the same reason: a remote municipality
  -- club carries a location_id (a municipality, by CHECK), so "has a location"
  -- would put a door code and a caretaker's name on a club with no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd        ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = p_product_id
    AND p.is_remote = false;

  -- Ordered by (created_at, id), which is the order the groups panel on the
  -- same page lists them in. The group selector sits directly above that panel;
  -- two orders on one page would be a bug the reader has to notice.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'created_at', entry->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',          g.id,
        'name',        g.name,
        'created_at',  g.created_at,
        'public_note', g.public_note,
        'gedu_note',   g.gedu_note,

        -- Register-shaped and nothing more: who may be marked, and what to call
        -- them. See 00200's header for why it is not the group feed's roster.
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id', part.participant_id,
                   'first_name',     gmp.first_name
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp ON gmp.id = part.participant_id
           WHERE part.group_id = g.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb),

        -- Every stored row for the group, in the SAME shape
        -- `get_gedu_group_feed` emits — the two are read by one card component
        -- and must not disagree about what a session is. An orphan the schedule
        -- no longer projects is history and travels too.
        'sessions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',                s.id,
                   'session_date',      s.session_date,
                   'starts_at',         s.starts_at,
                   'ends_at',           s.ends_at,
                   'report',            s.report,
                   'gedu_note',         s.gedu_note,
                   'created_at',        s.created_at,
                   'updated_at',        s.updated_at,
                   'created_by',        s.created_by,
                   'updated_by',        s.updated_by,
                   -- When the report was mailed to the families, NULL until it
                   -- was. Its audit partner `report_emailed_by` stays off the
                   -- wire here exactly as it does on the gedu feed.
                   'report_emailed_at', s.report_emailed_at,
                   -- The session's LAST EDITOR, not the report's author. An
                   -- admin who corrects one tick is named here, which is what
                   -- the chip on the card claims and is true.
                   'updated_by_first_name', (
                     SELECT pr.first_name
                       FROM public.profiles pr
                      WHERE pr.id = s.updated_by
                   ),
                   -- The session's photos (00222, reaching this document in
                   -- 00223). Byte-for-byte the gedu feed's aggregate, because
                   -- one card component renders both: {id, width, height} per
                   -- photo, ordered by (created_at, id) — the stamp is
                   -- clock_timestamp() taken under the session row's lock and
                   -- the id breaks a sub-tick tie, so every surface draws the
                   -- same order — and an empty array rather than a null when
                   -- there are none. `created_by` is deliberately off the wire,
                   -- for the same reason `report_emailed_by` above is: it is
                   -- safeguarding audit, it gates nothing and nothing renders
                   -- it. The URL is derived from the id by one helper rather
                   -- than stored.
                   'images', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'id',     img.id,
                              'width',  img.width,
                              'height', img.height
                            ) ORDER BY img.created_at, img.id)
                       FROM public.group_session_images img
                      WHERE img.session_id = s.id
                   ), '[]'::jsonb),
                   -- Sparse map keyed by participant id. A roster member absent
                   -- from it is UNMARKED, which is not 'absent'.
                   'attendance', COALESCE((
                     SELECT jsonb_object_agg(a.participant_id, a.status)
                       FROM public.session_attendance a
                      WHERE a.session_id = s.id
                   ), '{}'::jsonb)
                 ) ORDER BY s.session_date DESC)
            FROM public.group_sessions s
           WHERE s.group_id = g.id
        ), '[]'::jsonb),

        -- The group's staff, with roles — the first input the session card's
        -- staffing line needs, in the same shape get_gedu_group_feed emits it,
        -- because one card component renders both documents.
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         pr.id,
                   'first_name', pr.first_name,
                   'role',       ga.role
                 ) ORDER BY pr.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles pr ON pr.id = ga.gedu_id
           WHERE ga.group_id = g.id
        ), '[]'::jsonb),

        -- Every non-withdrawn cover request on the group, in the gedu feed's
        -- shape verbatim and for the same reason the session shape is: one card
        -- component renders both. `reason` and `reason_note` DO travel here —
        -- this document is admin-only end to end, and the reason is what the
        -- staffing editor shows beside the request.
        'covers', COALESCE((
          SELECT jsonb_agg(
                   public.cover_request_document(r, true, v_viewer)
                   ORDER BY r.session_date DESC, r.created_at, r.id
                 )
            FROM public.session_cover_requests r
           WHERE r.group_id = g.id
             AND r.status <> 'withdrawn'::public.cover_request_status
        ), '[]'::jsonb)
      ) AS entry
        FROM public.product_groups g
       WHERE g.product_id = p_product_id
    ) AS group_rows;

  RETURN jsonb_build_object(
    'product', v_product,
    'site',    v_site,
    'groups',  v_groups
  );
END;
$$;
-- A new parameter, so this is a DROP and a CREATE rather than a replace (and
-- therefore a re-GRANT). `p_group_id` defaults to NULL, so every existing call
-- site — and the old app during the deploy window — keeps working unchanged.
DROP FUNCTION IF EXISTS public.get_gedu_assigned_product(uuid);

CREATE FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  -- This RPC is the door to the whole workspace, so its gate and its "which
  -- group is mine" resolution are ONE question and are answered together. A
  -- cover has no assignment row to resolve a group from, which is why the
  -- resolution had to be widened alongside the gate rather than only the gate.
  IF p_group_id IS NOT NULL THEN
    -- An explicit group: the cover card's link carries one, so a gedu covering
    -- a SIBLING group of a product they already teach lands in the right
    -- workspace instead of their own group's. It must belong to this product
    -- and be one the caller is assigned to or covers — gedu_teaches_group is
    -- exactly that pair of questions since this migration.
    SELECT g.id
      INTO v_my_group_id
      FROM product_groups g
     WHERE g.id         = p_group_id
       AND g.product_id = p_product_id
       AND public.gedu_teaches_group(g.id);
  ELSE
    SELECT group_id
      INTO v_my_group_id
      FROM gedu_group_assignments
     WHERE product_id = p_product_id
       AND gedu_id    = v_caller_id
     LIMIT 1;

    -- No assignment on this product: a pure cover. Resolve the covered group,
    -- deterministically ordered so two live covers on one product answer the
    -- same way every call. (The card always sends p_group_id, so this arm is
    -- the fallback for a bare link rather than the normal path.)
    IF v_my_group_id IS NULL THEN
      SELECT g.id
        INTO v_my_group_id
        FROM product_groups g
       WHERE g.product_id = p_product_id
         AND public.gedu_covers_group(g.id)
       ORDER BY g.created_at, g.id
       LIMIT 1;
    END IF;
  END IF;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- 00227, in shell parity with get_gedu_group_feed's for the same reason the
    -- rosters are in parity: the page composes both documents.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
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
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        -- Every active seat on the group, whoever holds it. Spelled for a gamer
        -- until 00175, at which point counting an adult parent under that name
        -- became a lie the badge repeated on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        -- Each educator now carries their assignment ROLE — primary or
        -- assistant. Every read that LISTS a group's staff carries it, because
        -- "who is on this group" and "in what capacity" are one answer, and the
        -- role is a pay CLASS rather than a figure.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'role',       ga.role
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check (00177) keeps
                         -- it in step with the feed: an id transposition yields
                         -- NULL rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair (00203). Emitted for every
                         -- roster row, note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name,
                         -- 00227, in parity with the feed's roster. Always an
                         -- array, never null.
                         'creations',                  COALESCE(gc.creations, '[]'::jsonb)
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
                -- Same key, same guarantee.
                LEFT JOIN public.gamer_group_creations gc
                       ON gc.group_id       = part.group_id
                      AND gc.participant_id = part.participant_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;
-- RETURNS TABLE, so widening the row is a DROP and a CREATE rather than a
-- replace — and therefore a re-GRANT, since a recreated function comes back
-- PUBLIC-executable. The old app's zod contract strips the two new columns, so
-- the deploy window costs nothing on the read side.
DROP FUNCTION IF EXISTS public.get_my_assigned_products();

CREATE FUNCTION public.get_my_assigned_products() RETURNS TABLE(product_id uuid, group_id uuid, timezone text, start_date date, end_date date, is_remote boolean, product_type public.product_type, product_translations jsonb, schedule_slots jsonb, group_count integer, participant_count integer, kind text, covered_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gedu_id UUID := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- Two arms, discriminated by `kind`, because a gedu's dashboard now has two
  -- kinds of thing on it: a standing ASSIGNMENT (one row per assignment, as
  -- before, `covered_date` null) and a live COVER (one row per covered date,
  -- `covered_date` set). They share every product-shell column, which is why
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
    NULL::date         AS covered_date
  FROM gedu_group_assignments a
  JOIN products p ON p.id = a.product_id
  WHERE a.gedu_id = v_gedu_id

  UNION ALL

  -- The caller's LIVE covers: one row per covered (group, date) whose access
  -- window is still open. `gedu_covers_session` carries the whole of "live" —
  -- it is keyed to auth.uid(), requires the holder to still be certified, and
  -- applies the window expression — so nothing here restates any of it. The
  -- status test beside it is not redundant either: it is what makes the join
  -- read as "a covered request", and the predicate then decides whether it is
  -- still current.
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
    'cover'::text   AS kind,
    r.session_date  AS covered_date
  FROM session_cover_requests r
  JOIN product_groups g ON g.id = r.group_id
  JOIN products p       ON p.id = g.product_id
  WHERE r.covered_by = v_gedu_id
    AND r.status     = 'covered'::public.cover_request_status
    AND public.gedu_covers_session(r.group_id, r.session_date);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    -- The caller's SEATS on groups, of which there are now two kinds. The union
    -- is the whole of the change to this function: everything below it is
    -- written against a (product, group) pair and a possible covered DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per gedu_group_assignments row, exactly as
    --     before, with `covered_date` null.
    --   * `cover`      — one row per LIVE covered date. gedu_covers_session
    --     carries the whole of "live": keyed to auth.uid(), the holder still
    --     certified, and the access window still open.
    --
    -- `gedu_id` is carried through rather than dropped so the closing
    -- `WHERE a.gedu_id = v_uid` still reads as the statement it always was.
    WITH seat AS (
      SELECT a0.product_id,
             a0.group_id,
             a0.gedu_id,
             'assignment'::text AS kind,
             NULL::date         AS covered_date
        FROM public.gedu_group_assignments a0
       WHERE a0.gedu_id = v_uid
      UNION ALL
      SELECT g0.product_id,
             r0.group_id,
             r0.covered_by AS gedu_id,
             'cover'::text  AS kind,
             r0.session_date AS covered_date
        FROM public.session_cover_requests r0
        JOIN public.product_groups g0 ON g0.id = r0.group_id
       WHERE r0.covered_by = v_uid
         AND r0.status     = 'covered'::public.cover_request_status
         AND public.gedu_covers_session(r0.group_id, r0.session_date)
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Which kind of seat this row is, and on which date when it is a
               -- cover. The dashboard rollup keys on (product, group) and a
               -- cover card's identity is (group, date) — one card per covered
               -- date, lasting exactly as long as its access window.
               'kind',                    a.kind,
               'covered_date',            a.covered_date,
               -- Renamed from group_gamer_count in 00175: the count is every
               -- active seat on the group, and since 00173 one of those can be
               -- an adult.
               --
               -- It is the WHOLE current roster and stays that way. "How many
               -- gamers are in my group" is a fact about the group today, not
               -- about any one occurrence — the per-occurrence expected size
               -- that condition (1) uses is derived separately below and must
               -- never be routed through this value.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name, a.kind, a.covered_date
           )
      FROM seat a
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

      -- The run's FINAL computed occurrence (00227), which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Seven days ending at end_date, floored at start_date. Slots are weekly,
      -- so a run of a week or more has every weekday in that window and a
      -- shorter run is wholly inside it — which makes the max over the window
      -- the max over the whole run, at a bounded cost.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 6),
                   p.end_date - 6
                 )::timestamp,
                 p.end_date::timestamp,
                 interval '1 day'
               ) AS d
         -- Explicit rather than relying on generate_series answering nothing for
         -- a NULL bound: "an open-ended product never owes" is a decision and it
         -- should be readable as one.
         WHERE p.end_date IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.schedule_slots s
              WHERE s.product_id = p.id
                AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
           )
      ) AS final_occurrence

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

          -- The occurrence's END INSTANT — one value per occurrence, and the
          -- same value whichever arm of the union above produced it.
          --
          -- The union is deliberately left keyed on the date alone: carrying an
          -- end instant through it would let one date arrive twice with two
          -- different ends and count the occurrence twice. So it is resolved
          -- here instead — the stored row's own `ends_at` where the occurrence
          -- has a row, and otherwise the schedule's arithmetic.
          --
          -- MIN over the weekday's slots, not MAX, and that is not arbitrary:
          -- the projected arm admits a date when EXISTS a slot whose end has
          -- passed, and `EXISTS (end <= now)` is exactly `min(end) <= now`. The
          -- "has it finished" test and the "who did it expect" test therefore
          -- read the same instant by construction rather than by inspection.
          --
          -- Today the choice is moot, and it is worth naming WHY rather than
          -- leaving the guarantee incidental: `schedule_slots_product_id_weekday_key`
          -- is UNIQUE (product_id, weekday), so a weekday carries at most one
          -- slot and this MIN ranges over exactly one row. That is also what
          -- keeps the TypeScript twin in step, since its projection maps one
          -- slot per weekday and cannot pick a different one. **If that
          -- constraint is ever relaxed — the group_sessions unique key already
          -- flags multi-slot days as a revisit — the twins DIVERGE:** this side
          -- would take the minimum end, while the client's takes the
          -- earliest-STARTING slot's end, and those differ whenever the slot
          -- that starts earlier runs longer. Whoever relaxes it changes both
          -- halves in the same commit, or the badge and the card start
          -- disagreeing on multi-slot days only.
          CROSS JOIN LATERAL (
            SELECT COALESCE(
                     (SELECT gs5.ends_at
                        FROM public.group_sessions gs5
                       WHERE gs5.group_id     = g.id
                         AND gs5.session_date = occurrence.session_date),
                     (SELECT min(((occurrence.session_date + s2.start_time) AT TIME ZONE p.timezone)
                                 + make_interval(mins => s2.duration_minutes))
                        FROM public.schedule_slots s2
                       WHERE s2.product_id = p.id
                         AND s2.weekday = (EXTRACT(ISODOW FROM occurrence.session_date)::integer - 1))
                   ) AS ends_at
          ) AS occurrence_end

          -- How many the register was FOR — the members who had joined the
          -- group before this occurrence ended.
          --
          -- Separate from roster.roster_size on purpose: that one is the whole
          -- current roster and answers the dashboard card's headcount and the
          -- empty-group exemption, neither of which is a per-occurrence
          -- question.
          --
          -- The NULL branches are explicit rather than left to a comparison's
          -- behaviour on NULL, and both point the same way — expected. A seat
          -- with no stamp holds no group, so it cannot be here at all; an
          -- occurrence with no end instant cannot arise either. Where the
          -- unreachable happens anyway, the answer is the behaviour that
          -- predates this migration, which costs a mark nobody needed rather
          -- than producing a false "complete".
          CROSS JOIN LATERAL (
            SELECT COUNT(*)::integer AS expected_size
              FROM public.participations part4
             WHERE part4.group_id = g.id
               AND part4.status   = 'active'::public.participation_status
               AND (part4.group_joined_at IS NULL
                    OR occurrence_end.ends_at IS NULL
                    OR part4.group_joined_at <= occurrence_end.ends_at)
          ) AS expected

         WHERE roster.roster_size > 0
           -- A COVER row owes ONE date: the one it covers. The four conditions
           -- below are untouched and simply see a set of one occurrence, which
           -- is what "the same code path, restricted to that date" means — no
           -- second computation, and in particular the creations condition (4)
           -- fires for a cover only when the covered date really is the run's
           -- final occurrence. An ASSIGNMENT row sees every occurrence, as
           -- before.
           AND (a.covered_date IS NULL OR occurrence.session_date = a.covered_date)
           -- A date the caller holds a NON-WITHDRAWN request on is not their
           -- work, whichever kind of seat this row is: they have said they
           -- cannot be there. The badge must not count it, whether the request
           -- is still open, already covered, or a sub-of-sub chain's second
           -- link. This has a TWIN IN TYPESCRIPT (see the comment below on the
           -- four conditions) and the twin learns the same rule.
           AND NOT EXISTS (
             SELECT 1
               FROM public.session_cover_requests rq
              WHERE rq.group_id     = g.id
                AND rq.session_date = occurrence.session_date
                AND rq.requested_by = v_uid
                AND rq.status <> 'withdrawn'::public.cover_request_status
           )
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That includes the
           -- CREATIONS condition (4) below — which, since 00243, is scoped by
           -- the same join-date test (1) is — and which members a session is
           -- FOR at all: the TS side asks the same question of the same
           -- instant, with the same inclusive boundary, in both conditions.
           AND (
             -- (1) Some of the members this session EXPECTED have no answer
             -- yet. Both sides of the comparison are scoped the same way: marks
             -- are counted only for members who had joined before the
             -- occurrence ended, and they are compared against how many such
             -- members there are.
             --
             -- Before 00243 this compared every mark against the whole current
             -- roster, so placing a member into a group reopened every session
             -- in its history and the only way to clear the alert was to record
             -- an absence that never happened. The reasoning was that nobody
             -- had yet said whether that child was there; there was no question
             -- to answer, because they were not in the group.
             --
             -- Still measured against the CURRENT roster rather than the stored
             -- map's keys, which is a different rule and unchanged: a member
             -- who has LEFT stops being asked about.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                  AND (part2.group_joined_at IS NULL
                       OR occurrence_end.ends_at IS NULL
                       OR part2.group_joined_at <= occurrence_end.ends_at)
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < expected.expected_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             --
             -- Unscoped by who had joined, and that is right: a session owes the
             -- families a write-up whoever was in the room.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
             -- (3) The families have not been told it is there (00197).
             -- Writing the report is half the job; a report nobody was mailed
             -- about is a report nobody reads, so a session stays owed until
             -- the send has been claimed.
             --
             -- NOT EXISTS again, for the same reason as (2): a date with no
             -- materialized row is the same answer as a row that was never
             -- mailed, and neither is a LEFT JOIN's three-valued NULL test.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs4
                WHERE gs4.group_id     = g.id
                  AND gs4.session_date = occurrence.session_date
                  AND gs4.report_emailed_at IS NOT NULL
             )
             -- (4) The FINAL session of a product that requires creations, with
             -- somebody on the current roster who has none (00227). Creations
             -- are part of the last session's work, so this fires on exactly one
             -- occurrence per run and only once that occurrence has finished —
             -- which is free, because every member of this set has finished.
             --
             -- Measured over the CURRENT roster, scoped exactly as (1) is: only
             -- the members who had joined the group before the FINAL occurrence
             -- ended. The owner's principle is that if a gamer was in the group
             -- at the time of the last session, then the gedu owes that gamer a
             -- creation — so a seat placed into the group after that session
             -- had already finished owes nothing and cannot reopen a run that
             -- was square.
             --
             -- This shipped one revision unscoped, and the gap is the argument
             -- for closing it: the same member could be absent from the final
             -- session's register — not asked about, not counted, not drawn —
             -- while still being counted here as owing a creation FOR that
             -- session. One occurrence, two answers to one question about who
             -- it was for. Both conditions now ask it once.
             --
             -- The other half of "was in the group at the time" is not
             -- expressible here and is not attempted: a member who WAS in the
             -- group at the final session and has since left owes nothing,
             -- because this EXISTS ranges over active seats and a departure
             -- leaves nothing behind to measure. Leaving clears the debt, in
             -- both twins, as a limit of the data.
             --
             -- An empty roster is already excluded by the roster_size guard
             -- above, so nothing here has to restate it. A group whose every
             -- seat postdates the final session is NOT excluded by that guard —
             -- it has a roster — and falls out of this condition instead: no
             -- seat passes the join-date predicate, so the EXISTS is false and
             -- nothing is owed, which is the same answer for the same reason.
             --
             -- The array-length test is defensive: the CHECK on the table
             -- refuses an empty array and the write RPC deletes the row instead
             -- of storing one, so "no row" is the only reachable empty. It costs
             -- nothing and it states what "has a creation" means.
             OR (
               p.requires_gamer_creations
               AND occurrence.session_date = final_occurrence.session_date
               AND EXISTS (
                 SELECT 1
                   FROM public.participations part3
                  WHERE part3.group_id = g.id
                    AND part3.status   = 'active'::public.participation_status
                    -- The same three-branch shape (1) and the expected-size
                    -- lateral use, against the same per-occurrence end instant,
                    -- and NULL points the same way in both: expected, which is
                    -- the behaviour that predates this file and can only ever
                    -- ask for a creation nobody needed rather than declare a
                    -- run finished that is not.
                    AND (part3.group_joined_at IS NULL
                         OR occurrence_end.ends_at IS NULL
                         OR part3.group_joined_at <= occurrence_end.ends_at)
                    AND NOT EXISTS (
                      SELECT 1
                        FROM public.gamer_group_creations c
                       WHERE c.group_id       = g.id
                         AND c.participant_id = part3.participant_id
                         AND jsonb_array_length(c.creations) > 0
                    )
               )
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        -- The assignment ROLE rides each pill, which is what the groups panel's
        -- role select reads and writes back through apply_group_changes. This
        -- panel is the permanent-assignment editor; the session-card staffing
        -- editor is a different tool and deliberately does not link to it.
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email,
                     'role',       ga.role
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_date_of_birth',      gprof.date_of_birth,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check (00177) makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
                     -- The staff-only flair (00203), identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps (00207), identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  --
  -- The two seat-offer stamps (00207) are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_gedu_id_text    TEXT;
  v_temp_map        JSONB := '{}'::jsonb;
  v_inline_gedu     JSONB;
  v_role            public.gedu_assignment_role;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    DELETE FROM gedu_group_assignments
     WHERE group_id = (v_assignment->>'groupId')::UUID
       AND gedu_id  = (v_assignment->>'geduId')::UUID;
  END LOOP;

  IF array_length(p_deleted_group_ids, 1) > 0 THEN
    DELETE FROM product_groups
     WHERE id = ANY(p_deleted_group_ids)
       AND product_id = p_product_id;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_renamed_groups) LOOP
    UPDATE product_groups
       SET name = v_group->>'name'
     WHERE id = (v_group->>'groupId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    -- An added group's educators now arrive as objects carrying a ROLE:
    -- `gedus: [{ geduId, role }]`. Every assignment has a role as of this
    -- migration, and the column's DEFAULT is the backfill, so an element that
    -- omits `role` lands as a primary.
    IF jsonb_typeof(v_group->'gedus') = 'array' THEN
      FOR v_inline_gedu IN SELECT * FROM jsonb_array_elements(v_group->'gedus') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (
          v_new_id,
          (v_inline_gedu->>'geduId')::UUID,
          p_product_id,
          COALESCE((v_inline_gedu->>'role')::public.gedu_assignment_role, 'primary')
        );
      END LOOP;
    END IF;

    -- The legacy shape, still read for the deploy window: a bare array of ids,
    -- every one of them a primary. The old app posts this; the new one posts
    -- `gedus` above. Both are accepted, and a caller sending both gets both
    -- (the primary-key conflict on a repeated pair is silenced by the ON
    -- CONFLICT below, not here, so a duplicate inside ONE batch would still
    -- raise — which is the caller's bug rather than a state to absorb).
    IF jsonb_typeof(v_group->'geduIds') = 'array' THEN
      FOR v_gedu_id_text IN SELECT jsonb_array_elements_text(v_group->'geduIds') LOOP
        INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
        VALUES (v_new_id, v_gedu_id_text::UUID, p_product_id, 'primary')
        ON CONFLICT (group_id, gedu_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  -- Explicit conflict target so the (gedu_id, product_id) UNIQUE violation
  -- propagates as an error (an admin trying to assign the same Gedu to two
  -- groups in one product should fail). Only the (group_id, gedu_id)
  -- primary-key conflict is handled here — and as of this migration it UPDATES
  -- the role rather than doing nothing, which is what makes a role change ONE
  -- add rather than a remove plus an add. Re-adding a pair that is already
  -- there is therefore no longer a no-op: it restates the role, which is
  -- exactly what the panel's role select posts.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_added) LOOP
    IF v_temp_map ? (v_assignment->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_assignment->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_assignment->>'groupId')::UUID;
    END IF;

    v_gedu_id := (v_assignment->>'geduId')::UUID;
    v_role    := COALESCE(
                   (v_assignment->>'role')::public.gedu_assignment_role,
                   'primary'
                 );

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role)
    VALUES (v_resolved_group, v_gedu_id, p_product_id, v_role)
    ON CONFLICT (group_id, gedu_id) DO UPDATE
      SET role = EXCLUDED.role;
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id;
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants re-issued on every function this migration created or recreated
--
-- CREATE OR REPLACE preserves an ACL and DROP + CREATE does not, and the rule in
-- supabase/CLAUDE.md does not ask which happened: a migration that creates or
-- recreates a function pairs its per-role GRANTs with an explicit REVOKE ... FROM
-- PUBLIC, because a recreated function comes back PUBLIC-executable. So every
-- touched signature is restated here, with EXACTLY the grants it held before —
-- the two voice predicates deliberately keep their authenticated-only grant, and
-- the two internal gedu_teaches_* predicates their service-role-only one.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.gedu_teaches_group(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_teaches_group(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gedu_teaches_group_product(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_teaches_group_product(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_voice_group_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_voice_group_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_voice_group_moderator(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_voice_group_moderator(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_group_session_report_email(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_group_member_minecraft(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_group_member_roblox(uuid, text, bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_site_notes(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_admin_product_sessions(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_assigned_products() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_assigned_products() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_assigned_products() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Comments
-- ---------------------------------------------------------------------------

-- The five functions whose comment is written whole here: two whose comment was
-- short enough to restate, two that had none at all, and two that were DROPped
-- and therefore lost theirs.

COMMENT ON FUNCTION public.gedu_teaches_group(p_group_id uuid) IS
  'Internal predicate: may the caller act as staff on this group — assigned to '
  'it, OR holding a live cover on it (gedu_covers_group, which carries the '
  'certification test and the access window). The single gate behind the group '
  'workspace, the session notes and report, the register, the session photos and '
  'their delete check, and the group notes; gedu_teaches_gamer composes it too, '
  'which is why that predicate needed no edit of its own. NOT the gate behind '
  'the voice room or the family report mail — both of those are DATE-scoped and '
  'call gedu_covers_session directly, because a sub has no business in the '
  'group''s other sessions and the report mail is at-most-once with no resend. '
  'Not exposed to authenticated: it is called from inside the SECURITY DEFINER '
  'gedu RPCs.';

COMMENT ON FUNCTION public.is_voice_group_member(p_group_id uuid) IS
  'Who may be in this group''s voice room, and therefore — through '
  'is_chat_channel_member — in its in-call chat: an admin, an active seat-holder '
  'of the group, a gedu assigned to ANY group of the group''s product, or a live '
  'cover ON TODAY''S DATE in the product''s timezone. The cover arm is the one '
  'thing on this surface that is date-scoped rather than group-wide, and it is '
  'the narrower of the two deliberate exceptions to "a sub sees everything the '
  'main gedu sees": a sub belongs in the room on the date they are covering and '
  'on no other date of the group. "The session in question" is evaluated at CALL '
  'TIME because the predicate is handed a group and nothing else. The cover arm '
  'ADDS to the assignment arm and narrows nothing — a gedu assigned to the '
  'product keeps the product-wide mobility they already had. Total boolean; '
  'consumed by the voice_zones and chat policies, which is why it is granted to '
  '`authenticated` despite being a predicate.';

COMMENT ON FUNCTION public.is_voice_group_moderator(p_group_id uuid) IS
  'Who MODERATES this group''s voice room and its chat: an admin, a gedu '
  'assigned to any group of the group''s product, or a live cover on today''s '
  'date in the product''s timezone. A POSITIVE allow-list, never an exclusion — '
  'the room learned that the expensive way, a "not a gamer" test having been one '
  'parent-seat release away from handing moderation to parents. Date-scoped on '
  'its cover arm exactly as is_voice_group_member is, and for the same reason: '
  'the two move together, because the chat channel is gated by the pair and a '
  'cover must be in the channel on their own date only.';

COMMENT ON FUNCTION public.get_my_assigned_products() IS
  'Every product the calling gedu has a seat on, one row per seat, with the '
  'product shell, its schedule slots, how many groups it has and how many active '
  'seats (participant_count — renamed from gamer_count in 00175, because a seat '
  'may be held by an adult since 00173). Gedu-gated on its first statement. '
  'TWO KINDS OF SEAT since 00260, discriminated by `kind`: an `assignment` row '
  'per gedu_group_assignments row, with `covered_date` null, exactly as this '
  'function always returned; and a `cover` row per LIVE covered date, with '
  '`covered_date` set — live meaning a `covered` request whose holder is still '
  'certified and whose access window is open, which is the whole of what '
  'gedu_covers_session decides. One RPC rather than two because the two share '
  'every product-shell column and the dashboard card differs in its chrome '
  'rather than in the facts it needs. Widening a RETURNS TABLE is a DROP and a '
  'CREATE, so the two new columns arrive with a re-GRANT; an older client''s '
  'schema strips them.';

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid, p_group_id uuid) IS
  'One round trip for a gedu opening a product they have a seat on: the product '
  'shell, which group is theirs, and every group on the product with its '
  'participant_count and gedus. The roster rides only on the caller''s own group '
  'and is keyed by participant_id (00175) — the same shape get_gedu_group_feed '
  'serves, kept in parity on purpose even though the rendered roster always '
  'comes from the feed''s fresher copy. Since 00195 the shell carries the '
  'product''s topic (which decides whether a game identity is shown at all, and '
  'which one) and each roster entry carries roblox_username/roblox_user_id beside '
  'the Minecraft pair. Since 00203 each roster entry also carries the staff-only '
  'flair — group_joined_at, note and note_updated_by_first_name — emitted '
  'unconditionally, because the join stamp is a fact and the clubs-only newcomer '
  'rule is applied by the client. Since 00227 each roster entry carries '
  '`creations` too (always an array, [] when there is no row) and the shell '
  'carries requires_gamer_creations, both in parity with get_gedu_group_feed for '
  'the same reason every other field is: the page composes both documents. '
  'SINCE 00260 this is THE DOOR A COVER COMES THROUGH, so both halves of it were '
  'widened rather than only the gate: p_group_id is optional and, when given, '
  'must name a group of this product that the caller is assigned to or covers — '
  'which is what lets a gedu covering a SIBLING group of a product they already '
  'teach land in the right workspace instead of their own group''s. Without it '
  'the assignment group is resolved as before, and a caller with no assignment '
  'on the product falls back to their covered group, deterministically ordered. '
  'A caller with neither is refused with 42501, as they always were. Each entry '
  'of `gedus` additionally carries the assignment `role`.';

-- The rest are EXTENDED rather than restated. supabase/CLAUDE.md names the exact
-- failure this avoids — "a hand-copy dropped a clause once" — and these comments
-- run to several hundred words each, every sentence of which is still true. The
-- read is from the catalog and the write is one format(), so the result is
-- deterministic in a from-migrations build and nothing can be lost in transit.
DO $$
DECLARE
  v_target   record;
  v_existing text;
BEGIN
  FOR v_target IN
    SELECT *
      FROM (VALUES
        ('gedu_teaches_group_product', 'gedu_teaches_group_product(uuid)',
         ' Since 00260 it additionally admits a LIVE COVER on the group, and the'
         ' cover arm is deliberately GROUP-only rather than product-wide: an'
         ' assignment is a standing relationship with a product, which is what'
         ' earns the cross-group mobility above, while a cover is one date on one'
         ' group, and widening it to the product would hand a sub the member'
         ' flair of every sibling group they were never asked to stand in for.'),

        ('claim_group_session_report_email', 'claim_group_session_report_email(uuid, date)',
         ' Since 00260 the assignment half is spelled out INLINE here instead of'
         ' calling gedu_teaches_group, and that is a security decision rather'
         ' than a refactor: gedu_teaches_group now admits a live cover on ANY of'
         ' the group''s dates, while this mail is at-most-once with no resend, so'
         ' a sub must not be able to send the families a write-up of a session'
         ' they did not run. The cover arm here is therefore DATE-SCOPED to the'
         ' session being claimed — one of exactly two places on this surface that'
         ' is, the other being the voice room.'),

        ('set_group_member_minecraft', 'set_group_member_minecraft(uuid, text, text)',
         ' Since 00260 the group half also admits a LIVE COVER: the participant'
         ' sits in a group the caller holds a cover on, window open and'
         ' certification intact. A sub running the session is the person with the'
         ' child in front of them and is exactly who can read a handle off their'
         ' screen.'),

        ('set_group_member_roblox', 'set_group_member_roblox(uuid, text, bigint)',
         ' Since 00260 the group half also admits a LIVE COVER, in the same'
         ' change and the same shape as its Minecraft twin — one roster editor'
         ' serves both platforms, so widening one alone would ship a control that'
         ' saves on a Minecraft group and refuses on a Roblox one.'),

        ('set_site_notes', 'set_site_notes(uuid, text, text)',
         ' Since 00260 a live COVER on any group of an in-person product at that'
         ' site passes the site half too. The arm is location-shaped like the'
         ' assignment one beside it rather than borrowed from a group predicate,'
         ' because the question this function asks is about a BUILDING. It is the'
         ' owner''s "a sub sees everything the main gedu sees" applied to the'
         ' lowest-risk write on the surface, which is one fewer special case than'
         ' carving it out would have been.'),

        ('get_admin_dashboard', 'get_admin_dashboard()',
         ' Since 00260 the document carries a FIFTH top-level member,'
         ' cover_requests: every OPEN session cover request dated today or later'
         ' in its product''s timezone, ordered by date then product then id, with'
         ' the group, the product shell and its translations, the requester''s'
         ' name, the role being covered, the reason and note, and every offer with'
         ' its offerer''s name, certified flag and criminal_record_check_at — the'
         ' certification queue''s own two standing facts, so the panel draws the'
         ' same chips rather than inventing a second vocabulary for them. An'
         ' empty array is the all-clear, exactly as the attention queue reads its'
         ' own. A request whose date has PASSED drops out on its own, because'
         ' "unfilled" is a derived state of an open request and not something an'
         ' admin can still act on; a request the schedule no longer projects stays'
         ' in, because this orders by DATE and never by a derived instant. This is'
         ' the ONLY gedu-visible-reason surface besides the admin session'
         ' document: a `sick` category is health data about a contractor.'),

        ('get_gedu_group_feed', 'get_gedu_group_feed(uuid)',
         ' Since 00260 the document carries two more members, both of them inputs'
         ' to the client-side staffing derivation rather than answers from it:'
         ' `gedus`, the group''s assignments as {id, first_name, role}; and'
         ' `covers`, every NON-WITHDRAWN cover request on the group, unbounded,'
         ' in the one shape cover_request_document defines and every cover write'
         ' returns. Withdrawn is the one status that does not travel, because it'
         ' changes nothing about who is expected. The client merges covers onto'
         ' its entries by date, and a projected date with no session row carries'
         ' its requests like any other. `reason` and `reason_note` ride for an'
         ' ADMIN caller only — this document is served to an admin too, so the'
         ' flag is the CALLER''s role rather than a property of the RPC, which is'
         ' what keeps a `sick` category off a colleague''s screen while the one'
         ' document stays one document. `offer_count` rides for an admin and for'
         ' the requester themselves. The GATE is unchanged in shape and widened in'
         ' reach: gedu_teaches_group now admits a live cover on the group, so a'
         ' sub opens the workspace they are covering.'),

        ('get_admin_product_sessions', 'get_admin_product_sessions(uuid)',
         ' Since 00260 each group additionally carries `gedus` ({id, first_name,'
         ' role}) and `covers` (every non-withdrawn cover request on the group),'
         ' both byte for byte get_gedu_group_feed''s — one card component renders'
         ' the session cards of both documents, and the staffing line and the'
         ' Set-a-sub / Clear-sub / Withdraw-request editor are drawn from exactly'
         ' these two arrays. `reason` and `reason_note` DO travel here: this'
         ' document is admin-only end to end, and the reason is what the editor'
         ' shows beside the request.'),

        ('get_my_gedu_assignment_summaries', 'get_my_gedu_assignment_summaries(date)',
         ' Since 00260 the rows are the caller''s SEATS rather than their'
         ' assignments, discriminated by `kind`: an `assignment` row per'
         ' assignment with `covered_date` null, as before, and a `cover` row per'
         ' LIVE covered date (still certified, window still open) with'
         ' `covered_date` set. A cover row''s owed computation is THE SAME CODE'
         ' PATH restricted to that one date — no second computation, and in'
         ' particular the creations condition fires for a cover only when the'
         ' covered date really is the run''s final occurrence. And on every row,'
         ' of either kind, a date the caller holds a NON-WITHDRAWN request on is'
         ' no longer counted: they have said they cannot be there, so the badge'
         ' must not ask them for it, whether the request is open, covered, or the'
         ' second link of a sub-of-sub chain. The TypeScript twin named above'
         ' learns that same rule in the same change.'),

        ('get_product_groups_with_details', 'get_product_groups_with_details(uuid)',
         ' Since 00260 each entry of a group''s `gedus` carries the assignment'
         ' `role` — primary or assistant — which is what the panel''s per-pill'
         ' role select reads and writes back through apply_group_changes. This'
         ' panel remains the PERMANENT assignment editor; the session card''s'
         ' staffing editor is a different tool, and nothing links the two,'
         ' deliberately.')
      ) AS t(proname, signature, addition)
  LOOP
    SELECT obj_description(p.oid, 'pg_proc')
      INTO v_existing
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = v_target.proname;

    IF v_existing IS NULL THEN
      RAISE EXCEPTION
        '% carries no comment to extend — restate it in full instead',
        v_target.proname;
    END IF;

    EXECUTE format('COMMENT ON FUNCTION public.%s IS %L',
                   v_target.signature, v_existing || v_target.addition);
  END LOOP;
END $$;

-- The assignment writer had no comment at all, which is why it is written whole
-- here rather than extended above — and it is worth one, being the single writer
-- of the relationship this whole migration gates on.
COMMENT ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) IS
  'The admin groups panel''s whole batch, applied in one transaction: remove '
  'assignments, delete groups, rename groups, add groups (each with its '
  'educators inline), add assignments, and move participations between groups. '
  'Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two '
  'admins editing one product''s groups serialize rather than interleave. '
  'Removes run BEFORE adds so moving an educator from group A to group B is one '
  'batch — the (gedu_id, product_id) UNIQUE would otherwise refuse the add. '
  'Newly added groups are addressed by a client-minted `tempId` and the returned '
  '`tempMap` hands back the real ids, which is what lets one batch create a '
  'group and move members into it. Since 00260 an assignment carries a ROLE: an '
  'added assignment element is { groupId, geduId, role } and upserts ON CONFLICT '
  '(group_id, gedu_id) DO UPDATE SET role, so a role change is ONE add rather '
  'than a remove plus an add — which also means re-adding an existing pair is no '
  'longer a no-op, it restates the role. An added GROUP''s educators arrive as '
  'gedus: [{ geduId, role }]; the legacy geduIds array of bare ids is still read '
  'for the deploy window and lands every one of them as a primary. An omitted '
  'role is a primary, which is also the column''s default. This function is '
  'DELIBERATELY ASSIGNMENT-ONLY with respect to session covers, and is annotated '
  'as such in the completeness check: it is the writer of the permanent '
  'relationship, not a gate on it.';

-- The certification column now gates THREE things. Restated in full because the
-- sentence that was wrong is the count itself.
COMMENT ON COLUMN public.gedu_profiles.certified IS
  'Whether an admin has vouched for this educator. Gates three things and '
  'nothing else: group assignment (UI-only, because assignment is '
  'admin-driven), instant-voice-room moderation (server-side, because it is '
  'gedu-initiated), and — since 00260 — OFFERING AND HOLDING A SESSION COVER '
  '(server-side, twice over: gedu_may_cover_session refuses an uncertified '
  'offerer or sub, and gedu_covers_session re-checks this column on every access '
  'test, so de-certifying an educator ends a live cover''s reach into the group '
  'mid-window rather than only barring the next one). It is the ONLY eligibility '
  'test the cover pool applies — coverage area, language and schedule clash are '
  'deliberately follow-ups — which is why an uncertified gedu sees an empty '
  '"Sessions needing cover" list rather than a refusal. An uncertified gedu '
  'still has broad platform access by design. Distinct from '
  'profiles.email_verified_at, which is about an address rather than a person; '
  'this column was called "verified" until 00187.';

-- ---------------------------------------------------------------------------
-- 10. What this migration asserts about its own end state
--
-- The completeness check below is the same one tests/db/session-cover.test.ts
-- carries as the PERMANENT home of the rule. It is duplicated here on purpose:
-- the test catches a gate added next year, and this block catches one added
-- between the moment this file was authored and the moment it runs.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  -- Members whose reference to gedu_group_assignments is NOT a gate, each with
  -- the reason it is not. A member that carries neither a cover branch nor an
  -- entry here fails; and an entry here for a member that has SINCE gained a
  -- cover branch, or vanished, fails too — a stale annotation reads as coverage
  -- while covering nothing.
  --
  --   apply_group_changes            — the assignment WRITER. It creates and
  --                                    removes the permanent relationship; a
  --                                    cover is not a thing it can write.
  --   chat_channel_roster_ids        — LISTS who a channel can name. Its own
  --                                    comment already says a covering gedu
  --                                    becomes mentionable once they send, which
  --                                    is the decision, not an oversight.
  --   get_my_family_product_feed     — LISTS the group's gedus by first name for
  --                                    a FAMILY. The report attribution chip
  --                                    already names whoever wrote it, so a
  --                                    family learns nothing new from a cover;
  --                                    and this is the app's one STRICT client
  --                                    schema, so widening it would break the
  --                                    old app's parse rather than be stripped.
  --   get_product_groups_with_details— LISTS a group's gedus for the admin groups
  --                                    panel. Admin-gated; the list is the
  --                                    permanent assignment, which is exactly
  --                                    what that panel edits.
  --   validate_gedu_assignment_product — the assignment TRIGGER. It names the
  --                                    table in a RAISE message.
  --   customers_read_assignments_via_gamers — reads assignment ROWS for a parent.
  --                                    A read of the rows, not a gate on them.
  v_annotated constant text[] := ARRAY[
    'function:apply_group_changes',
    'function:chat_channel_roster_ids',
    'function:get_my_family_product_feed',
    'function:get_product_groups_with_details',
    'function:validate_gedu_assignment_product',
    'policy:gedu_group_assignments.customers_read_assignments_via_gamers'
  ];
  v_unbranched text[];
  v_name       text;
  v_missing    text[] := ARRAY[]::text[];
BEGIN
  -- Sorted under the C collation on purpose: an assertion that depends on a
  -- locale setting is an assertion that fails somewhere else.
  SELECT array_agg(d.k ORDER BY d.k COLLATE "C")
    INTO v_unbranched
    FROM (
      SELECT DISTINCT m.key AS k
        FROM (
          SELECT 'function:' || p.proname::text AS key, p.prosrc AS expr
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.prosrc LIKE '%gedu_group_assignments%'
          UNION ALL
          SELECT 'policy:' || pol.tablename::text || '.' || pol.policyname::text,
                 COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, '')
            FROM pg_policies pol
           WHERE pol.schemaname = 'public'
             AND (COALESCE(pol.qual, '') LIKE '%gedu_group_assignments%'
                  OR COALESCE(pol.with_check, '') LIKE '%gedu_group_assignments%')
        ) m
       WHERE m.expr NOT LIKE '%session_cover_requests%'
         AND m.expr NOT LIKE '%gedu_covers_group%'
         AND m.expr NOT LIKE '%gedu_covers_session%'
    ) d;

  IF COALESCE(v_unbranched, ARRAY[]::text[]) IS DISTINCT FROM v_annotated THEN
    RAISE EXCEPTION
      'the gates on gedu_group_assignments carrying no cover branch are % rather than % — widen the new one, or annotate it here and in tests/db/session-cover.test.ts with a reason',
      COALESCE(v_unbranched::text, '{}'), v_annotated::text;
  END IF;

  -- The two tables: RLS on, and nothing granted to either Data API client role.
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('session_cover_requests', 'session_cover_offers')
       AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'a session-cover table is missing RLS';
  END IF;

  -- has_table_privilege rather than information_schema: the information_schema
  -- grant views are filtered to roles the current user is a member of, which
  -- makes them the wrong instrument for asking about somebody else's privileges.
  IF EXISTS (
    SELECT 1
      FROM (VALUES ('session_cover_requests'), ('session_cover_offers')) AS t(tbl),
           (VALUES ('authenticated'), ('anon')) AS r(role_name),
           (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS pv(priv)
     WHERE has_table_privilege(r.role_name, ('public.' || t.tbl)::regclass, pv.priv)
  ) THEN
    RAISE EXCEPTION
      'a session-cover table is reachable from the Data API — every read and write goes through a SECURITY DEFINER RPC';
  END IF;

  -- The live-seat key is PARTIAL, which is what makes a withdrawn row history
  -- rather than a blocker. A plain unique index here would refuse a gedu who
  -- withdrew and changed their mind.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes i
     WHERE i.schemaname = 'public'
       AND i.indexname = 'session_cover_requests_live_seat'
       AND i.indexdef LIKE '%WHERE%withdrawn%'
  ) THEN
    RAISE EXCEPTION 'the live-seat unique index is missing or is not partial on status';
  END IF;

  -- The role column, and its default — which IS the backfill, and is kept.
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns c
     WHERE c.table_schema  = 'public'
       AND c.table_name    = 'gedu_group_assignments'
       AND c.column_name   = 'role'
       AND c.is_nullable   = 'NO'
       AND c.column_default LIKE '%primary%'
  ) THEN
    RAISE EXCEPTION 'gedu_group_assignments.role is missing, nullable, or has lost its default';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gedu_group_assignments a
     WHERE a.role <> 'primary'::public.gedu_assignment_role
  ) THEN
    RAISE EXCEPTION 'the role backfill did not land: some assignment is not primary';
  END IF;

  -- Exposure, both directions. The nine RPCs the browser calls must be reachable
  -- by `authenticated`; the predicates that are not classified in the spine must
  -- not be, or the build would fail on an unclassified function — which is the
  -- check working, but it is cheaper to say so here.
  FOREACH v_name IN ARRAY ARRAY[
    'request_session_cover', 'withdraw_session_cover_request',
    'offer_session_cover', 'withdraw_session_cover_offer',
    'get_open_cover_requests', 'approve_session_cover_offer',
    'set_session_cover', 'clear_session_cover',
    'withdraw_session_cover_request_as_admin',
    'gedu_covers_group'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN
      v_missing := v_missing || v_name;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION '% is reachable by anon', v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'these functions are not executable by authenticated: %', v_missing::text;
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    'gedu_covers_session', 'gedu_is_expected_at_session',
    'gedu_may_cover_session', 'cover_request_document',
    'cascade_withdraw_orphaned_cover_requests'
  ] LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_name
         AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR has_function_privilege('anon', p.oid, 'EXECUTE'))
    ) THEN
      RAISE EXCEPTION
        '% is an internal helper and must not be reachable from the Data API', v_name;
    END IF;
  END LOOP;

  -- No exposed function may be STRICT: a STRICT function skips its body on NULL
  -- input, so its guard would never run. The spine sweeps the whole schema for
  -- this; restated here for the functions this file adds, because that is the
  -- one property of them a later reader cannot see from the CREATE statements.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE '%cover%'
       AND p.proisstrict
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'an exposed session-cover function is STRICT, so its guard would never run';
  END IF;
END $$;
