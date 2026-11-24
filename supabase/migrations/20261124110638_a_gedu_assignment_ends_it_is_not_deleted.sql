-- A gedu assignment ends; it is not deleted.
--
-- An assignment was a bare (group, gedu) pair, deleted when an admin took the
-- gedu off the group and upserted when their role changed. So the moment a gedu
-- left, every past session they taught lost its teacher: invoicing, the session
-- feeds and the staffing derivation all asked "is this gedu assigned to the
-- group?" and answered for today about every date. An assignment is now a
-- PERIOD, and a session belongs to whoever held the group at its start
-- (owner's rulings, 2026-11-23).
--
-- WHAT THIS CHANGES
--
-- 1. `gedu_group_assignments` gains an `id`, `started_at` and `ended_at`. A
--    removal sets `ended_at`; an add starts a new row; a role change ends one
--    period and starts the next. One live period per (gedu, product), and no
--    two periods of one (gedu, product) overlap. Every existing row starts at
--    the earliest instant its product has any session, request or feedback for,
--    so every number read today reads the same afterwards.
-- 2. Three private helpers: group_session_starts_at (the one rule for a
--    session's start instant), group_assignments_at (the one containment rule)
--    and group_session_access_ends_at (the substitute window's end, lifted out
--    of gedu_holds_unexpired_substitution unchanged).
-- 3. gedu_holds_seat_at_session asks for the period containing the session's
--    start, so the derivation, the orphan sweep and every gate built on them
--    follow periods. Filing a request and an admin's off-platform substitution
--    snapshot the role of the period containing the session.
-- 4. apply_group_changes ends and starts periods at one clock instant per batch,
--    and sweeps only the requests a removal orphans at or after that instant.
-- 5. The two "now" policies (a family reading assignment rows, a gedu reading
--    their groups) and the trainee side of the one-seat-per-product trigger
--    read only current periods.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

ALTER TABLE public.gedu_group_assignments
  ADD COLUMN id uuid DEFAULT gen_random_uuid() NOT NULL,
  ADD COLUMN started_at timestamp with time zone,
  ADD COLUMN ended_at timestamp with time zone;

ALTER TABLE public.gedu_group_assignments
  DROP CONSTRAINT gedu_group_assignments_pkey,
  DROP CONSTRAINT gedu_group_assignments_gedu_id_product_id_key;

ALTER TABLE public.gedu_group_assignments
  ADD CONSTRAINT gedu_group_assignments_pkey PRIMARY KEY (id);

-- No history is corrected: a row starts at the earliest instant anything of its
-- product is known to have happened, so every session it was read as staffing
-- before still falls inside it. The product's start alone is not provably early
-- enough — start_date and timezone are editable, and a stored session row is a
-- snapshot of the schedule when it was written — so the minimum is taken over
-- every record that names an instant or a date. created_at bounds a row whose
-- product has none of them.
UPDATE public.gedu_group_assignments a
   SET started_at = LEAST(
         p.start_date::timestamp AT TIME ZONE p.timezone,
         (SELECT min(gs.starts_at)
            FROM public.group_sessions gs
            JOIN public.product_groups g ON g.id = gs.group_id
           WHERE g.product_id = a.product_id),
         (SELECT min(r.session_date)::timestamp AT TIME ZONE p.timezone
            FROM public.session_substitution_requests r
            JOIN public.product_groups g ON g.id = r.group_id
           WHERE g.product_id = a.product_id),
         (SELECT min(sf.session_opens_at)
            FROM public.session_feedback sf
            JOIN public.product_groups g ON g.id = sf.group_id
           WHERE g.product_id = a.product_id),
         a.created_at
       )
  FROM public.products p
 WHERE p.id = a.product_id;

-- No default: a now() default would put every row a writer forgot to date after
-- every past session, which unstaffs them silently. A writer names the instant.
ALTER TABLE public.gedu_group_assignments
  ALTER COLUMN started_at SET NOT NULL;

ALTER TABLE public.gedu_group_assignments
  ADD CONSTRAINT chk_gedu_group_assignments_ends_after_start
    CHECK (ended_at IS NULL OR ended_at > started_at);

CREATE UNIQUE INDEX uq_gedu_group_assignments_live_per_product
  ON public.gedu_group_assignments USING btree (gedu_id, product_id)
  WHERE ended_at IS NULL;

CREATE INDEX idx_gedu_group_assignments_group_gedu
  ON public.gedu_group_assignments USING btree (group_id, gedu_id);

COMMENT ON TABLE public.gedu_group_assignments IS 'Who staffs a group, as PERIODS: a row is one gedu holding one group in one role from started_at until ended_at, and ended_at is NULL while the period is current. A session belongs to the period containing its start instant, [started_at, ended_at), for planned and stored sessions alike — group_assignments_at is that rule and group_session_starts_at the start it is applied to. A row is never deleted to take a gedu off a group: removing them ends the period, adding them again starts a new row, and the gap between belongs to neither. A role change ends one period and starts the next, so a past session keeps the role it was taught in. One live period per (gedu, product), by a partial unique index, and no two periods of one (gedu, product) overlap, by the validate_gedu_assignment_periods trigger, which also refuses moving a start or re-ending an ended period. A group holds any number of gedus. Every reader says whether it means the gedus on the group now (ended_at IS NULL) or at a session. Written only by apply_group_changes; deleted only with its group or product, or by erasure.';

COMMENT ON COLUMN public.gedu_group_assignments.role IS 'Which capacity this educator holds the group in for this period: `primary` or `assistant`. A group holds ANY NUMBER of each — there is deliberately no exactly-one-primary rule, and an `assistant` on a product whose assistant fee is unset is allowed (the fee simply reads as not set wherever a fee is shown, and the admin attention queue goes on treating a missing assistant fee as "no assistant role" rather than as a defect). The ONLY thing the role decides is PAY: products carry a per-session fee for each. Readable wherever assignments already are, parents included through the existing policy, because it is a pay CLASS label and not a figure — the fee columns on `products` are already public. Written only by apply_group_changes, where a role change ends the current period and starts a new one in the new role, so a session keeps the role of the period it fell in.';

COMMENT ON COLUMN public.gedu_group_assignments.started_at IS 'The instant this period began: the clock instant of the admin batch that added the gedu or changed their role. No default — every writer names it. Never changed once written.';

COMMENT ON COLUMN public.gedu_group_assignments.ended_at IS 'The instant this period ended, exclusive — a session starting at exactly this instant belongs to whoever was added then, not to this period. NULL while the period is current. Set once and never moved.';

-- ---------------------------------------------------------------------------
-- 2. The private helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date)
RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- A stored session keeps the start it was written with.
           (SELECT gs.starts_at
              FROM public.group_sessions gs
             WHERE gs.group_id     = p_group_id
               AND gs.session_date = p_session_date),
           -- Otherwise the plan's start, a holiday-withdrawn date included: a
           -- request filed before its date became a holiday still names a
           -- session, and it is judged at the instant it would have started.
           (SELECT planned.starts_at
              FROM public.product_groups g
             CROSS JOIN LATERAL public.planned_session_dates(
                     g.product_id, p_session_date, p_session_date, true
                   ) AS planned
             WHERE g.id = p_group_id
             ORDER BY planned.starts_at
             LIMIT 1),
           -- A date the plan has no session on: product-local midnight.
           (SELECT p_session_date::timestamp AT TIME ZONE p.timezone
              FROM public.product_groups g
              JOIN public.products p ON p.id = g.product_id
             WHERE g.id = p_group_id)
         );
