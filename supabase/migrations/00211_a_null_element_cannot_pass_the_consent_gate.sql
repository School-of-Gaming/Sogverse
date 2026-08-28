-- A NULL element cannot pass the consent gate.
--
-- WHY
--
-- 00210 wrote the missing-set check as
--
--   WHERE NOT (r = ANY (COALESCE(p_consented_documents, ARRAY[]::text[])))
--
-- and `scalar = ANY (array)` is three-valued: when the array contains a NULL
-- element and no element matches, the operator yields SQL NULL rather than
-- false. `NOT NULL` is NULL, the WHERE keeps no row, `v_missing` comes back
-- empty, and the gate concludes that every required document was agreed to.
-- The enrolment then proceeds and one acceptance row is INSERTed per required
-- document — a false legal record that the platform will later cite as proof a
-- parent agreed to a text nobody ever showed them.
--
-- `p_consented_documents := ARRAY[NULL]` is enough to do it, and it is reachable
-- by any authenticated customer: `join_product_waitlist` is granted to
-- `authenticated` and passes its array straight through to `join_waitlist` and
-- on into `record_required_consents`. `create_participation` is service-role
-- only, but it takes the same array from the same caller-supplied wire field, so
-- the hole is one gate wide and two doors deep.
--
-- The same construct sits in `set_product_required_consents`, where the damage
-- is loud rather than silent: a NULL element makes the wipe-and-replace DELETE
-- match nothing, so the statement pair degrades from "replace this set" to
-- "merge into it", and the INSERT that follows then dies on the NOT NULL. An
-- admin gets an error and no requirement is dropped by accident — but the
-- delete's predicate is wrong for exactly the same reason, so it is fixed in the
-- same change rather than left as a lucky escape.
--
-- WHAT THIS MIGRATION DOES — BELT AND BRACES, ON PURPOSE
--
-- Two independent fixes, because either alone would be enough and neither is
-- worth trusting alone on a gate that produces legal records:
--
--   1. **Both functions refuse an array containing a NULL element outright**,
--      with check_violation — the errcode 00210 uses for every one of its
--      refusals. A NULL slug is not a document anybody could have agreed to and
--      not a set an admin could have meant; there is no reading of it that a
--      caller wants silently repaired, so it is named and refused.
--   2. **The membership test is rewritten to a NULL-proof form.** `NOT EXISTS
--      (SELECT 1 FROM unnest(...) AS c WHERE c = r)` is two-valued: a NULL
--      element simply fails `c = r` and drops out of the EXISTS, so a required
--      document with nothing matching it stays missing. If a future edit ever
--      removes the guard above, the gate still holds.
--
-- Neither function's signature changes, so nothing upstream moves: no wire
-- schema, no service, no generated type. Both are DROPped and recreated rather
-- than CREATE OR REPLACEd for the reason 00210 states — a recreated function
-- comes back PUBLIC-executable (observed on staging during 00172) — so each
-- one's REVOKE/GRANT pair and COMMENT are restated below in full.

-- ---------------------------------------------------------------------------
-- 1. The one writer of an acceptance
-- ---------------------------------------------------------------------------
--
-- Still no EXECUTE grant for anybody: it is reached only from inside
-- create_participation and join_waitlist, which are SECURITY DEFINER and hold
-- the privilege as the owner. The REVOKE FROM PUBLIC below is what keeps that
-- true across the recreate.

DROP FUNCTION public.record_required_consents(uuid, uuid, uuid, text[]);

