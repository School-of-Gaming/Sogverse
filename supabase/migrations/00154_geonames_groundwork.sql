-- 00154: schema groundwork for putting `locations` on GeoNames.
--
-- No rows move, no FK is touched and nothing user-visible changes. This adds
-- the three columns the GeoNames-sourced tree needs, the trigger that keeps one
-- of them true, and two assert-style backfills over the rows that already
-- exist. The seeding, the cutover and the sync tooling all land later and all
-- assume these columns are here.
--
-- WHAT EACH COLUMN IS FOR
--
--   * `geonames_id` — the upstream key for a sourced row. It is the dedupe key
--     ingestion and sync run on, because names are not one and official codes
--     are reused across levels. Unique where present, NULL for the two kinds of
--     row GeoNames does not supply: admin-created `site` rows, and the
--     config-declared synthetic rows a country needs where GeoNames models no
--     administrative record (Mayotte's région and département are the known
--     case). `external_code` is NOT touched and never holds a geonameid — its
--     contract is the official statistical code, and GeoNames' admin-code
--     columns are simply where those codes will come from.
--
--   * `retired_at` — how a refresh removes a place without deleting a row.
--     `gedu_locations.location_id` is ON DELETE CASCADE, so a DELETE here
--     silently erases a gedu's coverage claim; nothing on the refresh path may
--     ever delete. A retired row keeps every FK, coverage claim and ancestor
--     walk working while dropping out of browse, search and the municipality
--     directory. Keyed reads deliberately still return it: a stored pick must
--     keep resolving, and a retired row is a *valid* pick, never cleared.
--
--   * `depth` — 0 for a country row, parent + 1 below. This is what lets search
--     rank "broadest first" without the hardcoded per-type CASE that 00141
--     documents as already wrong for a country whose `district` sits BELOW its
--     municipality (US/GB/JP in the hierarchy config; none seeded yet). 00155
--     switches the ordering over.
--
-- THE DEFAULT ON `depth` IS LOAD-BEARING, not decoration. Without it the column
-- becomes a required field of the generated Insert type, and the admin
-- site-create route plus its zod body contract stop compiling — even though the
-- trigger below fills the value at runtime and a caller-supplied one would be
-- overwritten. Seeds therefore do not emit `depth` either: an emitted value
-- would be decorative and misleading.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.locations
  ADD COLUMN geonames_id bigint,
  ADD COLUMN retired_at  timestamptz,
  ADD COLUMN depth       smallint NOT NULL DEFAULT 0;

-- Partial, because every site and every synthetic row carries NULL and NULLs
-- are not equal to each other anyway — the partial form says so out loud and
-- keeps the index to the rows that have a key.
CREATE UNIQUE INDEX uq_locations_geonames_id
  ON public.locations (geonames_id)
  WHERE geonames_id IS NOT NULL;

COMMENT ON COLUMN public.locations.geonames_id IS
  'GeoNames geonameid for a row sourced from the GeoNames dumps: the dedupe key for ingestion and sync, unique where present. NULL on admin-created sites and on config-declared synthetic rows GeoNames models no administrative record for. Never holds an official statistical code — that is external_code, and the two are separate columns on purpose.';

COMMENT ON COLUMN public.locations.retired_at IS
  'When a refresh found this place gone upstream. Retired rows are hidden from browse reads, the search function and the municipality directory, but keyed reads still return them and the ancestor walk still climbs through them: every existing FK, coverage claim and rendered chain has to keep working. Refresh never DELETEs a location row — gedu_locations cascades — so this is the only way a place leaves the pickers.';

COMMENT ON COLUMN public.locations.depth IS
  'Distance from the root: 0 for a country row, parent.depth + 1 below. Maintained by trg_set_location_depth and never written by hand; the DEFAULT exists so the column stays optional in the generated Insert type. Search ranks broadest-first on this rather than on the location_type enum, whose declared order is wrong for any country that nests district below municipality.';

-- ---------------------------------------------------------------------------
-- The depth trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_location_depth() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_parent_depth smallint;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT l.depth INTO v_parent_depth
    FROM public.locations l
   WHERE l.id = NEW.parent_id;

  -- A BEFORE trigger runs ahead of the FK check, so a parent_id pointing at no
  -- row arrives here first. Raising the FK error ourselves is what the products
  -- location trigger does for the same case: without it the assignment below
  -- would write NULL into a NOT NULL column and report a constraint the caller
  -- did not violate.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'locations.parent_id % references no row', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.depth := v_parent_depth + 1;
  RETURN NEW;
END;
$$;