$$;

COMMENT ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) IS 'Internal: the start instant of the session a (group, date) names — the one rule every reader that places a session in an assignment period applies. The stored group_sessions row''s starts_at when there is one; else the plan''s start from planned_session_dates, holiday-withdrawn dates included; else product-local midnight of the date. NULL only for a group that does not exist. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_starts_at(p_group_id uuid, p_session_date date) TO service_role;

CREATE FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone)
RETURNS TABLE(gedu_id uuid, role public.gedu_assignment_role)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT a.gedu_id, a.role
    FROM public.gedu_group_assignments a
   WHERE a.group_id = p_group_id
     AND a.started_at <= p_at
     AND (a.ended_at IS NULL OR p_at < a.ended_at);
$$;

COMMENT ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) IS 'Internal: the gedus assigned to a group at an instant, each with the role of the period that holds it — the one containment rule, started_at <= instant < ended_at (an open end for a current period). At most one row per gedu, since one gedu''s periods on a product never overlap. Asked with group_session_starts_at to mean "assigned to the group at that session". No rows for a NULL instant. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_assignments_at(p_group_id uuid, p_at timestamp with time zone) TO service_role;

CREATE FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date)
RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           -- 24 hours after the report was mailed…
           (SELECT gs.report_emailed_at + interval '24 hours'
              FROM public.group_sessions gs
             WHERE gs.group_id     = p_group_id
               AND gs.session_date = p_session_date),
           -- …or, if it never was (or the session row was never materialized),
           -- product-local midnight fifteen days after the session date, so a
           -- club in Helsinki and one in Los Angeles both get fifteen of their
           -- own days.
           (SELECT (p_session_date + 15)::timestamp AT TIME ZONE p.timezone
              FROM public.product_groups g
              JOIN public.products p ON p.id = g.product_id
             WHERE g.id = p_group_id)
         );
$$;

COMMENT ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) IS 'Internal: when a temporary seat''s reach into a session''s group ends — 24 hours after the session''s report was mailed, or product-local midnight 15 days after the session date if it never was. The single definition of that window''s END. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_access_ends_at(p_group_id uuid, p_session_date date) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The period trigger
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.validate_gedu_assignment_periods() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'an assignment period''s start does not move (period %)', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
      RAISE EXCEPTION 'an assignment period ends once (period % ended at %)', OLD.id, OLD.ended_at
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- A missing start and an end at or before the start are the NOT NULL's and
  -- the CHECK's to refuse, under their own names; a range cannot be built from
  -- either.
  IF NEW.started_at IS NULL OR NEW.ended_at <= NEW.started_at THEN
    RETURN NEW;
  END IF;

  -- The key validate_one_gedu_seat_per_product takes, so every write about one
  -- gedu's seats on one product queues behind the others.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('gedu_seat:' || NEW.gedu_id::text || ':' || NEW.product_id::text, 0)
  );

  -- Two LIVE periods overlap as well, and are left to the partial unique
  -- index, which refuses them with the unique_violation an admin assigning one
  -- gedu to two groups of a product has always met.
  IF EXISTS (
    SELECT 1
      FROM public.gedu_group_assignments a
     WHERE a.gedu_id    = NEW.gedu_id
       AND a.product_id = NEW.product_id
       AND a.id        <> NEW.id
       AND NOT (a.ended_at IS NULL AND NEW.ended_at IS NULL)
       AND tstzrange(a.started_at, a.ended_at, '[)')
           && tstzrange(NEW.started_at, NEW.ended_at, '[)')
  ) THEN
    RAISE EXCEPTION 'gedu % already holds an assignment period on product % overlapping [%, %)',
      NEW.gedu_id, NEW.product_id, NEW.started_at, NEW.ended_at
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_gedu_assignment_periods() IS 'Trigger on gedu_group_assignments: no two periods of one (gedu, product) overlap, closed ones included, refused with exclusion_violation — the constraint btree_gist would otherwise express. Two live periods are left to the partial unique index and its unique_violation. Also refuses moving a period''s start and moving an end once set (check_violation): a period ends once. Takes the same transaction-scoped advisory lock on the (gedu, product) pair as validate_one_gedu_seat_per_product, so racing writers queue rather than each finding the other absent.';

