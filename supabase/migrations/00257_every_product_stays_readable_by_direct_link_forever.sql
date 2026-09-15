-- Every product stays readable by direct link, forever.
--
-- 00256 recreated can_read_product with a public arm bounded by the term —
-- `end_date IS NULL OR end_date >= today-in-the-product's-zone`. That was a
-- faithful translation of the stored-status test it replaced, and it was meant
-- to tighten nothing; it did tighten something, and this migration retires it.
-- It does so WITHOUT editing 00256, which is applied to staging: a pushed
-- migration is never amended, so every change ships as a new numbered file.
--
-- WHAT THE BOUNDED ARM COST
--
-- A product whose end date had passed became unreadable by anyone holding no
-- seat on it. A parent following a link from last spring's confirmation mail
-- met a not-found page, and the link's preview card fell back to the site
-- default, because the crawler fetching it has no session either.
--
-- THE RULE, FROM HERE
--
-- can_read_product answers true for any product that exists. Owner decision,
-- 2026-09-15: every product stays readable by direct link forever, on purpose.
-- A parent following an old link should land on the product's page and see that
-- it has ended, with the product's own picture in the preview. It extends the
-- August 2026 decision that an unlisted product is readable by direct link, to
-- the one axis that was still closing.
--
-- WHAT STILL DECIDES THE OTHER TWO QUESTIONS
--
-- Being LISTED is `is_visible` plus the browse queries' own date filters — a
-- finished product is absent from the shop and from the schools pages exactly
-- as it was, because none of that is a read rule. Being BUYABLE is the
-- registration state: the term dates, the seat cap and the registration window,
-- decided by the signup gate and by the client CTA. Readability was never the
-- lever for either, and it stops pretending to be one here.
--
-- WHY THE OTHER ARMS GO RATHER THAN STAY
--
-- With the public arm true for every product, the admin arm, the participation
-- arm and the assigned-gedu arm can no longer decide anything: each is reached
-- only when the disjunct before it was false, and none is. A security predicate
-- carrying branches that cannot decide is worse than one without them — the
-- next reader has to work out which arm granted a read, and the answer is
-- always "the first". So the body becomes the existence test and nothing else,
-- and the arms are deleted rather than left standing as decoration.
--
-- WHY IT STAYS A FUNCTION RATHER THAN BECOMING `USING (true)`
--
-- Six policies call it — products and the five satellite tables — and inlining
-- `true` in each would scatter the rule across six places to tighten if the
-- decision is ever revisited. One predicate is one edit. It stays SECURITY
-- DEFINER for the reason it always was: it runs inside the products SELECT
-- policy, so it must not depend on the caller's own RLS.
--
-- WHAT 00256's OWN ASSERTION BLOCK DID AND DID NOT CHECK
--
-- 00256's header says its last two checks "read every function source in the
-- schema and refuse a leftover reference". They do read every function source,
-- but what they refuse is narrower than that sentence: one refuses a body
-- naming the dropped TYPE `product_status`, the other a body naming a
-- `p_status` argument its own signature does not carry. Neither would have
-- caught a body still selecting the dropped `products.status` COLUMN. A
-- reviewer read the schema afterwards and found no such body, so nothing was
-- in fact left behind — but the claim was wider than the checks, and saying so
-- here is cheaper than trusting it twice.
--
-- The same review found two assertion gaps, and this file closes both: 00256
-- recreated get_admin_municipality_invoicing with CREATE OR REPLACE without
-- re-deriving the invariants 00253's DO block pinned, and its create_product
-- grant check asserted `authenticated` present and `anon` absent without
-- asserting `service_role` present.

-- ---------------------------------------------------------------------------
-- 1. The read predicate asks one question: does this product exist?
-- ---------------------------------------------------------------------------
-- No policy changes with it. Every policy that gated on a product's
-- readability already calls this function and keeps calling it, which is the
-- whole reason the widening is a single function body.

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- EXISTS is already total — it answers true or false and never NULL — so the
  -- COALESCE is belt and braces: it is what keeps the predicate a total boolean
  -- if an arm that can answer NULL is ever added back. The arm that made it
  -- load-bearing (comparing a caller's role, which is NULL for anon) is gone.
  SELECT COALESCE(
    EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = p_product_id),
    false
  );
$$;

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the satellite tables that follow it (translations, prices, schedule slots, marketing consents, required consents). True for ANY product that exists; false only for an id no product has. Every product is readable by direct link forever, by owner decision (2026-09-15): a parent following a link to a term that ended should land on the product''s page and read that it is over, with the product''s own picture in the link preview, rather than meet a not-found page and the site''s default card — and the crawler that renders that preview holds no session either. is_visible governs LISTING alone — the browse queries apply it, alongside their own date filters — so a finished or unlisted product is absent from the shop and present at its URL. Whether a place can be BOUGHT is decided somewhere else entirely: the term dates, the seat cap and the registration window. The former arms — an admin, a party to an active or waitlisted participation, an assigned gedu, and the term test that used to bound the public one — are removed rather than left dormant: with the public answer true for every product none of them could decide anything, and a security predicate whose branches cannot decide is one the next reader has to reason about for nothing. It remains a function rather than a USING (true) written into each policy so those six policies keep ONE predicate to tighten if the decision is ever revisited, and it remains SECURITY DEFINER because it runs inside the products SELECT policy and must not depend on the caller''s own RLS. Wrapped in COALESCE so it answers a total boolean whatever a future arm returns.';