CREATE FUNCTION public.record_required_consents(
  p_product_id          uuid,
  p_customer_id         uuid,
  p_participant_id      uuid,
  p_consented_documents text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  -- FIRST, before anything reads the product: an array carrying a NULL element
  -- is refused outright. A NULL is not a slug, so it can never be an agreement
  -- to a document, and the only thing it has ever been good for is turning the
  -- membership test below into a three-valued expression that answers "nothing
  -- is missing" for a caller who agreed to nothing. `unnest(NULL::text[])`
  -- yields no rows, so an omitted array (the ordinary shape on a product that
  -- requires nothing) passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consented_documents) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the consented-document list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  -- The overwhelmingly common case: a product with no required consents. It is
  -- not an error to send slugs anyway — an extra slug is a client that has not
  -- refreshed, not an attack — so nothing is written and nothing is refused.
  IF v_required IS NULL THEN
    RETURN;
  END IF;

  -- COALESCE rather than a NULL check: a caller who sent nothing and a caller
  -- who sent an empty array are making the same claim, and both must be refused
  -- with the same message naming what is missing.
  --
  -- NOT EXISTS rather than 00210's `NOT (r = ANY (...))`: the ANY form is
  -- three-valued and a NULL element makes it answer NULL instead of false for
  -- every required document, which drops every row from this ARRAY() and
  -- reports that nothing is missing. This form is two-valued — a NULL element
  -- fails `c = r` and contributes nothing — so a required document with no
  -- match stays missing whatever else is in the array. The guard at the top of
  -- this function already refuses that input; this is the second lock on the
  -- same door, and it is deliberate.
  v_missing := ARRAY(
    SELECT r
      FROM unnest(v_required) AS r
     WHERE NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_consented_documents, ARRAY[]::text[])) AS c
        WHERE c = r
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'this product requires consent to % before enrolling',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One row per REQUIRED document — never one per slug the caller sent, so a
  -- client that ticks a document the product does not require records nothing
  -- extra. The version is resolved here and never taken from the caller: the
  -- greatest created_at for that slug, with `version DESC` as a tiebreaker so
  -- two revisions published in one transaction pick deterministically rather
  -- than arbitrarily (an arbitrary answer to "what is current" is worse than a
  -- wrong one, because it changes between reads).
  --
  -- A required slug with NO published version yields NULL here and the NOT NULL
  -- on document_version aborts the enrolment. That is the intended handling: it
  -- is a data error only a migration could create, and enrolling somebody
  -- against a document that has never been published is not a lesser outcome
  -- than failing loudly.
  INSERT INTO public.consent_acceptances (
    customer_id, participant_id, product_id, document_slug, document_version
  )
  SELECT p_customer_id,
         p_participant_id,
         p_product_id,
         r,
         (SELECT cdv.version
            FROM public.consent_document_versions cdv
           WHERE cdv.document_slug = r
           ORDER BY cdv.created_at DESC, cdv.version DESC
           LIMIT 1)
    FROM unnest(v_required) AS r;
END;
$$;

COMMENT ON FUNCTION public.record_required_consents(uuid, uuid, uuid, text[]) IS
  'The enrolment-consent gate, and the only writer of consent_acceptances. '
  'Loads the product''s required document slugs, refuses the enrolment with '
  'check_violation unless the caller''s array covers ALL of them (naming the '
  'missing ones), and then writes one acceptance row per REQUIRED slug at that '
  'slug''s CURRENT version — the row with the greatest created_at, resolved '
  'server-side and never supplied by a caller. A product requiring nothing is a '
  'no-op, including when slugs are sent anyway. Called from create_participation '
  'and join_waitlist and from nowhere else, so the shop path and the queue path '
  'cannot drift apart; carries no EXECUTE grant for any role, because both '
  'callers are SECURITY DEFINER and already hold the privilege as the owner. '
  'Since 00211 an array containing a NULL element is refused before anything '
  'else happens, and the missing-set test is a two-valued NOT EXISTS rather '
  'than 00210''s `NOT (r = ANY (...))`: the ANY form answered SQL NULL — which '
  'NOT turns into NULL, not true — whenever the array held a NULL and nothing '
  'matched, so ARRAY[NULL] passed the gate for every required document and '
  'recorded acceptances nobody had given. These consents are NON-REVOCABLE '
  'enrolment conditions — see the consent_acceptances table comment.';

REVOKE EXECUTE ON FUNCTION
  public.record_required_consents(uuid, uuid, uuid, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. The one writer of a product's requirement set
-- ---------------------------------------------------------------------------
--
-- assert_admin() stays the FIRST statement: this function is exposed to
-- `authenticated` and the DB suite's authorization spine requires a guard-first
-- body. The NULL-element check is the second statement, which is where a
-- validation belongs anyway — after the caller has been established as somebody
-- allowed to be told what is wrong with their input.

DROP FUNCTION public.set_product_required_consents(uuid, text[]);

CREATE FUNCTION public.set_product_required_consents(
  p_product_id uuid,
  p_slugs      text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused rather than repaired. Without this the DELETE
  -- below matches nothing — `document_slug = ANY (array containing NULL)` is
  -- NULL for every row that does not match, and `NOT NULL` is NULL — so a
  -- wipe-and-replace silently degrades into a merge, and the INSERT then dies
  -- on the NOT NULL with an error that says nothing about which argument was
  -- wrong. NULL as the whole array still means "requires nothing"; it is only a
  -- NULL *element* that is meaningless.
  IF EXISTS (SELECT 1 FROM unnest(p_slugs) AS s WHERE s IS NULL) THEN
    RAISE EXCEPTION
      'the required-consent slug list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOT EXISTS rather than `NOT (document_slug = ANY (...))`, for the same
  -- reason record_required_consents uses it: two-valued, so the set really is
  -- replaced whatever the array holds. The guard above already refuses the one
  -- input that made the difference; this is the second lock.
  DELETE FROM public.product_required_consents
   WHERE product_id = p_product_id
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_slugs, ARRAY[]::text[])) AS s
        WHERE s = document_slug
     );

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair above and below is a *set* replacement, and leaving an unchanged row
  -- in place keeps the delete from churning rows an admin did not touch. A slug
  -- the whitelist has never heard of is refused by the foreign key, which is
  -- the only validation this needs — admins are trusted, and a bad slug is a
  -- broken deploy rather than an attack.
  IF p_slugs IS NOT NULL AND array_length(p_slugs, 1) > 0 THEN
    INSERT INTO public.product_required_consents (product_id, document_slug)
    SELECT p_product_id, s
      FROM unnest(p_slugs) AS s
    ON CONFLICT (product_id, document_slug) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_product_required_consents(uuid, text[]) IS
  'Replace the set of consent documents a product requires, admin-only and '
  'guard-first on assert_admin. The only writer of product_required_consents: '
  'that table carries no write grant for any Data API role, and this function '
  'is what create_product and update_product both call so the join table has '
  'exactly one door. NULL and an empty array both mean "requires nothing", '
  'which is how a requirement is cleared. An unknown slug is refused by the '
  'foreign key into consent_documents — the only validation needed, since '
  'admins are trusted and a bad slug is a broken deploy rather than an attack. '
  'Since 00211 a NULL *element* is refused with check_violation, and the '
  'replacing DELETE uses a two-valued NOT EXISTS rather than 00210''s '
  '`NOT (document_slug = ANY (...))`, which matched no row at all once the '
  'array held a NULL and quietly turned the replacement into a merge.';