REVOKE ALL ON FUNCTION public.validate_gedu_assignment_periods() FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_gedu_assignment_periods() TO service_role;

CREATE TRIGGER trg_validate_gedu_assignment_periods
  BEFORE INSERT OR UPDATE OF gedu_id, product_id, started_at, ended_at
  ON public.gedu_group_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_periods();

-- ---------------------------------------------------------------------------
-- 4. The "now" policies
-- ---------------------------------------------------------------------------

ALTER POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments
  USING (
    (( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role)
    AND ( SELECT public.has_active_participation_on_product(gedu_group_assignments.product_id) AS has_active_participation_on_product)
    AND ended_at IS NULL
  );

ALTER POLICY gedus_read_assigned_groups ON public.product_groups
  USING (
    (( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role)
    AND (
      (id IN ( SELECT ga.group_id
                 FROM public.gedu_group_assignments ga
                WHERE ga.gedu_id = ( SELECT auth.uid() AS uid)
                  AND ga.ended_at IS NULL))
      OR ( SELECT public.gedu_substitutes_group(product_groups.id) AS gedu_substitutes_group)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. One seat per product, judged against the current period
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_one_gedu_seat_per_product() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- Two transactions writing one pair into the two tables would each find the
  -- other table empty. The lock is keyed on the pair, so they queue instead.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('gedu_seat:' || NEW.gedu_id::text || ':' || NEW.product_id::text, 0)
  );

  IF TG_TABLE_NAME = 'gedu_group_trainees' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
       WHERE pr.id = NEW.gedu_id
         AND pr.role = 'gedu'::public.user_role
    ) THEN
      RAISE EXCEPTION 'a trainee seat is held by a gedu, and profile % is not one', NEW.gedu_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Only a CURRENT period: a gedu who once taught the product and was taken
    -- off it may shadow a group of it.
    IF EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
       WHERE a.gedu_id = NEW.gedu_id
         AND a.product_id = NEW.product_id
         AND a.ended_at IS NULL
    ) THEN
      RAISE EXCEPTION 'gedu % is assigned on product % and cannot also be a trainee there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.gedu_group_trainees t
       WHERE t.gedu_id = NEW.gedu_id
         AND t.product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'gedu % is a trainee on product % and cannot also be assigned there',
        NEW.gedu_id, NEW.product_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_one_gedu_seat_per_product() IS 'Trigger on gedu_group_assignments and gedu_group_trainees: a gedu holds a current assignment or a trainee seat on a product, never both, refused from whichever side is written second with unique_violation — the SQLSTATE each table''s own one-per-(gedu, product) index raises for the same kind of clash. An ENDED assignment period does not count: a gedu taken off a product may train on it. On the trainee table it also refuses a seat-holder who is not a gedu. Takes a transaction-scoped advisory lock on the (gedu, product) pair, so two writes racing into the two tables queue rather than each finding the other empty. apply_group_changes removes before it adds, so one batch may end a gedu''s seat of one kind and add one of the other on the same product.';

-- ---------------------------------------------------------------------------
-- 6. The substitute window's end, read from its one definition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.session_substitution_requests r
      JOIN public.gedu_profiles gp  ON gp.user_id = r.substitute_id
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status       = 'substituted'::public.substitution_request_status
       AND r.substitute_id   = p_gedu_id
       -- Still certified. De-certifying an educator ends their substitution access
       -- mid-window, which is the point of checking it here rather than only at
       -- approval time.
       AND gp.certified
       AND now() < public.group_session_access_ends_at(r.group_id, r.session_date)
  );
$$;

