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
 * Three foreign keys point into the tree, and each fails a bare DELETE in its
 * own way. `gedu_locations.location_id` is ON DELETE CASCADE and
 * `profiles.home_location_id` is ON DELETE SET NULL, so a bare wipe silently
 * erases every coverage claim and every family's chosen place, with nothing in
 * the log. `products.location_id` is ON DELETE RESTRICT, and a product may
 * legitimately point above `site` — an online municipality club points at the
 * municipality that funds it — so a bare wipe simply aborts, several statements
 * in, as an opaque foreign-key violation. That hazard is the whole reason
 * ongoing sync may never delete a location row — it retires them instead. The
 * cutover is the single sanctioned exception, and it earns that only by
 * capturing everything that points at the tree *before* the delete and
 * re-pointing it after.
 *
 * ## The country row is adopted in place, never wiped
 *
 * The levels below it are deleted and reseeded; the country row itself is
 * UPDATEd to its GeoNames identity (geonames_id, resolved name, name_i18n) and
 * keeps its uuid. Two things force that, both RESTRICT-shaped:
 *
 *   - Products pointing at rows the wipe removes have to point *somewhere*
 *     while the old rows go and before the new ones exist —
 *     `products.location_id` is NOT NULL for the shapes that carry one, so
 *     there is no "detach" for products the way there is for sites. The
 *     surviving country row is the one place a product may legally wait (the
 *     products trigger permits a country row for the online shapes), and it can
 *     only survive if it is not wiped.
 *   - The old and the new tree cannot coexist even briefly: `external_code` is
 *     unique per (country, type), so the new rows cannot be inserted before the
 *     old ones are gone. Adoption is what breaks the cycle — one row stands
 *     still while everything around it is exchanged.
 *
 * What adoption buys for free: every reference *to* the country row — a gedu's
 * whole-country claim, a family pick, a product anchored there by pre-trigger
 * legacy, a site parked under it by an earlier reconciliation — simply
 * survives, uncaptured and untouched. A country row carries no official code in
 * any national classification anyway; its identity *is* its (country_code,
 * type) key, so adopting it does not leave a row that predates its source in
 * any sense that matters — every value on it after adoption is GeoNames'.
 *
 * The seed's own country INSERT still runs and is guarded on exactly the keys
 * adoption satisfies, so it no-ops after an adoption and seeds the row from
 * scratch on a database that never had one (CI's from-scratch build wipes rows
 * seeded minutes earlier; the guard makes both paths land identically).
 *
 * ## The five sections, in the order they must run
 *
 *  1. **Capture** — the rows about to be wiped, and every reference into them,
 *     recorded as `(type, official code)` rather than as row ids. Ids are what
 *     the cutover throws away; the code is what survives a change of source,
 *     because GeoNames' admin-code columns supply the same official codes the
 *     national classifications did. It also asks the two questions that are
 *     only answerable while the tree is intact: is there exactly one country
 *     row to adopt and park on, and is every captured product a shape the park
 *     is legal for. Both raise rather than warn — they are faults in the data
 *     the cutover is about to move, not losses it can name and carry on from.
 *  2. **Detach, park & wipe** — sites lose their `parent_id` (they stay; they
 *     are the only rows in this tree a human created), products are parked on
 *     the country row, then the seeded level rows go bottom-up, because
 *     `parent_id` is ON DELETE RESTRICT.
 *  3. **Adopt & reseed** — the country row takes its GeoNames identity, then
 *     the ordinary generator statements run unchanged. This is what makes the
 *     end state indistinguishable from a country added yesterday.
 *  4. **Re-point** — sites re-parented, claims re-inserted and products moved
 *     off the country row, all by the code join, with a `RAISE WARNING` naming
 *     anything that did not map. A site whose old parent has no counterpart is
 *     parked under the country row: never left NULL, because a NULL parent is
 *     the picker's root level and the venue would surface beside the countries,
 *     and never deleted, because a product may RESTRICT on it. A product whose
 *     old row has no counterpart stays parked the same way, for the same
 *     reasons — visible, named, and legal where it stands.
 *  5. **Assert** — restored references equal captured minus warned, no site is
 *     parentless, and the sites and products sitting on the country row are
 *     exactly the pre-existing ones plus the ones the warnings named.
 *
 * ## The one join, and why it is `IS NOT DISTINCT FROM`
 *
 * Every re-point runs the same join: `(country_code, type, external_code)`.
 * The captured references are all to level rows — country-row references
 * survive adoption untouched, so nothing captures them — but a level row a
 * hand edit left code-less captures NULL, and `IS NOT DISTINCT FROM` keeps the
 * join total rather than silently dropping such a row from the report. A
 * reference to a code-less non-country row cannot be re-pointed at all; it
 * falls out of the join and is named in the warning report. That is expected to
 * be empty in production and is accepted on staging, whose location data is
 * fake and explicitly disposable.
 *
 * One sharp edge, stated rather than hidden: every product write here runs the
 * products location trigger, and a relic product whose own shape contradicts
 * where it points would fail on it. The trigger's message names the rule and
 * not the row, and by the park in section 2 the tree is already half gone — so
 * section 1 asks the question first, while everything is still intact, and
 * raises its own exception naming each offending product. What is left for the
 * trigger to catch is a shape section 1 could not have known about, which is
 * the outcome that genuinely wants a human.
 */
