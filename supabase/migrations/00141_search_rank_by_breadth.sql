-- Rank search hits by real breadth, not by the order the enum happens to declare.
--
-- `search_locations` broke ties with `ORDER BY ... m.type ...`, relying on the
-- `location_type` enum's declaration order — country, region, municipality,
-- district, site — as a proxy for "broadest first". That is right for Finland,
-- which skips `district` entirely, and backwards for France, where `district`
-- IS the departement sitting above the communes.
--
-- The effect was not cosmetic. Searching "haute" matched 72 rows: 63 communes
-- and 9 departements. Every commune outranked every departement, the default
-- page is 20 (LOCATION_SEARCH_LIMIT), and search does not paginate — so
-- Haute-Savoie, Haute-Garonne and Hautes-Alpes were unreachable by search at
-- all. A gedu setting coverage had to browse France -> Auvergne-Rhone-Alpes ->
-- Haute-Savoie to claim a departement they could name from memory.
--
-- Breadth is now written out. It is deliberately not a lookup function: this is
-- called from a SECURITY INVOKER function, so a helper would need EXECUTE
-- granted to anon and authenticated and its own entry in the authorization
-- spine — a whole new grantable object to express five integers.
--
-- One limit, stated because the CASE looks more universal than it is: it
-- encodes the shape of the two seeded countries, where `district` sits between
-- region and municipality. The hierarchy config also describes countries (US,
-- GB, JP) that put a district *below* the municipality, and for those this
-- ordering would be wrong in the same way the enum is wrong for France. None is
-- seeded, so none can be returned; a country whose levels nest differently must
-- make this country-aware rather than adding itself to the list.
--
-- Body copied from 00136 with only the two ORDER BY clauses changed — per
-- supabase/CLAUDE.md, from this branch's own migration rather than schema.sql,
-- which is still describing dev and knows nothing about this function.

CREATE OR REPLACE FUNCTION public.search_locations(
  p_query text,
  p_types public.location_type[] DEFAULT NULL,
  p_limit integer DEFAULT 20
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
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then broadest level first,
   -- then name, then id to break the homonym ties France is full of.
   --
   -- Breadth is spelled out rather than taken from the enum's declared order,
   -- which sorts municipality before district and is therefore backwards for
   -- France, where a district IS the departement above the communes. Ordering
   -- by the enum buried all nine 'haute' departements behind 41 communes, past
   -- the default page of 20 — and search does not paginate, so they could not
   -- be reached at all.
   ORDER BY m.match_rank,
            CASE m.type
             WHEN 'country'      THEN 0
             WHEN 'region'       THEN 1
             WHEN 'district'     THEN 2
             WHEN 'municipality' THEN 3
             ELSE 4
           END,
            m.name, m.id
   LIMIT (SELECT cap FROM probe)
),
-- The chain of every hit on this page, at most `cap` rows walking at most a
-- handful of levels. Bounded by depth as well as by the parent FK in case a
-- hand-made row ever forms a cycle.
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
      ) ORDER BY p.match_rank,
                 CASE p.type
             WHEN 'country'      THEN 0
             WHEN 'region'       THEN 1
             WHEN 'district'     THEN 2
             WHEN 'municipality' THEN 3
             ELSE 4
           END,
                 p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;