COMMENT ON FUNCTION public.gedu_holds_unexpired_substitution(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate: does this gedu still hold this (group, date) substitution at all? True when they are the substitute_id of a `substituted` request for it, are still certified, and it has not EXPIRED — now() is before group_session_access_ends_at, the single definition of the window''s END (24 hours after the report was mailed, or product-local midnight 15 days after the session date). It makes NO start test, which is what separates it from gedu_substitutes_session: this one answers whether the substitution is still the gedu''s to SEE, and the gedu seat reads (gedu_assigned_products, gedu_assignment_summaries) ask it so that an accepted substitution appears on My SOG from approval rather than from the moment its workspace opens. Takes the gedu as an argument: gedu_substitutes_session asks it about the caller, and the seat reads about the gedu they were handed, who is not the caller when the Discord bot asks. Not granted to `authenticated`.';

-- ---------------------------------------------------------------------------
-- 7. The derivation: assigned to the group AT THAT SESSION
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_gedu_id IS NOT NULL
     AND p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     -- "…they are either assigned to the group at that session…" — a period
     -- holding the session's start instant.
     AND (
           EXISTS (
             SELECT 1
               FROM public.group_assignments_at(
                      p_group_id,
                      public.group_session_starts_at(p_group_id, p_session_date)
                    ) a
              WHERE a.gedu_id = p_gedu_id
           )
           -- "…or hold a `substituted` request for it." No window test and no
           -- certification test, for the same reason its parent predicate makes
           -- neither: this answers WHO IS DOING THE JOB, a staffing fact, and
           -- conflating it with access would make a past session's staffing
           -- silently change fifteen days later.
           OR EXISTS (
             SELECT 1
               FROM public.session_substitution_requests r
              WHERE r.group_id     = p_group_id
                AND r.session_date = p_session_date
                AND r.substitute_id   = p_gedu_id
                AND r.status       = 'substituted'::public.substitution_request_status
           )
         );
$$;

COMMENT ON FUNCTION public.gedu_holds_seat_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate: does this gedu hold a SEAT at (group, date) — assigned to the group at that session, or the substitute_id of a live `substituted` request for it? "Assigned at that session" is an assignment period containing the session''s start instant: group_assignments_at asked at group_session_starts_at. So a gedu taken off a group keeps every session that started before the removal, and one added later gets only the sessions starting at or after their period began. The second half of the derivation sentence, lifted out because three callers ask it: gedu_is_expected_at_session (which is this AND holding no live request of your own), the orphan sweep (which withdraws every request whose requester no longer passes this), and approve_session_substitution_offer (which refuses to seat a sub for somebody who no longer passes it). Makes NO access-window and NO certification test, exactly as its parent does not: it answers who is DOING THE JOB, a staffing fact, where gedu_substitutes_session answers who may REACH the group. Takes the gedu as an argument rather than reading auth.uid(), because every caller asks it about somebody else. Not granted to `authenticated`.';

COMMENT ON FUNCTION public.gedu_is_expected_at_session(p_gedu_id uuid, p_group_id uuid, p_session_date date) IS 'Internal predicate, and the derivation the whole feature rests on: a gedu is expected at (group, date) iff they hold no non-withdrawn request for it, AND they are either assigned to the group at that session or hold a `substituted` request for it. "Assigned at that session" means an assignment period containing the session''s start instant, so the answer about a past date does not change when the gedu is later taken off the group or their role changes. That one sentence handles the sub-of-sub chain, an open sub-of-sub request and a cleared substitution alike, which is why nothing stores "who is running this session" anywhere. Takes the gedu as an argument rather than reading auth.uid(), because every writer asks it about somebody else. Deliberately makes NO access-window and NO certification test: it answers who is DOING THE JOB, a staffing fact, where gedu_substitutes_session answers who may REACH the group, an access fact — conflating them would make a past session''s staffing silently change fifteen days later. Where a gedu is both assigned and holds a substitution on the same group (only an admin edit can produce that), the assignment period supplies the role. Not granted to `authenticated`. The second half of that sentence — "assigned to the group at that session, or holding a substituted request for it" — is gedu_holds_seat_at_session, which this composes rather than restates: three callers ask that question, and it is written out once.';

COMMENT ON FUNCTION public.cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date) IS 'Internal: after an admin edit that can unseat somebody — clear, withdraw, the replace inside set_session_substitution, or ending an assignment period — withdraw every non-withdrawn request on that (group, date) whose requester no longer holds a seat there, meaning neither assigned to the group at that session nor the substitute_id of a live substituted request. A FIXPOINT sweep rather than one statement, because unseating cascades: clearing X''s substitution withdraws X''s own request, which unseats whoever was substituting that, and so on until a pass changes nothing. Withdrawing a substituted row blanks its three substitution columns — chk_substitution_state forbids a withdrawn row from carrying a sub — which is deliberate: an admin unwinding a mistake leaves no phantom substitution behind for invoicing to bill. Not granted to `authenticated`; called only from inside the admin RPCs. "No longer holds a seat" is gedu_holds_seat_at_session, one predicate rather than two inline NOT EXISTS clauses, and it is period-aware: a session that started before an assignment ended still belongs to that assignment, so a removal never orphans a past request. apply_group_changes is among the callers: ending a gedu''s period through the admin groups panel unseats them without touching a substitution row, so that writer sweeps every date the gedu held a live request on whose session starts at or after the removal.';

-- ---------------------------------------------------------------------------
-- 8. The role a request snapshots: the period containing the session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_substitution_requests;
BEGIN
  -- The authorization IS the derivation: you may file an absence only for a
  -- session you are expected at. That admits an assigned gedu and an approved
  -- sub alike — which is the whole of "a sub can ask for a sub" — and refuses
  -- somebody who already has a live request, so filing twice is impossible
  -- before the unique index has to say so. It also refuses a session that
  -- starts after the filer's assignment period ended.
  IF NOT public.gedu_is_expected_at_session(p_gedu_id, p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL THEN
    RAISE EXCEPTION 'a substitution request needs a reason category'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cancellation: nobody needs cover for a session that is not happening.
  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
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
    RAISE EXCEPTION 'a substitution request cannot be filed for a past session (%)', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role being substituted: the role of the filer's assignment period
  -- containing the session, or — when the filer is themselves a sub — the role
  -- stored on the substitution they hold.
  SELECT a.role INTO v_role
    FROM public.group_assignments_at(
           p_group_id,
           public.group_session_starts_at(p_group_id, p_session_date)
         ) a
   WHERE a.gedu_id = p_gedu_id;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_substitution_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.substitute_id   = p_gedu_id
       AND r.status       = 'substituted'::public.substitution_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)', p_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_substitution_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, p_gedu_id, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, p_gedu_id);
