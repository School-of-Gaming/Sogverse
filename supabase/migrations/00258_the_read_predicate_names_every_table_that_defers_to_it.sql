-- The read predicate names every table that defers to it, and a check keeps
-- that true.
--
-- 00257's COMMENT on can_read_product inherited a list from 00256 and the list
-- was one table short: it named the products policy plus five satellites
-- (translations, prices, schedule slots, marketing consents, required
-- consents), while SEVEN policies call the predicate — the sixth satellite is
-- product_gamer_photo_consents, whose SELECT policy defers to it exactly as the
-- others do. Nothing behaved wrongly; the predicate's own documentation
-- undercounted the surface it governs, which is the kind of error that gets
-- more expensive the longer it sits in a security comment.
--
-- 00257 is applied to staging, so this ships as a new file rather than an edit.
--
-- WHY A CHECK RATHER THAN A CORRECTED SENTENCE
--
-- A corrected sentence is correct until the next satellite table arrives, and
-- the way this one went wrong is precisely that a table was added and the
-- comment was not. So the comment is corrected AND pinned: the block below
-- reads the policy catalog for every policy whose expression names the
-- predicate, requires that set to be exactly the seven known ones, and requires
-- the function's comment to name each of the six satellites. Adding a seventh
-- satellite now fails this check on CI's from-scratch build until the new
-- migration restates both — which is the one moment somebody is looking at the
-- right thing anyway.

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS 'Read predicate behind the products SELECT policy and the six satellite tables that defer to it: translations, prices, schedule slots, marketing consents, gamer photo consents, required consents. True for ANY product that exists; false only for an id no product has. Every product is readable by direct link forever, by owner decision (2026-09-15): a parent following a link to a term that ended should land on the product''s page and read that it is over, with the product''s own picture in the link preview, rather than meet a not-found page and the site''s default card — and the crawler that renders that preview holds no session either. is_visible governs LISTING alone — the browse queries apply it, alongside their own date filters — so a finished or unlisted product is absent from the shop and present at its URL. Whether a place can be BOUGHT is decided somewhere else entirely: the term dates, the seat cap and the registration window. The former arms — an admin, a party to an active or waitlisted participation, an assigned gedu, and the term test that used to bound the public one — are removed rather than left dormant: with the public answer true for every product none of them could decide anything, and a security predicate whose branches cannot decide is one the next reader has to reason about for nothing. It remains a function rather than a USING (true) written into each policy, so those seven policies keep ONE predicate to tighten if the decision is ever revisited, and it remains SECURITY DEFINER because it runs inside the products SELECT policy and must not depend on the caller''s own RLS. Wrapped in COALESCE so it answers a total boolean whatever a future arm returns.';

DO $$
DECLARE
  -- Sorted under the C collation on purpose: the database's own collation sorts
  -- `products` before `product_translations` (punctuation carries no primary
  -- weight there), and an assertion that depends on a locale setting is an
  -- assertion that fails somewhere else.
  v_deferring text[];
  v_expected  constant text[] := ARRAY[
    'product_gamer_photo_consents',
    'product_marketing_consents',
    'product_prices',
    'product_required_consents',
    'product_translations',
    'products',
    'schedule_slots'
  ];
  v_comment text;
  v_named   text;
BEGIN
  SELECT array_agg(t ORDER BY t COLLATE "C")
    INTO v_deferring
    FROM (
      SELECT DISTINCT p.tablename::text AS t
        FROM pg_policies p
       WHERE p.schemaname = 'public'
         AND (coalesce(p.qual, '') LIKE '%can_read_product%'
              OR coalesce(p.with_check, '') LIKE '%can_read_product%')
    ) s;

  IF v_deferring IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'the tables deferring to can_read_product are % rather than % — restate the function comment and this check together',
      COALESCE(v_deferring::text, 'none'), v_expected::text;
  END IF;

  SELECT obj_description(p.oid, 'pg_proc')
    INTO v_comment
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'can_read_product';

  IF v_comment IS NULL THEN
    RAISE EXCEPTION 'can_read_product carries no comment';
  END IF;

  -- The satellites as a reader meets them, in the comment's own words rather
  -- than in table names — the comment is prose for a person, and a check that
  -- demanded identifiers would only push the prose out of it.
  FOREACH v_named IN ARRAY ARRAY['translations', 'prices', 'schedule slots',
                                 'marketing consents', 'gamer photo consents',
                                 'required consents'] LOOP
    IF position(v_named IN v_comment) = 0 THEN
      RAISE EXCEPTION
        'can_read_product''s comment does not name the % it governs', v_named;
    END IF;
  END LOOP;
END $$;
