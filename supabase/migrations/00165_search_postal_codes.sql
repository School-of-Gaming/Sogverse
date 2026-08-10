-- 00165: `search_locations` learns postal codes.
--
-- The picker's box promises "search by name or code". `00162`–`00164` supplied
-- the codes; this migration makes the promise true, in the same box, through the
-- same server-side search, on every surface the picker serves — including the
-- public educator registration page, which reaches this function with no session
-- at all.
--
-- WHY THIS IS A `CREATE OR REPLACE` AND NOT A DROP
--
-- The signature is unchanged — still (text, location_type[], integer, text) —
-- so the function keeps its identity, its OID and therefore its ACL. `00155` had
-- to drop-and-create because it *added* a parameter and would otherwise have
-- left two overloads standing; nothing of the sort applies here, and a needless
-- DROP would throw away grants for no reason. The body below is based on this
-- branch's `00155`, which is the current truth for this function: `schema.sql`
-- is built from migrations merged to `dev` and predates this branch, so for this
-- one object it is stale by exactly our own work (supabase/CLAUDE.md names this
-- edge).
--
-- WHY A SECOND ARM RATHER THAN A WIDER `search_blob`
--
-- Every other search key a row has — its canonical name, each `name_i18n`
-- alternate, its official code — is folded into `locations.search_blob`, a
-- GENERATED column. A generated column may only read *its own row*, and postal
-- codes live in another table with a many-to-many relationship to this one
-- (a municipality has dozens of codes; a French code spans dozens of communes).
-- Folding them into the blob would therefore mean trigger-maintained
-- denormalization: a second copy of the postal table, kept in step by triggers on
-- both sides, drifting silently the first time one of them was forgotten. So the
-- codes stay where they are and the *function* gains a second match arm, joined
-- back to the municipality rows before ranking.
--
-- The fold rule survives intact, and that is the point of doing it here rather
-- than anywhere else: the arm is SQL inside the same function, reading the same
-- `probe` CTE, so there is still exactly one fold and nothing outside the
-- database matches anything.
--
-- WHAT A POSTAL HIT IS
--
--   * **The municipality row**, deduped. A prefix can match many codes of one
--     place ("003" reaches most of Helsinki), and one row comes out.
--   * Ranked on the same scale as the blob arm: the needle IS a whole code →
--     exact (0); the needle is a PREFIX of a code → prefix (1). There is
--     deliberately no infix arm on codes — nobody searches the middle of a
--     postcode, and an infix arm would drag half of France into a three-digit
--     needle.
--   * Merged with the blob arm before ranking, so a row matching both ways
--     appears once, at its better rank.
--
-- The arm respects everything the blob arm respects: `p_types` (a postal row
-- points at a municipality, and the filter is applied to the joined row's real
-- type rather than assumed), `p_country`, `retired_at IS NULL`, the two-character
-- floor, and the folded needle.
--
-- THE STORED SIDE IS COMPARED RAW, AND THAT IS A SCOPED DECISION
--
-- The needle is folded (unaccent + lowercase) because both arms read one needle.
-- The stored code is not, and does not need to be: every seeded country's codes
-- are fixed-width digits, on which the fold is the identity. `postal_codes
-- .postal_code`'s own comment already defers the opposite case — "a country whose
-- codes carry spaces or letters will need that decision made deliberately rather
-- than inherited" — and folding the stored side here would be that decision made
-- by accident, at the price of an expression the index below cannot serve.
--
-- COST: NO DIGIT GATE. MEASURED, NOT ASSUMED.
--
-- The obvious saving is to run the postal arm only when the folded needle is
-- digit-shaped, since FI and FR codes are pure digits and a name-shaped needle
-- can never match one. It is not taken, for two reasons — one measured, one
-- structural.
--
-- Measured, against staging (35,905 locations, 38,944 postal rows), with the
-- index this migration adds:
--
--   needle 'haute' (name-shaped, cannot match a code)
--     postal arm  : Bitmap Index Scan, 0 rows, 11 buffers, 0.053 ms
--     blob arm    : Bitmap Heap Scan, 70 rows, 62 buffers, 0.220 ms
--   needle '75001'
--     postal arm  : Bitmap Index Scan, 1 row, 13 buffers, 0.134 ms
--   needle '75' (two characters, no trigram extractable)
--     postal arm  : 32 rows, 10 buffers, 0.096 ms
--     blob arm, same needle length: 1,141 buffers, 467 ms
--
-- So the arm's cost on a needle that cannot match it is one GIN probe that finds
-- nothing — a fifth of what the blob arm spends on the very same keystroke, and
-- three orders of magnitude below what a two-character needle already costs.
--
-- Structurally, a digit gate would hardcode "postal codes are digits", which is a
-- fact about Finland and France rather than about postal codes: the UK, the
-- Netherlands, Canada and Poland all use letters or separators. Its failure mode
-- is a silent one — the arm would simply stop matching, with nothing saying so —
-- and it is the same country-shaped assumption `00155` removed from the ranking
-- one migration earlier. Paying 11 buffers to avoid re-introducing it is the
-- right trade.
--
-- THE INDEX, AND WHY IT IS A TRIGRAM ONE
--
-- Without an index the arm is a sequential scan of every postal row per
-- keystroke: 38,944 rows, 287 buffers, ~4 ms warm and 213 ms cold on staging —
-- and it grows with every country added, which is exactly the shape this
-- feature's read layer exists to avoid.
--
-- The `postal_codes` primary key is (country_code, postal_code, location_id), so
-- its btree serves a code lookup only when the country is known; a cross-country
-- needle — the default, since the picker has no country to choose — does not
-- reach it.
--
-- A plain btree on `postal_code` would not help either, and the reason is worth
-- writing down because it is invisible in a plan you have not run. PostgreSQL
-- rewrites `LIKE 'abc%'` into btree range bounds **at planning time**, and that
-- rewrite requires the pattern to be a `Const`. Ours is not: it is an InitPlan
-- over the `probe` CTE, deliberately, because that is what lets one folded needle
-- serve every arm. Verified on staging — with a `text_pattern_ops` btree in
-- place, a literal `LIKE '75001%'` used it (0.03 ms) and the identical query with
-- the pattern behind an InitPlan fell back to a sequential scan (3.96 ms). Only
-- explicit `~>=~` / `~<~` bounds reach such an index, and computing a correct
-- upper bound for an arbitrary needle is hand-rolled byte arithmetic nobody
-- should have to re-derive.
--
-- A GIN trigram index has no such restriction: it extracts its query keys at
-- *execution* time, which is precisely why `idx_locations_search_blob` already
-- works against the same InitPlan-shaped pattern. Using one here makes both arms
-- the same shape, indexed the same way, with one kind of reasoning behind them —
-- and it costs 616 kB on 38,944 rows.
--
-- A GRANT ON `postal_codes`, DELIBERATELY
--
-- `search_locations` is SECURITY INVOKER and is executable by `service_role`, so
-- every read it makes has to be a read `service_role` may perform. `00162` gave
-- `postal_codes` a SELECT grant to `anon` and `authenticated` only, and said in
-- its own header that a privileged read should add the grant in the change that
-- needs it. This is that change: without it a `service_role` caller of a function
-- it holds EXECUTE on gets `permission denied for table postal_codes`, which is
-- fail-closed but still a bug, and one that shows up only on the privileged path.
-- The widening is nil in substance — `service_role` already reads `locations` in
-- full, and this is public reference data whose whole posture is that the answer
-- does not depend on who asks. No write grant is added to anybody, and the
-- assertions at the foot of this file re-check that.

