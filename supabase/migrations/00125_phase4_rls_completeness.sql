-- Phase 4 of the DB authorization refactor (docs/db-authorization-architecture.md
-- §5 Phase 4): RLS completeness.
--
-- WHAT THIS CHANGES
--
-- 1. can_read_product() becomes a TOTAL boolean. Its first disjunct compares the
--    caller's role to 'admin', which is NULL for a caller with no profiles row,
--    and `NULL OR false` is NULL under three-valued logic — so a roleless caller
--    got SQL NULL rather than false. Harmless where it is used (a USING clause
--    treats NULL as deny) but a predicate that can answer NULL is a trap for the
--    next consumer. COALESCE(…, false) closes it. Behaviour under RLS is
--    unchanged; the function is also moved to the canonical empty search_path.
--
-- 2. The two §3.2 participation predicates gain their `authenticated` EXECUTE
--    grant, because three policies now compose from them (item 3). They were
--    service_role-only while nothing consumed them.
--
-- 3. Three SELECT policies stop inlining the "caller has an active participation
--    on this product / in this group" subquery and call the audited predicate
--    instead. See the equivalence note below.
--
-- 4. Every policy that compared the caller's role to 'admin' inline — either as
--    `(SELECT get_user_role()) = 'admin'` or as a hand-rolled EXISTS over
--    profiles — now calls the named admin predicate, InitPlan-wrapped as
--    `(SELECT public.is_admin())`. The four policies that already called
--    is_admin() bare are wrapped too, so the admin half of every policy in the
--    database is one shape.
--
-- EQUIVALENCE (item 3) — why this is safe to apply ahead of any code deploy
--
-- The inlined subqueries key on ONE participation column each (customer_id for
-- the two customer policies, gamer_id for the gamer one) under a role gate. The
-- predicates key on EITHER column ("is the caller a party to this
-- participation"). So the rewrite can only ever ADMIT a row the old form
-- refused, never refuse one it admitted — no existing read can break, which is
-- what makes it safe to push to a shared database whose deployed code has not
-- changed yet.
--
-- The one row it could additionally admit is a caller holding role 'customer'
-- who is the gamer_id of an active participation (or role 'gamer' who is the
-- customer_id). Verified as non-existent on the shared database at write time:
-- zero rows in either direction, every gamer_id resolving to a 'gamer' profile
-- and every customer_id to a 'customer' one. It is also unreachable through the
-- application's own creation paths — participation parties are resolved from
-- parent/gamer links, gamer profiles are created with the gamer role by the
-- atomic creation RPC (which refuses to promote an existing account), and the
-- role column carries no write grant for `authenticated` at all. And were such a
-- row ever created, the effect would be to show a party to a participation the
-- group/assignment row they are themselves party to — the policies' own intent,
-- not a widening of it.
--
-- The `group_id IS NOT NULL` clause in the two group policies is dropped as
-- redundant: the predicate compares group_id to product_groups.id, which is a
-- NOT NULL primary key, so a NULL group_id can never match.
--
-- ALTER POLICY (rather than DROP + CREATE) is used throughout so no statement
-- ever observes the table without its policy.

-- ---------------------------------------------------------------------------
-- 1. can_read_product — total boolean, canonical search_path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_product(p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    -- admin sees everything (mirrors admin_full_access_* FOR ALL)
    (SELECT public.get_user_role()) = 'admin'::public.user_role
    -- public: published and visible
    OR EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = p_product_id
        AND pr.status IN ('pending'::public.product_status, 'running'::public.product_status)
        AND pr.is_visible = true
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

REVOKE ALL ON FUNCTION public.can_read_product(p_product_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_product(p_product_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_product(p_product_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_product(p_product_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The §3.2 participation predicates become policy-callable
-- ---------------------------------------------------------------------------
-- A policy expression is evaluated as the querying role, so a predicate a
-- policy composes from must be executable by that role.

GRANT EXECUTE ON FUNCTION public.has_active_participation_on_product(p_product_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_participation_in_group(p_group_id uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The three policies that inlined the party-to subquery
-- ---------------------------------------------------------------------------

ALTER POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments
  USING (
    (SELECT public.get_user_role()) = 'customer'::public.user_role
    AND (SELECT public.has_active_participation_on_product(product_id))
  );

ALTER POLICY customers_read_groups_via_gamers ON public.product_groups
  USING (
    (SELECT public.get_user_role()) = 'customer'::public.user_role
    AND (SELECT public.has_active_participation_in_group(id))
  );

ALTER POLICY gamers_read_own_group ON public.product_groups
  USING (
    (SELECT public.get_user_role()) = 'gamer'::public.user_role
    AND (SELECT public.has_active_participation_in_group(id))
  );

-- ---------------------------------------------------------------------------
-- 4. Every inline admin comparison becomes (SELECT public.is_admin())
-- ---------------------------------------------------------------------------
-- `(SELECT get_user_role()) = 'admin'` and `is_admin()` are the same expression
-- — is_admin()'s entire body is that comparison — so each of these is a
-- rename, not a semantic change, including the NULL answer for a caller with no
-- profiles row (which a USING/WITH CHECK clause treats as deny either way).
--
-- The subquery wrapper is what makes it an InitPlan: one evaluation per
-- statement instead of one per row. Three of the policies below carried a bare
-- call and were paying per row; the four that already called is_admin() bare
-- were too.

-- 4a. FOR ALL policies — USING and WITH CHECK.

ALTER POLICY admin_full_access_calendar_holidays ON public.calendar_holidays
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_family_subscriptions ON public.family_subscriptions
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_feedback ON public.feedback_submissions
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_gedu_assignments ON public.gedu_group_assignments
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_gedu_profiles ON public.gedu_profiles
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_holiday_calendars ON public.holiday_calendars
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_minecraft_accounts ON public.minecraft_accounts
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_parent_gamer ON public.parent_gamer
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_participations ON public.participations
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_payments ON public.payments
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_product_groups ON public.product_groups
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_product_holiday_calendars ON public.product_holiday_calendars
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_product_prices ON public.product_prices
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_product_subscription_prices ON public.product_subscription_prices
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_product_translations ON public.product_translations
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_products ON public.products
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_profiles ON public.profiles
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_refunds ON public.refunds
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_schedule_slots ON public.schedule_slots
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_site_details ON public.site_details
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_full_access_site_staff_details ON public.site_staff_details
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_manage_gedu_locations ON public.gedu_locations
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_manage_locations ON public.locations
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY admin_manage_spoken_languages ON public.spoken_languages
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- 4b. FOR ALL policies carrying only USING. A FOR ALL policy with no WITH CHECK
--     reuses its USING clause for writes, so leaving WITH CHECK unset preserves
--     the existing shape exactly.
--
--     These two are create-or-alter rather than a plain ALTER, because they are
--     the one place where the hosted databases and migration history disagree:
--     both policies exist on the hosted databases but were never written into a
--     migration, so a database built from migrations alone has no admin policy
--     on either table. That drift meant CI was verifying a *different* RLS
--     surface from the one that runs in production on exactly the two tables
--     holding the parent PIN hash and a child's date of birth. Creating them
--     when absent repairs it; the hosted databases take the ALTER branch and
--     are unaffected.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'customer_profiles'
       AND policyname = 'Admins can do everything on customer_profiles'
  ) THEN
    ALTER POLICY "Admins can do everything on customer_profiles" ON public.customer_profiles
      USING ((SELECT public.is_admin()));
  ELSE
    CREATE POLICY "Admins can do everything on customer_profiles" ON public.customer_profiles
      TO authenticated USING ((SELECT public.is_admin()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'gamer_profiles'
       AND policyname = 'Admins can do everything on gamer_profiles'
  ) THEN
    ALTER POLICY "Admins can do everything on gamer_profiles" ON public.gamer_profiles
      USING ((SELECT public.is_admin()));
  ELSE
    CREATE POLICY "Admins can do everything on gamer_profiles" ON public.gamer_profiles
      TO authenticated USING ((SELECT public.is_admin()));
  END IF;
END;
$$;

-- 4c. The WhatsApp policies, which hand-rolled the EXISTS over profiles rather
--     than calling the role accessor at all — the last copies of that idiom.

ALTER POLICY "Admins can read whatsapp_contacts" ON public.whatsapp_contacts
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins can update whatsapp_contacts" ON public.whatsapp_contacts
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins can insert whatsapp_contacts" ON public.whatsapp_contacts
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "Admins can read whatsapp_messages" ON public.whatsapp_messages
  USING ((SELECT public.is_admin()));

-- The direction pin stays: an admin may write outbound messages only, so an
-- inbound row can never be forged through the API.
ALTER POLICY "Admins can insert whatsapp_messages" ON public.whatsapp_messages
  WITH CHECK ((SELECT public.is_admin()) AND direction = 'outbound');
