-- Revoke all anon write privileges; parameterize the grant-audit function.
--
-- anon held INSERT/UPDATE/DELETE (plus TRUNCATE/REFERENCES/TRIGGER/MAINTAIN in
-- places) on 27 tables -- including payments, refunds, participations, and
-- family_subscriptions -- identically on prod and staging. Leftovers from the
-- original auto-expose defaults: the 2026-03 audit's grant lockdown revoked
-- writes from authenticated only, so anon ended up *more* privileged at the
-- grant layer than authenticated on the money tables. Nothing was exploitable
-- (every anon-applicable RLS policy is SELECT-only, and default-deny blocks
-- all anon writes), but that left a single layer where the architecture
-- demands two: one future policy written without a TO clause (defaults to
-- PUBLIC, which includes anon) would have armed these grants into an
-- unauthenticated write path. Revoking is provably behavior-preserving --
-- RLS already denies every anon write, so no working code path can use them.
-- anon's SELECT grants are untouched (the public catalog policies need them).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.calendar_holidays FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.customer_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.family_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.feedback_submissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.gamer_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.gedu_group_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.gedu_locations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.holiday_calendars FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.locations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.minecraft_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.parent_gamer FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.participations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.product_groups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.product_holiday_calendars FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.product_prices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.product_subscription_prices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.product_translations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.refunds FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.schedule_slots FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.site_details FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.site_staff_details FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.spoken_languages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.whatsapp_contacts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.whatsapp_messages FROM anon;

-- The access-control DB test now audits anon table grants the same way it
-- audits authenticated, so the grantee becomes a parameter. Body copied from
-- supabase/schema.sql (the zero-arg original hardcoded 'authenticated').
DROP FUNCTION public._list_table_grants();

CREATE FUNCTION public._list_table_grants(p_grantee text) RETURNS TABLE(table_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT table_name::text, privilege_type::text
  FROM information_schema.table_privileges
  WHERE grantee = p_grantee
    AND table_schema = 'public'
  ORDER BY table_name, privilege_type;
$$;

-- Test-harness helper, callable by the service-role test client only. The
-- explicit service_role grant is required under the no-default-grants regime.
REVOKE EXECUTE ON FUNCTION public._list_table_grants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._list_table_grants(text) TO service_role;