import { sqlBigint, sqlJsonb, sqlText } from "./sql.mjs";

/** The level types the wipe covers. The country row is adopted, never wiped. */
function levelTypes(levelOrder) {
  return levelOrder.map((type) => sqlText(type)).join(", ");
}

/**
 * Section 1 — capture, into temp tables that die with the transaction.
 *
 * Scoped to exactly the rows the wipe will remove: the seeded levels, never the
 * country row (adopted in place, so references to it survive on their own) and
 * never `site` rows (they survive too, so a coverage tick on one never moves,
 * and capturing either would double-count the restored-reference assertions in
 * section 5).
 */
export function capture(iso, levelOrder, sqlTitle) {
  const country = sqlText(iso);
  return `-- ---------------------------------------------------------------------------
-- 1. CAPTURE — what is about to be wiped, and everything pointing into it
-- ---------------------------------------------------------------------------
--
-- References are recorded as (type, official code), never as row ids: the ids
-- are what this migration throws away, and the code is the one key that means
-- the same thing before and after a change of source.
--
-- The country row is not in scope: it is adopted in place by section 3, so a
-- reference to it — a whole-country coverage claim, a family pick, a product
-- anchored there, a site parked under it — survives without being captured.
-- \`site\` rows are not in scope either: they are ours, they stay, and a
-- reference to one never moves.

CREATE TEMP TABLE cutover_scope ON COMMIT DROP AS
  SELECT l.id, l.type, l.name, l.external_code
    FROM public.locations l
   WHERE l.country_code = ${country}
     AND l.type IN (${levelTypes(levelOrder)});

CREATE UNIQUE INDEX ON cutover_scope (id);

-- The country row itself, with the two counts section 5 needs to tell "parked
-- by this migration, and warned about" from "already sitting there before it
-- ran". One row, or none on a database that never had this country.
CREATE TEMP TABLE cutover_country ON COMMIT DROP AS
  SELECT c.id,
         (SELECT count(*) FROM public.products p WHERE p.location_id = c.id)  AS pre_products,
         (SELECT count(*) FROM public.locations s
           WHERE s.type = 'site' AND s.parent_id = c.id)                      AS pre_sites
    FROM public.locations c
   WHERE c.country_code = ${country} AND c.type = 'country';

-- Exactly one country row, or none — asserted here, before anything is
-- touched. Three things downstream assume it and none of them says so when it
-- is false: the product park in section 2 is a scalar subquery over this
-- table, adoption in section 3 updates every row it joins, and the arithmetic
-- in section 5 sums \`pre_products\` across it. A second ${iso} country row is a
-- data fault a human has to resolve before a cutover means anything, and the
-- ids are named so they can be looked at.
DO $$
DECLARE
  v_count integer;
  v_ids   text;
BEGIN
  SELECT count(*), string_agg(id::text, ', ' ORDER BY id)
    INTO v_count, v_ids
    FROM cutover_country;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % rows claim to be the ${iso} country row (%). Adoption, the product park and the assertions in section 5 each assume exactly one — resolve the duplicates by hand first.',
      v_count, v_ids;
  END IF;
END;
$$;

-- Each site's parent, as (type, official code).
CREATE TEMP TABLE cutover_sites ON COMMIT DROP AS
  SELECT s.id           AS site_id,
         s.name         AS site_name,
         p.type         AS parent_type,
         p.external_code AS parent_code
    FROM public.locations s
    JOIN cutover_scope p ON p.id = s.parent_id
   WHERE s.type = 'site';

-- Every gedu coverage tick on a row being wiped. Claims on the country row
-- survive adoption and are deliberately absent here — capturing one would
-- re-insert a pair that still exists and violate the join table's primary key.
--
-- One row per tick, NOT DISTINCT. Two scoped rows can share a (type, code) key
-- only when both carry NULL — code-less rows a hand edit left behind — and a
-- gedu who ticked both has lost two claims, not one. Deduping here would report
-- one and let the other disappear unnamed. The de-duplication that is actually
-- needed lives on the re-insert in section 4, where it stops two keys that
-- resolve to one row from violating the join table's primary key; the loss
-- arithmetic in section 5 counts ticks, and both sides of it count them the
-- same way.
CREATE TEMP TABLE cutover_gedu ON COMMIT DROP AS
  SELECT gl.gedu_id, s.type, s.external_code
    FROM public.gedu_locations gl
    JOIN cutover_scope s ON s.id = gl.location_id;

-- Every family whose own location is one of these rows. The column is ON DELETE
-- SET NULL, so without this the wipe would empty it with nothing to say so.
CREATE TEMP TABLE cutover_home ON COMMIT DROP AS
  SELECT p.id AS profile_id, s.type, s.external_code
    FROM public.profiles p
    JOIN cutover_scope s ON s.id = p.home_location_id;

-- Every product anchored to a row being wiped. An online municipality club
-- legitimately points at the municipality that funds it, and
-- \`products.location_id\` is ON DELETE RESTRICT with NOT NULL for the shapes
-- that carry one — so unlike sites there is no detach: section 2 parks these
-- on the country row while the trees are exchanged, and section 4 puts them
-- back by the same code join as everything else.
-- \`is_remote\` and \`product_type\` ride along because the park is only legal
-- for the shapes the products trigger lets sit above site level; the check
-- below is what turns the illegal case into a named failure here instead of an
-- opaque one three statements later.
CREATE TEMP TABLE cutover_products ON COMMIT DROP AS
  SELECT p.id AS product_id, p.is_remote, p.product_type, s.type, s.external_code
    FROM public.products p
    JOIN cutover_scope s ON s.id = p.location_id;

-- A product whose own shape forbids where this migration would have to put it.
-- Two such shapes, failing at two different moments, both refused here by name
-- while the old tree is still standing and the row can still be described.
--
-- Everything in cutover_products points at a level row rather than a site —
-- that is what being in scope means — so an **in-person** product in here
-- already contradicts the trigger, which requires \`location_id\` to be a site
-- whenever \`is_remote\` is false. It is a relic from before the trigger existed,
-- and section 2's park would abort on it with the trigger's own message and no
-- clue as to which row caused it.
--
-- An **online municipality club** is allowed above site level, but only on a
-- country, a region or a municipality. One anchored to any other level passes
-- the park — the country row is legal for it — and then aborts in section 4's
-- re-point, after the wipe, with the trigger naming a level rather than a
-- product and the tree it came from already gone.
DO $$
DECLARE
  v_names text;
  v_count integer;
BEGIN
  SELECT count(*), string_agg(format('%s (%s, now under %s %s)', product_id, product_type, type, coalesce(external_code, '-')), ', ' ORDER BY product_id)
    INTO v_count, v_names
    FROM cutover_products
   WHERE NOT is_remote
      OR (is_remote
          AND product_type = 'municipality_club'
          AND type NOT IN ('country', 'region', 'municipality'));

  IF v_count > 0 THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % product(s) are anchored to a level their own shape forbids, so the ${iso} cutover cannot park them and put them back: %. An in-person product needs a site; an online municipality club needs a country, region or municipality. Fix each one before running this migration.',
      v_count, v_names;
  END IF;
END;
$$;

-- A code-less row below country level can never be re-pointed, so anything
-- referencing one is lost before the wipe even runs. Named here rather than
-- only in section 4's report, because this is the point at which it is still
-- possible to stop and look.
DO $$
DECLARE
  v_names text;
  v_count integer;
BEGIN
  SELECT count(*), string_agg(format('%s %s', type, name), ', ' ORDER BY type, name)
    INTO v_count, v_names
    FROM cutover_scope
   WHERE external_code IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING
      '${sqlTitle} cutover: % scoped row(s) carry no official code, so nothing pointing at them can be re-pointed: %',
      v_count, v_names;
  END IF;
END;
$$;
`;
}

