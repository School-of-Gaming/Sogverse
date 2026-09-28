--
-- Name: search_locations(text, public.location_type[], integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_locations(p_query text, p_types public.location_type[] DEFAULT NULL::public.location_type[], p_limit integer DEFAULT 20, p_country text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
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
      -- code.
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


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) IS 'Cross-country location search over two match sources merged before ranking: the stored fold on locations (canonical names, name_i18n alternates, official codes; exact > term-prefix > infix) and postal_codes joined to the municipality each code reaches (exact code > code prefix, no infix). Diacritic-insensitive both ways; one folded needle serves both arms. A place matching both ways appears once, at its better rank, and the total counts the deduped union. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked then places before venues, then broadest-first by the stored depth, and capped server-side. p_types and p_country restrict both arms, and the restriction applies to the total as well as the page. Retired rows are excluded from matches, but the ancestor walk still climbs through them so a chain renders whole. SECURITY INVOKER, so the caller''s RLS on locations and postal_codes applies unchanged; needles shorter than two characters return an empty result without reading either table.';


--
-- Name: FUNCTION search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO anon;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO authenticated;
GRANT ALL ON FUNCTION public.search_locations(p_query text, p_types public.location_type[], p_limit integer, p_country text) TO service_role;


