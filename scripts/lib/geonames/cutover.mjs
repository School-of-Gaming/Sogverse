/**
 * The cutover bracket: what a country already seeded from a national
 * classification needs *around* the ordinary GeoNames seed statements so its
 * live references survive being reseeded from a different source.
 *
 * Nothing here knows which country it is writing for. It takes the ISO code and
 * the config's `levelOrder` and emits the same five sections every time, which
 * is the point — Finland and France go through the identical path, and any
 * future country that was seeded before GeoNames existed would too.
 *
 * ## Why a wipe needs a bracket at all
 *
 * `gedu_locations.location_id` is ON DELETE CASCADE and
 * `profiles.home_location_id` is ON DELETE SET NULL, so a bare DELETE of the
 * seeded tree silently erases every coverage claim and every family's chosen
 * place, with nothing in the log. That hazard is the whole reason ongoing sync
 * may never delete a location row — it retires them instead. The cutover is the
 * single sanctioned exception, and it earns that only by capturing what points
 * at the tree *before* the delete and re-pointing it after.
 *
 * `products.location_id` is the third foreign key and is deliberately untouched:
 * a product points at a `site`, sites are ours, and nothing here deletes one.
 *
 * ## The five sections, in the order they must run
 *
 *  1. **Capture** — the rows about to be wiped, and every reference into them,
 *     recorded as `(type, official code)` rather than as row ids. Ids are what
 *     the cutover throws away; the code is what survives a change of source,
 *     because GeoNames' admin-code columns supply the same official codes the
 *     national classifications did.
 *  2. **Detach & wipe** — sites lose their `parent_id` (they stay; they are the
 *     only rows in this tree a human created), then the seeded rows go
 *     bottom-up, because `parent_id` is ON DELETE RESTRICT.
 *  3. **Reseed** — the ordinary generator statements, unchanged. This is what
 *     makes the end state indistinguishable from a country added yesterday.
 *  4. **Re-point** — sites re-parented and claims re-inserted by the code join,
 *     with a `RAISE WARNING` naming anything that did not map. A site whose old
 *     parent has no counterpart is parked under the country row: never left
 *     NULL, because a NULL parent is the picker's root level and the venue
 *     would surface beside the countries, and never deleted, because a product
 *     may RESTRICT on it.
 *  5. **Assert** — restored references equal captured minus warned, no site is
 *     parentless, and the sites sitting under the country row are exactly the
 *     ones the warnings named.
 *
 * ## The one join, and why it is `IS NOT DISTINCT FROM`
 *
 * Every re-point runs the same join: `(country_code, type, external_code)`. A
 * country row carries no official code in any national classification, so its
 * captured code is NULL, and `IS NOT DISTINCT FROM` is what lets the single
 * join serve both cases — a country claim matching on `(country_code, type)`
 * alone, everything else matching on its code. Writing the country case as a
 * second statement would be a second thing to keep correct.
 *
 * A reference to a row that carries no code and is not a country cannot be
 * re-pointed at all; it falls out of the join and is named in the warning
 * report. That is expected to be empty in production and is accepted on
 * staging, whose location data is fake and explicitly disposable.
 */
import { sqlText } from "./sql.mjs";

/** Every type the wipe covers: the country row plus the config's seeded levels. */
function scopedTypes(levelOrder) {
  return ["country", ...levelOrder].map((type) => sqlText(type)).join(", ");
}

/**
 * Section 1 — capture, into temp tables that die with the transaction.
 *
 * Scoped to exactly the rows the wipe will remove. `site` rows are absent on
 * purpose: they survive, so a coverage tick on one never moves, and capturing
 * it would double-count the restored-reference assertion in section 5.
 */