/**
 * Section 2 — detach the sites, park the products, then delete the seeded
 * level rows bottom-up.
 *
 * Bottom-up because `parent_id` is ON DELETE RESTRICT: a region cannot go while
 * its municipalities are still there. The detach and the park come first for
 * the same reason, one foreign key each.
 */
export function wipe(iso, levelOrder, sqlTitle) {
  const country = sqlText(iso);
  const deletes = [...levelOrder]
    .reverse()
    .map(
      (type) =>
        `DELETE FROM public.locations l\n  USING cutover_scope s\n WHERE l.id = s.id AND s.type = ${sqlText(type)};`,
    )
    .join("\n\n");

  return `-- ---------------------------------------------------------------------------
-- 2. DETACH, PARK & WIPE
-- ---------------------------------------------------------------------------
--
-- Sites are ours and stay; only their parentage goes, and section 4 gives it
-- back. Products cannot be detached — their column is NOT NULL where it is
-- carried at all — so they wait on the country row, which the products trigger
-- permits for the shapes that point above site level, and section 4 moves them
-- on. Everything else is deleted bottom-up because \`parent_id\` is ON DELETE
-- RESTRICT — a region cannot leave while its municipalities are still under it.
-- The country row is not deleted: section 3 adopts it in place.
--
-- \`gedu_locations\` CASCADEs and \`profiles.home_location_id\` SETs NULL as
-- these statements run. That is precisely why section 1 ran first.

UPDATE public.locations s
   SET parent_id = NULL
 WHERE s.type = 'site'
   AND s.parent_id IN (SELECT id FROM cutover_scope);

UPDATE public.products p
   SET location_id = (SELECT id FROM cutover_country)
 WHERE p.id IN (SELECT product_id FROM cutover_products);

${deletes}

DO $$
DECLARE
  v_left integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.locations
   WHERE country_code = ${country}
     AND type IN (${levelTypes(levelOrder)});

  IF v_left > 0 THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % seeded ${iso} row(s) survived the wipe — the reseed below would land on top of them',
      v_left;
  END IF;
END;
$$;
`;
}

