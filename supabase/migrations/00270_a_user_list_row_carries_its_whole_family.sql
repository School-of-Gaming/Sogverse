-- One row per entry of the admin user list, carrying its whole family.
--
-- WHAT THE ADMIN SURFACES DO TODAY, AND WHY IT HAD TO CHANGE
--
-- Three admin surfaces — the users page, the product page's participant picker
-- and its gedu picker — each read `profiles` whole, page by page, and then do in
-- the browser what a database does for a living: nest children under parents,
-- hoist a matched child's parent to the top level, filter by role, and match a
-- needle. Prod passed 3,000 profiles and the read is now four sequential pages
-- for about 1.2 MB before a single row can paint. Admins look at the newest ~25
-- and search for one person; nobody scrolls the table.
--
-- This view makes the list and the search the same query, and makes one page of
-- it 25 rows: newest first with the `id` tiebreaker, an optional role equality
-- filter, optional `ILIKE` terms on a family-wide search blob, an optional
-- spoken-language containment filter, and a keyset `or` filter carrying the last
-- row's `created_at` and `id`. Nothing about it is an RPC or a route: it is a
-- `security_invoker` view under the admin RLS on `profiles`, so it needs a grant
-- and an entry in the DB suite's view registry, and nothing else.
--
-- WHAT A ROW IS
--
-- One row per *top-level list entry*: every non-gamer profile, plus any gamer
-- with no parent link. A linked gamer is not a row of its own — it rides inside
-- its parent's `linked_gamers` array, which is exactly the collapse the page
-- builds by hand today. The unlinked gamer is the case that keeps the list
-- complete: a child whose parent link was deleted would otherwise be reachable
-- from nowhere.
--
-- EVERYTHING A ROW NEEDS RIDES ALONG
--
-- The lesson this replaces was paid for in production: a per-gamer sign-in
-- lookup — thirty sequential keyed batches — sat on the end of the old chain and
-- gated first paint, and a keyed read handed thousands of ids is a walk in
-- disguise. So each embedded gamer carries what a list row renders about a
-- child, the two gedu standing flags come off the 1:1 extension row rather than
-- a second whole-table read, and `spoken_languages` is carried so the gedu
-- picker's "speaks X" filter is a containment predicate on this view rather than
-- a browser pass over every educator.
--
-- Game handles are deliberately *not* columns. They are folded into the search
-- blob — which is what makes "who is EnderDragon42?" answerable — and no surface
-- renders one on a list row, so putting them on the wire per row would pay for
-- something nobody reads. A surface that starts showing them adds one line here.
--
-- WHY EVERY DERIVED VALUE IS A SCALAR SUBQUERY AND THE `FROM` NAMES ONE TABLE
--
-- This is the whole performance design and it is load-bearing, not style.
--
--   * The unfiltered newest page must not build 3,000 families to return 25.
--     With `profiles` as the only relation in the `FROM` and an index matching
--     the sort, the plan is an ordered index scan under a `LIMIT`, and a scalar
--     subquery in the target list runs once per *returned* row. A `LEFT JOIN`
--     would be a second relation the planner may hash — and a hash join carries
--     no pathkeys, so the ordering would come back as a sort over the whole
--     table and the `LIMIT` would stop saving anything.
--   * `count: exact` on the first page must not build them either. PostgREST's
--     count wraps this query and selects `count(*)` from it; a flattened
--     subquery's unreferenced target-list expressions are never evaluated, so
--     the count costs the `WHERE` and nothing else. A join in the `FROM` stays
--     in the join tree and would be executed for every row regardless.
--   * The search path necessarily evaluates the blob for every row it scans,
--     because that is what the filter reads. At this table size that is the
--     accepted cost: an unanchored `ILIKE` is unindexable, and the expression
--     spans four tables so no trigram index can stand behind it either.
--
-- THE INDEX
--
-- `profiles` had no index on `created_at` at all, so the keyset order was a sort
-- of the whole table. The key is `(created_at DESC, id)` in exactly that
-- direction, because that is the order every reader already asks for — a plain
-- ascending index read backwards would give `id` descending on a tie and force
-- the sort back.
--
-- `user_search_index` IS REPLACED HERE AND DROPPED IN THE NEXT MIGRATION
--
-- It existed for one thing — the admin user search — and this view does that
-- job with a family-wide blob instead of a per-person one, which is the fix for
-- the bug that a hit on a child's name returned a row the list then collapsed
-- away. Every string it made findable is preserved here: name, email, phone and
-- each game handle, for the parent AND for every child.
--
-- The drop is deliberately NOT in this file. Staging is shared, and a migration
-- is pushed there before its branch merges — so dropping the old view here
-- would break the user search of every checkout still running the code that
-- reads it, for as long as this branch stays open. The next migration holds the
-- drop alone and is pushed at landing time, which shrinks that window from the
-- life of a branch to the minutes between a push and a deploy. On a database
-- built from `migrations/` the two run back to back and the split is invisible.

