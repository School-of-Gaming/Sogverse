-- `user_search_index` keeps the property 00185 restored to it: every profile
-- column.
--
-- 00186 added `profiles.email_verified_at`, and this view's column list is
-- written out by hand, so it does not follow on its own. The consequence is the
-- same one 00185 was written to fix: the admin user search parses this view's
-- rows through a zod schema checked against `Profile` — the *table's* row type —
-- so a new profiles column makes that schema demand a rule, and the rule then
-- demands the column exist here. Without this the search cannot answer in
-- `Profile` at all.
--
-- This is the second time the pattern has fired in five migrations, which is the
-- system working: adding a column to `profiles` costs one line here, and the
-- compiler is what remembers to charge it.
--
-- NOTHING IS NEWLY EXPOSED
--
-- The view is SECURITY INVOKER and `profiles` carries a table-wide SELECT grant,
-- so every role that can read this view could already read this column with a
-- direct select. This widens one admin-only search's payload by a nullable
-- timestamp and changes no authorization anywhere. Reads were never the concern
-- with `email_verified_at`; writes were, and 00186's deliberate absence of any
-- UPDATE grant is untouched here.
--
-- NOT FOLDED INTO search_blob
--
-- The blob is the set of strings a person can be *found* by. A timestamp is not
-- one — nobody looks a family up by when they confirmed their address — and
-- folding it in would only put a second, differently-formatted copy of a date
-- into a needle-matched string.
--
-- DROP AND RECREATE RATHER THAN CREATE OR REPLACE, for 00185's reason:
-- `CREATE OR REPLACE VIEW` may only append columns, so it would strand the new
-- one after `search_blob` and leave the profile columns no longer contiguous.
-- The DROP takes the grants with it, so they are restated below.

DROP VIEW public.user_search_index;

CREATE VIEW public.user_search_index
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.email,
  p.email_verified_at,
  p.first_name,
  p.last_name,
  p.role,
  p.phone,
  p.currency,
  p.home_location_id,
  p.referral_code,
  p.locale,
  p.spoken_languages,
  p.created_at,
  p.updated_at,
  concat_ws(
    ' ',
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    mc.minecraft_username,
    rb.roblox_username
  ) AS search_blob
FROM public.profiles p
LEFT JOIN public.minecraft_accounts mc ON mc.user_id = p.id
LEFT JOIN public.roblox_accounts    rb ON rb.user_id = p.id;

COMMENT ON VIEW public.user_search_index IS
  'Profiles as the admin user search matches them: every profile column, plus '
  'search_blob. Read by that one search and nothing else. SECURITY INVOKER, so '
  'RLS on profiles, minecraft_accounts and roblox_accounts governs every row '
  'exactly as it would a direct read — which also means a role granted SELECT '
  'here must hold SELECT on all three. The joins are on those tables'' primary '
  'key and so cannot multiply a profile into several rows; the search reads its '
  'match total from this view''s row count, so that is asserted rather than '
  'assumed. A future game platform is one more LEFT JOIN and one more argument '
  'to concat_ws, with no change anywhere outside the database.';

COMMENT ON COLUMN public.user_search_index.search_blob IS
  'Every string a person can be found by — name, email, phone, and each game '
  'handle — space-joined. Derived, never written, and never selected: the '
  'search filters on it and reads the profile columns beside it, so it does not '
  'cross the wire. referral_code and email_verified_at are deliberately absent: '
  'one labels where a family came from and the other is a date, and neither is '
  'a name anyone should be findable by. The phone is the stored digits (E.164 '
  'without the +), which is why a needle reduced to its trailing digits matches '
  'a number typed either nationally or internationally without the search '
  'knowing any dialling rules.';

-- The DROP took these with it. Same two roles, same single privilege: `anon`
-- gets nothing, because this is reachable only from an admin surface.
GRANT SELECT ON public.user_search_index TO authenticated;
GRANT SELECT ON public.user_search_index TO service_role;

-- The same end-state assertions 00185 made, because a drop/recreate is exactly
-- the cycle that loses them: security_invoker silently off would make the view
-- answer with its owner's rights (every profile, to every caller — a data leak
-- that looks from the application like a search that works), and a grant is the
-- kind of line whose absence fails closed somewhere far away.
DO $assert$
DECLARE
  v_ok     boolean;
  v_offend text;
BEGIN
  SELECT c.reloptions @> ARRAY['security_invoker=true']
    INTO v_ok
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'user_search_index'
     AND c.relkind = 'v';
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'user_search_index is not SECURITY INVOKER — it would answer with rows the caller cannot read';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_search_index'
       AND column_name = 'email_verified_at'
  ) THEN
    RAISE EXCEPTION 'user_search_index is missing email_verified_at — the admin search cannot answer in Profile without it';
  END IF;

  -- 00185's column, re-asserted: a recreate that copied an older column list
  -- would drop it and fail the same way, one migration later.
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_search_index'
       AND column_name = 'referral_code'
  ) THEN
    RAISE EXCEPTION 'user_search_index lost referral_code in the recreate';
  END IF;

  -- Scoped to the two Data API roles, as 00185's own check is: the view's owner
  -- holds everything by definition, so an unscoped sweep reports the owner's
  -- privileges as offenders and fails against a perfectly correct view.
  SELECT string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type)
    INTO v_offend
    FROM information_schema.table_privileges g
   WHERE g.table_schema = 'public'
     AND g.table_name = 'user_search_index'
     AND g.grantee IN ('authenticated', 'anon')
     AND g.privilege_type <> 'SELECT';
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'user_search_index carries write privileges: %', v_offend;
  END IF;

  IF has_table_privilege('anon', 'public.user_search_index', 'SELECT') THEN
    RAISE EXCEPTION 'user_search_index is readable by anon';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_search_index', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT user_search_index — the DROP took the grant and it was not restored';
  END IF;
END;
$assert$;