/**
 * Section 3's opening — adopt the country row in place.
 *
 * (The rest of section 3 is the ordinary seed statements, emitted by the
 * generator itself; the seed's own country INSERT is guarded on exactly the
 * keys this UPDATE satisfies, so it no-ops after an adoption and creates the
 * row from scratch on a database that never had one.)
 */
export function adopt(iso, countryRow, sqlTitle) {
  const country = sqlText(iso);
  return `-- ---------------------------------------------------------------------------
-- 3. ADOPT & RESEED
-- ---------------------------------------------------------------------------
--
-- The country row keeps its uuid and takes its GeoNames identity — the same
-- values, from the same resolution, as the guarded INSERT below would write on
-- a database that had no row to adopt. Everything pointing at it (whole-country
-- claims, family picks, parked sites, and the products section 2 parked)
-- survives this statement untouched, which is the point of adopting rather
-- than wiping: a country row's identity is its (country_code, type) key, and
-- after this UPDATE every value on it is GeoNames'.

UPDATE public.locations l
   SET geonames_id   = ${sqlBigint(countryRow.geonameid)},
       name          = ${sqlText(countryRow.name)},
       name_i18n     = ${sqlJsonb(countryRow.nameI18n)},
       external_code = NULL
  FROM cutover_country c
 WHERE l.id = c.id;

DO $$
BEGIN
  IF (SELECT count(*) FROM cutover_country) = 1
     AND NOT EXISTS (
       SELECT 1 FROM public.locations
        WHERE country_code = ${country} AND type = 'country'
          AND geonames_id = ${sqlBigint(countryRow.geonameid)}
     ) THEN
    RAISE EXCEPTION '${sqlTitle} cutover: the ${iso} country row did not take its GeoNames identity';
  END IF;
END;
$$;
`;
}