END;
$$;

COMMENT ON FUNCTION public.file_session_substitution_request(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_reason public.substitution_reason, p_reason_note text) IS '"I cannot make this session", filed for the given gedu: the one body of that write, behind request_session_substitution (the web, for auth.uid()) and request_session_substitution_for_discord_user (the Discord bot, for the linked gedu). Makes no role test of its own: each caller has already established that the gedu is a gedu. The AUTHORIZATION IS THE DERIVATION: the gedu must be EXPECTED at that session, which admits an assigned gedu and an approved sub alike (that is the whole of "a sub can ask for a sub") and refuses anyone who already holds a live request, and anyone whose assignment period does not contain the session''s start — a session after their removal — with 42501. The reason category is required here and only here — an admin recording an off-platform substitution may not know it. The date must pass the ordinary writable-date check, must not be a cancelled session (P0026), AND must be today or later in the PRODUCT''s timezone; date granularity is deliberate, the handbook''s own norm being same-day filing, and it is deliberately looser than the card, which hides the action once the session''s end has passed. The role substituted is snapshotted from the gedu''s assignment period containing the session, or from the role on the substitution they hold when the gedu is themselves a sub; a request keeps that role if the gedu''s role changes before the date. reason_note is trimmed, nulled when empty, and capped at 500 characters by the table''s own CHECK. Returns the request document as the filer reads it, without reason or reason_note: the filer''s own words come back from the form, and every other gedu-facing document keeps them off the wire. Granted to nobody: reachable only through its two wrappers.';

CREATE OR REPLACE FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_row    public.session_substitution_requests;
  v_exists boolean;
  v_role   public.gedu_assignment_role;
  v_note   text;
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL
     OR p_absent_gedu_id IS NULL OR p_sub_gedu_id IS NULL THEN
    RAISE EXCEPTION 'set_session_substitution needs a group, a date, an absent gedu and a sub'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.product_groups g WHERE g.id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  -- The ordinary writable-date check and NOTHING MORE: there is deliberately no
  -- today-or-later requirement here. This is the retroactive path — an
  -- off-platform substitution that has already happened has to be recordable, because
  -- gedu invoicing reads these rows.
  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cancellation: no sub is seated on a session that is not happening, and
  -- that binds the retroactive path too.
  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.group_id     = p_group_id
     AND r.session_date = p_session_date
     AND r.requested_by = p_absent_gedu_id
     AND r.status <> 'withdrawn'::public.substitution_request_status
     FOR UPDATE;
  v_exists := FOUND;

  IF NOT v_exists THEN
    -- No request: the admin is filing one on the absent gedu's behalf, and a
    -- filing states why exactly as the gedu's own does. An admin surface that
    -- asked no reason, because the seat had a request, reaches this only when
    -- that request was withdrawn while its dialog was open.
    IF p_reason IS NULL THEN
      RAISE EXCEPTION 'seat has no substitution request, and filing one needs a reason'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The absent gedu has to actually be expected at the session — assigned
    -- to the group at that session, so a past session keeps the gedu who held
    -- the group then.
    IF NOT public.gedu_is_expected_at_session(
             p_absent_gedu_id, p_group_id, p_session_date
           ) THEN
      RAISE EXCEPTION 'gedu % is not expected at group % on %',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;

    -- The role of the absent gedu's period containing the session, so a past
    -- session is substituted in the role it was taught in.
    SELECT a.role INTO v_role
      FROM public.group_assignments_at(
             p_group_id,
             public.group_session_starts_at(p_group_id, p_session_date)
           ) a
     WHERE a.gedu_id = p_absent_gedu_id;

    IF v_role IS NULL THEN
      SELECT r2.role INTO v_role
        FROM public.session_substitution_requests r2
       WHERE r2.group_id     = p_group_id
         AND r2.session_date = p_session_date
         AND r2.substitute_id   = p_absent_gedu_id
         AND r2.status       = 'substituted'::public.substitution_request_status
       LIMIT 1;
    END IF;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)',
                      p_absent_gedu_id, p_group_id, p_session_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT public.gedu_may_substitute_session(
           p_sub_gedu_id, p_group_id, p_session_date, p_absent_gedu_id
         ) THEN
    RAISE EXCEPTION 'gedu % cannot substitute on group % on %',
                    p_sub_gedu_id, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_exists THEN
    -- An OPEN request becomes substituted — which is what "set a sub" reads as when
    -- the absent gedu has already asked. A request that is ALREADY SUBSTITUTED is
    -- RE-POINTED at the new sub, so replacing a sub is one action rather than a
    -- clear followed by a set. `approved_by` is the acting admin either way.
    -- Reason and note are only overwritten when this call supplies them, so an
    -- admin replacing a sub does not blank what the gedu wrote.
    UPDATE public.session_substitution_requests
       SET status      = 'substituted'::public.substitution_request_status,
           substitute_id  = p_sub_gedu_id,
           approved_by = v_caller,
           approved_at = now(),
           reason      = COALESCE(p_reason, reason),
           reason_note = COALESCE(v_note, reason_note)
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.session_substitution_requests
      (group_id, session_date, requested_by, role, reason, reason_note,
       status, substitute_id, approved_by, approved_at)
    VALUES (p_group_id, p_session_date, p_absent_gedu_id, v_role, p_reason, v_note,
            'substituted'::public.substitution_request_status, p_sub_gedu_id, v_caller, now())
    RETURNING * INTO v_row;
  END IF;

  -- The replace case can UNSEAT the sub who was there, and a displaced sub who
  -- had filed their own absence no longer holds a seat to be absent from.
  PERFORM public.cascade_withdraw_orphaned_substitution_requests(p_group_id, p_session_date);

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = v_row.id;

  RETURN public.substitution_request_document(v_row, true, v_caller);