-- ---------------------------------------------------------------------------
-- 1. The index the postal arm runs on
-- ---------------------------------------------------------------------------

CREATE INDEX idx_postal_codes_code_trgm
  ON public.postal_codes
  USING gin (postal_code extensions.gin_trgm_ops);

COMMENT ON INDEX public.idx_postal_codes_code_trgm IS
  'Serves the postal match arm of search_locations, which asks for codes starting with a folded needle across every country at once. Trigram rather than btree because the needle arrives as an InitPlan over the search function''s probe CTE, and PostgreSQL''s LIKE-prefix-to-range rewrite needs a plan-time Const; GIN extracts its query keys at execution time instead, exactly as the locations search blob index does.';

-- ---------------------------------------------------------------------------
-- 2. The grant the arm needs on the privileged path
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.postal_codes TO service_role;

COMMENT ON TABLE public.postal_codes IS
  'Postal code -> municipality, one row per (country, code, place) fact. An alternative key onto a locations row, never a level of the hierarchy. Nothing references this table, which is what makes a refresh a plain delete-and-reinsert rather than the retire-never-delete discipline locations lives under. Public reference data: anon, authenticated and service_role may SELECT, nobody may write from a client, and rows land through generated data migrations. service_role holds SELECT because search_locations is SECURITY INVOKER, reads this table for its postal match arm, and is executable by that role.';