/**
 * Section 4 — re-parent the sites, re-insert the claims, move the products off
 * the country row, name what did not map.
 */
export function repoint(iso, levelOrder, sqlTitle) {
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
-- \`IS NOT DISTINCT FROM\` so a code-less captured row still reaches the warning
-- report instead of silently vanishing from the join.

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
       cutover_country c
 WHERE s.id = t.site_id
   AND t.new_parent_id IS NULL;

-- DISTINCT here and nowhere else: two captured ticks can resolve to one new
-- row, and re-inserting that pair twice would violate the join table's primary
-- key. The capture stays one row per tick, so the loss report and section 5's
-- arithmetic both count what the gedu actually lost.
INSERT INTO public.gedu_locations (gedu_id, location_id)
SELECT DISTINCT c.gedu_id, n.id
  FROM cutover_gedu c
  JOIN public.locations n
${match("external_code")};

UPDATE public.profiles p
   SET home_location_id = n.id
  FROM cutover_home c
  JOIN public.locations n
${match("external_code")}
 WHERE p.id = c.profile_id;

-- Products, off the country row and back onto their captured (type, code).
-- This UPDATE runs the products location trigger, so a relic product whose
-- captured type its own shape forbids fails here with the trigger's message —
-- the correct, named outcome for a row that needs a human. One that maps to
-- nothing stays parked on the country row: legal where it stands, named below.
UPDATE public.products p
   SET location_id = n.id
  FROM cutover_products c
  JOIN public.locations n
${match("external_code")}
 WHERE p.id = c.product_id;

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
      '${sqlTitle} cutover: % site(s) had no counterpart for their old parent and are parked under the ${iso} country row: %',
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
      '${sqlTitle} cutover: % gedu coverage tick(s) had no counterpart and are gone: %',
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
      '${sqlTitle} cutover: % family location pick(s) had no counterpart and are now empty: %',
      v_count, v_names;
  END IF;

  SELECT count(*), string_agg(format('product %s -> %s %s', c.product_id, c.type, coalesce(c.external_code, '-')), ', ' ORDER BY c.product_id)
    INTO v_count, v_names
    FROM cutover_products c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country}
        AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );

  IF v_count > 0 THEN
    RAISE WARNING
      '${sqlTitle} cutover: % product(s) had no counterpart and are parked on the ${iso} country row — re-point them by hand: %',
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
export function assertions(iso, levelOrder, sqlTitle) {
  const country = sqlText(iso);
  const types = levelTypes(levelOrder);
  return `-- ---------------------------------------------------------------------------
-- 5. ASSERT — nothing crossed silently
-- ---------------------------------------------------------------------------
--
-- The seed gates above already refused a tree that did not land whole. What is
-- left to prove is that every reference into the old tree either landed in the
-- new one or was named in a warning, and that no site or product was left
-- somewhere the warnings did not say.
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
      '${sqlTitle} cutover: % captured site(s) resolved to % target row(s) — the (type, external_code) join is not unique',
      v_sites, v_targets;
  END IF;

  -- Gedu coverage: restored = captured - warned, counted over the level rows
  -- only — claims on the country row survived adoption uncaptured, so they are
  -- outside both sides of this equation.
  --
  -- Captured counts ticks and restored counts rows, and the two agree because
  -- the only way two ticks collapse into one row is two scoped rows sharing a
  -- (type, code) key — which they can do only when both codes are NULL. Where
  -- every level row of the reseeded tree carries a code, as Finland's and
  -- France's do, a NULL key resolves to nothing at all: both such ticks are
  -- counted as lost, by both sides, and the equation holds.
  --
  -- That premise is about the country, not about the join, and a country whose
  -- reseeded level rows are themselves code-less breaks it in the other
  -- direction. \`IS NOT DISTINCT FROM\` matches NULL to NULL, so a code-less
  -- captured tick fans out to *every* code-less row of its type and the INSERT
  -- above restores more than was ever captured. Nothing here prevents that; the
  -- comparison below catches it — restored far exceeds captured - lost, and the
  -- migration aborts. That is the right outcome: such a country needs a key
  -- this join does not have, and finding out loudly beats a silent fan-out.
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
      '${sqlTitle} cutover: captured % gedu coverage tick(s), warned about %, but % came back',
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
      '${sqlTitle} cutover: captured % family location pick(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- Products: restored = captured - warned, over the level rows; the warned
  -- remainder is still parked on the country row and is counted just below.
  SELECT count(*) INTO v_captured FROM cutover_products;
  SELECT count(*) INTO v_lost
    FROM cutover_products c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.locations n
      WHERE n.country_code = ${country} AND n.type = c.type
        AND n.external_code IS NOT DISTINCT FROM c.external_code
   );
  SELECT count(*) INTO v_restored
    FROM public.products p
    JOIN public.locations n ON n.id = p.location_id
   WHERE n.country_code = ${country} AND n.type IN (${types});

  IF v_restored <> v_captured - v_lost THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: captured % product(s), warned about %, but % came back',
      v_captured, v_lost, v_restored;
  END IF;

  -- The products on the country row are exactly the ones that were already
  -- there before this ran plus the warned set — nothing else drifted onto it.
  SELECT coalesce(sum(pre_products), 0) + v_lost INTO v_expected FROM cutover_country;
  SELECT count(*) INTO v_restored
    FROM public.products p
    JOIN cutover_country c ON c.id = p.location_id;

  IF v_restored <> v_expected THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % product(s) sit on the ${iso} country row, expected % (pre-existing plus the warned set)',
      v_restored, v_expected;
  END IF;

  -- No site left at the picker's root.
  SELECT count(*) INTO v_restored
    FROM public.locations
   WHERE type = 'site' AND country_code = ${country} AND parent_id IS NULL;

  IF v_restored > 0 THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % ${iso} site(s) have no parent and would surface beside the countries',
      v_restored;
  END IF;

  -- The sites sitting directly under the country row are exactly the ones that
  -- were already parked there before this ran — their parent survived, so they
  -- were never captured — plus the ones the warnings named.
  SELECT count(*) INTO v_lost
    FROM cutover_site_targets
   WHERE new_parent_id IS NULL;
  SELECT coalesce(sum(pre_sites), 0) + v_lost INTO v_expected FROM cutover_country;
  SELECT count(*) INTO v_restored
    FROM public.locations s
    JOIN cutover_country c ON c.id = s.parent_id
   WHERE s.type = 'site';

  IF v_restored <> v_expected THEN
    RAISE EXCEPTION
      '${sqlTitle} cutover: % ${iso} site(s) sit directly under the country row, expected % (pre-existing plus the warned set)',
      v_restored, v_expected;
  END IF;
END;
$$;
`;
}