END;
$$;

COMMENT ON FUNCTION public.set_session_substitution(p_group_id uuid, p_session_date date, p_absent_gedu_id uuid, p_sub_gedu_id uuid, p_reason public.substitution_reason, p_reason_note text) IS 'The office-arranged path: an admin names the absent gedu and the sub outright, with no offer involved. Three shapes in one function. With NO request for that seat it files one on the absent gedu''s behalf, created already `substituted` — the filing needs a reason exactly as the gedu''s own does and is refused without one, and the absent gedu must actually be EXPECTED at the session, which means assigned to the group at that session (an assignment period containing its start) or holding a substitution for it; the role is taken from that period or from the substitution they hold, so a past session is substituted in the role it was taught in. With an OPEN request it marks that request `substituted`, which is what the admin queue''s approve reads as. With an ALREADY SUBSTITUTED one it RE-POINTS the substitution, so replacing a sub is one action rather than a clear and a set, and the displaced sub''s own absence is then swept by the cascade. An approval or a re-point may omit the reason and keeps the row''s: reason and note are only overwritten when supplied, so an admin replacing a sub does not blank what the gedu wrote. There is deliberately NO today-or-later requirement — this is the retroactive path, and an off-platform substitution that already happened has to be recordable because gedu invoicing reads these rows. The date still passes the ordinary writable-date check. approved_by is the acting admin on every admin path.';

-- ---------------------------------------------------------------------------
-- 9. The writer: periods end and start at one instant per batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb DEFAULT '[]'::jsonb, p_renamed_groups jsonb DEFAULT '[]'::jsonb, p_deleted_group_ids uuid[] DEFAULT '{}'::uuid[], p_gedu_assignments_added jsonb DEFAULT '[]'::jsonb, p_gedu_assignments_removed jsonb DEFAULT '[]'::jsonb, p_participation_moves jsonb DEFAULT '[]'::jsonb, p_trainees_added jsonb DEFAULT '[]'::jsonb, p_trainees_removed jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_now             TIMESTAMPTZ;
  v_group           JSONB;
  v_assignment      JSONB;
  v_move            JSONB;
  v_new_id          UUID;
  v_real_to_id      UUID;
  v_resolved_group  UUID;
  v_gedu_id         UUID;
  v_temp_map        JSONB := '{}'::jsonb;
  v_inline_gedu     JSONB;
  v_adds            JSONB := '[]'::jsonb;
  v_role            public.gedu_assignment_role;
  v_current         RECORD;
  v_removed_group   UUID;
  v_removed_gedu    UUID;
  v_sweep_groups    UUID[] := '{}';
  v_sweep_dates     DATE[] := '{}';
  v_sweep           RECORD;
  v_trainee         JSONB;
