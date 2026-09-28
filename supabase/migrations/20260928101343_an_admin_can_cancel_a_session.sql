-- An admin can cancel a session, and restore it again.
--
-- WHAT A CANCELLATION IS
--
-- A session is a (group, product-local date) pair the schedule projects. An
-- admin may cancel one — past or future, on any product type — with an
-- optional reason, and restore it by removing the cancellation. It lives in its
-- own table rather than as columns on group_sessions, so cancelling and
-- restoring never touch the session's record.
--
-- THE ADMIN'S WORD WINS OVER THE RECORD
--
-- An admin may cancel a date that already holds a record (a report, a note, a
-- photo, attendance): if an admin says it was cancelled, it was. Nothing is
-- deleted. The record is kept but frozen — every write on a cancelled date is
-- refused, the family feed stops carrying it, and every reader that treats a
-- stored row as "the session ran" (the feeds, the owed count, invoicing, the
-- report mail) lets the cancellation win. Restoring removes the cancellation,
-- and the record comes back as it was. Both the cancel and every write take
-- the same (group, date) advisory lock, so a write cannot land past a
-- cancellation committed beside it.
--
-- WHEN A CANCELLATION IS IN EFFECT
--
-- One predicate answers it everywhere: a cancellation row exists AND either
-- the current schedule projects the date or the date holds a stored session
-- row. So a cancellation on a recorded date keeps winning over the record
-- whatever later happens to the schedule — removing the weekday's slot or
-- narrowing the term cannot bring a kept report back to the families, back
-- onto an invoice or back onto the owed count. A cancellation on a date with
-- neither a projection nor a row (the weekday moved before anything was
-- recorded) is inert: it renders nothing and is never surfaced. The row is
-- kept rather than swept, so moving the schedule back makes it apply again.
-- Every reader and writer below asks that one predicate, and the feeds and the
-- invoicing document emit exactly the cancellations it holds true for.
--
-- WHO SEES WHAT
--
-- The reason, who cancelled and when are admin-only, exactly as a substitution
-- reason is. Gedus and families learn only that the date is cancelled.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.session_cancellations (
    group_id     uuid NOT NULL,
    session_date date NOT NULL,
    reason       text,
    cancelled_by uuid NOT NULL,
    cancelled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_cancellations_pkey PRIMARY KEY (group_id, session_date),
    CONSTRAINT chk_session_cancellations_reason CHECK (
      reason IS NULL
      OR (char_length(reason) BETWEEN 1 AND 500 AND reason = btrim(reason))
    ),
    CONSTRAINT session_cancellations_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE,
    CONSTRAINT session_cancellations_cancelled_by_fkey
      FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.session_cancellations IS 'One row per cancelled session, keyed exactly as group_sessions is: (group, product-local date). Written and removed only by cancel_session and restore_session (admin-only); no client role holds a grant, and RLS is on with no policy. A cancellation may share its key with a group_sessions row, and then it wins: the row is kept but frozen (every write on a cancelled date is refused with P0026, under the advisory lock cancel_session also takes), the family feed stops carrying it, and every reader that treats a stored row as "the session ran" excludes it until the session is restored — whatever the schedule does afterwards. Whether a row is in effect is group_session_is_cancelled''s answer and no reader''s own: a cancellation on a date with neither a schedule projection nor a stored row is INERT, never surfaced, and kept so that moving the schedule back re-applies it.';
COMMENT ON COLUMN public.session_cancellations.reason IS 'Why the session was cancelled, admin-only on every read, exactly as a substitution reason is. Trimmed and nulled when blank by cancel_session; the CHECK caps it at 500 characters.';
COMMENT ON COLUMN public.session_cancellations.cancelled_by IS 'The admin who cancelled (or last re-worded) the cancellation. RESTRICT rather than SET NULL because the column is NOT NULL: who called a session off is part of the record.';

ALTER TABLE public.session_cancellations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.session_cancellations TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers (internal: service_role only)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  -- The two-int form keeps this keyspace apart from the single-bigint locks
  -- other functions take on a user id.
  SELECT pg_advisory_xact_lock(hashtext(p_group_id::text), hashtext(p_session_date::text));
$$;

COMMENT ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) IS 'Transaction-scoped advisory lock on one (group, date) session key. Taken by ensure_group_session on every session write and by cancel_session / restore_session, so no write can land past a cancellation committed beside it.';

REVOKE ALL ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lock_group_session_key(p_group_id uuid, p_session_date date) TO service_role;


CREATE FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p_group_id IS NOT NULL
     AND p_session_date IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM public.product_groups g
             JOIN public.products p ON p.id = g.product_id
            WHERE g.id = p_group_id
              AND (p.start_date IS NULL OR p_session_date >= p.start_date)
              AND (p.end_date   IS NULL OR p_session_date <= p.end_date)
         )
     AND public.derive_group_session_window(p_group_id, p_session_date) IS NOT NULL;
$$;

COMMENT ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) IS 'Does the CURRENT schedule project a session on this date: inside the product''s start and end dates and on a weekday it has a slot for. The writable-date check minus its visible horizon — what a new cancellation is validated against, and one of the two ways a stored cancellation stays in effect (group_session_is_cancelled).';

REVOKE ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_date_is_scheduled(p_group_id uuid, p_session_date date) TO service_role;


CREATE FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
           SELECT 1
             FROM public.session_cancellations c
            WHERE c.group_id     = p_group_id
              AND c.session_date = p_session_date
         )
     AND (
           public.group_session_date_is_scheduled(p_group_id, p_session_date)
           -- A kept record holds its cancellation whatever the schedule does
           -- next: without this arm, removing the slot or narrowing the term
           -- would hand a cancelled session's report back to the families and
           -- its date back to the invoice.
           OR EXISTS (
                SELECT 1
                  FROM public.group_sessions s
                 WHERE s.group_id     = p_group_id
                   AND s.session_date = p_session_date
              )
         );
$$;

