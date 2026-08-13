-- 00168: `is_visible` stops meaning "parents cannot see or buy this" and starts
-- meaning "not publicly LISTED". The public branch of can_read_product drops
-- its `is_visible` test; the status gate stays exactly as it was.
--
-- WHY. There is a shape of product the platform could not express: one that is
-- real, purchasable and deliberately absent from the shop — an ad campaign's
-- landing product, a club offered to one school's families, an early-access
-- cohort handed round by link. The only switch we had for "keep this off the
-- browse grids" also revoked the read, so the link led to a not-found page and
-- the product could not be sold at all. Splitting the two questions is the
-- whole change: the browse queries keep filtering on `is_visible`, so unlisting
-- still removes a product from the shop and the schools page, and the seat cap,
-- the status gate and the registration window carry on deciding — as they
-- already did — whether anyone may actually take a seat.
--
-- WHAT IS ACCEPTED, DELIBERATELY. Three consequences follow, and all three are
-- the owner's decision rather than oversights to be engineered away:
--
--   1. An unlisted product is enumerable through the anon Data API. The read
--      policy is a predicate, not a search filter — anything readable can be
--      listed by someone querying the table directly. This is obscurity, not
--      secrecy, and it is the price of the direct link working at all.
--   2. A shared or leaked link can be picked up by a search engine. The only
--      mitigation is the noindex/nofollow the public detail page emits for an
--      unlisted product; nothing here can stop the URL from being crawled once
--      it is public.
--   3. There is no longer a truly-invisible state. A product still being
--      drafted is merely unlisted, so a link-holder can see and buy something
--      unfinished. `draft` never provided that guarantee either (00169 drops it
--      as dead code) — what used to provide it was this `is_visible` test, and
--      it is gone on purpose.
--
-- WHAT DOES NOT CHANGE. `create_participation` has never looked at
-- `is_visible`: it gates on effective status, the registration window, the
-- already-enrolled check and the seat cap. So purchase needs no database change
-- to follow this decision — it was never the thing visibility was blocking.
--
-- WHY `CREATE OR REPLACE`. The signature is unchanged, so the function keeps
-- its OID and the five SELECT policies that call it (products and its four
-- satellite tables) keep pointing at the same object. The grants are restated
-- anyway — the house rule is that a migration says out loud who may execute
-- what it wrote — and the DO block at the foot asserts the end state a REPLACE
-- cannot.

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid)
RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published. `is_visible` is NOT tested here, and its absence is
    -- the point: that column governs LISTING only — the browse queries filter
    -- on it — while a direct link to an unlisted product is meant to lead to a
    -- page a parent can read and buy from. The consequence is that an unlisted
    -- product is readable, and therefore enumerable, through the Data API:
    -- obscurity rather than secrecy, accepted by owner decision (Aug 2026).
    -- What keeps a product unbuyable is its status, its seat cap and its
    -- registration window — never its visibility.
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
    )
    -- enrolled gamer (child's own login) OR purchaser (parent), active/waitlisted
    OR EXISTS (
      SELECT 1 FROM public.participations p
      WHERE p.product_id = p_product_id
        AND (p.gamer_id = (SELECT auth.uid()) OR p.customer_id = (SELECT auth.uid()))
        AND p.status IN ('active'::public.participation_status, 'waitlisted'::public.participation_status)
    )
    -- assigned gedu
    OR EXISTS (
      SELECT 1 FROM public.gedu_group_assignments a
      WHERE a.product_id = p_product_id
        AND a.gedu_id = (SELECT auth.uid())
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_read_product(p_product_id uuid) IS
  'Read predicate behind the products SELECT policy and the four satellite '
  'tables that follow it (translations, prices, schedule slots, holiday '
  'calendar links). True for: an admin; anyone at all on a product whose '
  'status is pending or running; a parent or gamer party to an active or '
  'waitlisted participation on it; an assigned gedu. It does NOT test '
  'is_visible — since 00168 that column means "not publicly listed" and is '
  'applied by the browse queries, so an unlisted product stays readable (and '
  'enumerable) by direct link. Wrapped in COALESCE so it answers a total '
  'boolean rather than NULL for a caller with no profiles row.';

GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product(uuid) TO service_role;

DO $$
DECLARE
  v_src TEXT;
BEGIN
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.can_read_product(uuid)'::regprocedure);

  -- The visibility test is gone. The needle is the column name itself, which
  -- now appears nowhere in the body but the prose above — so the check spells
  -- the comparison instead, and would catch it being pasted back in any form
  -- the old body used.
  IF v_src LIKE '%is_visible = true%' THEN
    RAISE EXCEPTION 'can_read_product still tests is_visible on its public branch';
  END IF;

  -- The status gate is emphatically NOT part of what this migration relaxes.
  IF v_src NOT LIKE '%''pending''::public.product_status%'
     OR v_src NOT LIKE '%''running''::public.product_status%' THEN
    RAISE EXCEPTION 'can_read_product lost its published-status gate';
  END IF;

  -- The three private branches survived the paste.
  IF v_src NOT LIKE '%participations%'
     OR v_src NOT LIKE '%gedu_group_assignments%'
     OR v_src NOT LIKE '%get_user_role%' THEN
    RAISE EXCEPTION 'can_read_product lost one of its non-public branches';
  END IF;

  IF NOT pg_catalog.has_function_privilege('anon', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute can_read_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute can_read_product';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'public.can_read_product(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute can_read_product';
  END IF;
END;
$$;