BEGIN
  PERFORM public.assert_admin();

  PERFORM 1 FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- The one instant every period this batch ends or starts is stamped with,
  -- read under the product's lock: two admins' transactions can start in one
  -- order and take the lock in the other, and now() would stamp them in the
  -- first. One instant also means a gedu moved between groups leaves one
  -- period exactly where the next begins.
  v_now := clock_timestamp();

  -- Removes first, so an admin can move a Gedu from group A to B in one batch:
  -- the period on A ends before the one on B starts.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_gedu_assignments_removed) LOOP
    v_removed_group := (v_assignment->>'groupId')::UUID;
    v_removed_gedu  := (v_assignment->>'geduId')::UUID;

    UPDATE gedu_group_assignments
       SET ended_at = v_now
     WHERE group_id   = v_removed_group
       AND gedu_id    = v_removed_gedu
       AND product_id = p_product_id
       AND ended_at IS NULL;

    -- ENDING AN ASSIGNMENT IS AN UNSEATING for every session starting at or
    -- after this instant, and every other write that can unseat somebody
    -- sweeps the substitution requests it orphans. A gedu removed while they
    -- have a live request for next Tuesday leaves that request open, and an
    -- admin answering it would seat a sub to substitute for nobody.
    --
    -- Only the removed gedu's LIVE REQUESTS on sessions starting at or after
    -- the removal are collected: a session that started before it still
    -- belongs to the ended period, so its request, and any substitution on it,
    -- stands. A date they merely SUBSTITUTE on is not collected: a
    -- substitution is a seat of its own. The sweeps run at the END of the
    -- batch, after the adds, so a gedu removed and added again in one batch
    -- keeps the requests their new period still covers.
    SELECT v_sweep_groups || array_agg(r.group_id),
           v_sweep_dates  || array_agg(r.session_date)
      INTO v_sweep_groups, v_sweep_dates
      FROM (
        SELECT DISTINCT r.group_id, r.session_date
          FROM session_substitution_requests r
         WHERE r.group_id     = v_removed_group
           AND r.requested_by = v_removed_gedu
           AND r.status <> 'withdrawn'::public.substitution_request_status
           AND public.group_session_starts_at(r.group_id, r.session_date) >= v_now
      ) r;
  END LOOP;

  -- Trainee seats removed, with the assignments and for the same reason: the
  -- one-seat-per-product trigger refuses an add while a seat of the other
  -- kind is still there, so every remove runs before any add. A trainee holds
  -- no substitution request, so nothing is swept.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_removed) LOOP
    DELETE FROM gedu_group_trainees
     WHERE group_id = (v_trainee->>'groupId')::UUID
       AND gedu_id  = (v_trainee->>'geduId')::UUID;
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

  -- An added group's educators arrive inline as `gedus: [{ geduId, role }]`.
  -- They join the batch's adds ahead of the explicit ones, addressed by the
  -- group's real id, so both go through the one add below.
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_added_groups) LOOP
    INSERT INTO product_groups (product_id, name)
    VALUES (p_product_id, v_group->>'name')
    RETURNING id INTO v_new_id;

    v_temp_map := v_temp_map || jsonb_build_object(v_group->>'tempId', v_new_id::TEXT);

    IF jsonb_typeof(v_group->'gedus') = 'array' THEN
      FOR v_inline_gedu IN SELECT * FROM jsonb_array_elements(v_group->'gedus') LOOP
        v_adds := v_adds || jsonb_build_array(
          v_inline_gedu || jsonb_build_object('groupId', v_new_id::TEXT)
        );
      END LOOP;
    END IF;
  END LOOP;

  v_adds := v_adds || p_gedu_assignments_added;

  -- An add { groupId, geduId, role } (an omitted role is a primary):
  --   - a current period on that group in that role: nothing to do;
  --   - a current period there in another role: a role change, which ends that
  --     period and starts one in the new role, so past sessions keep the role
  --     they were taught in — unless the period began in this very batch, when
  --     its role is corrected in place, since ending it at the instant it
  --     began would leave a period of no length;
  --   - otherwise a new period from this instant. A gedu still current on
  --     another group of the product meets the one-live-period index, which is
  --     the error an admin assigning one gedu to two groups has always met.
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(v_adds) LOOP
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

    SELECT a.id, a.role, a.started_at INTO v_current
      FROM gedu_group_assignments a
     WHERE a.group_id = v_resolved_group
       AND a.gedu_id  = v_gedu_id
       AND a.ended_at IS NULL
       FOR UPDATE;

    IF FOUND THEN
      CONTINUE WHEN v_current.role = v_role;

      IF v_current.started_at = v_now THEN
        UPDATE gedu_group_assignments
           SET role = v_role
         WHERE id = v_current.id;
        CONTINUE;
      END IF;

      UPDATE gedu_group_assignments
         SET ended_at = v_now
       WHERE id = v_current.id;
    END IF;

    INSERT INTO gedu_group_assignments (group_id, gedu_id, product_id, role, started_at)
    VALUES (v_resolved_group, v_gedu_id, p_product_id, v_role, v_now);
  END LOOP;

  -- Trainee seats added, after every remove. A group added in this batch is
  -- addressed by its tempId. No ON CONFLICT: re-adding a seat that is
  -- there, or placing a gedu already seated on the product, is refused.
  FOR v_trainee IN SELECT * FROM jsonb_array_elements(p_trainees_added) LOOP
    IF v_temp_map ? (v_trainee->>'groupId') THEN
      v_resolved_group := (v_temp_map->>(v_trainee->>'groupId'))::UUID;
    ELSE
      v_resolved_group := (v_trainee->>'groupId')::UUID;
    END IF;

    INSERT INTO gedu_group_trainees (group_id, gedu_id, product_id)
    VALUES (v_resolved_group, (v_trainee->>'geduId')::UUID, p_product_id);
  END LOOP;

  FOR v_move IN SELECT * FROM jsonb_array_elements(p_participation_moves) LOOP
    IF (v_move->'toGroupId') IS NULL OR jsonb_typeof(v_move->'toGroupId') = 'null' THEN
      v_real_to_id := NULL;
    ELSIF v_temp_map ? (v_move->>'toGroupId') THEN
      v_real_to_id := (v_temp_map->>(v_move->>'toGroupId'))::UUID;
    ELSE
      v_real_to_id := (v_move->>'toGroupId')::UUID;
    END IF;

    -- Only a seat held now moves: an ended seat keeps the group it ended in,
    -- and a waitlisted row has none. A move naming either, from a panel that
    -- loaded before the seat ended, is skipped; the panel refetches after the
    -- batch and no longer shows it.
    UPDATE participations
       SET group_id = v_real_to_id
     WHERE id = (v_move->>'participationId')::UUID
       AND product_id = p_product_id
       AND status = 'active';
  END LOOP;

  -- The removals' sweeps, against the batch's end state. Each is the same
  -- fixpoint every other unseating runs, so a chain that starts here unwinds
  -- exactly as it does there.
  FOR v_sweep IN
    SELECT DISTINCT s.group_id, s.session_date
      FROM unnest(v_sweep_groups, v_sweep_dates) AS s(group_id, session_date)
  LOOP
    PERFORM public.cascade_withdraw_orphaned_substitution_requests(
              v_sweep.group_id, v_sweep.session_date
            );
  END LOOP;

  RETURN jsonb_build_object('tempMap', v_temp_map);
END;
$$;