-- A recreated function comes back PUBLIC-executable, so the revoke is paired
-- with the grants it had before this file: anon (the shop is read without an
-- account), authenticated, service_role.
REVOKE EXECUTE ON FUNCTION public.can_read_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Assert the end state.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_src       text;
  v_lang      text;
  v_prov      "char";
  v_strict    boolean;
  v_secdef    boolean;
  v_grantees  text;
  v_token     text;
BEGIN
  -- --- (a) can_read_product is the existence test and nothing else. --------
  SELECT pr.prosrc,
         (SELECT l.lanname FROM pg_language l WHERE l.oid = pr.prolang),
         pr.provolatile,
         pr.proisstrict,
         pr.prosecdef
    INTO v_src, v_lang, v_prov, v_strict, v_secdef
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'can_read_product';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'can_read_product is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'can_read_product') <> 1 THEN
    RAISE EXCEPTION 'can_read_product is overloaded — a policy call would be ambiguous';
  END IF;

  -- Non-vacuity first: a body that no longer reads `products` at all would
  -- satisfy every absence check below while answering nothing.
  IF position('public.products' IN v_src) = 0 THEN
    RAISE EXCEPTION 'can_read_product no longer reads public.products';
  END IF;

  -- The four references the widening removes. Each names a decision this
  -- predicate must not make any more: the term bound (end_date), the seat
  -- carve-outs (participations), the staffing one (gedu_group_assignments) and
  -- the admin one (get_user_role).
  FOREACH v_token IN ARRAY ARRAY['end_date', 'participations',
                                 'gedu_group_assignments', 'get_user_role'] LOOP
    IF position(v_token IN v_src) <> 0 THEN
      RAISE EXCEPTION
        'can_read_product still names % — every product is readable by direct link, so no arm but existence may decide',
        v_token;
    END IF;
  END LOOP;

  -- It answers a total boolean, and answers it for a caller with no profiles
  -- row: false for an id no product has, rather than NULL.
  IF public.can_read_product('00000000-0000-0000-0000-000000000000'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'can_read_product does not answer a plain false for an id no product has';
  END IF;

  IF v_lang <> 'sql' THEN
    RAISE EXCEPTION 'can_read_product is LANGUAGE % rather than sql', v_lang;
  END IF;

  IF v_prov <> 's' THEN
    RAISE EXCEPTION 'can_read_product is not STABLE';
  END IF;

  IF v_strict THEN
    RAISE EXCEPTION 'can_read_product is STRICT — it would skip its body and answer NULL on a NULL id';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'can_read_product is not SECURITY DEFINER — it runs inside the products policy and must not depend on the caller''s RLS';
  END IF;

  -- Exactly three grantees besides the owner, and PUBLIC is not one of them.
  SELECT coalesce(string_agg(DISTINCT g.rolname, ', ' ORDER BY g.rolname), '(none)')
    INTO v_grantees
    FROM pg_proc pr
    JOIN pg_namespace n ON n.oid = pr.pronamespace
    CROSS JOIN LATERAL aclexplode(pr.proacl) acl
    JOIN pg_roles g ON g.oid = acl.grantee
   WHERE n.nspname = 'public'
     AND pr.proname = 'can_read_product'
     AND acl.privilege_type = 'EXECUTE'
     AND acl.grantee <> pr.proowner;

  IF v_grantees <> 'anon, authenticated, service_role' THEN
    RAISE EXCEPTION 'can_read_product is executable by % rather than anon, authenticated, service_role', v_grantees;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
      CROSS JOIN LATERAL aclexplode(pr.proacl) acl
     WHERE n.nspname = 'public' AND pr.proname = 'can_read_product'
       AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'can_read_product is executable by PUBLIC';
  END IF;

  -- --- (b) create_product kept the third of its three grants. --------------
  -- 00256's block checked `authenticated` present and `anon` absent and stopped
  -- there, so the admin routes' service-role client was covered by nothing.
  IF NOT has_function_privilege('service_role', (
        SELECT pr.oid FROM pg_proc pr
          JOIN pg_namespace n ON n.oid = pr.pronamespace
         WHERE n.nspname = 'public' AND pr.proname = 'create_product'), 'EXECUTE') THEN
    RAISE EXCEPTION 'create_product lost its service_role grant';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. 00253's invariants, re-derived against the function 00256 left behind.
-- ---------------------------------------------------------------------------
-- 00253 pinned get_admin_municipality_invoicing's end state in a DO block, and
-- said in so many words that a replacement has to restate those invariants or
-- the superseded migration's block is the last place they were ever checked.
-- 00256 replaced the function with CREATE OR REPLACE and did not. This block is
-- that restatement, derived from the body as 00256 left it rather than copied
-- from 00253 — and one of 00253's checks is REPLACED rather than carried.
--
-- The replaced one is 00253's `status IN ('running', 'completed')`, which was
-- half of the candidate filter's second arm. 00256 deliberately removed it:
-- that clause is the defect 00256 exists to fix, since no club ever held a
-- stored status other than 'pending', so the arm admitted nobody and a club
-- with no recorded session never reached the invoice. Its ABSENCE is asserted
-- here, and so is the presence of the term-overlap test that is now the whole
-- of that arm. The stored column is gone from the schema entirely, so the
-- absence check is widened to the word `status` anywhere in the body, which
-- covers the dropped emitted key too.

DO $$
DECLARE
  v_sig constant text := 'public.get_admin_municipality_invoicing(date)';
  v_src text;
  v_prov "char";
  v_strict boolean;
  v_key text;
BEGIN
  SELECT pr.prosrc, pr.provolatile, pr.proisstrict
    INTO v_src, v_prov, v_strict
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public'
     AND pr.proname = 'get_admin_municipality_invoicing';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'get_admin_municipality_invoicing') <> 1 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is overloaded — a call would be ambiguous';
  END IF;

  -- --- (a) Guard-first, and reachable. ------------------------------------
  IF position('assert_admin' IN v_src) = 0
     OR position('assert_admin' IN v_src) > position('check_violation' IN v_src) THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing does not gate on assert_admin before anything else';
  END IF;

  IF v_strict THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is STRICT — its guard would be skipped on NULL input';
  END IF;

  IF v_prov <> 's' THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is not STABLE';
  END IF;

  -- --- (b) The month argument is validated, not assumed. -------------------
  IF position('date_trunc(''month''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a non-first-of-month argument';
  END IF;

  -- --- (c) The candidate set is both halves of the union. ------------------
  -- The first half is a recorded session in the month; the second is a term
  -- that overlaps it. The overlap test is spelled out clause by clause,
  -- because it is now the WHOLE of the second half and 00253's own check
  -- asserted a status clause instead of it.
  IF position('product_type = ''municipality_club''' IN v_src) = 0
     OR position('public.group_sessions' IN v_src) = 0
     OR position('p.start_date IS NOT NULL' IN v_src) = 0
     OR position('p.start_date <= v_month_end' IN v_src) = 0
     OR position('p.end_date IS NULL OR p.end_date >= p_month_start' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost half of the set of clubs a month contains';
  END IF;

  -- --- (c2) And it does NOT ask about a stored status. ---------------------
  -- The inversion of 00253's third clause. There is no products.status column
  -- to read and no emitted status key to render, so any occurrence of the word
  -- is a body that has regressed to the read this function was fixed to stop
  -- making.
  IF position('status' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing names a status — the candidate test is the term alone and the document carries none';
  END IF;

  -- --- (d) The municipality walk, and its refusal to filter retired rows. --
  IF position('w.type <> ''municipality''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost the ancestor-or-self municipality walk';
  END IF;

  IF position('retired_at' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing filters retired locations — the walk must pass through them';
  END IF;

  -- --- (e) A club with no municipality stops the read. ---------------------
  -- 00253's own reason for existing: the emitted document is swept for a null
  -- municipality, and a hit raises rather than shipping a club nobody can be
  -- billed for.
  IF position('jsonb_typeof(club.value -> ''municipality'') = ''null''' IN v_src) = 0
     OR position('ancestor-or-self of the location of municipality club' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing no longer refuses a club with no municipality';
  END IF;

  -- --- (f) Every key the client contract parses. ---------------------------
  -- Derived from the zod schema the db test parses live output through, as it
  -- stands after 00256 dropped `status` from the emitted club. Each is checked
  -- with its trailing comma so a key is not matched inside a longer one.
  FOREACH v_key IN ARRAY ARRAY['''month_start''', '''timezone'',', '''start_date'',',
                               '''end_date'',', '''municipality_fee_cents'',',
                               '''product_translations'',', '''schedule_slots'',',
                               '''location'',', '''municipality'',', '''sessions'',',
                               '''group_id'',', '''session_date'''] LOOP
    IF position(v_key IN v_src) = 0 THEN
      RAISE EXCEPTION
        'get_admin_municipality_invoicing no longer emits %, which the client parses', v_key;
    END IF;
  END LOOP;

  -- --- (g) Reachable by an admin's own session, and by nobody's anon one. --
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing lost a grant it needs';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_admin_municipality_invoicing is executable by anon';
  END IF;
END $$;
