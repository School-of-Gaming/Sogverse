-- 00179: the admin user search reaches a phone number and a game handle.
--
-- An admin looking for somebody starts from whatever artifact they were handed,
-- and two of the commonest ones were unreachable. A parent who messages on
-- WhatsApp is a PHONE NUMBER, which no query touched. A child reported by a
-- gedu is a GAME HANDLE — and for a gamer that is the only real-world name they
-- have, because their email is the synthetic <token>@gamer.sogverse.internal
-- address the account was minted with. "Who is EnderDragon42?" was a question
-- the platform could not answer at all.
--
-- WHAT THIS ADDS
--
--   One view, `user_search_index`: every profile column, plus a `search_blob`
--   holding the strings a person can be found by — their name, email, phone and
--   each game handle — joined with a space.
--
-- WHY A BLOB RATHER THAN COLUMNS SIDE BY SIDE
--
-- The caller matches one needle against one column, so adding a searchable
-- field later is an edit to THIS FILE and to nothing else: no new filter branch
-- in the service, no new test of the query string, no chance of a field that is
-- in the view but that nobody ever searches. A third game platform is one more
-- LEFT JOIN and one more argument to concat_ws below, which is the whole reason
-- the per-platform tables can stay as they are — their account keys are
-- deliberately not one value space (a dashed Mojang UUID against a Roblox
-- int64), and nothing here asks them to become one.
--
-- It also removes a hazard from the caller rather than asking it to handle one.
-- Matching several columns at once meant a hand-built PostgREST `or=(…)` filter,
-- whose branches are comma-separated — so a comma inside the needle split the
-- filter itself and answered a search for "Smith, Jon" with a 400. One column is
-- one ordinary filter, and the needle is just a value again.
--
-- WHY A VIEW AND NOT A DENORMALIZED COLUMN
--
-- A generated column may only read its own row, and the handles are in other
-- tables — so the column form of this is a copy of both account tables kept in
-- step by triggers on both sides, drifting silently the first time one is
-- forgotten. That trade was made once already, for postal codes against
-- locations, and rejected on the same grounds.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * No diacritic fold. `immutable_unaccent` is right here and is one call
--     away, and it is left out because the people typing into this box are
--     admins on Nordic keyboards, for whom ä and ö cost nothing. The residual is
--     named rather than hidden: a French name (é, è, ç) is awkward from that
--     keyboard, and a family who registers their own name unaccented will not be
--     found by an admin who types it accented. Either would be answered by
--     wrapping both sides of the match below in the fold.
--   * No index. A leading-wildcard ILIKE cannot use a btree, and an expression
--     spanning three tables cannot be indexed at all without materializing it,
--     so every search is a sequential scan over `profiles` and two small joins.
--     That is single-digit milliseconds at the size this table is and does not
--     stay that way — the answer when it stops being true is a stored fold with
--     a GIN trigram index over it, which is the shape `locations` already uses.
--   * No ranking, and therefore no reordering of results. The caller still takes
--     the newest matches under its cap and reports the true total alongside.
--
-- SECURITY INVOKER, so the caller's own RLS on all three tables decides every
-- row: the view cannot answer with anything a direct read would not already
-- return. A non-admin's own search sees their own handles and nobody else's,
-- because the joins are filtered by the same policies the account tables carry.
-- The corollary binds any future arm — a table joined in here has to be readable
-- by every role granted SELECT below, or that role gets a permission error on a
-- path no admin ever exercises.

-- ---------------------------------------------------------------------------
-- 1. The view.
--
-- Both joins are on the account tables' PRIMARY KEY, which is what makes them
-- strictly one-to-one and unable to multiply a profile into several rows. That
-- property is load-bearing rather than incidental: the caller reads its match
-- total from this view's row count, so a join that duplicated a profile would
-- not merely repeat a row on screen, it would overstate "showing 20 of N" by
-- however many game accounts that person holds. It is asserted at the foot.
-- ---------------------------------------------------------------------------

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
  'cross the wire. The phone is the stored digits (E.164 without the +), which '
  'is why a needle reduced to its trailing digits matches a number typed either '
  'nationally or internationally without the search knowing any dialling rules.';

-- ---------------------------------------------------------------------------
-- 2. Grants.
--
-- SELECT and nothing else, to the two roles that hold SELECT on all three
-- underlying tables. `anon` gets nothing: this is reachable only from an admin
-- surface, and a signed-out caller has no business enumerating profiles.
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.user_search_index TO authenticated;
GRANT SELECT ON public.user_search_index TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions.
--
-- Three things this migration could get wrong silently:
--
--   (a) security_invoker off. The view would then run with its OWNER's rights
--       and hand every caller every profile in the table — the one failure here
--       that is a data leak rather than a wrong answer, and it is invisible from
--       the application, which would simply see a search that works.
--   (b) A join that multiplies rows, making the reported match total larger than
--       the number of people found.
--   (c) A write privilege, or an anon grant, arriving by accident.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_ok       boolean;
  v_offend   text;
  v_profiles bigint;
  v_indexed  bigint;
BEGIN
  -- --- (a) The caller's own RLS applies. -----------------------------------
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

  -- --- (b) One row per profile, however many game accounts they hold. ------
  SELECT count(*) INTO v_profiles FROM public.profiles;
  SELECT count(*) INTO v_indexed  FROM public.user_search_index;
  IF v_profiles IS DISTINCT FROM v_indexed THEN
    RAISE EXCEPTION 'user_search_index holds % rows for % profiles — a join is multiplying rows and the search total would overstate its matches', v_indexed, v_profiles;
  END IF;

  -- --- (c) SELECT only, and not for anon. ---------------------------------
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
    RAISE EXCEPTION 'user_search_index is not readable by authenticated';
  END IF;
END
$assert$;
