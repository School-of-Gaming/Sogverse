-- Server-driven location browse and search.
--
-- Until now the picker UI browsed generated static JSON catalogs shipped to the
-- browser — one file per country, 286 KB gzipped for France alone. The payload
-- was O(size of country) to paint a twenty-row screen, and every added country
-- made it worse at a steady ~8 bytes per place. The rows have been in this table
-- the whole time; the catalog was only ever a client-side cache of them.
--
-- Browsing needs nothing new: `idx_locations_parent` already indexes "the
-- children of this node". Search is what this migration adds.
--
-- WHAT SEARCH HAS TO DO
--
--   * cross-country from the first keystroke (no country is chosen first),
--   * diacritic-insensitive in BOTH directions — "nimes" finds Nîmes and
--     "jarvenpaa" finds Järvenpää, and equally "Nîmes" typed with the accent
--     still finds it,
--   * match the official statistical code as well as the name, because an admin
--     working from an INSEE/Tilastokeskus list has the code in front of them,
--   * match the `name_i18n` alternates, so "Helsingfors" finds the Helsinki row,
--   * rank prefix matches above infix ones,
--   * report the true total match count while returning only a rendering budget.
--
-- HOW: A DENORMALIZED, PRE-FOLDED SEARCH BLOB
--
-- Every searchable string for a row — its canonical name, each `name_i18n`
-- alternate, its official code — is folded (unaccented, lowercased) and joined
-- into one column, each term wrapped in a sentinel character (U+001F UNIT
-- SEPARATOR, which cannot occur in a place name). That single column carries
-- both match kinds as plain LIKE patterns:
--
--   contains "needle"          -> the row matches somewhere      (infix)
--   contains SENTINEL"needle"  -> some term STARTS with needle    (prefix)
--   contains SEP"needle"SEP    -> some term IS needle             (exact)
--
-- so ranking is three LIKE tests against one indexed column rather than a
-- per-row walk over a jsonb document. A GIN trigram index over the column serves
-- all three patterns.
--
-- THE IMMUTABILITY TRAP, WHICH IS REAL
--
-- `unaccent()` is declared STABLE, not IMMUTABLE — it resolves a text-search
-- dictionary by name, which is in principle a catalog lookup. Postgres therefore
-- refuses it inside an index expression or a generated column, which is exactly
-- where folding has to happen. The standard resolution is a thin IMMUTABLE
-- wrapper that pins the dictionary by OID; the promise it makes is that the
-- `unaccent` dictionary is installed once and never redefined, which is true
-- here (it ships with the extension and nothing in this repo touches it). If
-- that dictionary is ever replaced, every stored blob has to be recomputed and
-- the index rebuilt — the wrapper's comment says so on the object itself.
--
-- WHY A STORED GENERATED COLUMN RATHER THAN AN EXPRESSION INDEX
--
-- An expression index would keep the column off the wire, but the expression
-- then has to be re-evaluated for every row a scan touches. Short needles cannot
-- use a trigram index at all (fewer than three characters yields no trigram), so
-- those queries are a sequential scan — and re-folding 35k jsonb documents per
-- keystroke is a second or more. Against a stored column the same scan is a
-- plain text LIKE. The cost is that `search_blob` rides along in `select("*")`
-- responses; the rows that ship to a browser are counted in hundreds, so that is
-- the cheaper side of the trade.
--
-- ABUSE SURFACE
--
-- `/register-gedu` is a public, unauthenticated page and will call search on
-- keystrokes. Three things bound it here, and the rest is bounded above this
-- layer (debounce, and a CDN-cacheable route):
--
--   * a minimum needle length, enforced in the function rather than trusted from
--     the client — under it the function returns an empty result without
--     touching the table at all,
--   * a hard server-side cap on the returned row count, so `p_limit` cannot be
--     turned into a bulk export,
--   * SECURITY INVOKER, so the caller's own RLS applies exactly as it would to a
--     direct select. `locations` is already anon-readable in full, so the
--     function widens nothing; it narrows.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Folding primitives
-- ---------------------------------------------------------------------------