COMMENT ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) IS 'THE test for whether a (group, date) is a cancelled session, asked by every reader and writer: a cancellation row exists AND either the current schedule projects the date or a group_sessions row is stored on it. A cancellation over a stored record therefore stays in effect through any later schedule or term edit. One on a date with neither a projection nor a row is inert and answers false here; it is kept, and applies again if the schedule moves back.';

REVOKE ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_session_is_cancelled(p_group_id uuid, p_session_date date) TO service_role;


CREATE FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One shape for every reader, with the admin-only keys emitted as JSON null
  -- rather than omitted — the substitution document's convention, so no client
  -- schema branches on which keys arrived.
  SELECT jsonb_build_object(
    'session_date', p_cancellation.session_date,
    'reason',
      CASE WHEN p_include_detail THEN p_cancellation.reason END,
    'cancelled_at',
      CASE WHEN p_include_detail THEN p_cancellation.cancelled_at END,
    'cancelled_by',
      CASE WHEN p_include_detail THEN p_cancellation.cancelled_by END,
    'cancelled_by_first_name',
      CASE WHEN p_include_detail THEN (
        SELECT pr.first_name
          FROM public.profiles pr
         WHERE pr.id = p_cancellation.cancelled_by
      ) END
  );
$$;

COMMENT ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) IS 'The one wire shape of a cancellation on the staff documents: {session_date, reason, cancelled_at, cancelled_by, cancelled_by_first_name}. The last four are JSON null unless p_include_detail, which every caller sets from the CALLER being an admin: the reason is admin-only, exactly as a substitution reason is.';

REVOKE ALL ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_cancellation_document(p_cancellation public.session_cancellations, p_include_detail boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- The two writes
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row    public.session_cancellations;
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RAISE EXCEPTION 'cancel_session needs a group and a date'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.product_groups g WHERE g.id = p_group_id) THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  -- The date must be a session: one the schedule projects, or one holding a
  -- stored record — exactly the dates group_session_is_cancelled can answer
  -- true for, so a cancellation written here is never born inert. The record
  -- arm is what lets an admin re-word the reason on a cancelled record whose
  -- slot has since been removed, and call off a record the schedule no longer
  -- projects. There is deliberately no visible horizon: an admin calling off a
  -- session months ahead inside the term (a holiday, a closed venue) is the
  -- ordinary case, and a past session is cancellable too.
  IF NOT (
       public.group_session_date_is_scheduled(p_group_id, p_session_date)
       OR EXISTS (
            SELECT 1
              FROM public.group_sessions s
             WHERE s.group_id     = p_group_id
               AND s.session_date = p_session_date
          )
     ) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The lock every session write takes, so a write in flight either lands
  -- before this cancellation or is refused after it. A stored record on the
  -- date is no bar: the admin's word wins, and the record is kept, frozen and
  -- hidden until a restore.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  -- Cancelling a cancelled session re-words it: the reason is replaced and the
  -- stamp moves to this admin, so the record names who wrote the reason shown.
  INSERT INTO public.session_cancellations
    (group_id, session_date, reason, cancelled_by)
  VALUES (p_group_id, p_session_date, v_reason, v_caller)
  ON CONFLICT (group_id, session_date) DO UPDATE
    SET reason       = EXCLUDED.reason,
        cancelled_by = EXCLUDED.cancelled_by,
        cancelled_at = now()
  RETURNING * INTO v_row;

  RETURN public.session_cancellation_document(v_row, true)
         || jsonb_build_object('group_id', v_row.group_id);
END;
$$;

COMMENT ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) IS 'An admin cancels one session — a (group, date) the current schedule projects or that holds a stored record, past or future, with no visible-horizon bound; those are exactly the dates on which group_session_is_cancelled can hold, so no cancellation is written inert. The optional reason is trimmed and nulled when blank. A date that already holds a record (report, note, photo or attendance) is cancelled all the same: the admin''s word wins, nothing is deleted, and the record stays frozen and hidden until a restore. Taken under the (group, date) advisory lock every session write also takes. Cancelling an already-cancelled session is an UPSERT: the reason is replaced and cancelled_by / cancelled_at move to the caller. Returns the cancellation document with every admin field, plus group_id. Admin-only, guard-first.';

REVOKE ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_session(p_group_id uuid, p_session_date date, p_reason text) TO service_role;


CREATE FUNCTION public.restore_session(p_group_id uuid, p_session_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_group_id IS NULL OR p_session_date IS NULL THEN
    RAISE EXCEPTION 'restore_session needs a group and a date'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  DELETE FROM public.session_cancellations c
   WHERE c.group_id     = p_group_id
     AND c.session_date = p_session_date;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) IS 'An admin restores a cancelled session by removing its cancellation, which reopens every write on that date and brings back any record kept on it. Idempotent: returns true when a cancellation was removed and false when there was none. Deliberately no schedule check, so a cancellation on a date the schedule no longer projects — in effect over a kept record, or inert — can still be cleared. Admin-only, guard-first.';

REVOKE ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.restore_session(p_group_id uuid, p_session_date date) TO service_role;