-- ---------------------------------------------------------------------------
-- 1. The keyset index.
-- ---------------------------------------------------------------------------

CREATE INDEX idx_profiles_created_at_desc_id
  ON public.profiles USING btree (created_at DESC, id);

COMMENT ON INDEX public.idx_profiles_created_at_desc_id IS
  'The order every list read of profiles asks for: newest first, id breaking a '
  'tie. Written DESC-then-ASC rather than as a plain ascending pair because a '
  'backwards read of (created_at, id) orders id descending on a tie, which is '
  'not the order the readers use — so the planner would sort instead, and the '
  'keyset page would cost a full scan. `created_at` is NOT NULL, so the nulls '
  'ordering DESC implies is unreachable.';

-- ---------------------------------------------------------------------------
-- 2. The view.
-- ---------------------------------------------------------------------------

CREATE VIEW public.user_list_entries
WITH (security_invoker = true)
AS
SELECT
  -- Every `profiles` column, for the same reason `user_search_index` carried
  -- them: the surfaces answer in the table's own row type, so a column added to
  -- `profiles` owes this list one line and the compiler is what charges it.
  p.id,
  p.email,
  p.email_verified_at,
  p.first_name,
  p.last_name,
  p.role,
  p.phone,
  p.currency,
  p.home_location_id,
  p.utm_source,
  p.utm_medium,
  p.utm_campaign,
  p.locale,
  p.spoken_languages,
  p.created_at,
  p.updated_at,

  -- The two gedu standing flags a list row renders, off the 1:1 extension row.
  -- `false` rather than NULL for anybody who has no such row: `role` is the
  -- discriminator for whether the value means anything, and it is already on
  -- the row, so a third value would only be a second way to ask the same
  -- question. This is the same coalesce every call site writes today.
  COALESCE(
    (SELECT gd.certified FROM public.gedu_profiles gd WHERE gd.user_id = p.id),
    false
  ) AS certified,
  COALESCE(
    (
      SELECT gd.criminal_record_check_passed
        FROM public.gedu_profiles gd
       WHERE gd.user_id = p.id
    ),
    false
  ) AS criminal_record_check_passed,

  -- The children, oldest first. `'[]'` rather than NULL for a row with none, so
  -- a consumer reads a length instead of asking twice; the "no connected
  -- gamers" line on a customer row is that length being zero.
  COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id',                g.id,
                 'first_name',        g.first_name,
                 'last_name',         g.last_name,
                 'email',             g.email,
                 'email_verified_at', g.email_verified_at,
                 'role',              g.role,
                 'created_at',        g.created_at,
                 'sign_in',           gpr.sign_in
               )
               ORDER BY g.created_at, g.id
             )
        FROM public.parent_gamer pg
        JOIN public.profiles g ON g.id = pg.gamer_id
        LEFT JOIN public.gamer_profiles gpr ON gpr.user_id = g.id
       WHERE pg.parent_id = p.id
    ),
    '[]'::jsonb
  ) AS linked_gamers,

  -- The family's searchable text: this person's strings, then every child's.
  -- `concat_ws` drops NULLs, so an absent handle or phone contributes nothing
  -- rather than a literal gap.
  concat_ws(
    ' ',
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    (
      SELECT mc.minecraft_username
        FROM public.minecraft_accounts mc
       WHERE mc.user_id = p.id
    ),
    (
      SELECT rb.roblox_username
        FROM public.roblox_accounts rb
       WHERE rb.user_id = p.id
    ),
    (
      SELECT string_agg(
               concat_ws(
                 ' ',
                 g.first_name,
                 g.last_name,
                 g.email,
                 g.phone,
                 gmc.minecraft_username,
                 grb.roblox_username
               ),
               ' '
             )
        FROM public.parent_gamer pg
        JOIN public.profiles g ON g.id = pg.gamer_id
        LEFT JOIN public.minecraft_accounts gmc ON gmc.user_id = g.id
        LEFT JOIN public.roblox_accounts    grb ON grb.user_id = g.id
       WHERE pg.parent_id = p.id
    )
  ) AS family_search_blob

FROM public.profiles p
WHERE p.role <> 'gamer'::public.user_role
   OR NOT EXISTS (
        SELECT 1 FROM public.parent_gamer pg WHERE pg.gamer_id = p.id
      );