-- The IMMUTABLE wrapper described above. The dictionary is named explicitly
-- rather than left to search_path resolution: the one-argument unaccent() looks
-- its dictionary up by unqualified name, which under `SET search_path TO ''`
-- would not resolve at all.
CREATE FUNCTION public.immutable_unaccent(p_value text) RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p_value);
$$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
  'Diacritic-stripping fold, declared IMMUTABLE so it may be used in a generated column. unaccent() itself is STABLE because it resolves a dictionary by name; pinning the dictionary makes the result depend on nothing but the input. If the extensions.unaccent dictionary is ever redefined, locations.search_blob must be recomputed and its index rebuilt.';

-- The sentinel that wraps every term inside a search blob. U+001F (UNIT
-- SEPARATOR) is a control character: it cannot appear in a place name, an
-- official code, or anything a user can type into the search box, so it can
-- never be mistaken for content.
CREATE FUNCTION public.location_search_separator() RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT chr(31);
$$;

COMMENT ON FUNCTION public.location_search_separator() IS
  'The term delimiter inside locations.search_blob: U+001F UNIT SEPARATOR. A term-prefix match is "contains separator || needle"; an exact term match is "contains separator || needle || separator".';

-- Everything about one row that search should match, folded and delimited.
CREATE FUNCTION public.location_search_blob(
  p_name          text,
  p_name_i18n     jsonb,
  p_external_code text
) RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    public.location_search_separator()
      || string_agg(term, public.location_search_separator() ORDER BY term)
      || public.location_search_separator(),
    public.location_search_separator()
  )
  FROM (
    SELECT DISTINCT lower(public.immutable_unaccent(btrim(raw.value))) AS term
      FROM (
             SELECT p_name
             UNION ALL
             -- Alternates only. `name` is never duplicated into name_i18n, so
             -- the keys are irrelevant here; only the values are searchable.
             SELECT alternate.value
               FROM jsonb_each_text(coalesce(p_name_i18n, '{}'::jsonb)) AS alternate
             UNION ALL
             SELECT p_external_code
           ) AS raw(value)
     WHERE raw.value IS NOT NULL
       AND btrim(raw.value) <> ''
  ) AS terms;
$$;

COMMENT ON FUNCTION public.location_search_blob(text, jsonb, text) IS
  'Every searchable string for a location row — canonical name, each name_i18n alternate, the official code — folded to lowercase without diacritics and joined with the separator around each term. Backs the generated locations.search_blob column.';

-- ---------------------------------------------------------------------------
-- The column and its index
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN search_blob text
  GENERATED ALWAYS AS (
    public.location_search_blob(name, name_i18n, external_code)
  ) STORED;

COMMENT ON COLUMN public.locations.search_blob IS
  'Derived, never written: the row''s folded searchable terms, separator-delimited. Read only by public.search_locations; it is present in select(*) responses and carries no information the other columns do not.';

