-- The criminal record check's stamp and its flag agree, or the row is refused.
--
-- WHY
--
-- 00213 introduced the invariant in prose and leaned on it everywhere: the RPC
-- writes `criminal_record_check_at` in the same statement as
-- `criminal_record_check_passed` and nulls it when the check is withdrawn; the
-- admin dashboard therefore ships only the MOMENT to the certification queue and
-- reads NULL as "no check"; the users list reads only the FLAG and prints its
-- warning mark from that. Two surfaces, two different columns, one assumed
-- equivalence — and nothing in the database said so.
--
-- The house rule is that a state the UI cannot produce must fail loudly at the
-- schema rather than corrupt silently. There is no way to reach a disagreeing
-- row through the app today: the table has no write grant for any Data API role,
-- and the one RPC that writes it sets both columns together. That is exactly the
-- argument for writing the CHECK now — the constraint costs nothing while it can
-- never fire, and it is the only thing that would catch a future migration, a
-- backfill or a hand-run UPDATE putting the queue and the users list into
-- disagreement about the same educator.
--
-- The predicate is stated as an equivalence rather than as two implications on
-- purpose. `(criminal_record_check_at IS NOT NULL) = criminal_record_check_passed`
-- is one expression that refuses both halves of the failure: a stamp left behind
-- a withdrawn check (a record of nothing), and a flag set with no moment (a
-- record the queue would read as absent). Neither operand can be NULL — the flag
-- is NOT NULL and `IS NOT NULL` is never NULL — so the CHECK is never
-- indeterminate and there is no third outcome to reason about.
--
-- WHAT THIS DOES NOT DO
--
-- It does not touch `criminal_record_check_by`, which is genuinely independent:
-- its FK is ON DELETE SET NULL, so a recorded check whose admin has since left
-- the platform is NULL there while the flag and the moment both stand. That is
-- the designed outcome — losing an account must never unrecord a check — and
-- folding the audit name into the equivalence would turn a departure into a
-- constraint violation.
--
-- It also gates nothing new. Certification remains the platform's only blocking
-- lever over an educator; this is a shape constraint on one row, not a rule
-- about what an educator may do.

-- ---------------------------------------------------------------------------
-- 1. The invariant, enforced
-- ---------------------------------------------------------------------------
--
-- No NOT VALID / VALIDATE dance: `gedu_profiles` is a small table, the columns
-- were added three migrations ago with the flag defaulting to false and the
-- stamp to NULL, and every row written since went through the RPC that maintains
-- the equivalence. So the table is already conforming and an immediate validating
-- ADD CONSTRAINT is cheap. If it somehow is not, the failure here is the point:
-- it means a row exists that two admin surfaces already disagree about.

ALTER TABLE public.gedu_profiles
  ADD CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag
  CHECK ((criminal_record_check_at IS NOT NULL) = criminal_record_check_passed);

COMMENT ON CONSTRAINT gedu_profiles_criminal_record_check_stamp_matches_flag
  ON public.gedu_profiles IS
  'The criminal record check''s moment is non-NULL exactly when its flag is true. '
  'Asserted in prose by 00213 and relied on by two admin surfaces that read '
  'different halves of it — the dashboard''s certification queue ships only '
  'criminal_record_check_at and reads NULL as "no check", while the users list '
  'reads only criminal_record_check_passed — so a disagreeing row would have the '
  'two describing the same educator differently. Nothing reachable can write one '
  'without the other (no write grant on the table; one RPC sets both in a single '
  'statement), which is why this fires only against a migration, a backfill or a '
  'hand-run UPDATE, and why failing loudly there is the whole of its job. '
  'criminal_record_check_by is deliberately outside it: ON DELETE SET NULL means '
  'a departed admin leaves a recorded check without a name, and that is correct.';

-- ---------------------------------------------------------------------------
-- 2. The acting admin is rendered after all
-- ---------------------------------------------------------------------------
--
-- 00213's comment on the column said "audit only — nothing renders it and no
-- surface reads it", and the service layer matched it by leaving the column out
-- of its shared select. That is no longer true: the admin user-detail card names
-- the recording admin beside the date, exactly as it already names the
-- certifying admin beside theirs, and for the same reason — an admin looking at
-- an educator's standing is entitled to know whose statement it is.
--
-- Nothing about the write posture changes, and the comment says so rather than
-- leaving a reader to infer it from silence. The column is still unforgeable:
-- gedu_profiles carries no write grant for any Data API role, the RPC stamps it
-- from the calling session, and the person the record is about cannot write it.
-- What changed is only who may READ it, which was always "whoever RLS lets read
-- the row" — an admin, and the educator themselves. The educator is not shown it,
-- and that is enforced where it belongs: the gedu-facing reads select the flag
-- and the moment from their own row and never the embed, because a gedu's
-- session cannot read another admin's profiles row anyway.