export function capture(iso, levelOrder, title) {
  const country = sqlText(iso);
  return `-- ---------------------------------------------------------------------------
-- 1. CAPTURE — what is about to be wiped, and everything pointing into it
-- ---------------------------------------------------------------------------
--
-- References are recorded as (type, official code), never as row ids: the ids
-- are what this migration throws away, and the code is the one key that means
-- the same thing before and after a change of source.

-- Exactly the rows the wipe removes. \`site\` rows are deliberately not here —
-- they are ours, they stay, and a reference to one never moves.
CREATE TEMP TABLE cutover_scope ON COMMIT DROP AS
  SELECT l.id, l.type, l.name, l.external_code
    FROM public.locations l
   WHERE l.country_code = ${country}
     AND l.type IN (${scopedTypes(levelOrder)});

CREATE UNIQUE INDEX ON cutover_scope (id);

-- Each site's parent, as (type, official code). A country row's code is NULL —
-- see the module header for why one join still serves both shapes.
CREATE TEMP TABLE cutover_sites ON COMMIT DROP AS
  SELECT s.id           AS site_id,
         s.name         AS site_name,
         p.type         AS parent_type,
         p.external_code AS parent_code
    FROM public.locations s
    JOIN cutover_scope p ON p.id = s.parent_id
   WHERE s.type = 'site';

-- Every gedu coverage tick on a row being wiped. A tick on the country row
-- captures with a NULL code and re-points on (country_code, type).
--
-- DISTINCT because two scoped rows can share a (type, code) key only when both
-- carry NULL — two country rows, or two code-less rows a hand edit left behind.
-- Two claims that collapse to one key would re-insert as one row and violate
-- the join table's primary key; deduping here keeps the captured count equal to
-- the count section 5 asserts against.
CREATE TEMP TABLE cutover_gedu ON COMMIT DROP AS
  SELECT DISTINCT gl.gedu_id, s.type, s.external_code
    FROM public.gedu_locations gl
    JOIN cutover_scope s ON s.id = gl.location_id;

-- Every family whose own location is one of these rows. The column is ON DELETE
-- SET NULL, so without this the wipe would empty it with nothing to say so.
CREATE TEMP TABLE cutover_home ON COMMIT DROP AS
  SELECT p.id AS profile_id, s.type, s.external_code
    FROM public.profiles p
    JOIN cutover_scope s ON s.id = p.home_location_id;

-- A code-less row below country level can never be re-pointed, so anything
-- referencing one is lost before the wipe even runs. Named here rather than
-- only in section 4's report, because this is the point at which it is still
-- possible to stop and look.
--
-- The product check is the other half of that, and it is an EXCEPTION rather
-- than a warning. \`products.location_id\` is ON DELETE RESTRICT, and a product
-- may legitimately point above \`site\` — an online municipality club points at
-- the municipality that funds it — so such a row would abort the wipe several
-- statements from now as an opaque foreign-key violation. The cutover
-- deliberately does not move products (nothing here knows what a product's
-- location *means*, and the choice belongs to a human), so it says so here,
-- with the products named, while the database is still untouched.
DO $$
DECLARE
  v_names text;
  v_count integer;
BEGIN
  SELECT count(*), string_agg(format('%s %s', type, name), ', ' ORDER BY type, name)
    INTO v_count, v_names
    FROM cutover_scope
   WHERE type <> 'country' AND external_code IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING
      '${title} cutover: % scoped row(s) carry no official code, so nothing pointing at them can be re-pointed: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('product %s -> %s %s', p.id, s.type, s.name), ', ' ORDER BY p.id)
    INTO v_count, v_names
    FROM public.products p
    JOIN cutover_scope s ON s.id = p.location_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      '${title} cutover: % product(s) point above site level at a row this migration wipes, and products.location_id is ON DELETE RESTRICT: %. Re-point or clear them by hand first — a product''s location is a business decision, not one a data migration makes.',
      v_count, v_names;
  END IF;
END;
$$;
`;
}

/**
 * Section 2 — detach the sites, then delete the seeded rows bottom-up.
 *
 * Bottom-up because `parent_id` is ON DELETE RESTRICT: a region cannot go while
 * its municipalities are still there. The detach comes first for the same
 * reason, one level further down.
 */