CREATE INDEX idx_locations_search_blob
  ON public.locations
  USING gin (search_blob extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- The search function
-- ---------------------------------------------------------------------------

-- Ranked, capped, counted, with each hit's ancestor chain attached.
--
-- Returns jsonb rather than a table because the answer is one document with two
-- parts — the true total and a page of hits — and each hit carries a nested
-- ancestor array. A RETURNS TABLE shape would repeat the total on every row and
-- still need a jsonb column for the chain; the wire shape is parsed through a
-- zod schema in the feature's contracts either way.
CREATE FUNCTION public.search_locations(
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
   -- A total order, so the page is stable: rank, then broadest level first
   -- (the enum is declared country -> region -> municipality -> district ->
   -- site), then name, then id to break the homonym ties France is full of.
   ORDER BY m.match_rank, m.type, m.name, m.id
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
      ) ORDER BY p.match_rank, p.type, p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.search_locations(text, public.location_type[], integer) IS
  'Cross-country location search: diacritic-insensitive both ways, matching canonical names, name_i18n alternates and official codes. Returns {total, results[]} where results carry each hit''s ancestor chain nearest-first, ranked exact > term-prefix > infix and capped server-side. SECURITY INVOKER, so the caller''s RLS on locations applies unchanged; needles shorter than two characters return an empty result without reading the table.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The folding primitives are nobody's API, but they are still reached down two
-- privilege-checked paths, and a caller needs EXECUTE on both:
--
--   * `search_locations` is SECURITY INVOKER, so its body runs as the *caller*.
--     It folds the needle with immutable_unaccent and builds its LIKE patterns
--     from location_search_separator, so every role allowed to search needs
--     EXECUTE on those two. Granting the wrapper alone yields 42501 on the
--     first call.
--   * a generated column's expression is evaluated during INSERT/UPDATE **with
--     the privileges of the writing role** — not once at ALTER TABLE time — so
--     any role that may write to `locations` needs EXECUTE on
--     location_search_blob (and transitively on the two it calls).
--     `authenticated` holds INSERT and UPDATE here under admin_manage_locations,
--     so without this an admin cannot create a venue or rename a row.
--
-- Granting them widens nothing. All three are pure functions of their
-- arguments: they read no table, hold no privilege of their own, and reveal
-- nothing a caller did not already pass in.
REVOKE ALL ON FUNCTION public.immutable_unaccent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO anon;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO authenticated;
GRANT ALL ON FUNCTION public.immutable_unaccent(text) TO service_role;

REVOKE ALL ON FUNCTION public.location_search_separator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_search_separator() TO anon;
GRANT EXECUTE ON FUNCTION public.location_search_separator() TO authenticated;
GRANT ALL ON FUNCTION public.location_search_separator() TO service_role;

-- Not granted to `anon`: anon never writes to `locations`, and nothing on the
-- read path calls this one.
REVOKE ALL ON FUNCTION public.location_search_blob(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_search_blob(text, jsonb, text) TO authenticated;
GRANT ALL ON FUNCTION public.location_search_blob(text, jsonb, text) TO service_role;

-- Search is anon-reachable on purpose: /register-gedu asks an applicant where
-- they can work before they have an account, and the public catalogue will do
-- the same. It reads nothing anon cannot already SELECT from `locations` under
-- that table's own anon_read_locations policy.
REVOKE ALL ON FUNCTION public.search_locations(text, public.location_type[], integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer) TO anon;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_locations(text, public.location_type[], integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Assertions — a half-applied search index must fail here, not in production
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_blank    integer;
  v_hits     jsonb;
BEGIN
  -- Every row got a blob. A generated column cannot be NULL here (the function
  -- coalesces), but an empty one would mean a row matched by nothing.
  SELECT count(*) INTO v_blank
    FROM public.locations
   WHERE search_blob IS NULL
      OR char_length(search_blob) <= 2;

  IF v_blank > 0 THEN
    RAISE EXCEPTION 'locations: % rows have an empty search_blob', v_blank;
  END IF;

  -- Diacritic folding, in the direction that actually needs the extension.
  IF public.location_search_blob('Nîmes', NULL, '30189') NOT LIKE '%nimes%' THEN
    RAISE EXCEPTION 'locations: unaccent is not folding — is the extensions.unaccent dictionary installed?';
  END IF;

  -- An alternate name is searchable, and the official code is too.
  IF public.location_search_blob('Helsinki', '{"sv":"Helsingfors"}'::jsonb, '091') NOT LIKE '%helsingfors%' THEN
    RAISE EXCEPTION 'locations: name_i18n alternates are missing from the search blob';
  END IF;

  -- End to end, against the real seed: the Swedish name of a Finnish
  -- municipality finds the Finnish row.
  SELECT public.search_locations('helsingfors', NULL, 5) INTO v_hits;
  IF (v_hits -> 'total')::integer < 1 THEN
    RAISE EXCEPTION 'locations: search_locations found nothing for a seeded alternate name';
  END IF;

  -- Every function the two invoker-privileged paths reach, checked per role.
  -- The assertions above all run as the migration's owner, which holds
  -- everything — so they pass just as happily when anon and authenticated hold
  -- nothing, and a search that 42501s for every real caller looks like a clean
  -- migration. This is the check that does not.
  IF NOT has_function_privilege('anon', 'public.search_locations(text, public.location_type[], integer)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.immutable_unaccent(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.location_search_separator()', 'EXECUTE') THEN
    RAISE EXCEPTION 'locations: anon cannot execute the whole search path — SECURITY INVOKER needs every function in the body granted, not just the entry point';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.location_search_blob(text, jsonb, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.immutable_unaccent(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.location_search_separator()', 'EXECUTE') THEN
    RAISE EXCEPTION 'locations: authenticated cannot execute the search_blob generation expression — every write to locations would fail';
  END IF;
END;
$$;