-- ---------------------------------------------------------------------------
-- 3. The function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_locations(
  p_query text,
  p_types public.location_type[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_country text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path TO ''
    AS $$
WITH RECURSIVE
probe AS (
  SELECT
    folded.needle,
    -- LIKE metacharacters in the needle are escaped, not stripped: a user typing
    -- "%" should find nothing rather than everything. Both arms build their
    -- patterns from this one value.
    replace(replace(replace(folded.needle, '\', '\\'), '%', '\%'), '_', '\_') AS pattern,
    char_length(folded.needle) >= 2 AS runnable,
    -- The cap is the server's, not the caller's. Clamped rather than rejected so
    -- an out-of-range limit degrades to a sane page instead of an error.
    least(greatest(coalesce(p_limit, 20), 1), 50) AS cap
  FROM (
    SELECT lower(public.immutable_unaccent(btrim(coalesce(p_query, '')))) AS needle
  ) AS folded
),
matched AS (
  -- One row per matching place, at its best rank across both arms. A place found
  -- by name AND by postal code is one hit, not two, and it keeps the better of
  -- the two ranks — which is what `DISTINCT ON (id) ORDER BY id, match_rank`
  -- expresses.
  SELECT DISTINCT ON (h.id)
         h.id, h.name, h.name_i18n, h.type, h.parent_id, h.country_code,
         h.external_code,
         -- Carried for the ordering below only; not part of the wire shape.
         h.depth,
         h.match_rank
    FROM (
      -- ARM 1 — the stored fold: canonical name, name_i18n alternates, official
      -- code. Unchanged from 00155.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        CASE
          -- A term IS the needle.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || public.location_search_separator() || '%' FROM probe) THEN 0
          -- A term STARTS WITH the needle. A prefix hit found late in the scan
          -- therefore still outranks an infix hit found early, which is the whole
          -- point of ranking rather than filtering.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || '%' FROM probe) THEN 1
          ELSE 2
        END AS match_rank
      FROM public.locations l
      -- Scalar subqueries rather than a join to `probe`: each becomes an InitPlan
      -- evaluated once, which is what lets the planner treat the pattern as a
      -- runtime constant and consider the trigram index.
      WHERE (SELECT runnable FROM probe)
        AND l.search_blob LIKE (SELECT '%' || pattern || '%' FROM probe)
        AND (p_types IS NULL OR l.type = ANY (p_types))
        -- Both filters live here rather than in `page`, so the total the panel
        -- reports counts only rows it could actually offer.
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)

      UNION ALL

      -- ARM 2 — postal codes, joined back to the municipality they reach. The
      -- hit is the place, never the code: the code carries no name, no parent and
      -- nothing anyone browses.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        -- The needle IS a whole code, or it is a prefix of one. Nothing else —
        -- an infix arm on a five-digit code is noise, not a search.
        --
        -- Equality takes the unescaped needle because `=` interprets no
        -- metacharacters; the prefix takes the escaped pattern for the same
        -- reason arm 1 does.
        CASE
          WHEN pc.postal_code = (SELECT needle FROM probe) THEN 0
          ELSE 1
        END AS match_rank
      FROM public.postal_codes pc
      JOIN public.locations l ON l.id = pc.location_id
      WHERE (SELECT runnable FROM probe)
        AND pc.postal_code LIKE (SELECT pattern || '%' FROM probe)
        -- Every filter arm 1 applies, applied to the joined row rather than
        -- assumed from the fact that postal rows point at municipalities.
        AND (p_types IS NULL OR l.type = ANY (p_types))
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)
    ) AS h
   ORDER BY h.id, h.match_rank
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then venues after places, then
   -- broadest level first, then name, then id to break the homonym ties France
   -- is full of.
   --
   -- Breadth is the stored `depth`, which is true for any hierarchy shape. Sites
   -- are pushed below places by their own term ahead of depth, because depth
   -- cannot separate them: a Finnish site and a French commune are both at
   -- depth 3.
   ORDER BY m.match_rank, (m.type = 'site'), m.depth, m.name, m.id
   LIMIT (SELECT cap FROM probe)
),
-- The chain of every hit on this page, at most `cap` rows walking at most a
-- handful of levels. Bounded by depth as well as by the parent FK in case a
-- hand-made row ever forms a cycle.
--
-- Deliberately unfiltered on `retired_at`: a hit's ancestors are rendered as a
-- path, and a path with a link missing is unreadable. Retirement hides a place
-- from being *chosen*, not from being *named*.
walk AS (
  SELECT p.id AS anchor_id, p.parent_id AS node_id, 1 AS depth
    FROM page p
  UNION ALL
  SELECT w.anchor_id, up.parent_id, w.depth + 1
    FROM walk w
    JOIN public.locations up ON up.id = w.node_id
   WHERE w.depth < 10
),
chains AS (
  SELECT w.anchor_id,
         jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'name', a.name,
             'name_i18n', a.name_i18n,
             'type', a.type
           ) ORDER BY w.depth
         ) AS ancestors
    FROM walk w
    JOIN public.locations a ON a.id = w.node_id
   GROUP BY w.anchor_id
)
SELECT jsonb_build_object(
  -- The union, deduped — so a place matching by name and by code counts once.
  'total', (SELECT count(*) FROM matched),
  'results', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',            p.id,
        'name',          p.name,
        'name_i18n',     p.name_i18n,
        'type',          p.type,
        'parent_id',     p.parent_id,
        'country_code',  p.country_code,
        'external_code', p.external_code,
        -- Nearest first, matching every other ancestor chain in this codebase.
        'ancestors',     coalesce(c.ancestors, '[]'::jsonb)
      ) ORDER BY p.match_rank, (p.type = 'site'), p.depth, p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.search_locations(text, public.location_type[], integer, text) IS
  'Cross-country location search over two match sources merged before ranking: the stored fold on locations (canonical names, name_i18n alternates, official codes; exact > term-prefix > infix) and postal_codes joined to the municipality each code reaches (exact code > code prefix, no infix). Diacritic-insensitive both ways; one folded needle serves both arms. A place matching both ways appears once, at its better rank, and the total counts the deduped union. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked then places before venues, then broadest-first by the stored depth, and capped server-side. p_types and p_country restrict both arms, and the restriction applies to the total as well as the page. Retired rows are excluded from matches, but the ancestor walk still climbs through them so a chain renders whole. SECURITY INVOKER, so the caller''s RLS on locations and postal_codes applies unchanged; needles shorter than two characters return an empty result without reading either table.';