COMMENT ON FUNCTION public.apply_group_changes(p_product_id uuid, p_added_groups jsonb, p_renamed_groups jsonb, p_deleted_group_ids uuid[], p_gedu_assignments_added jsonb, p_gedu_assignments_removed jsonb, p_participation_moves jsonb, p_trainees_added jsonb, p_trainees_removed jsonb) IS 'The admin groups panel''s whole batch, applied in one transaction: end assignments, delete groups, rename groups, add groups (each with its educators inline), add assignments, and move participations between groups — only active seats move, so a move naming an ended or waitlisted row is skipped silently. Admin-only, guard-first, and it takes the PRODUCT row''s lock first so two admins editing one product''s groups serialize rather than interleave; every period the batch ends or starts is stamped with ONE clock_timestamp() read under that lock. An assignment is a PERIOD: a removal { groupId, geduId } ends the current period at that instant (no current period is a silent no-op) and never deletes it; an add { groupId, geduId, role } is a no-op when the gedu is current on that group in that role, a ROLE CHANGE when current there in another role — the period ends and one in the new role starts at the same instant, so past sessions keep the role they were taught in, except that a period begun in this same batch has its role corrected in place rather than leave a period of no length — and otherwise starts a new period at that instant. Re-adding a gedu who was removed is a new row; the gap belongs to neither. Removes run BEFORE adds, so moving an educator from group A to group B is one batch: A''s period ends where B''s begins, and the one-live-period-per-product index would otherwise refuse the add, as it refuses assigning one gedu to two groups of a product. Newly added groups are addressed by a client-minted `tempId` and the returned `tempMap` hands back the real ids, which is what lets one batch create a group and move members into it. An added GROUP''s educators arrive as gedus: [{ geduId, role }] and are added exactly as explicit adds are, ahead of them. An omitted role is a primary, which is also the column''s default. This function is DELIBERATELY ASSIGNMENT-ONLY with respect to session substitutions, and is annotated as such in the completeness check: it is the writer of the permanent relationship, not a gate on it. Ending an assignment also sweeps the substitution requests it orphans: for every date the removed gedu held a live request on whose session starts at or after the removal, the same fixpoint every other unseating runs — a session that started before the removal still belongs to the ended period, so nothing in the past is withdrawn. The sweeps run at the end of the batch, after the adds, so a gedu removed and re-added in one batch keeps the requests their new period covers. It remains ASSIGNMENT-ONLY as a GATE — it still gates on nothing and still writes no substitution row — but a writer that can unseat somebody has to leave the derivation consistent, or an admin could answer a request filed by a person who is no longer expected at the session. TRAINEE SEATS ride the same batch: p_trainees_removed and p_trainees_added, each element { groupId, geduId } (an added one may name a tempId), removed with the assignments and added after them, so the one-seat-per-product trigger, which refuses a gedu holding both a current assignment and a trainee seat on the product, judges the batch''s end state. An added trainee seat has no ON CONFLICT, so placing a gedu already seated on the product is refused.';

-- ---------------------------------------------------------------------------
-- 10. The trainee table's description of its sibling
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.gedu_group_trainees IS 'Trainee seats: a gedu placed on one group to shadow it before they are ready to run one. Shaped like a gedu_group_assignments row without its period — (group_id, gedu_id, product_id, created_at), one seat per (gedu, product), deleted when it goes — so a later reader can treat it as a second source of seats. Deliberately NOT a value of gedu_group_assignments.role: every staff gate reads that table and treats any current row as full staff, so a trainee kept out of it is closed to all of them by default. A trainee is admitted only where a function asks gedu_trains_group: their own workspace and product documents, and their own group''s voice room and chat as a non-moderator. Independent of certification. A gedu holds a current assignment or a trainee seat on a product, never both, which a trigger on each table enforces. Written only by apply_group_changes. An admin reads every row and a gedu their own; the group''s assigned gedus learn a trainee''s first name through their workspace document, and no family path reaches this table.';

-- ---------------------------------------------------------------------------
-- 11. The backfill reproduces today's staffing
-- ---------------------------------------------------------------------------

-- Every session the old model read as staffed by an assignment — any date of
-- its group — must still fall in that assignment's period: every stored
-- session, every date a substitution request names, and every planned date up
-- to today.
DO $$
DECLARE
  v_late integer;
BEGIN
  WITH session_keys AS (
    SELECT gs.group_id, gs.session_date
      FROM public.group_sessions gs
    UNION
    SELECT r.group_id, r.session_date
      FROM public.session_substitution_requests r
    UNION
    SELECT g.id, planned.session_date
      FROM public.product_groups g
      JOIN public.products p ON p.id = g.product_id
     CROSS JOIN LATERAL public.planned_session_dates(
             p.id, p.start_date, (now() AT TIME ZONE p.timezone)::date, true
           ) AS planned
  )
  SELECT count(*) INTO v_late
    FROM session_keys k
    JOIN public.gedu_group_assignments a ON a.group_id = k.group_id
   WHERE public.group_session_starts_at(k.group_id, k.session_date) < a.started_at;

  IF v_late > 0 THEN
    RAISE EXCEPTION '% (session, assignment) pairs start before the assignment''s backfilled period; the backfill would unstaff them', v_late;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gedu_group_assignments a
     WHERE a.ended_at IS NOT NULL OR NOT isfinite(a.started_at)
  ) THEN
    RAISE EXCEPTION 'every backfilled assignment period is current and starts at a finite instant';
  END IF;
END;
$$;