-- No grants, deliberately. PostgreSQL does not check EXECUTE on a trigger
-- function — the executor calls it from the trigger context — so granting one
-- only widens the callable surface for nothing. REVOKE strips the EXECUTE
-- PUBLIC gets by default at CREATE FUNCTION time; the products location trigger
-- is the model.
REVOKE ALL ON FUNCTION public.set_location_depth() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Backfill: depth, top-down, BEFORE the trigger exists
-- ---------------------------------------------------------------------------
--
-- Order matters. The trigger reads the parent's *stored* depth, so running it
-- over a table whose parents are not corrected yet would propagate the DEFAULT
-- of 0 down every chain. The recursive walk below computes the whole tree from
-- the root in one statement instead, and the trigger is attached after it.
--
-- The `IS DISTINCT FROM` guard keeps the statement to the rows that are wrong —
-- which is every non-country row, so `updated_at` moves on them. That is
-- accepted rather than suppressed: the rows really were rewritten, nothing
-- reads that column as a content-change signal, and disabling the timestamp
-- trigger to hide it would be the bigger lie.

WITH RECURSIVE tree AS (
  SELECT l.id, 0::smallint AS depth
    FROM public.locations l
   WHERE l.parent_id IS NULL
  UNION ALL
  SELECT child.id, (t.depth + 1)::smallint
    FROM public.locations child
    JOIN tree t ON t.id = child.parent_id
)
UPDATE public.locations l
   SET depth = t.depth
  FROM tree t
 WHERE t.id = l.id
   AND l.depth IS DISTINCT FROM t.depth;

CREATE TRIGGER trg_set_location_depth
  BEFORE INSERT OR UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_location_depth();

COMMENT ON TRIGGER trg_set_location_depth ON public.locations IS
  'Keeps locations.depth equal to the ancestor-chain length: 0 when parent_id is NULL, parent.depth + 1 otherwise. Fires on every INSERT and UPDATE so the column cannot be forged from outside. LIMIT, stated so nobody assumes otherwise: a FOR EACH ROW trigger corrects the row it is handed and cannot re-depth that row''s descendants, so re-parenting a node that HAS descendants would leave their depth stale. Nothing does that — nothing above `site` is ever created or moved by the application, sync never reparents without a human widening the migration by hand, and the FI/FR cutover re-parents only sites, which are leaves. A future migration that reparents a non-leaf must re-run the recursive backfill in this file.';

-- ---------------------------------------------------------------------------
-- Backfill: country_code on site rows
-- ---------------------------------------------------------------------------
--
-- `country_code` is denormalized onto every row so country filtering needs no
-- recursion, and a site's is simply its parent's. The venue dialog has been
-- sending the parent's code since it shipped and the create route inserted it
-- as supplied — so today the value is CLIENT-supplied rather than absent, and
-- rows created before that dialog existed have none at all (production's single
-- site is one of them). The route stops trusting the client in this same
-- change; this corrects what is already stored.

UPDATE public.locations s
   SET country_code = p.country_code
  FROM public.locations p
 WHERE p.id = s.parent_id
   AND s.type = 'site'
   AND s.country_code IS DISTINCT FROM p.country_code;

-- ---------------------------------------------------------------------------
-- Assertions — a half-applied groundwork migration fails here, not in the app
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_wrong_depth  bigint;
  v_wrong_site   bigint;
BEGIN
  -- Every row's depth equals its real ancestor-chain length. A row unreachable
  -- from any root (a cycle) is absent from the walk and counted here too.
  WITH RECURSIVE tree AS (
    SELECT l.id, 0::smallint AS depth
      FROM public.locations l
     WHERE l.parent_id IS NULL
    UNION ALL
    SELECT child.id, (t.depth + 1)::smallint
      FROM public.locations child
      JOIN tree t ON t.id = child.parent_id
  )
  SELECT count(*) INTO v_wrong_depth
    FROM public.locations l
    LEFT JOIN tree t ON t.id = l.id
   WHERE t.id IS NULL OR t.depth <> l.depth;

  IF v_wrong_depth > 0 THEN
    RAISE EXCEPTION
      'locations.depth backfill: % row(s) do not match their ancestor-chain length (or sit outside the tree entirely)',
      v_wrong_depth;
  END IF;

  -- Every site carries its parent's country code. A parentless site would be a
  -- root row in the picker rather than a venue, so it fails here as well.
  SELECT count(*) INTO v_wrong_site
    FROM public.locations s
    LEFT JOIN public.locations p ON p.id = s.parent_id
   WHERE s.type = 'site'
     AND (s.parent_id IS NULL OR s.country_code IS DISTINCT FROM p.country_code);

  IF v_wrong_site > 0 THEN
    RAISE EXCEPTION
      'locations site country_code backfill: % site row(s) are parentless or disagree with their parent''s country_code',
      v_wrong_site;
  END IF;
END;
$$;