export function wipe(iso, levelOrder, title) {
  const country = sqlText(iso);
  const deletes = [...levelOrder]
    .reverse()
    .concat("country")
    .map(
      (type) =>
        `DELETE FROM public.locations l\n  USING cutover_scope s\n WHERE l.id = s.id AND s.type = ${sqlText(type)};`,
    )
    .join("\n\n");

  return `-- ---------------------------------------------------------------------------
-- 2. DETACH & WIPE
-- ---------------------------------------------------------------------------
--
-- Sites are ours and stay; only their parentage goes, and section 4 gives it
-- back. Everything else is deleted bottom-up because \`parent_id\` is ON DELETE
-- RESTRICT — a region cannot leave while its municipalities are still under it.
--
-- \`gedu_locations\` CASCADEs and \`profiles.home_location_id\` SETs NULL as
-- these statements run. That is precisely why section 1 ran first.
--
-- \`products\` reference only \`site\` rows, so no product is touched here at all.

UPDATE public.locations s
   SET parent_id = NULL
 WHERE s.type = 'site'
   AND s.parent_id IN (SELECT id FROM cutover_scope);

${deletes}

DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.locations
   WHERE country_code = ${country}
     AND type IN (${scopedTypes(levelOrder)});

  IF v_left > 0 THEN
    RAISE EXCEPTION
      '${title} cutover: % seeded ${iso} row(s) survived the wipe — the reseed below would land on top of them',
      v_left;
  END IF;
END;
$$;
`;
}

/**
 * Section 4 — re-parent the sites, re-insert the claims, name what did not map.
 *
 * (Section 3 is the ordinary seed statements, emitted by the generator itself.)
 */
export function repoint(iso, levelOrder, title) {
  const country = sqlText(iso);
  /** The one join, written once. `n` is the new row, `c` the captured reference. */
  const match = (codeColumn) =>
    `    ON n.country_code = ${country}\n` +
    `   AND n.type = c.type\n` +
    `   AND n.external_code IS NOT DISTINCT FROM c.${codeColumn}`;

  return `-- ---------------------------------------------------------------------------
-- 4. RE-POINT — every captured reference, against the rows that replaced them
-- ---------------------------------------------------------------------------
--
-- One join throughout: (country_code, type, external_code), with
-- \`IS NOT DISTINCT FROM\` so a country-level reference — whose code is NULL,
-- because no national classification gives country rows one — matches on the
-- type alone.

-- Resolved first, into a table, because the same resolution answers three
-- questions: where each site goes, which sites had nowhere to go, and whether
-- the join was a function rather than a fan-out (asserted in section 5).
CREATE TEMP TABLE cutover_site_targets ON COMMIT DROP AS
  SELECT c.site_id, c.site_name, c.parent_type, c.parent_code, n.id AS new_parent_id
    FROM cutover_sites c
    LEFT JOIN public.locations n
      ON n.country_code = ${country}
     AND n.type = c.parent_type
     AND n.external_code IS NOT DISTINCT FROM c.parent_code;

UPDATE public.locations s
   SET parent_id = t.new_parent_id
  FROM cutover_site_targets t
 WHERE s.id = t.site_id
   AND t.new_parent_id IS NOT NULL;

-- A site whose old parent has no counterpart is parked under the country row.
-- Never NULL: a NULL parent is the picker's root level, so the venue would
-- surface beside the countries. Never deleted: a product may RESTRICT on it.
UPDATE public.locations s
   SET parent_id = c.id
  FROM cutover_site_targets t,
       public.locations c
 WHERE s.id = t.site_id
   AND t.new_parent_id IS NULL
   AND c.country_code = ${country}
   AND c.type = 'country';

INSERT INTO public.gedu_locations (gedu_id, location_id)
SELECT c.gedu_id, n.id
  FROM cutover_gedu c
  JOIN public.locations n
${match("external_code")};

UPDATE public.profiles p
   SET home_location_id = n.id
  FROM cutover_home c
  JOIN public.locations n
${match("external_code")}
 WHERE p.id = c.profile_id;

-- The warning report. Empty is the expected outcome in production; staging's
-- location data is fake and explicitly disposable, so losses there are named
-- and accepted rather than fixed.
DO $$
DECLARE
  v_count integer;
  v_names text;
BEGIN
  SELECT count(*), string_agg(format('%s (was under %s %s)', site_name, parent_type, coalesce(parent_code, '-')), ', ' ORDER BY site_name)
    INTO v_count, v_names
    FROM cutover_site_targets
   WHERE new_parent_id IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING
      '${title} cutover: % site(s) had no counterpart for their old parent and are parked under the ${iso} country row: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('gedu %s -> %s %s', c.gedu_id, c.type, coalesce(c.external_code, '-')), ', ' ORDER BY c.gedu_id, c.type)
    INTO v_count, v_names
    FROM cutover_gedu c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country}
        AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );

  IF v_count > 0 THEN
    RAISE WARNING
      '${title} cutover: % gedu coverage tick(s) had no counterpart and are gone: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('profile %s -> %s %s', c.profile_id, c.type, coalesce(c.external_code, '-')), ', ' ORDER BY c.profile_id)
    INTO v_count, v_names
    FROM cutover_home c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country}
        AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );

  IF v_count > 0 THEN
    RAISE WARNING
      '${title} cutover: % family location pick(s) had no counterpart and are now empty: %',
      v_count, v_names;
  END IF;
END;
$$;
`;
}