-- ---------------------------------------------------------------------------
-- Every existing reader and writer learns about cancellations. Bodies below are
-- copied from their current definitions and changed only where marked
-- "cancellation".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_window     tstzrange;
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
BEGIN
  -- Cancellation: nothing is written on a cancelled date, whether or not it
  -- already holds a row — a record kept under a cancellation is frozen until
  -- the session is restored. Asked first, under the (group, date) lock
  -- cancel_session also takes, so a write cannot land past a cancellation
  -- committed beside it. Every session write that names a date (notes,
  -- attendance, a photo) reaches the table through here, which is what makes
  -- this the one refusal they share.
  --
  -- The effective test, as every other writer asks it. It refuses every date
  -- holding a row under a cancellation, whatever the schedule now says. The
  -- one date it lets through with a cancellation on it — no row and no
  -- projection — is refused anyway below, because the schedule derives no
  -- window for it.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
  END IF;

  SELECT id INTO v_session_id
    FROM public.group_sessions
   WHERE group_id = p_group_id AND session_date = p_session_date;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  v_window := public.derive_group_session_window(p_group_id, p_session_date);
  IF v_window IS NULL THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.group_sessions (
    group_id, session_date, starts_at, ends_at, created_by, updated_by
  )
  VALUES (
    p_group_id, p_session_date, lower(v_window), upper(v_window), v_uid, v_uid
  )
  ON CONFLICT (group_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    -- A concurrent writer materialized it between the SELECT and the INSERT.
    -- Theirs is the snapshot; take it rather than overwriting.
    SELECT id INTO v_session_id
      FROM public.group_sessions
     WHERE group_id = p_group_id AND session_date = p_session_date;
  END IF;

  RETURN v_session_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.request_session_substitution(p_group_id uuid, p_session_date date, p_reason public.substitution_reason DEFAULT NULL::public.substitution_reason, p_reason_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_timezone text;
  v_role     public.gedu_assignment_role;
  v_note     text;
  v_row      public.session_substitution_requests;
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

  -- The role being substituted: the filer's assignment role, or — when the filer is
  -- themselves a sub — the role stored on the substitution they hold.
  SELECT a.role INTO v_role
    FROM public.gedu_group_assignments a
   WHERE a.group_id = p_group_id
     AND a.gedu_id  = v_caller;

  IF v_role IS NULL THEN
    SELECT r.role INTO v_role
      FROM public.session_substitution_requests r
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.substitute_id   = v_caller
       AND r.status       = 'substituted'::public.substitution_request_status
     LIMIT 1;
  END IF;

  -- Unreachable while the derivation holds — being expected means one of the two
  -- reads above found something — and stated so the NOT NULL column cannot fail
  -- with a constraint name instead of a sentence.
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role to substitute for gedu % on group % (%)', v_caller, p_group_id, p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_reason_note, '')), '');

  INSERT INTO public.session_substitution_requests
    (group_id, session_date, requested_by, role, reason, reason_note)
  VALUES (p_group_id, p_session_date, v_caller, v_role, p_reason, v_note)
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, false, v_caller);
END;
$$;


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

    -- The absent gedu has to actually be expected at the session.
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


CREATE OR REPLACE FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
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
     -- Stops a sub substituting their own substitute — the person who said they
     -- cannot be there cannot be the answer to somebody else's absence on the
     -- same day.
     AND NOT EXISTS (
           SELECT 1
             FROM public.session_substitution_requests r
            WHERE r.group_id     = p_group_id
              AND r.session_date = p_session_date
              AND r.requested_by = p_gedu_id
              AND r.status <> 'withdrawn'::public.substitution_request_status
         )
     -- (5) Cancellation: the session is not cancelled. Nobody is seated to
     -- cover a session that is not happening, which also takes a cancelled
     -- date off the pool list and refuses an offer or an approval on one.
     AND NOT public.group_session_is_cancelled(p_group_id, p_session_date);
$$;


CREATE OR REPLACE FUNCTION public.ensure_chat_channel(p_group_id uuid) RETURNS SETOF public.chat_channels
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  -- The voice join margins, as SQL literals and named as such. They mirror
  -- VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES / _AFTER_MINUTES, which SQL
  -- cannot see; the db test that pins these windows against the TypeScript
  -- fixtures is what keeps the two honest.
  c_open_margin  constant interval := interval '5 minutes';
  c_close_margin constant interval := interval '5 minutes';

  v_zone       text;
  v_product_id uuid;
  v_opens      timestamptz;
  v_ends       timestamptz;
  v_id         uuid;
BEGIN
  -- Guard first. A NULL group is refused outright rather than allowed to fall
  -- through the predicate — an admin passes is_voice_group_member(NULL), and a
  -- refusal is the only correct answer to "which group?" with no group named.
  IF p_group_id IS NULL OR NOT public.is_voice_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.timezone
    INTO v_product_id, v_zone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_zone IS NOT NULL THEN
    SELECT o.opens_at, o.closes_at
      INTO v_opens, v_ends
      FROM (
        SELECT
          -- `timestamp AT TIME ZONE zone` resolves a wall clock in that zone to
          -- the right instant, so nothing here does arithmetic of its own on a
          -- local day.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone) - c_open_margin
            AS opens_at,
          -- The duration is added to the INSTANT, not to the wall clock, so a
          -- session straddling a transition keeps its real length.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone)
            + make_interval(mins => s.duration_minutes) + c_close_margin
            AS closes_at
          FROM (
            -- Yesterday, today and tomorrow AS CALENDAR DATES in the product's
            -- zone. Stepping a date is exact on any runtime; stepping an
            -- instant by 24 hours is what breaks twice a year.
            SELECT ((now() AT TIME ZONE v_zone)::date + probe.offset_days)
                     AS session_date
              FROM generate_series(-1, 1) AS probe(offset_days)
          ) cd
          JOIN public.schedule_slots s ON s.product_id = v_product_id
           -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
           WHERE s.weekday = (EXTRACT(ISODOW FROM cd.session_date)::integer - 1)
             -- Cancellation: a cancelled session opens no room, by the one
             -- effective test every other reader asks.
             AND NOT public.group_session_is_cancelled(p_group_id, cd.session_date)
      ) o
     WHERE now() >= o.opens_at
       AND now() <  o.closes_at
     -- Two slots' windows can overlap. The TypeScript path takes whichever slot
     -- PostgREST happened to return first; this takes the earliest-opening one,
     -- deterministically, so two callers a millisecond apart cannot materialize
     -- two different channels for one room.
     ORDER BY o.opens_at, o.closes_at
     LIMIT 1;
  END IF;

  IF v_opens IS NULL THEN
    RAISE EXCEPTION 'No session window is open for this group'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insert-or-reselect, the established idempotent shape. Two joiners racing on
  -- mount is the normal case, not the exception.
  INSERT INTO public.chat_channels (
    type, group_id, session_opens_at, session_ends_at
  )
  VALUES (
    'group_session'::public.chat_channel_type, p_group_id, v_opens, v_ends
  )
  ON CONFLICT (group_id, session_opens_at) DO NOTHING
  RETURNING chat_channels.id INTO v_id;

  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM public.chat_channels c
     WHERE c.group_id = p_group_id
       AND c.session_opens_at = v_opens;
  END IF;

  RETURN QUERY
  SELECT c.* FROM public.chat_channels c WHERE c.id = v_id;
