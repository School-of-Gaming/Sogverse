-- `user_search_index` regains the property its own comment claims for it: every
-- profile column.
--
-- 00184 added `profiles.referral_code` and the view, whose column list is
-- written out by hand, did not move with it. That is not a cosmetic gap. The
-- admin user search parses this view's rows through a zod schema that is checked
-- against `Profile` — the *table's* row type — precisely so a column added to
-- `profiles` cannot be forgotten here; the check does not know which columns the
-- view selects, so the schema demands a rule for the new column and the select
-- list then demands the column exist. Without this migration the search cannot
-- answer in `Profile` at all, and the alternative — teaching it to answer in
-- something narrower — throws away that guard for every future column.
--
-- NOTHING IS NEWLY EXPOSED
--
-- The view is SECURITY INVOKER and `profiles` carries a table-wide SELECT grant,
-- so every role that can read this view could already read this column with a
-- direct select. This widens the payload of one admin-only search by one
-- nullable text column and changes no authorization anywhere. Reads were never
-- the concern with `referral_code`; writes were, and 00184's deliberate absence
-- of an UPDATE grant is untouched here.
--
-- DROP AND RECREATE RATHER THAN CREATE OR REPLACE
--
-- `CREATE OR REPLACE VIEW` may only *append* columns, so it would force
-- `referral_code` to sit after `search_blob` — leaving the profile columns no
-- longer contiguous and the view's comment no longer describing its shape. The
-- DROP takes the grants with it, so they are restated below.

DROP VIEW public.user_search_index;

CREATE VIEW public.user_search_index
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.email,
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

-- `referral_code` is deliberately NOT one of the strings folded into
-- search_blob. It is marketing provenance, not an identity: nobody looks a
-- person up by the code on the flyer they clicked, and making one findable that
-- way would turn a label into a lookup key over a whole cohort of families.
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
  'cross the wire. referral_code is deliberately absent: it labels where a '
  'family came from and is not a name anyone should be findable by. The phone '
  'is the stored digits (E.164 without the +), which is why a needle reduced to '
  'its trailing digits matches a number typed either nationally or '
  'internationally without the search knowing any dialling rules.';

-- The DROP took these with it. Same two roles, same single privilege: `anon`
-- gets nothing, because this is reachable only from an admin surface.
GRANT SELECT ON public.user_search_index TO authenticated;
GRANT SELECT ON public.user_search_index TO service_role;

-- The same end-state assertions 00179 made, because a drop/recreate is exactly
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
       AND column_name = 'referral_code'
  ) THEN
    RAISE EXCEPTION 'user_search_index is missing referral_code — the admin search cannot answer in Profile without it';
  END IF;

  -- Scoped to the two Data API roles, as 00179's own check is: the view's owner
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
