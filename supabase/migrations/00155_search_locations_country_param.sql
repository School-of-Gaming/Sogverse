-- 00155: `search_locations` gains a country parameter, a retired-row filter and
-- a country-agnostic ranking.
--
-- WHY THIS IS A DROP AND A CREATE, IN ONE MIGRATION. Adding a parameter changes
-- the function's identity in PostgreSQL: `CREATE OR REPLACE` would leave the
-- three-argument version standing beside the four-argument one, and every
-- existing call — all of which pass three named arguments — would become
-- ambiguous. That surfaces as a 42883 on the first anonymous keystroke rather
-- than at DDL time, which is the worst place to find it. Dropping the old
-- signature and creating the new one in the same transaction leaves exactly one
-- overload at every moment a client could call.
--
-- The body is copied from `supabase/schema.sql` per the rule in
-- supabase/CLAUDE.md — this branch has not touched the function, so the
-- snapshot is accurate. Three things change inside it:
--
--   1. RANKING. `00141` replaced the location_type enum's declaration order
--      with a hardcoded CASE spelling out "country, region, district,
--      municipality, site" and said in its own header that the CASE encodes the
--      shape of the two seeded countries and would be wrong for a country
--      whose `district` sits BELOW its municipality — which the hierarchy
--      config already sketches for US, GB and JP. `depth` (00154) is that
--      breadth, stored per row and true for any shape, so the CASE goes.
--
--      Sites are ranked below places EXPLICITLY, ahead of depth, rather than
--      falling out of it: a Finnish site and a French commune both sit at depth
--      3, so depth alone would interleave venues with places. `(type = 'site')`
--      sorts false before true, which puts every place ahead of every venue at
--      equal match rank.
--
--   2. RETIRED ROWS. The filter lands in the `matched` CTE, not in `page`, so
--      the reported `total` drops retired rows too — a "showing N of M" whose M
--      counted rows the panel will never offer is worse than no M at all. The
--      recursive ancestor walk deliberately does NOT filter: a chain has to
--      render whole, and a live municipality under a retired district still
--      needs its district's name to be readable.
--
--   3. A COUNTRY PARAMETER, optional and defaulting to NULL, so every existing
--      caller keeps working. It closes the gap `src/services/locations/CLAUDE
--      .md` records honestly: a country-restricted picker filters search hits in
--      the browser, but the server ranks and caps the page BEFORE that filter
--      runs, so a needle matching many rows elsewhere could push every wanted
--      row off the page and leave the box empty on a needle that does match.
--      Filtering in the `matched` CTE fixes the count and the page together.

DROP FUNCTION IF EXISTS public.search_locations(
  text, public.location_type[], integer
);

CREATE FUNCTION public.search_locations(
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
    -- "%" should find nothing rather than everything.
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
  SELECT
    l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code, l.external_code,
    -- Carried for the ordering below only; it is not part of the wire shape.
    l.depth,
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
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then venues after places, then
   -- broadest level first, then name, then id to break the homonym ties France
   -- is full of.
   --
   -- Breadth is the stored `depth`, which is true for any hierarchy shape. The
   -- per-type CASE this replaces was right only for the two seeded countries
   -- and backwards for any country nesting `district` below `municipality`.
   -- Sites are pushed below places by their own term ahead of depth, because
   -- depth cannot separate them: a Finnish site and a French commune are both
   -- at depth 3.
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
  'Cross-country location search: diacritic-insensitive both ways, matching canonical names, name_i18n alternates and official codes. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked exact > term-prefix > infix, then places before venues, then broadest-first by the stored depth, and capped server-side. p_country (optional) restricts matches to one ISO country code, and the restriction applies to the total as well as the page. Retired rows (retired_at IS NOT NULL) are excluded from matches, but the ancestor walk still climbs through them so a chain renders whole. SECURITY INVOKER, so the caller''s RLS on locations applies unchanged; needles shorter than two characters return an empty result without reading the table.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- A new signature is a new object with no privileges of its own, so the
-- original migration's block is re-issued in full. Search is anon-reachable on
-- purpose: /register-gedu asks an applicant where they can work before they
-- have an account. It reads nothing anon cannot already SELECT from `locations`
-- under that table's own anon_read_locations policy, and the folding primitives
-- it calls as the caller (immutable_unaccent, location_search_separator) keep
-- the grants 00136 gave them.

REVOKE ALL ON FUNCTION public.search_locations(text, public.location_type[], integer, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer, text) TO anon;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer, text) TO authenticated;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Assertions — exactly one overload, reachable by the roles that need it
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_overloads bigint;
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

  IF NOT pg_catalog.has_function_privilege(
       'anon',
       'public.search_locations(text, public.location_type[], integer, text)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION 'anon cannot execute the new search_locations signature';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.search_locations(text, public.location_type[], integer, text)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION 'authenticated cannot execute the new search_locations signature';
  END IF;
END;
$$;