COMMENT ON VIEW public.user_list_entries IS
  'One row per entry of the admin user list: every non-gamer profile, plus any '
  'gamer with no parent link. A linked gamer is not a row — it rides inside its '
  'parent''s linked_gamers array, which is the parent-child collapse the page '
  'used to build in the browser from two whole-table reads. Carries every '
  'profiles column, the two gedu standing flags, the children as JSON, and a '
  'family-wide search blob, so a page of 25 rows is one request and nothing a '
  'row renders needs a keyed follow-up read. SECURITY INVOKER, so RLS on '
  'profiles, parent_gamer, gamer_profiles, gedu_profiles, minecraft_accounts '
  'and roblox_accounts governs it exactly as a direct read of those tables '
  'would — which also means a role granted SELECT here must hold SELECT on all '
  'six, and that a caller who cannot see a link sees the child as a top-level '
  'row rather than as somebody''s. The FROM names one table and every derived '
  'value is a scalar subquery on purpose: that is what lets the newest page be '
  'an ordered index scan under a LIMIT, evaluating the children and the blob '
  'for the 25 rows it returns rather than for the whole table, and what lets an '
  'exact count skip them entirely. A join in the FROM would cost both. Replaced '
  'user_search_index in 00270.';

COMMENT ON COLUMN public.user_list_entries.linked_gamers IS
  'This family''s children, oldest first, as a JSON array of objects carrying '
  'id, first_name, last_name, email, email_verified_at, role, created_at and '
  'sign_in — everything the two list surfaces render or gate on per child, '
  'including the sign-in mode whose per-gamer lookup used to be thirty '
  'sequential keyed batches on the end of the list read. Empty array, never '
  'NULL. A child the caller''s RLS cannot see is simply absent, so an array is '
  'never a claim about somebody the caller could not have read directly.';

COMMENT ON COLUMN public.user_list_entries.family_search_blob IS
  'Every string this family can be found by — name, email, phone and each game '
  'handle, for this person AND for every linked child — space-joined. Derived, '
  'never written, and never selected: the search filters on it and reads the '
  'other columns beside it, so it does not cross the wire. Family-wide rather '
  'than per-person because the list shows families: a hit on a child''s name or '
  'handle has to return the row the child is inside, and matching per person '
  'returned a row the page then collapsed away. The utm_* columns and '
  'email_verified_at are deliberately absent: those label where a family came '
  'from and when they verified, and neither is a name anyone should be findable '
  'by. The phone is the stored digits (E.164 without the +), which is why a '
  'needle reduced to its trailing digits matches a number typed either '
  'nationally or internationally without the search knowing any dialling rules.';

COMMENT ON COLUMN public.user_list_entries.certified IS
  'Whether an admin has vouched for this educator, from the 1:1 gedu_profiles '
  'row; false for anyone who has none, so read it together with role. Carried '
  'here because the gedu picker filters and disables on it server-side and the '
  'users list marks it per row — the two reasons the whole-table certification '
  'read existed.';

COMMENT ON COLUMN public.user_list_entries.criminal_record_check_passed IS
  'Whether an admin has recorded seeing an acceptable criminal record extract, '
  'from the same 1:1 row as certified and on the same terms. The flag only — '
  'never the _at or _by stamps, which name the admin who saw the document and '
  'belong to the detail page''s own narrower read, not to a list.';

-- A view arrives with no privileges at all. Same two roles as the view this
-- replaces, same single privilege: `anon` gets nothing, because every surface
-- reading this is behind an admin session — and `anon` holds no SELECT on
-- minecraft_accounts or roblox_accounts, so a grant here would only trade a
-- 404 for a permission error.
GRANT SELECT ON public.user_list_entries TO authenticated;
GRANT SELECT ON public.user_list_entries TO service_role;

-- ---------------------------------------------------------------------------
-- 3. End-state assertions.
--
-- The same shape 00185 and 00188 used, because creating a view is exactly the
-- cycle that loses these: security_invoker silently off would make it answer
-- with its owner's rights — every profile, to every caller, a leak that looks
-- from the application like a list that works — and a grant is the kind of line
-- whose absence fails closed somewhere far away. The row-shape claims are
-- vacuous on the empty database CI builds from migrations and are real against
-- staging and production, which is where a wrong predicate would show.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_ok       boolean;
  v_offend   text;
  v_rows     bigint;
  v_distinct bigint;
  v_expected bigint;
  v_indexdef text;