-- ---------------------------------------------------------------------------
-- 4. Assert the end state
-- ---------------------------------------------------------------------------
--
-- `CREATE OR REPLACE` keeps the function's OID and therefore its ACL, so no
-- grant is re-issued above — but "should have survived" is not the same as
-- "did", and the whole point of the search function's posture is that an
-- anonymous visitor can reach it. Asserted rather than assumed, alongside the
-- postal grant this migration adds and the write posture it must not disturb.

DO $$
DECLARE
  v_overloads bigint;
  v_role text;
BEGIN
  SELECT count(*) INTO v_overloads
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'search_locations';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION
      'search_locations must have exactly one overload after this migration, found %',
      v_overloads;
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT pg_catalog.has_function_privilege(
         v_role,
         'public.search_locations(text, public.location_type[], integer, text)',
         'EXECUTE')
    THEN
      RAISE EXCEPTION '% lost EXECUTE on search_locations across the replace', v_role;
    END IF;

    -- SECURITY INVOKER: a role that may execute the function must be able to
    -- read everything the function reads, or the postal arm fails closed for it.
    IF NOT pg_catalog.has_table_privilege(v_role, 'public.postal_codes', 'SELECT') THEN
      RAISE EXCEPTION
        '% may execute search_locations but cannot SELECT postal_codes — the postal arm would raise permission denied',
        v_role;
    END IF;
  END LOOP;

  -- The read grant above must not have brought a write grant with it. Rows land
  -- through data migrations, which run as the database owner and need no Data
  -- API privilege at all.
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'public.postal_codes', 'INSERT')
       OR pg_catalog.has_table_privilege(v_role, 'public.postal_codes', 'UPDATE')
       OR pg_catalog.has_table_privilege(v_role, 'public.postal_codes', 'DELETE')
    THEN
      RAISE EXCEPTION
        '% holds a write grant on postal_codes — this is seeded reference data, written only by migrations',
        v_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'idx_postal_codes_code_trgm'
       AND c.relkind = 'i'
  ) THEN
    RAISE EXCEPTION 'the postal code trigram index is missing — every keystroke would scan postal_codes';
  END IF;
END;
$$;