COMMENT ON COLUMN public.gedu_profiles.criminal_record_check_by IS
  'The admin whose statement this was, stamped alongside '
  'criminal_record_check_at by set_gedu_criminal_record_check and NULL whenever '
  'the flag is false. Rendered on the admin user-detail card — the recording '
  'admin''s name beside the date, exactly like certified_by — and nowhere else; '
  'the gedu-facing surfaces read only the flag and the moment from their own row, '
  'so an educator is never shown who looked at their document. Unforgeable '
  'regardless of who reads it: the table carries no write grant for any Data API '
  'role and the RPC derives this from the calling session. ON DELETE SET NULL, so '
  'a departed admin leaves the check recorded without the name; losing an account '
  'must never silently unrecord a check that was made.';

-- ---------------------------------------------------------------------------
-- 3. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Runs against the database this file was just applied to, so a silent no-op —
-- an already-claimed version number, a constraint that landed NOT VALID — fails
-- here rather than three weeks later.

DO $assert$
DECLARE
  v_def text;
BEGIN
  -- --- (a) The constraint exists, is a CHECK, and is validated. -------------
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.gedu_profiles'::regclass
     AND c.conname = 'gedu_profiles_criminal_record_check_stamp_matches_flag'
     AND c.contype = 'c';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'gedu_profiles_criminal_record_check_stamp_matches_flag was not created';
  END IF;

  -- A NOT VALID constraint checks new rows and ignores every row already there,
  -- which is a different guarantee from the one the comment above claims.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.gedu_profiles'::regclass
       AND c.conname = 'gedu_profiles_criminal_record_check_stamp_matches_flag'
       AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'gedu_profiles_criminal_record_check_stamp_matches_flag is NOT VALID — existing rows were never checked';
  END IF;

  -- Both columns are named in the predicate. A constraint that compiled but
  -- lost one of its operands would still be a valid CHECK and would enforce
  -- nothing anybody wanted.
  IF position('criminal_record_check_at' IN v_def) = 0
     OR position('criminal_record_check_passed' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the stamp/flag CHECK does not reference both columns: %', v_def;
  END IF;

  -- --- (b) It actually refuses both halves of the disagreement. ------------
  --
  -- Asserted by writing, because a predicate that reads correctly and never
  -- fires is the failure mode a catalog check cannot see. Each attempt runs in
  -- its own sub-block, so the savepoint that block opens rolls the write back
  -- when the constraint does its job; the migration's transaction is untouched
  -- either way.
  --
  -- Skipped on an empty table rather than faked, and the skip is real: CI builds
  -- this database from migrations alone and loads the fixtures afterwards, so
  -- there may be no educator here to try it against. The catalog assertions
  -- above carry the file in that case, and the standing proof that the
  -- constraint bites lives in the db test suite, which runs after the fixtures
  -- exist. Inventing a row is not available — user_id is a foreign key to a real
  -- profile — and a migration that created an account to test a CHECK would be a
  -- worse thing than a conditional assertion.
  IF EXISTS (SELECT 1 FROM public.gedu_profiles) THEN
    BEGIN
      UPDATE public.gedu_profiles
         SET criminal_record_check_passed = false,
             criminal_record_check_at     = now()
       WHERE user_id = (SELECT user_id FROM public.gedu_profiles LIMIT 1);
      RAISE EXCEPTION 'a stamp survived a false flag — the CHECK is not enforcing';
    EXCEPTION
      WHEN check_violation THEN NULL;
    END;

    BEGIN
      UPDATE public.gedu_profiles
         SET criminal_record_check_passed = true,
             criminal_record_check_at     = NULL
       WHERE user_id = (SELECT user_id FROM public.gedu_profiles LIMIT 1);
      RAISE EXCEPTION 'a true flag survived a NULL stamp — the CHECK is not enforcing';
    EXCEPTION
      WHEN check_violation THEN NULL;
    END;
  END IF;

  -- --- (c) The write posture 00213 established is still what it was. -------
  --
  -- Re-derived rather than assumed: the comment rewritten above asserts the
  -- column is unforgeable, and a comment is worth nothing if the grant behind it
  -- has moved since.
  IF has_column_privilege('authenticated', 'public.gedu_profiles', 'criminal_record_check_by', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.gedu_profiles', 'criminal_record_check_by', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can write gedu_profiles.criminal_record_check_by — the audit stamp is forgeable';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.gedu_profiles', 'criminal_record_check_by', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT gedu_profiles.criminal_record_check_by — the admin card reads it under RLS';
  END IF;

  IF to_regprocedure('public.set_gedu_criminal_record_check(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'set_gedu_criminal_record_check is gone — nothing maintains the invariant this CHECK enforces';
  END IF;
END
$assert$;