BEGIN
  -- --- (a) It answers as its caller. --------------------------------------
  SELECT c.reloptions @> ARRAY['security_invoker=true']
    INTO v_ok
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'user_list_entries'
     AND c.relkind = 'v';
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'user_list_entries is not SECURITY INVOKER — it would answer with rows the caller cannot read';
  END IF;

  -- --- (b) It carries what the surfaces read. -----------------------------
  -- Named one by one rather than counted: a missing column has to be reported
  -- by name, and each of these is a surface that stops working without it.
  SELECT string_agg(needed.col, ', ' ORDER BY needed.col)
    INTO v_offend
    FROM unnest(ARRAY[
           'id', 'email', 'email_verified_at', 'first_name', 'last_name',
           'role', 'phone', 'currency', 'home_location_id',
           'utm_source', 'utm_medium', 'utm_campaign',
           'locale', 'spoken_languages', 'created_at', 'updated_at',
           'certified', 'criminal_record_check_passed',
           'linked_gamers', 'family_search_blob'
         ]) AS needed(col)
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = 'user_list_entries'
        AND ic.column_name = needed.col
   );
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'user_list_entries is missing column(s) %, which the admin list and the two pickers read', v_offend;
  END IF;

  -- --- (c) The grants. ----------------------------------------------------
  -- Scoped to the two Data API roles: the view's owner holds everything by
  -- definition, so an unscoped sweep reports the owner as an offender and
  -- fails against a perfectly correct view.
  SELECT string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type)
    INTO v_offend
    FROM information_schema.table_privileges g
   WHERE g.table_schema = 'public'
     AND g.table_name = 'user_list_entries'
     AND g.grantee IN ('authenticated', 'anon')
     AND g.privilege_type <> 'SELECT';
  IF v_offend IS NOT NULL THEN
    RAISE EXCEPTION 'user_list_entries carries write privileges: %', v_offend;
  END IF;

  IF has_table_privilege('anon', 'public.user_list_entries', 'SELECT') THEN
    RAISE EXCEPTION 'user_list_entries is readable by anon';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_list_entries', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT user_list_entries — the admin list, the participant picker and the gedu picker all read it';
  END IF;

  -- --- (d) One row per entry, and the right entries. ----------------------
  -- The claim the list's exact count rests on. A derived value written as a
  -- join instead of a scalar subquery is the mistake this catches: a person
  -- with two children would become two rows, and the count would overstate
  -- the list by however many children each family has.
  SELECT count(*), count(DISTINCT id)
    INTO v_rows, v_distinct
    FROM public.user_list_entries;
  IF v_rows <> v_distinct THEN
    RAISE EXCEPTION 'user_list_entries holds % rows for % distinct people — something in it multiplies a row and the list total would overstate itself', v_rows, v_distinct;
  END IF;

  -- A linked gamer belongs inside its parent's array, never beside it. Scoped
  -- to the gamer role because the collapse is: a non-gamer profile someone has
  -- linked as a child stays a top-level row of its own, since the list is the
  -- only place an adult account can be reached from.
  IF EXISTS (
    SELECT 1
      FROM public.user_list_entries v
      JOIN public.parent_gamer pg ON pg.gamer_id = v.id
     WHERE v.role = 'gamer'::public.user_role
  ) THEN
    RAISE EXCEPTION 'a linked gamer is a top-level row in user_list_entries — the family collapse is not happening and children would appear twice';
  END IF;

  -- And nobody who is not a linked gamer is missing from it.
  SELECT count(*)
    INTO v_expected
    FROM public.profiles p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.parent_gamer pg WHERE pg.gamer_id = p.id
   );
  SELECT count(*)
    INTO v_rows
    FROM public.user_list_entries v
   WHERE NOT EXISTS (
     SELECT 1 FROM public.parent_gamer pg WHERE pg.gamer_id = v.id
   );
  IF v_rows <> v_expected THEN
    RAISE EXCEPTION 'user_list_entries holds % of the % people who have no parent link — the list would be missing accounts nothing else can reach', v_rows, v_expected;
  END IF;

  -- --- (e) The keyset index, in the direction the readers ask for. --------
  SELECT i.indexdef
    INTO v_indexdef
    FROM pg_indexes i
   WHERE i.schemaname = 'public'
     AND i.tablename = 'profiles'
     AND i.indexname = 'idx_profiles_created_at_desc_id';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'idx_profiles_created_at_desc_id does not exist — every keyset page would sort the whole table';
  END IF;
  IF v_indexdef NOT LIKE '%(created_at DESC, id)%' THEN
    RAISE EXCEPTION 'idx_profiles_created_at_desc_id is keyed % — the readers order by created_at DESC then id ASC, and any other direction is a sort', v_indexdef;
  END IF;

END;
$assert$;