END;
$$;


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
           -- Cancellation: a cancelled session needs no cover, so its requests
           -- leave both lists. They are kept, not withdrawn, so restoring the
           -- session brings them back as they were.
           AND NOT public.group_session_is_cancelled(r.group_id, r.session_date)
      ) q
  ), '[]'::jsonb);
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
        -- them. Deliberately NOT the group feed's roster — taking the register
        -- is all this surface does with it, and the groups panel on the same
        -- page already answers who these people are.
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
                   -- The session's photos. Byte-for-byte the gedu feed's
                   -- aggregate, because
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

        -- Every non-withdrawn substitution request on the group, in the gedu feed's
        -- shape verbatim and for the same reason the session shape is: one card
        -- component renders both. `reason` and `reason_note` DO travel here —
        -- this document is admin-only end to end, and the reason is what the
        -- staffing editor shows beside the request.
        'substitutions', COALESCE((
          SELECT jsonb_agg(
                   public.substitution_request_document(r, true, v_viewer)
                   ORDER BY r.session_date DESC, r.created_at, r.id
                 )
            FROM public.session_substitution_requests r
           WHERE r.group_id = g.id
             AND r.status <> 'withdrawn'::public.substitution_request_status
        ), '[]'::jsonb),

        -- Cancellation: the group's cancelled sessions, newest first, with
        -- every admin field — this document is admin-only end to end. Exactly
        -- the ones in effect: a cancellation over a kept record travels even
        -- where the schedule no longer projects its date, so the page can
        -- still restore it, and an inert one is never surfaced.
        'cancellations', COALESCE((
          SELECT jsonb_agg(
                   public.session_cancellation_document(sc, true)
                   ORDER BY sc.session_date DESC
                 )
            FROM public.session_cancellations sc
           WHERE sc.group_id = g.id
             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
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
  v_substitutions     jsonb;
  v_cancellations     jsonb;
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
    -- Staff-facing only, and the one thing a client needs before it can
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
  -- The identity key is `participant_id`. Every row on this roster is whoever
  -- holds the seat, and that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel, and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel: the first is when this seat was taken on the PRODUCT,
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
        -- email, so on a CHILD row this is non-null in practice. An ADULT row
        -- has no parent link at all, so it is NULL there and the wire contract
        -- allows it — the address for that row is the one below.
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
        -- check is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair, in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- The one field on this roster that is NOT staff-only: the
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
        -- NULL until it has been. The card renders the sent line from
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
        -- The session's photos. `created_by` is deliberately NOT on the
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

  -- Every NON-WITHDRAWN substitution request on the group, unbounded — exactly as this
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
             public.substitution_request_document(r, v_is_admin, v_viewer, true)
             ORDER BY r.session_date DESC, r.created_at, r.id
           ),
           '[]'::jsonb
         )
    INTO v_substitutions
    FROM public.session_substitution_requests r
   WHERE r.group_id = p_group_id
     AND r.status <> 'withdrawn'::public.substitution_request_status;

  -- Cancellation: the group's cancelled sessions in effect, newest first —
  -- including one over a kept record the schedule no longer projects, which
  -- the feed draws as cancelled in the record's place rather than as the
  -- record. The reason, who cancelled and when ride for an ADMIN caller
  -- only, keyed to the caller exactly as a substitution reason is: a gedu
  -- learns that the session is off and nothing about why.
  SELECT COALESCE(
           jsonb_agg(
             public.session_cancellation_document(sc, v_is_admin)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = p_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions,
    'gedus',    v_gedus,
    'substitutions',   v_substitutions,
    'cancellations', v_cancellations
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
  v_creations      jsonb;
  v_cancellations  jsonb;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, where a NULL uid
  -- would disappear into a larger boolean expression instead of refusing.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.participant_id, part.group_id, part.product_id
    INTO v_participant_id, v_group_id, v_product_id
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
  FROM public.profiles pr WHERE pr.id = v_participant_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it. The requirement flag
  -- is not selected either, and its absence here is the enforcement: it
  -- is staff-facing, and a family sees nothing different on a flagged product.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
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
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person products only — same test as the gedu feed, and for
  -- the same reason: a remote municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- Who teaches this group, by first name. Nothing else about them: not the
  -- surname, not the email, not the verification state. A family is being told
  -- who they are with, which is a first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
    ) AS gedu_rows;

  -- THIS participant's creations in THIS group, and nobody else's. A
  -- flat array on the document rather than a map keyed by participant, so
  -- another child's work has nowhere to live here BY TYPE — the same move
  -- `attendance` makes below, where the gedu feed carries a map and this
  -- document carries one answer. Empty array when there is no row, so the card
  -- renders on "is this empty" and never on "is this null".
  SELECT COALESCE(
           (SELECT c.creations
              FROM public.gamer_group_creations c
             WHERE c.group_id       = v_group_id
               AND c.participant_id = v_participant_id),
           '[]'::jsonb
         )
    INTO v_creations;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. There is deliberately no window here: what is stored is
  -- what travels.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys ride on every session, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` has the same shape as the gedu and admin documents' —
  -- {id, width, height}, ordered by (created_at, id) — because one shared
  -- gallery component renders them all. The uploader does not travel: it is
  -- safeguarding audit, and a family surface is the last place for it.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.participant_id   = v_participant_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
         -- Cancellation: a record kept under a cancellation does not travel. A
         -- family is told the session is off, and a report on it would say
         -- otherwise; a restore brings the row back here as it was.
         AND NOT public.group_session_is_cancelled(s.group_id, s.session_date)
    ) AS session_rows;

  -- Cancellation: the group's cancelled sessions in effect, newest first, as a
  -- date and NOTHING ELSE. The reason and who cancelled are admin-only; a
  -- family is told the session is off, not why. One kept over a record the
  -- schedule no longer projects travels too, and the record beside it does
  -- not (above): the family has no instants to draw it at, so the date
  -- simply stops being shown rather than showing the report.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('session_date', sc.session_date)
             ORDER BY sc.session_date DESC
           ),
           '[]'::jsonb
         )
    INTO v_cancellations
    FROM public.session_cancellations sc
   WHERE sc.group_id = v_group_id
     AND public.group_session_is_cancelled(sc.group_id, sc.session_date);

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'creations',   v_creations,
    'sessions',    v_sessions,
    'cancellations', v_cancellations
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
  v_orphans   text;
BEGIN
  PERFORM public.assert_admin();

  -- The month is named by its first day and nothing else. A mid-month argument
  -- is a caller that has not decided what it is asking for — the window would
  -- be a month-long span that matches no calendar month, and every total drawn
  -- from it would be wrong in a way nobody could see. Refused loudly, after the
  -- guard, so an unauthorized caller learns nothing about the argument shape.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH RECURSIVE candidate AS (
    SELECT p.*
      FROM public.products p
     WHERE p.product_type = 'municipality_club'
       AND (
             EXISTS (
               SELECT 1
                 FROM public.product_groups g
                 JOIN public.group_sessions gs ON gs.group_id = g.id
                WHERE g.product_id = p.id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
                  -- Cancellation: the same exclusion as `sessions` below.
                  AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
             )
          OR (
               p.start_date IS NOT NULL
               AND p.start_date <= v_month_end
               AND (p.end_date IS NULL OR p.end_date >= p_month_start)
             )
           )
  ),
  -- The ancestor-or-self walk, one chain per candidate's own location. It
  -- stops climbing the moment it has emitted a municipality, so the shortest
  -- chain wins by construction; `depth` is kept so the DISTINCT ON below picks
  -- the nearest one even if a tree ever nests two municipalities.
  walk AS (
    SELECT l.id AS origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           0 AS depth
      FROM public.locations l
     WHERE l.id IN (
             SELECT c.location_id FROM candidate c WHERE c.location_id IS NOT NULL
           )
     UNION ALL
    SELECT w.origin_id,
           l.id,
           l.parent_id,
           l.type,
           l.name,
           l.name_i18n,
           w.depth + 1
      FROM walk w
      JOIN public.locations l ON l.id = w.parent_id
     -- Two stops, and each earns its place: the first is the answer, the second
     -- is a belt-and-braces bound on a tree the schema does not forbid a cycle
     -- in beyond a row parenting itself.
     WHERE w.type <> 'municipality'
       AND w.depth < 16
  ),
  municipality AS (
    SELECT DISTINCT ON (w.origin_id)
           w.origin_id,
           w.id,
           w.name,
           w.name_i18n
      FROM walk w
     WHERE w.type = 'municipality'
     ORDER BY w.origin_id, w.depth
  )
  SELECT COALESCE(jsonb_agg(club.doc ORDER BY club.id), '[]'::jsonb)
    INTO v_clubs
    FROM (
      SELECT c.id,
             jsonb_build_object(
               'id',                     c.id,
               'timezone',               c.timezone,
               'start_date',             c.start_date,
               'end_date',               c.end_date,
               'municipality_fee_cents', c.municipality_fee_cents,
               'product_translations',   tr.items,
               'schedule_slots',         sl.items,
               'location',
                 CASE WHEN l.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        l.id,
                             'name',      l.name,
                             'name_i18n', l.name_i18n,
                             'type',      l.type
                           )
                 END,
               'municipality',
                 CASE WHEN m.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        m.id,
                             'name',      m.name,
                             'name_i18n', m.name_i18n
                           )
                 END,
               -- The buyer of this club, whole rather than by id: the caller
               -- turns it into a Finvoice file, so a second admin-gated round
               -- trip per club would buy nothing. Null where nobody has said
               -- who pays yet — flagged by the page, refused by the export.
               'invoice_customer',
                 CASE WHEN ic.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',                 ic.id,
                             'fennoa_customer_no', ic.fennoa_customer_no,
                             'invoice_name',       ic.invoice_name,
                             'street',             ic.street,
                             'postal_code',        ic.postal_code,
                             'city',               ic.city,
                             'country_code',       ic.country_code,
                             'your_reference',     ic.your_reference,
                             'invoice_text',       ic.invoice_text
                           )
                 END,
               'sessions',               se.items,
               'cancelled_sessions',     cx.items,
               'group_ids',              gr.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
        -- The link is the club's own column and never the location's: one city
        -- can be two customers, and an association can buy clubs sited in a
        -- municipality it is not.
        LEFT JOIN public.invoice_customers ic ON ic.id = c.invoice_customer_id
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
        -- Raw rows, one per (group, date). The page collapses two groups on one
        -- date into the single session the club is paid for, and can still say
        -- which groups met — an aggregate here would have thrown that away.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     gs.group_id,
                              'session_date', gs.session_date
                            )
                            ORDER BY gs.session_date, gs.group_id
                          )
                     FROM public.group_sessions gs
                     JOIN public.product_groups g ON g.id = gs.group_id
                    WHERE g.product_id = c.id
                      AND gs.session_date >= p_month_start
                      AND gs.session_date <= v_month_end
                      -- Cancellation: a row kept under a cancellation is not a
                      -- session that ran, so it never reaches the bill. Left
                      -- out here rather than trusted to the page, so no reader
                      -- of this document can count one.
                      AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                 ), '[]'::jsonb) AS items
        ) se
        -- Cancellation: the month's cancelled (group, date) pairs in effect,
        -- in the same shape as `sessions`, so the page can show a cancelled
        -- date as Cancelled rather than as unrecorded and never bill it. The
        -- same predicate `sessions` excludes by, so a pair here never also
        -- appears there, and an inert cancellation appears in neither.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     sc.group_id,
                              'session_date', sc.session_date
                            )
                            ORDER BY sc.session_date, sc.group_id
                          )
                     FROM public.session_cancellations sc
                     JOIN public.product_groups g ON g.id = sc.group_id
                    WHERE g.product_id = c.id
                      AND sc.session_date >= p_month_start
                      AND sc.session_date <= v_month_end
                      AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                 ), '[]'::jsonb) AS items
        ) cx
        -- Every group the club has, whether or not the month says anything
        -- about it. A date is cancelled for the club only when every one of its
        -- groups cancelled it, and a group that neither met nor cancelled is
        -- exactly the one neither list above can name — without this a
        -- sibling's cancellation would hide its missed session. Every row, with
        -- no filter: a group has no archived state and no start date, so any
        -- group the product holds is one its schedule is due to meet.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
    ) club;

  -- Every club on the invoice belongs to a municipality, or there is no invoice.
  -- A municipality club whose chain reaches no municipality cannot be billed to
  -- anybody, and the reader of this document has no way to tell such a club from
  -- one whose location was mistyped an hour ago — so the read stops and names the
  -- products, which is the whole of the repair instruction. Checked against the
  -- document that was built rather than against a second walk of the tree,
  -- because what matters is what would have been emitted.
  --
  -- A missing invoice CUSTOMER is deliberately NOT refused here, and the
  -- difference is real: a club with no municipality has nobody to bill and
  -- cannot be rendered on a page that is organised by municipality, while a club
  -- with no customer renders perfectly well and simply cannot have a file
  -- produced for it yet. Refusing the month would take every other file down
  -- with it.
  SELECT string_agg(club.value ->> 'id', ', ' ORDER BY club.value ->> 'id')
    INTO v_orphans
    FROM jsonb_array_elements(v_clubs) AS club(value)
   WHERE jsonb_typeof(club.value -> 'municipality') = 'null';

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: no municipality is an ancestor-or-self of the location of municipality club(s) % — repoint the location so the club can be invoiced',
      v_orphans
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
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
    -- written against a (product, group) pair and a possible substitution DATE, and
    -- does not care which arm produced them.
    --
    --   * `assignment` — one row per gedu_group_assignments row, exactly as
    --     before, with `substitution_date` null.
    --   * `substitution`      — one row per UNEXPIRED substitution date.
    --     gedu_holds_unexpired_substitution carries the whole of that: keyed to
    --     auth.uid(), the holder still certified, and the window's END not yet
    --     passed. Deliberately not gedu_substitutes_session, which would also
    --     require the session to be within 48 hours — this arm feeds the substitution
    --     card a sub reads on My SOG, which exists from approval, where the
    --     workspace it links to opens at T-48h.
    --
    -- `gedu_id` is carried through rather than dropped so the closing
    -- `WHERE a.gedu_id = v_uid` still reads as the statement it always was.
    WITH seat AS (
      SELECT a0.product_id,
             a0.group_id,
             a0.gedu_id,
             'assignment'::text AS kind,
             NULL::date         AS substitution_date
        FROM public.gedu_group_assignments a0
       WHERE a0.gedu_id = v_uid
      UNION ALL
      SELECT g0.product_id,
             r0.group_id,
             r0.substitute_id AS gedu_id,
             'substitution'::text  AS kind,
             r0.session_date AS substitution_date
        FROM public.session_substitution_requests r0
        JOIN public.product_groups g0 ON g0.id = r0.group_id
       WHERE r0.substitute_id = v_uid
         AND r0.status     = 'substituted'::public.substitution_request_status
         AND public.gedu_holds_unexpired_substitution(r0.group_id, r0.session_date)
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Which kind of seat this row is, and on which date when it is a
               -- substitution. The dashboard rollup keys on (product, group) and a
               -- substitution card's identity is (group, date) — one card per substituted
               -- date, standing from approval until the substitution expires.
               'kind',                    a.kind,
               'substitution_date',            a.substitution_date,
               -- The count is every active seat on the group, and one of those
               -- can be an adult — which is why it is named for the
               -- participant rather than for a gamer.
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
             ORDER BY g.name, a.kind, a.substitution_date
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

      -- The run's FINAL computed occurrence, which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Cancellation: the final session is the last projected occurrence this
      -- GROUP has not had cancelled, so a cancelled last session hands the
      -- creations condition to the one before it rather than dropping it.
      -- The window is therefore a year ending at end_date, floored at
      -- start_date, rather than the week that sufficed before cancellations:
      -- slots are weekly, so any week inside it holds every weekday and the
      -- max over the window is the max over the run unless a whole year of
      -- the group's sessions is cancelled — a bounded cost either way.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 366),
                   p.end_date - 366
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
           AND NOT public.group_session_is_cancelled(g.id, d::date)
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
           -- A SUBSTITUTION row owes ONE date: the one it substitutes for. The four conditions
           -- below are untouched and simply see a set of one occurrence, which
           -- is what "the same code path, restricted to that date" means — no
           -- second computation, and in particular the creations condition (4)
           -- fires for a substitution only when the substitution date really is the run's
           -- final occurrence. An ASSIGNMENT row sees every occurrence, as
           -- before.
           AND (a.substitution_date IS NULL OR occurrence.session_date = a.substitution_date)
           -- A date the caller holds a NON-WITHDRAWN request on is not their
           -- work, whichever kind of seat this row is: they have said they
           -- cannot be there. The badge must not count it, whether the request
           -- is still open, already substituted, or a sub-of-sub chain's second
           -- link. This has a TWIN IN TYPESCRIPT (see the comment below on the
           -- four conditions) and the twin learns the same rule.
           AND NOT EXISTS (
             SELECT 1
               FROM public.session_substitution_requests rq
              WHERE rq.group_id     = g.id
                AND rq.session_date = occurrence.session_date
                AND rq.requested_by = v_uid
                AND rq.status <> 'withdrawn'::public.substitution_request_status
           )
           -- Cancellation: a cancelled session owes nothing — nothing ran, so
           -- there is no register, report or mail to ask for, and a record
           -- kept under the cancellation is frozen rather than owed — and
           -- stays so when the stored-row arm reaches it on a date the
           -- schedule no longer projects, because a cancellation over a
           -- record stays in effect. This has the same TypeScript twin as the
           -- rule above, and it learns it too.
           AND NOT public.group_session_is_cancelled(g.id, occurrence.session_date)
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That includes the
           -- CREATIONS condition (4) below — which is scoped by the same
           -- join-date test (1) is — and which members a session is
           -- FOR at all: the TS side asks the same question of the same
           -- instant, with the same inclusive boundary, in both conditions.
           AND (
             -- (1) Some of the members this session EXPECTED have no answer
             -- yet. Both sides of the comparison are scoped the same way: marks
             -- are counted only for members who had joined before the
             -- occurrence ended, and they are compared against how many such
             -- members there are.
             --
             -- Comparing every mark against the whole current roster instead
             -- would mean that placing a member into a group reopens every
             -- session in its history, with no way to clear the alert but to
             -- record an absence that never happened: nobody had yet said
             -- whether that child was there, because they were not in the
             -- group.
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
             -- (3) The families have not been told it is there.
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
             -- somebody on the current roster who has none. Creations
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


COMMENT ON FUNCTION public.ensure_group_session(p_group_id uuid, p_session_date date) IS 'Find-or-create the session row for a (group, date), snapshotting the schedule instants at first write and never re-deriving them afterwards. Refuses a CANCELLED date (group_session_is_cancelled) with SQLSTATE P0026 whether or not it already holds a row — a record kept under a cancellation is frozen until a restore, whatever the schedule does meanwhile — asked first, under the (group, date) advisory lock cancel_session also takes. That is the one refusal every dated session write (notes, attendance, a photo) shares, since each reaches the table through here.';

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (an active seat may be held by an adult as well as by a child), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent, and — on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The register condition is scoped to the members who had JOINED the group before that occurrence ended: both the marks counted and the size they are compared against, off participations.group_joined_at against an end instant resolved once per occurrence (the stored row''s ends_at, else the min slot end for that weekday, which is the same instant the "has it finished" test already used). group_participant_count and the empty-roster guard deliberately keep measuring the WHOLE current roster — a card''s headcount and the empty-group exemption are not per-occurrence questions. The report and mail conditions are unscoped because a session owes those whoever was in the room. The creations condition carries the SAME join-date scoping as the register condition, on the owner''s principle that a gedu owes a creation for every gamer who was in the group at the time of the last session — so a seat placed into the group after the final session ended owes nothing, and one occurrence cannot answer "who was this for" two different ways. Only the JOIN half of that principle is expressible: a member who has since LEFT owes nothing, because the roster is active seats and a departure leaves no trace. The final session is the last occurrence the schedule projects on or before end_date that the group has not cancelled, derived here rather than stored — so a cancelled last session hands the creations condition to the one before it; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. A CANCELLED occurrence is never owed, by group_session_is_cancelled — including a cancelled record the schedule no longer projects, which the stored-row arm would otherwise reach: nothing ran, and a record kept under a cancellation is frozen. The badge''s unit is the SESSION: it counts sessions needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions and on who a session is for, which scopes two of them. A SECOND KIND OF SEAT feeds the same machinery: a `substitution` row per substitution date, carrying `kind` and `substitution_date`, whose owed count is the same four conditions applied to a set of one occurrence — so it is 0 or 1 and never a term''s worth. That arm asks gedu_holds_unexpired_substitution rather than gedu_substitutes_session: the card stands from approval, where the workspace behind it opens 48 hours before the substituted session, and a card that waited for the workspace would hide from a sub the afternoon they had agreed to take. A substitution still locked owes nothing by construction, because every occurrence this count ranges over has already ended.';

COMMENT ON FUNCTION public.gedu_may_substitute_session(p_gedu_id uuid, p_group_id uuid, p_session_date date, p_absent_gedu_id uuid) IS 'Internal predicate: may this gedu be seated as the sub for this (group, date)? Five refusals: (1) not the absent gedu, (2) a certified gedu — the ONLY eligibility test there is, with coverage area, language and schedule clash all deliberately left to follow-ups, (3) not already expected at that session, (4) holding no non-withdrawn request of their own on that (group, date), and (5) the session is not cancelled. Together (3) and (4) stop a sub covering their own substitute and stop two seats collapsing onto one person, which would make "who did which job" unanswerable. Asked by offer_session_substitution, again by approve_session_substitution_offer under the request''s lock, by set_session_substitution, and by get_open_substitution_requests as its exclusion — the pool list shows a gedu exactly the requests they could actually take, and never one on a cancelled session. Not granted to `authenticated`.';

-- ---------------------------------------------------------------------------
-- The writes that do not pass through ensure_group_session: the report mail's
-- claim and a photo's removal. A record kept under a cancellation is frozen,
-- so both refuse a cancelled date as every other session write does.
-- ---------------------------------------------------------------------------

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
  -- gedu_teaches_group. gedu_teaches_group admits a live substitution on ANY of
  -- the group's dates; the family report mail is at-most-once and has no
  -- resend, so a sub must not be able to send the mail for a session they did
  -- not run. The substitution arm is therefore DATE-SCOPED to the session being
  -- claimed.
  IF NOT public.is_admin()
     AND NOT EXISTS (
           SELECT 1
             FROM public.gedu_group_assignments ga
            WHERE ga.group_id = p_group_id
              AND ga.gedu_id  = (SELECT auth.uid())
         )
     AND NOT public.gedu_substitutes_session(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a cancelled session's report is never mailed. The record
  -- may still hold one — an admin can cancel a session that was written up —
  -- but the families were told the session is off. Asked under the lock
  -- cancel_session takes, so a claim cannot land past a cancellation.
  PERFORM public.lock_group_session_key(p_group_id, p_session_date);

  IF public.group_session_is_cancelled(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', p_session_date
      USING ERRCODE = 'P0026';
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

COMMENT ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) IS 'Claim the one send of a session report to the group''s families, and hand back the row it claimed. Open to an ADMIN or to the gedu assigned to the group, exactly as the session-notes writer is. Refuses a CANCELLED session with SQLSTATE P0026 — a record kept under a cancellation may hold a report, but the families were told the session is off — asked under the (group, date) advisory lock cancel_session takes. Then takes the row''s lock and refuses with P0021 when there is no report to send (no row, or a report that is empty after the same whitespace trim the summaries SQL applies) and with P0022 when report_emailed_at is already set — every refusal binds an admin identically; otherwise stamps report_emailed_at = now() and report_emailed_by = auth.uid(). The claim is the FIRST write of the send and is also its authorization: succeeding proves the caller may send for this group, which is what lets the route resolve recipients with the service role afterwards. Releasing a claim is the route''s job and happens only when every single mail failed. The assignment half is spelled out INLINE here instead of calling gedu_teaches_group, and that is a security decision rather than a convenience: gedu_teaches_group admits a live substitution on ANY of the group''s dates, while this mail is at-most-once with no resend, so a sub must not be able to send the families a write-up of a session they did not run. The substitution arm here is therefore DATE-SCOPED to the session being claimed — one of exactly two places on this surface that is, the other being the voice room.';

REVOKE ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO authenticated;
GRANT ALL ON FUNCTION public.claim_group_session_report_email(p_group_id uuid, p_session_date date) TO service_role;


CREATE OR REPLACE FUNCTION public.assert_can_delete_session_image(p_image_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
BEGIN
  -- An admin, or a gedu. Guard-first on the first statement, in the shape the
  -- authorization spine reads and every other session RPC carries.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id, s.session_date
    INTO v_group_id, v_session_date
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way, exactly as they do in
  -- delete_group_session_image. The caller has no right to learn which it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a photo on a cancelled session is frozen with the rest of
  -- the record. Asked here as well as on the delete, because the route removes
  -- the object between the two and must not start on one it cannot finish.
  IF public.group_session_is_cancelled(v_group_id, v_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', v_session_date
      USING ERRCODE = 'P0026';
  END IF;

  -- The id it validated, so a caller has a positive answer rather than the
  -- absence of an error. Returning it discloses nothing: it is the id the caller
  -- just sent, and it comes back only on the path where they were allowed.
  RETURN p_image_id;
END;
$$;

COMMENT ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) IS 'May this caller remove this photo? A CHECK-ONLY function: it mutates nothing, and it exists because the route deletes the storage object BEFORE the row, on the service-role client, and an admin client must never act for a caller whose authorization has not been proved. Object-first is what makes a failed removal visible and retryable — the row is what every surface reads, so deleting it first would take the tile away and leave the object standing in a public bucket with nothing left to retry against. The gate is byte for byte delete_group_session_image''s: guard-first on assert_role for an ADMIN or a gedu, then the group resolved from the image''s own session row, with a photo id belonging to another group and one belonging to nothing refused IDENTICALLY with 42501 — never distinguish them, or this becomes an oracle for real photo ids, which name objects whose unguessable names are the access control. A photo on a CANCELLED session is refused with P0026 after that gate, exactly as the delete refuses it, so the route never removes an object whose row it may not delete. Returns the id it validated. It does not replace the delete RPC''s own guard, which still runs on the actual delete afterwards; the window between the two is cosmetic, because nothing inside it can widen what a caller may do.';

REVOKE ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assert_can_delete_session_image(p_image_id uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.delete_group_session_image(p_image_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_group_id     uuid;
  v_session_date date;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id, s.session_date
    INTO v_group_id, v_session_date
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way. Deliberate: the caller
  -- has no right to learn which of the two it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cancellation: a photo on a cancelled session is frozen with the rest of
  -- the record, and comes back with it on a restore. Asked under the lock
  -- cancel_session takes, so a removal cannot land past a cancellation.
  PERFORM public.lock_group_session_key(v_group_id, v_session_date);

  IF public.group_session_is_cancelled(v_group_id, v_session_date) THEN
    RAISE EXCEPTION 'The session on % is cancelled', v_session_date
      USING ERRCODE = 'P0026';
  END IF;

  DELETE FROM public.group_session_images WHERE id = p_image_id;
END;
$$;

COMMENT ON FUNCTION public.delete_group_session_image(p_image_id uuid) IS 'Remove one photo''s ROW from a session''s report. Open to an ADMIN or to ANY gedu assigned to the group — there is no per-photo ownership, matching how the report itself is edited under the last-editor model. Guard-first on assert_role; the group is then resolved from the image''s own session row, and that resolution is the second half of the gate. A photo id that belongs to another group and one that belongs to nothing are refused identically with 42501, so this cannot be used as an oracle for real photo ids. A photo on a CANCELLED session is refused with P0026 after that gate, under the (group, date) advisory lock cancel_session takes: it is frozen with the rest of the record until a restore. The route calls this LAST: it authorizes with assert_can_delete_session_image, removes the OBJECT through the Storage API (never with SQL against storage.objects, which orphans the backing file), and only then deletes the row here — so that a removal which failed to remove the picture leaves the photo on the card, visible and retryable, instead of taking the tile away while the object stands in a public bucket. This function''s own guard is not replaced by that check; it runs again on the actual delete. A row that survives a failed delete after its object is gone renders as a broken thumbnail, and the ordinary remove control is its repair: the storage API answers a delete of an absent object as success, so the retry reaches here and clears the row.';

REVOKE ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_group_session_image(p_image_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- The partner API's read of the same answer. It runs on the service role with
-- no user to scope to, and asks the one predicate rather than re-deriving the
-- schedule in TypeScript, so its answer cannot drift from every other surface.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) RETURNS TABLE(group_id uuid, session_date date)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.group_id, c.session_date
    FROM public.session_cancellations c
   WHERE c.group_id = ANY (p_group_ids)
     AND public.group_session_is_cancelled(c.group_id, c.session_date);
$$;

COMMENT ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) IS 'Every cancelled (group, date) in effect among the given groups — group_session_is_cancelled holding — and no reason, stamp or author: the partner API needs only which of its recorded sessions did not happen. Service-role only: its caller has no Sogverse user, and no client role is granted the table behind it.';

REVOKE ALL ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_session_cancellations_in_effect(p_group_ids uuid[]) TO service_role;