REVOKE EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  FROM PUBLIC;
-- `authenticated` because create_product is SECURITY INVOKER and reaches this
-- as the admin's own session role; `service_role` for the admin client and the
-- DB suite.
GRANT EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_required_consents(uuid, text[])
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions
-- ---------------------------------------------------------------------------
--
-- Same apply-time protection 00210 carries: a silent no-op (a claimed version
-- number, a grant that did not take, a body that came back without its guard)
-- fails here rather than the next time somebody enrols.

DO $assert$
DECLARE
  v_src text;
BEGIN
  -- --- (a) Both functions exist, exactly once, at their unchanged signature. -
  IF to_regprocedure('public.record_required_consents(uuid, uuid, uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'record_required_consents was not recreated';
  END IF;

  IF to_regprocedure('public.set_product_required_consents(uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'set_product_required_consents was not recreated';
  END IF;

  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'record_required_consents') <> 1
     OR (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'set_product_required_consents') <> 1
  THEN
    RAISE EXCEPTION 'a consent writer is overloaded — the old signature was not dropped';
  END IF;

  -- --- (b) The hole is closed in both bodies. -------------------------------
  --
  -- Asserted as the ABSENCE of the exact construct as well as the presence of
  -- its replacement: a body that grew the guard but kept the old test would
  -- pass a presence-only check while still carrying the bug for anything that
  -- reaches the test with the guard bypassed. The needle is the whole buggy
  -- expression rather than the bare operator, because `prosrc` includes the
  -- body's COMMENTS — and these bodies explain the operator they no longer use,
  -- so a needle of just the operator matches the explanation and fails.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_required_consents';

  IF position('c IS NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'record_required_consents does not refuse a NULL array element';
  END IF;

  IF position('ANY (COALESCE(p_consented_documents' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'record_required_consents still tests membership with the three-valued ANY form';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'set_product_required_consents';

  IF position('s IS NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_product_required_consents does not refuse a NULL array element';
  END IF;

  IF position('ANY (COALESCE(p_slugs' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'set_product_required_consents still deletes with the three-valued ANY form';
  END IF;

  -- The guard has to stay the FIRST statement: this function is exposed to
  -- `authenticated`, and the spine's role-gated classification is what its
  -- grant rests on.
  IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_product_required_consents does not guard on assert_admin';
  END IF;

  -- --- (c) The ACLs the recreate rebuilt from scratch. ----------------------
  IF has_function_privilege('authenticated', 'public.record_required_consents(uuid, uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_required_consents(uuid, uuid, uuid, text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'record_required_consents came back reachable through the Data API — only the enrolment RPCs may call it';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_product_required_consents(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_product_required_consents lost its authenticated grant — create_product is SECURITY INVOKER and reaches it as the caller';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.set_product_required_consents(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_product_required_consents lost its service_role grant';
  END IF;

  IF has_function_privilege('anon', 'public.set_product_required_consents(uuid, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE set_product_required_consents — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (d) The callers still reach them. ------------------------------------
  --
  -- A DROP of a function a plpgsql body names is not refused (the call is
  -- resolved at run time), so "the caller still calls it" is worth asserting
  -- after a drop-and-recreate rather than assumed.
  FOR v_src IN
    SELECT p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_participation', 'join_waitlist')
  LOOP
    IF position('public.record_required_consents' IN v_src) = 0 THEN
      RAISE EXCEPTION 'an enrolment door stopped calling record_required_consents';
    END IF;
  END LOOP;

  FOR v_src IN
    SELECT p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_product', 'update_product')
  LOOP
    IF position('public.set_product_required_consents' IN v_src) = 0 THEN
      RAISE EXCEPTION 'a product writer stopped writing the requirement set';
    END IF;
  END LOOP;
END
$assert$;
