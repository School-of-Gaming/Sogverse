-- The pool keeps the absent gedu anonymous, an unseated gedu leaves no live
-- request behind, and a cover survives a session that runs past midnight.
--
-- WHY
--
-- Three defects in the substitution feature 00260 shipped, each of them a case
-- the design states correctly and the code does not.
--
-- 1. THE POOL'S ANONYMITY LEAK. "The pool names the session, never the absent
--    gedu" is the rule, and get_open_cover_requests keeps it — but the two
--    offer RPCs both end in cover_request_document(v_row, false, v_caller),
--    and that document ALWAYS carried requested_by and requested_by_first_name.
--    So any certified gedu could unmask the absent person on any pool row by
--    offering, and — worse — by calling withdraw_session_cover_offer, which
--    deleted nothing when the caller held no offer and returned the document
--    anyway. A free lookup of who is off sick, keyed by request id.
--
--    The identity is now a DISCLOSURE rather than a field: it travels for an
--    admin (p_include_reason), for a viewer who IS the requester, and for a
--    caller that explicitly asks to reveal it because its own reader is staff
--    on the group. Everybody else gets JSON null, in the same shape — the
--    document keeps one shape for every reader, exactly as reason and
--    offer_count already do. And withdraw_session_cover_offer now refuses a
--    caller who holds no offer, so it is a write or it is nothing.
--
--    WHO REVEALS, AND WHY, in full — the answer has to be stated per caller
--    rather than per function, because two of these callers are gedu-facing:
--
--      request_session_cover                   conceal — the filer IS the
--      withdraw_session_cover_request                   requester, so the
--                                                       viewer arm reveals it
--                                                       to them and to nobody
--                                                       else.
--      offer_session_cover                     CONCEAL — the fix. A volunteer
--      withdraw_session_cover_offer                     decides on the session,
--                                                       never on the person.
--      get_open_cover_requests                 n/a     — never built the
--                                                       document; its own row
--                                                       shape omits the absent
--                                                       gedu by construction.
--      approve_session_cover_offer             reveal  — admin-gated, and
--      set_session_cover                                 p_include_reason is
--      clear_session_cover                               already true on all
--      withdraw_session_cover_request_as_admin           four.
--      get_gedu_assigned_product               reveal  — admin-only document
--                                                        end to end.
--      get_gedu_group_feed                     REVEAL  — explicitly, with the
--                                                        new flag. This is the
--                                                        one caller whose
--                                                        reader is not an admin
--                                                        and is still entitled:
--                                                        the gedu workspace is
--                                                        reached only by staff
--                                                        on the group, and the
--                                                        session card's
--                                                        staffing line names
--                                                        who is absent. The
--                                                        REASON still rides on
--                                                        the admin flag alone,
--                                                        so a colleague learns
--                                                        who is away and never
--                                                        that it was `sick`.
--
--    The flag DEFAULTS TO FALSE, so the fail-safe direction is the silent one:
--    a caller added later that forgets it conceals, which is a missing name on
--    a screen rather than a disclosure. That is also why this is a DROP and a
--    CREATE — a fourth parameter is a new signature, and leaving the old
--    three-argument one in place would make every existing call ambiguous.
--
-- 2. UNSEATING THROUGH THE GROUPS PANEL LEFT LIVE REQUESTS BEHIND. Every admin
--    write that can unseat somebody sweeps the requests it orphans — clear,
--    withdraw, and the replace inside set_session_cover all end in
--    cascade_withdraw_orphaned_cover_requests. apply_group_changes did not,
--    and it is the one writer that can unseat a gedu WITHOUT touching a cover
--    row at all: removing gedu G from group A while G has an open request for
--    Tuesday leaves that request open, and an admin approving an offer on it
--    seats a sub to cover nobody — and hands them the group's workspace for
--    their trouble. The removal loop now sweeps every date G held a live
--    request on, and approve_session_cover_offer re-asks under the lock it
--    already takes whether the requester still holds a seat.
--
-- 3. A SESSION THAT RUNS PAST MIDNIGHT DROPPED ITS COVER AT 00:00. The two
--    voice predicates and the token route all resolved "the session in
--    question" as TODAY in the product's timezone. A session dated Monday that
--    runs to 00:30 therefore ejected the covering gedu from the room and from
--    the chat at local midnight, and a session starting at 00:10 refused them
--    for the whole pre-window (still yesterday's date). The predicates now
--    accept a cover dated today OR YESTERDAY in the product's timezone; the
--    route, which already computes the open slot, asks about the open slot's
--    own session date and falls back to today-or-yesterday when no slot is
--    open. A few hours of overlap is the whole cost, and the voice window is
--    only open around the session anyway.
--
-- WHY A SEPARATE MIGRATION
--
-- 00260, 00262 and 00264 are applied to staging, and an applied migration is
-- never edited (supabase/CLAUDE.md, "Never amend a pushed migration"): the CLI
-- matches on version, so an edit there would never run on staging and only CI's
-- fresh-from-migrations database would ever see it.
--
-- The bodies below are 00260's verbatim — 00262's for the two writers it
-- superseded — with only the changes named above. Every recreated function has
-- its REVOKE ... FROM PUBLIC, anon paired with its per-role GRANTs re-issued at
-- the foot of this file, because a recreated function can come back
-- PUBLIC-executable whichever form the recreation took.

-- ---------------------------------------------------------------------------
-- 1. Holding a seat, as a predicate
--
-- "A gedu is expected at (group, date) iff they hold no non-withdrawn request
-- for it, AND they are either assigned to the group or hold a covered request
-- for it." The second half of that sentence is a question of its own — does
-- this person still hold a SEAT there — and three places now ask it: the
-- derivation, the orphan sweep, and the approval path. It was written out twice
-- and about to be written out a third time, so it becomes a function.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.gedu_holds_seat_at_session(
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
     -- "…they are either assigned to the group…"
     AND (
           EXISTS (
             SELECT 1
               FROM public.gedu_group_assignments a
              WHERE a.group_id = p_group_id
                AND a.gedu_id  = p_gedu_id
           )
           -- "…or hold a `covered` request for it." No window test and no
           -- certification test, for the same reason its parent predicate makes
           -- neither: this answers WHO IS DOING THE JOB, a staffing fact, and
           -- conflating it with access would make a past session's staffing
           -- silently change fifteen days later.
           OR EXISTS (
             SELECT 1
               FROM public.session_cover_requests r
              WHERE r.group_id     = p_group_id
                AND r.session_date = p_session_date
                AND r.covered_by   = p_gedu_id
                AND r.status       = 'covered'::public.cover_request_status
           )
         );
$$;

-- The derivation, now stated as what it always meant: no live request of their
-- own, and a seat. Unchanged in behaviour, and one definition shorter.
CREATE OR REPLACE FUNCTION public.gedu_is_expected_at_session(
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
     AND public.gedu_holds_seat_at_session(p_gedu_id, p_group_id, p_session_date);
$$;

-- The sweep, now asking the predicate rather than restating it. Same fixpoint,
-- same two conditions, one place they are written.
CREATE OR REPLACE FUNCTION public.cascade_withdraw_orphaned_cover_requests(
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
       AND NOT public.gedu_holds_seat_at_session(
                 r.requested_by, p_group_id, p_session_date
               );

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The document: who is absent is a disclosure, not a field
--
-- A fourth parameter is a new signature, so the three-argument function is
-- DROPPED rather than replaced — an overload would make every existing
-- three-argument call ambiguous ("function is not unique") rather than
-- resolving to the new default. Nothing depends on it in the catalog sense:
-- both the plpgsql and the string-bodied SQL callers resolve the name at
-- execution time, and every one of them is either recreated below or now
-- resolves to the four-argument function through its default.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.cover_request_document(public.session_cover_requests, boolean, uuid);

CREATE FUNCTION public.cover_request_document(
  p_request public.session_cover_requests,
  p_include_reason boolean,
  p_viewer_id uuid,
  p_reveal_requester boolean DEFAULT false
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
    -- WHO IS ABSENT travels for three readers and no others: an admin
    -- (p_include_reason, which every admin path already passes), the requester
    -- themselves, and a caller that has explicitly asked to reveal it because
    -- its own reader is staff on the group — which is the gedu workspace feed
    -- and nothing else. A volunteer answering the pool gets JSON null here,
    -- because the pool names the session and never the person.
    --
    -- Emitted as null rather than omitted, exactly as reason and offer_count
    -- are: the document keeps ONE shape for every reader, so no client schema
    -- branches on which keys arrived.
    'requested_by',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN p_request.requested_by
      END,
    'requested_by_first_name',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT pr.first_name
               FROM public.profiles pr
              WHERE pr.id = p_request.requested_by
           )
      END,
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

-- ---------------------------------------------------------------------------
-- 3. The two offer RPCs, which are the leak
--
-- Both now conceal the requester explicitly rather than by the default, so the
-- decision is greppable at the call site rather than inferred from an absent
-- argument. withdraw_session_cover_offer additionally refuses a caller holding
-- no offer: it was the free read.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.offer_session_cover(p_request_id uuid)
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

  -- CONCEALED, explicitly: a volunteer never learns whose absence this is.
  RETURN public.cover_request_document(v_row, false, v_caller, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_session_cover_offer(p_request_id uuid)
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

  -- A withdraw that deletes nothing is not a withdraw: it is a READ of somebody
  -- else's absence wearing a write's clothes, and before this it was the
  -- cheapest one on the surface — any certified gedu could hand this function a
  -- request id they had never offered on and be told who was away. It is a
  -- write or it is a refusal, and 42501 is the same answer an unknown id gets,
  -- so it cannot be used to tell a real request from an invented one either.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- CONCEALED, explicitly: see offer_session_cover above.
  RETURN public.cover_request_document(v_row, false, v_caller, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The staff feed still names who is absent
--
-- The ONE caller that passes the new flag. The gedu workspace is reached only
-- by staff on the group — assigned to its product, or holding a live cover on
-- it, or an admin — and its session card's staffing line is "X is away, Y is
-- covering". Take the name away and the line cannot be drawn; the surface is
-- the workspace of the very group the absence is on, which is exactly the
-- distinction the pool does not have.
--
-- The REASON is untouched and still rides on v_is_admin alone: a colleague
-- learns that somebody is away, never that it was `sick`.
--
-- The body is 00260's verbatim but for that one argument.
-- ---------------------------------------------------------------------------

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
             public.cover_request_document(r, v_is_admin, v_viewer, true)
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

-- ---------------------------------------------------------------------------
-- 5. Approval re-checks the seat under the lock it already holds
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_session_cover_offer(p_offer_id uuid)
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

  -- THE ABSENT GEDU MUST STILL HOLD THE SEAT THEY FILED AGAINST. An admin can
  -- remove a gedu from a group through the groups panel while a request of
  -- theirs is open, and approving an offer on an orphaned request would seat a
  -- sub to cover nobody — and hand them the group's workspace for it. The panel
  -- now sweeps the requests it orphans, so this is the second line of defence
  -- rather than the first, and it is asked under the lock this function already
  -- holds, beside the offer's own staleness check.
  --
  -- A REFUSAL rather than a withdraw-and-refuse, and that is forced rather than
  -- chosen: the RAISE aborts the transaction, so a withdraw written first would
  -- be rolled back with it. An admin who wants the row gone withdraws it
  -- explicitly, which is what the queue's own Withdraw action does.
  IF NOT public.gedu_holds_seat_at_session(
           v_row.requested_by, v_row.group_id, v_row.session_date
         ) THEN
    RAISE EXCEPTION 'gedu % no longer holds a seat on group % (%), so there is nothing to cover',
                    v_row.requested_by, v_row.group_id, v_row.session_date
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

-- ---------------------------------------------------------------------------
-- 6. Unseating through the groups panel sweeps what it orphans
--
-- The function stays DELIBERATELY ASSIGNMENT-ONLY in the completeness check's
-- sense — it still writes no cover row and still gates on nothing — but a
-- writer that can unseat somebody has to leave the derivation consistent, and
-- calling the sweep is not a cover branch: it is the same clean-up every other
-- unseating already runs.
-- ---------------------------------------------------------------------------

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
  v_removed_group   UUID;
  v_removed_gedu    UUID;
  v_orphan_date     DATE;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Removes first so an admin can move a Gedu from group A to B in one batch.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    v_removed_group := (v_assignment->>'groupId')::UUID;
    v_removed_gedu  := (v_assignment->>'geduId')::UUID;

    DELETE FROM gedu_group_assignments
     WHERE group_id = v_removed_group
       AND gedu_id  = v_removed_gedu;

    -- REMOVING AN ASSIGNMENT IS AN UNSEATING, and every other write that can
    -- unseat somebody already sweeps the cover requests it orphans. This one
    -- is the odd case because it unseats WITHOUT touching a cover row at all:
    -- a gedu removed from the group while they have a live request for Tuesday
    -- leaves that request open, and an admin answering it would seat a sub to
    -- cover nobody — and hand them the group's workspace for the date.
    --
    -- Only the dates the removed gedu has a LIVE REQUEST on are swept, because
    -- those are the only ones this removal can have orphaned; the sweep itself
    -- is the same fixpoint every other unseating runs, so a chain that starts
    -- here unwinds exactly as it does there. A date they merely COVER is not
    -- swept and must not be: a cover is a seat of its own, and it does not
    -- depend on the assignment this statement just deleted.
    FOR v_orphan_date IN
      SELECT DISTINCT r.session_date
        FROM session_cover_requests r
       WHERE r.group_id     = v_removed_group
         AND r.requested_by = v_removed_gedu
         AND r.status <> 'withdrawn'::public.cover_request_status
    LOOP
      PERFORM public.cascade_withdraw_orphaned_cover_requests(
                v_removed_group, v_orphan_date
              );
    END LOOP;
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
-- 7. A session that runs past midnight keeps its cover in the room
--
-- The two voice predicates move together, always: the chat channel is gated by
-- the pair, so one of them dropping a cover at local midnight would take the
-- room and leave the chat, or the reverse. The token route's TypeScript twin
-- learns the same thing in the same change — and learns it better, because the
-- route already knows which slot is open and can ask about that session's own
-- date rather than about a day.
-- ---------------------------------------------------------------------------

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
    -- SCOPED: a sub reaches the room on the dates they are covering and on no
    -- other date of the group. It ADDS to the assignment arm above rather than
    -- narrowing it — a gedu assigned to the product keeps the product-wide
    -- mobility they already had.
    --
    -- "The session in question" is TODAY OR YESTERDAY in the PRODUCT's
    -- timezone, evaluated at call time because the predicate is handed a group
    -- and nothing else. Yesterday is not slack, it is the calendar: a session
    -- dated Monday that runs to 00:30 is still Monday's session at 00:10 on
    -- Tuesday, and asking only about today ejected its cover from the room and
    -- from the chat at local midnight — while a session starting at 00:10
    -- refused them for its whole pre-window, which falls on the day before.
    -- The cost is a few hours in which a cover could rejoin the PREVIOUS day's
    -- room, and the voice window itself is only open around a session, so there
    -- is nothing there to rejoin. gedu_covers_session still applies the access
    -- window and the certification test to whichever date matches.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and (
          public.gedu_covers_session(
            p_group_id, (now() at time zone p2.timezone)::date
          )
          or public.gedu_covers_session(
               p_group_id, ((now() at time zone p2.timezone)::date - 1)
             )
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
    -- same reason: a sub moderates the room on the dates they are covering, not
    -- on the group's other dates. The two move together — the chat channel is
    -- gated by this pair, so a cover is in the channel on their own date only,
    -- and a cross-midnight session that dropped one predicate at 00:00 would
    -- drop the other with it. Today OR yesterday in the product's timezone; the
    -- membership predicate above carries the whole reasoning.
    or exists (
      select 1
      from public.product_groups g2
      join public.products p2 on p2.id = g2.product_id
      where g2.id = p_group_id
        and (
          public.gedu_covers_session(
            p_group_id, (now() at time zone p2.timezone)::date
          )
          or public.gedu_covers_session(
               p_group_id, ((now() at time zone p2.timezone)::date - 1)
             )
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants re-issued on every function this migration created or recreated
--
-- CREATE OR REPLACE preserves an ACL and DROP + CREATE does not, and the rule
-- in supabase/CLAUDE.md does not ask which happened: a recreated function can
-- come back PUBLIC-executable, so every touched signature is restated here with
-- EXACTLY the grants it held before. The four internal predicates keep their
-- service-role-only grant, the two voice predicates their authenticated-only
-- one (they are read from RLS policies, which evaluate as the querying role),
-- and the RPCs the browser calls keep both.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.gedu_holds_seat_at_session(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_holds_seat_at_session(uuid, uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gedu_is_expected_at_session(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.gedu_is_expected_at_session(uuid, uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cascade_withdraw_orphaned_cover_requests(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cascade_withdraw_orphaned_cover_requests(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cover_request_document(public.session_cover_requests, boolean, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cover_request_document(public.session_cover_requests, boolean, uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.offer_session_cover(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.offer_session_cover(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.offer_session_cover(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.withdraw_session_cover_offer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_session_cover_offer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_voice_group_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_voice_group_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_voice_group_moderator(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_voice_group_moderator(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. What the catalog says about all this
--
-- The document lost its comment with the signature it hung on, so that one is
-- written whole. The rest are EXTENDED from the catalog rather than restated,
-- for the reason supabase/CLAUDE.md names — "a hand-copy dropped a clause once"
-- — and because every sentence they already carry is still true.
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS
  'Internal predicate: does this gedu still hold a SEAT at (group, date) — assigned to the group, or the covered_by of a live `covered` request for it? The second half of the derivation sentence, lifted out because three callers ask it: gedu_is_expected_at_session (which is this AND holding no live request of your own), the orphan sweep (which withdraws every request whose requester no longer passes this), and approve_session_cover_offer (which refuses to seat a sub for somebody who no longer passes it). Makes NO access-window and NO certification test, exactly as its parent does not: it answers who is DOING THE JOB, a staffing fact, where gedu_covers_session answers who may REACH the group. Takes the gedu as an argument rather than reading auth.uid(), because every caller asks it about somebody else. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.cover_request_document(p_request public.session_cover_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) IS
  'Internal: the ONE wire shape of a cover request. Every cover write returns it and both staff feeds'' `covers` arrays are built from it, so no surface can drift about what a request is. Takes the ROW rather than an id, so a feed aggregates it over a query and a writer hands over the row it just wrote. THREE fields are keyed to the reader rather than to the RPC, and all three are emitted as JSON null when the reader is not entitled to them rather than omitted, so the document keeps one shape for every reader and no client schema branches on which keys arrived. `reason`/`reason_note` travel on p_include_reason, the ADMIN flag, alone. `offer_count` travels for an admin and for the requester themselves, because how many people volunteered for a colleague''s absence is not their business. And WHO IS ABSENT — requested_by with its first name — travels for an admin, for a viewer who IS the requester, and for a caller that passed p_reveal_requester because its own reader is staff on the group; that flag DEFAULTS TO FALSE, so a caller added later that forgets it conceals, and the only caller passing it today is get_gedu_group_feed, whose reader reached the group''s workspace and whose session card''s staffing line names who is away. The two offer RPCs pass false explicitly: a volunteer decides on the session and never on the person, which is the same rule the pool list keeps by never naming them at all. Not granted to `authenticated`.';

DO $$
DECLARE
  v_target   record;
  v_existing text;
BEGIN
  FOR v_target IN
    SELECT *
      FROM (VALUES
        ('gedu_is_expected_at_session', 'gedu_is_expected_at_session(uuid, uuid, date)',
         ' Since 00265 the second half of that sentence — "assigned to the group,'
         ' or holding a covered request for it" — is gedu_holds_seat_at_session,'
         ' which this composes rather than restates: three callers now ask that'
         ' question and it had been written out twice. Behaviour is unchanged.'),

        ('cascade_withdraw_orphaned_cover_requests', 'cascade_withdraw_orphaned_cover_requests(uuid, date)',
         ' Since 00265 "no longer holds a seat" is gedu_holds_seat_at_session'
         ' rather than two inline NOT EXISTS clauses, and apply_group_changes'
         ' joins the callers: removing a gedu from a group through the admin'
         ' groups panel unseats them without touching a cover row, so that'
         ' writer now sweeps every date the removed gedu held a live request on.'),

        ('offer_session_cover', 'offer_session_cover(uuid)',
         ' Since 00265 the document it returns CONCEALS the absent gedu —'
         ' requested_by and requested_by_first_name arrive as JSON null. Before'
         ' that, offering was a way to unmask the absent person on any pool row,'
         ' which made the pool''s own "names the session, never the person" rule'
         ' one button-press deep.'),

        ('withdraw_session_cover_offer', 'withdraw_session_cover_offer(uuid)',
         ' Since 00265 it REFUSES a caller who holds no offer on the request'
         ' (42501, the same answer an unknown id gets) instead of deleting'
         ' nothing and returning the document anyway — which had made it the'
         ' cheapest read on the surface, a lookup of who is away keyed by'
         ' request id. The document it returns conceals the absent gedu, as'
         ' offer_session_cover''s does.'),

        ('approve_session_cover_offer', 'approve_session_cover_offer(uuid)',
         ' Since 00265 it also re-asks, under the lock it already takes, whether'
         ' the ABSENT gedu still holds a seat at the session'
         ' (gedu_holds_seat_at_session): an admin can remove a gedu from the'
         ' group through the groups panel while a request of theirs is open, and'
         ' approving an offer on an orphaned request would seat a sub to cover'
         ' nobody and hand them the group''s workspace for it. A refusal rather'
         ' than a withdraw-and-refuse, because the RAISE would roll a withdraw'
         ' back with the rest of the transaction.'),

        ('get_gedu_group_feed', 'get_gedu_group_feed(uuid)',
         ' Since 00265 it is the ONE caller that asks cover_request_document to'
         ' reveal the requester explicitly. The workspace is reached only by'
         ' staff on the group and its session card''s staffing line names who is'
         ' away; the REASON still rides on the admin flag alone, so a colleague'
         ' learns that somebody is absent and never that it was `sick`.'),

        ('apply_group_changes', 'apply_group_changes(uuid, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb)',
         ' Since 00265 removing an assignment also sweeps the cover requests it'
         ' orphans: for every date the removed gedu held a live request on, the'
         ' same fixpoint every other unseating runs. It remains'
         ' ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still'
         ' writes no cover row — but a writer that can unseat somebody has to'
         ' leave the derivation consistent, or an admin could answer a request'
         ' filed by a person who is no longer expected at the session.'),

        ('is_voice_group_member', 'is_voice_group_member(uuid)',
         ' Since 00265 the cover arm accepts a cover dated TODAY OR YESTERDAY in'
         ' the product''s timezone rather than today alone. A session dated'
         ' Monday that runs past local midnight is still Monday''s session at'
         ' 00:30 on Tuesday, and a session starting at 00:10 has its whole'
         ' pre-window on the day before; asking only about today ejected the'
         ' cover from the room and the chat at midnight, and refused them before'
         ' a small-hours start. The access window inside gedu_covers_session is'
         ' unchanged and still applies to whichever date matches.'),

        ('is_voice_group_moderator', 'is_voice_group_moderator(uuid)',
         ' Since 00265 its cover arm accepts today OR yesterday in the product''s'
         ' timezone, moving with is_voice_group_member as it always must: the'
         ' chat channel is gated by the pair, so a cross-midnight session that'
         ' dropped one would keep a cover in the room with no moderation, or in'
         ' the chat with none.')
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

-- ---------------------------------------------------------------------------
-- 10. What this migration asserts about its own end state
--
-- NOTHING BELOW NEEDS A ROW. That is deliberate and it is the lesson of 00260's
-- own block, which asserts "no assignment has a role other than primary" — true
-- and worth asserting, and vacuously true on the empty database CI builds from
-- migrations, so it proves the backfill nowhere but on staging. The
-- concealment rule is checked by CALLING the document builder on a composite
-- value assembled inline: a row-typed literal needs no table, no auth and no
-- fixture, and it fails on an empty database exactly as it would on a full one.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  -- Members whose reference to gedu_group_assignments is NOT a gate. The list
  -- is 00260's MINUS apply_group_changes, which now references the cover tables
  -- through the orphan sweep and is therefore branched rather than annotated —
  -- the sweep is not a gate, but the check measures references and the honest
  -- answer is that it has one. tests/db/session-cover.test.ts, the permanent
  -- home of this rule, names it positively instead.
  v_annotated constant text[] := ARRAY[
    'function:chat_channel_roster_ids',
    'function:get_my_family_product_feed',
    'function:get_product_groups_with_details',
    'function:validate_gedu_assignment_product',
    'policy:gedu_group_assignments.customers_read_assignments_via_gamers'
  ];
  v_unbranched text[];
  v_absent     uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_viewer     uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_request    public.session_cover_requests;
  v_doc        jsonb;
  v_name       text;
BEGIN
  -- (a) The concealment, exercised rather than described. The composite is
  -- built inline, so this runs on a database with no groups, no gedus and no
  -- requests in it.
  v_request := ROW(
    '33333333-3333-3333-3333-333333333333'::uuid,   -- id
    '44444444-4444-4444-4444-444444444444'::uuid,   -- group_id
    current_date,                                   -- session_date
    v_absent,                                       -- requested_by
    'primary'::public.gedu_assignment_role,         -- role
    'sick'::public.cover_reason,                    -- reason
    'a note',                                       -- reason_note
    'open'::public.cover_request_status,            -- status
    NULL::uuid,                                     -- covered_by
    NULL::uuid,                                     -- approved_by
    NULL::timestamptz,                              -- approved_at
    now(),                                          -- created_at
    now()                                           -- updated_at
  )::public.session_cover_requests;

  -- A stranger: concealed, and the KEYS ARE STILL THERE. Both halves matter —
  -- the second is what lets one client schema read every reader's copy.
  v_doc := public.cover_request_document(v_request, false, v_viewer, false);
  IF v_doc->'requested_by' <> 'null'::jsonb
     OR v_doc->'requested_by_first_name' <> 'null'::jsonb THEN
    RAISE EXCEPTION
      'cover_request_document names the absent gedu to a viewer who is neither the requester, an admin, nor entitled to reveal: %', v_doc;
  END IF;
  IF NOT (v_doc ? 'requested_by' AND v_doc ? 'requested_by_first_name') THEN
    RAISE EXCEPTION
      'cover_request_document OMITS the requester keys instead of nulling them — the document must keep one shape for every reader: %', v_doc;
  END IF;

  -- And it must not leak the absence another way while it is at it.
  IF v_doc->'reason' <> 'null'::jsonb
     OR v_doc->'reason_note' <> 'null'::jsonb
     OR v_doc->'offer_count' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'cover_request_document gave a stranger the reason or the offer count: %', v_doc;
  END IF;

  -- The three readers who are entitled, one arm each.
  IF (public.cover_request_document(v_request, true,  v_viewer, false))->>'requested_by' IS DISTINCT FROM v_absent::text THEN
    RAISE EXCEPTION 'the admin arm no longer names the absent gedu';
  END IF;
  IF (public.cover_request_document(v_request, false, v_viewer, true))->>'requested_by' IS DISTINCT FROM v_absent::text THEN
    RAISE EXCEPTION 'p_reveal_requester no longer names the absent gedu';
  END IF;
  IF (public.cover_request_document(v_request, false, v_absent, false))->>'requested_by' IS DISTINCT FROM v_absent::text THEN
    RAISE EXCEPTION 'the requester can no longer see their own name on their own request';
  END IF;

  -- (b) One document builder, four arguments, one of them defaulted. A second
  -- overload would make every three-argument call ambiguous rather than
  -- defaulted, which is the trap the DROP above exists to avoid.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'cover_request_document') <> 1 THEN
    RAISE EXCEPTION 'cover_request_document has been overloaded rather than replaced';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cover_request_document'
       AND p.pronargs = 4 AND p.pronargdefaults = 1
  ) THEN
    RAISE EXCEPTION 'cover_request_document does not carry exactly one trailing default';
  END IF;

  -- (c) The three call sites whose argument IS the decision, read back from the
  -- catalog: two concealing, one revealing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'offer_session_cover'
       AND p.prosrc LIKE '%cover_request_document(v_row, false, v_caller, false)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'withdraw_session_cover_offer'
       AND p.prosrc LIKE '%cover_request_document(v_row, false, v_caller, false)%'
  ) THEN
    RAISE EXCEPTION 'an offer RPC no longer conceals the absent gedu explicitly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_gedu_group_feed'
       AND p.prosrc LIKE '%cover_request_document(r, v_is_admin, v_viewer, true)%'
  ) THEN
    RAISE EXCEPTION 'the gedu workspace feed no longer names the absent gedu, so its staffing line cannot be drawn';
  END IF;

  -- (d) The seat re-check, the sweep, and the yesterday arm — each read as a
  -- reference in the body that must carry it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'approve_session_cover_offer'
       AND p.prosrc LIKE '%gedu_holds_seat_at_session%'
  ) THEN
    RAISE EXCEPTION 'approve_session_cover_offer no longer checks that the absent gedu still holds a seat';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'apply_group_changes'
       AND p.prosrc LIKE '%cascade_withdraw_orphaned_cover_requests%'
  ) THEN
    RAISE EXCEPTION 'the groups panel writer no longer sweeps the cover requests its removals orphan';
  END IF;

  FOREACH v_name IN ARRAY ARRAY['is_voice_group_member', 'is_voice_group_moderator'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND p.prosrc LIKE '%timezone)::date - 1%'
    ) THEN
      RAISE EXCEPTION
        '% no longer accepts a cover dated yesterday, so a session running past local midnight drops it at 00:00', v_name;
    END IF;
  END LOOP;

  -- (e) The completeness check, restated because its expected list moved.
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

  -- (f) Exposure, both directions, for everything this file touched.
  FOREACH v_name IN ARRAY ARRAY[
    'offer_session_cover', 'withdraw_session_cover_offer',
    'approve_session_cover_offer', 'get_gedu_group_feed',
    'apply_group_changes', 'is_voice_group_member', 'is_voice_group_moderator'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION '% lost its authenticated grant', v_name;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION '% is reachable by anon', v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'gedu_holds_seat_at_session', 'gedu_is_expected_at_session',
    'cover_request_document', 'cascade_withdraw_orphaned_cover_requests'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR has_function_privilege('anon', p.oid, 'EXECUTE'))
    ) THEN
      RAISE EXCEPTION
        '% is an internal helper and must not be reachable from the Data API', v_name;
    END IF;
  END LOOP;

  -- A STRICT function skips its body on NULL input, so a guard inside it would
  -- never run. New function, same sweep 00260 made over its own.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('gedu_holds_seat_at_session', 'offer_session_cover',
                         'withdraw_session_cover_offer', 'approve_session_cover_offer')
       AND p.proisstrict
  ) THEN
    RAISE EXCEPTION 'a session-cover function is STRICT, so its guard would never run';
  END IF;
END $$;