/**
 * Section 5 — the cutover's own assertions, on top of the seed gates.
 *
 * The seed gates say the new tree landed whole. These say nothing was lost on
 * the way across, and that every loss there was is one the report named.
 */
export function assertions(iso, levelOrder, title) {
  const country = sqlText(iso);
  const types = scopedTypes(levelOrder);
  return `-- ---------------------------------------------------------------------------
-- 5. ASSERT — nothing crossed silently
-- ---------------------------------------------------------------------------
--
-- The seed gates above already refused a tree that did not land whole. What is
-- left to prove is that every reference into the old tree either landed in the
-- new one or was named in a warning, and that no site was left somewhere a user
-- would meet it as a country.
DO $$
DECLARE
  v_sites          integer;
  v_targets        integer;
  v_captured       integer;
  v_lost           integer;
  v_restored       integer;
  v_expected       integer;
BEGIN
  -- The code join has to be a function, not a fan-out: one target row per
  -- captured site, or the UPDATE above picked an arbitrary parent.
  SELECT count(*) INTO v_sites   FROM cutover_sites;
  SELECT count(*) INTO v_targets FROM cutover_site_targets;

  IF v_targets <> v_sites THEN
    RAISE EXCEPTION
      '${title} cutover: % captured site(s) resolved to % target row(s) — the (type, external_code) join is not unique',
      v_sites, v_targets;
  END IF;

  -- Gedu coverage: restored = captured - warned. The wipe cascaded every old
  -- row away, so what is there now is exactly what section 4 re-inserted.
  SELECT count(*) INTO v_captured FROM cutover_gedu;
  SELECT count(*) INTO v_lost
    FROM cutover_gedu c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country} AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );
  SELECT count(*) INTO v_restored
    FROM public.gedu_locations gl
    JOIN public.locations n ON n.id = gl.location_id
   WHERE n.country_code = ${country} AND n.type IN (${types});

  IF v_restored <> v_captured - v_lost THEN
    RAISE EXCEPTION
      '${title} cutover: captured % gedu coverage tick(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- Family location picks, the same way.
  SELECT count(*) INTO v_captured FROM cutover_home;
  SELECT count(*) INTO v_lost
    FROM cutover_home c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country} AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );
  SELECT count(*) INTO v_restored
    FROM public.profiles p
    JOIN public.locations n ON n.id = p.home_location_id
   WHERE n.country_code = ${country} AND n.type IN (${types});

  IF v_restored <> v_captured - v_lost THEN
    RAISE EXCEPTION
      '${title} cutover: captured % family location pick(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- No site left at the picker's root.
  SELECT count(*) INTO v_restored
    FROM public.locations
   WHERE type = 'site' AND country_code = ${country} AND parent_id IS NULL;

  IF v_restored > 0 THEN
    RAISE EXCEPTION
      '${title} cutover: % ${iso} site(s) have no parent and would surface beside the countries',
      v_restored;
  END IF;

  -- The sites sitting directly under the country row are exactly the ones that
  -- had nowhere else to go, plus any that were already there before this ran —
  -- a site parked by an earlier reconciliation stays parked, and re-points to
  -- the new country row rather than counting as a fresh loss.
  SELECT count(*) INTO v_expected
    FROM cutover_site_targets
   WHERE new_parent_id IS NULL OR parent_type = 'country';
  SELECT count(*) INTO v_restored
    FROM public.locations s
    JOIN public.locations p ON p.id = s.parent_id
   WHERE s.type = 'site' AND s.country_code = ${country}
     AND p.type = 'country' AND p.country_code = ${country};

  IF v_restored <> v_expected THEN
    RAISE EXCEPTION
      '${title} cutover: % ${iso} site(s) sit directly under the country row, expected % (the warned set)',
      v_restored, v_expected;
  END IF;
END;
$$;
`;
}
