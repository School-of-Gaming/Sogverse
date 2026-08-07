/**
 * Emits one country's postal-code seed migration.
 *
 *   node scripts/generate-postal-seed.mjs FI
 *   node scripts/generate-postal-seed.mjs FR
 *
 * The sibling of `generate-geonames-seed.mjs`, and deliberately a *separate*
 * script over a separate table, because postal data lives under different rules
 * from geography:
 *
 *   - **Nothing references a postal row.** No product, no gedu coverage claim,
 *     no family location pick — every foreign key runs the other way. So a
 *     refresh here is a plain DELETE-then-INSERT for the country, where a
 *     geography refresh may never delete at all (`gedu_locations.location_id` is
 *     ON DELETE CASCADE and a delete erases a gedu's coverage silently). Postal
 *     data can therefore track upstream freely; the tree cannot.
 *   - **A postal row is a key, not a place.** It carries no name, no parent, no
 *     depth and nothing anyone browses. It exists so a parent can type "00100"
 *     instead of walking Finland → Uusimaa → Helsinki.
 *
 * ## What it emits
 *
 * One data-only migration per country: a DELETE scoped to that country, then
 * chunked INSERTs that resolve `location_id` by joining
 * `(country_code, type = 'municipality', external_code)`, then an assertion
 * block restating the generator's own gates in SQL. Upstream codes naming a
 * municipality we do not carry are dropped by that join on purpose and are
 * *reported here*, never failed on — see the module header in
 * `scripts/lib/geonames/postal.mjs` for why that asymmetry is deliberate.
 *
 * ## Determinism
 *
 * Same story as the geography generator, for the same reasons: rows are sorted
 * by `(municipality code, postal code)`, chunking is fixed, downloads are cached
 * and reused (`GEONAMES_REFRESH=1` forces a refresh), and the only date written
 * is the source file's own publication date. La Poste's export carries no
 * archive either, so the committed migration is the reviewable snapshot of
 * record.
 *
 * ## Never regenerate an applied migration
 *
 * It is history the moment it is pushed. A newer source is a NEW migration —
 * which for this table is cheap precisely because nothing references it.
 */
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fail } from "./lib/geonames/cache.mjs";
import { countryConfig } from "./lib/geonames/config.mjs";
import { ingestCountry } from "./lib/geonames/ingest.mjs";
import { ingestPostal } from "./lib/geonames/postal.mjs";
import { sqlText } from "./lib/geonames/sql.mjs";

/**
 * The migration each country's postal seed lands in. Literals for the same
 * reason the geography generator's map is: a migration number is chosen once by
 * a human against *remote* migration history — an already-used version is
 * silently treated as applied — and never inferred from a directory listing,
 * which would mint a second file on a rerun.
 */
const MIGRATIONS = {
  FI: "00163_seed_finland_postal_codes.sql",
  FR: "00164_seed_france_postal_codes.sql",
};

const TITLES = { FI: "Finland", FR: "France", SE: "Sweden", GB: "the United Kingdom" };

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

/**
 * Rows per INSERT statement. Matches the geography generator's, and for the
 * same reason: large enough that a small country emits one statement, small
 * enough that France's ~39,000 pairs stay readable as diff hunks. The value is
 * load-bearing for determinism — statement boundaries must land in the same
 * places on every run.
 */
const CHUNK_SIZE = 2000;

/* -------------------------------------------------------------------- setup */

const args = process.argv.slice(2);
const unknownFlag = args.find((arg) => arg.startsWith("--"));
if (unknownFlag) fail(`Unknown flag ${unknownFlag}. This generator takes a country code and nothing else.`);
const iso = args[0]?.toUpperCase();
if (!iso) fail("Usage: node scripts/generate-postal-seed.mjs <CC>   (e.g. FI, FR)");

const migrationFile = MIGRATIONS[iso];
if (!migrationFile) {
  fail(
    `No postal migration file name recorded for ${iso}. Pick the next free migration number — ` +
      `checked against remote migration history first — and add it to MIGRATIONS in ` +
      `scripts/generate-postal-seed.mjs.`,
  );
}

const config = countryConfig(iso);
const title = TITLES[iso] ?? iso;
const ingested = await ingestCountry(config);
const postal = await ingestPostal(config, ingested);

/* --------------------------------------------------------------------- emit */

function header() {
  const fileList = postal.files
    .map((file) => `--   ${file.source}\n--     ${file.rows.toLocaleString("en-US")} rows, published ${file.published}`)
    .join("\n");

  const sourceNote =
    config.postal.source === "laposte"
      ? `-- SOURCE: LA POSTE, NOT GEONAMES
--
-- ${title} is the one country whose postal source is overridden, and the reason
-- is structural rather than a matter of quality: GeoNames' French postal file
-- carries the département+arrondissement code (751, 772…) in its third admin
-- column rather than the commune INSEE code, so it joins 0 of ~34,900 communes
-- and no amount of upstream healing would change that. La Poste's Base
-- officielle des codes postaux keys on \`code_commune_insee\`, which is exactly
-- the code \`locations.external_code\` holds.
--
-- Licence Ouverte 2.0 (La Poste), which requires source credit and does not
-- restrict commercial use. The public attribution surface names it.
--
-- THE PARIS / LYON / MARSEILLE ROLLUP
--
-- La Poste keys those three cities by *arrondissement* (75101–75120,
-- 69381–69389, 13201–13216) where the COG has one commune each (75056, 69123,
-- 13055). ${postal.stats.rolledUp} source rows were rewritten through the fixed 45-code map in
-- scripts/lib/geonames/config.mjs before the join. The map is enumerated as
-- config data because it is derivable from neither file.
--`
      : `-- SOURCE: GEONAMES POSTAL DUMPS
--
-- CC BY 4.0, republished daily by download.geonames.org. The municipality code
-- moves between admin columns from file to file — mainland ${title}'s kunta code
-- is in admin code 3 and Åland's, a separate file for the same country, is in
-- admin code 2 — so the column is declared per file in
-- scripts/lib/geonames/config.mjs rather than guessed here.
--`;

  const unmatchedNote =
    postal.unmatched.length === 0
      ? `-- Every upstream code resolved to a municipality this tree carries.\n--\n`
      : `-- ${postal.unmatched.length} upstream municipality code(s) name no row in this tree, so their
-- ${postal.unmatched.reduce((sum, entry) => sum + entry.postalCodes.length, 0)} postal code(s) are simply not seeded. This is REPORTED, never failed
-- on, and the list is worth reading because it holds two different facts. Some
-- are upstream lag: a code the postal source has and the geography does not
-- yet, or a place the geography still files under a code the classification
-- retired. Failing on those would make postal ingestion hostage to the
-- geography's currency, which heals on somebody else's schedule. The rest are
-- places that are not this country's tree at all — a postal operator routes mail
-- to territories that are their own ISO countries and their own GeoNames files,
-- and this country's \`isoFiles\` deliberately does not include them. Each one:
${postal.unmatched
  .map(
    (entry) =>
      `--   ${entry.municipalityCode}${entry.placeName === "" ? "" : ` (${entry.placeName})`}: ` +
      `${entry.postalCodes.slice(0, 6).join(", ")}${entry.postalCodes.length > 6 ? `, … ${entry.postalCodes.length - 6} more` : ""}`,
  )
  .join("\n")}
--\n`;

  const uncoveredNote =
    postal.uncovered.length === 0
      ? `-- Coverage is complete: all ${postal.stats.municipalities.toLocaleString("en-US")} sourced municipalities carry at least one code.\n--\n`
      : `-- ${postal.uncovered.length} of ${postal.stats.municipalities.toLocaleString("en-US")} sourced municipalities carry NO postal code
-- (coverage ${(postal.coverage * 100).toFixed(4)}%, floor ${(config.postal.minCoverage * 100).toFixed(4)}%):
${postal.uncovered
  .slice(0, 12)
  .map((row) => `--   ${row.externalCode} ${row.name}`)
  .join("\n")}${postal.uncovered.length > 12 ? `\n--   … and ${postal.uncovered.length - 12} more` : ""}
--\n`;

  return `-- Seeds ${title}'s postal codes: ${postal.rows.length.toLocaleString("en-US")} (code, municipality) rows over ${postal.stats.distinctCodes.toLocaleString("en-US")} distinct codes.
--
-- A postal code is an alternative KEY onto a municipality that already exists,
-- never a level of the hierarchy. Rows land by joining
-- (country_code, type = 'municipality', external_code) — the official
-- statistical code, which GeoNames' admin-code columns supply — so this
-- migration depends on ${title}'s location tree having been seeded, which
-- migration ordering guarantees.
--
-- REBUILDABLE, WHICH THE TREE IS NOT
--
-- Nothing references a postal row, so this migration opens by DELETEing the
-- country's rows outright and reinserting them. That is the whole difference
-- from \`locations\`, where \`gedu_locations.location_id\` is ON DELETE CASCADE
-- and a delete erases a gedu's coverage claim silently — which is why the
-- geography may only insert, rename, code-correct and retire. The hazard is not
-- present here, so the discipline is not either.
--
-- READ FROM
--
${fileList}
--
${sourceNote}
${uncoveredNote}${unmatchedNote}-- REGENERATING
--
--   node scripts/generate-postal-seed.mjs ${iso}
--
-- Deterministic against the same downloaded snapshot: rows are sorted by
-- (municipality code, postal code), the ${CHUNK_SIZE}-row chunking is fixed, and nothing
-- run-dependent is written. Neither source publishes an archive, so this
-- committed file is the reviewable snapshot of record. Rerun it only to
-- reproduce or review that snapshot — a newer source is a NEW migration, which
-- for this table is cheap precisely because nothing references it.
--
-- Data-only migration: no schema change, no type change, no grant change.
`;
}

/**
 * One chunked INSERT. The join is the whole statement: an upstream code naming
 * no municipality contributes no row and raises nothing, which is the SQL-side
 * expression of "report unmatched codes, never fail on them".
 */
function insertStatement(chunk, index, total) {
  const range =
    total > chunk.length
      ? `Codes ${index * CHUNK_SIZE + 1}–${index * CHUNK_SIZE + chunk.length} of ${total}`
      : `All ${total} codes`;

  const values = chunk
    .map((row) => `    (${sqlText(row.postalCode)}, ${sqlText(row.municipalityCode)})`)
    .join(",\n");

  return (
    `-- ${range}.\n` +
    `INSERT INTO public.postal_codes (country_code, postal_code, location_id)\n` +
    `SELECT ${sqlText(iso)}, v.postal_code, l.id\n` +
    `FROM (VALUES\n${values}\n` +
    `) AS v(postal_code, municipality_code)\n` +
    `JOIN public.locations l\n` +
    `  ON l.country_code = ${sqlText(iso)}\n` +
    ` AND l.type = 'municipality'\n` +
    ` AND l.external_code = v.municipality_code;\n`
  );
}

function assertions() {
  return `-- Fail the migration if the seed did not land whole.
--
-- The generator's gates ran against the source files; these restate them
-- against the database, because this file can be applied by hand long after
-- that run. Counts are exact rather than "at least": a surplus means rows exist
-- this seed does not explain, and that wants a human.
DO $$
DECLARE
  n_rows      bigint;
  n_codes     bigint;
  n_munis     bigint;
  n_uncovered bigint;
BEGIN
  SELECT count(*) INTO n_rows
    FROM public.postal_codes
   WHERE country_code = ${sqlText(iso)};

  IF n_rows <> ${postal.rows.length} THEN
    RAISE EXCEPTION
      '${title} postal seed: expected ${postal.rows.length} rows for ${iso}, found %. A shortfall means the municipality join lost rows the generator matched; a surplus means rows exist this seed does not explain.',
      n_rows;
  END IF;

  SELECT count(DISTINCT postal_code) INTO n_codes
    FROM public.postal_codes
   WHERE country_code = ${sqlText(iso)};

  IF n_codes <> ${postal.stats.distinctCodes} THEN
    RAISE EXCEPTION '${title} postal seed: expected ${postal.stats.distinctCodes} distinct ${iso} postal codes, found %', n_codes;
  END IF;

  -- Coverage, scoped to SOURCED municipalities. \`geonames_id IS NOT NULL\` is
  -- load-bearing, not decoration: the DB test fixtures in supabase/seed.sql
  -- include a small code-less Finnish tree that no postal source has ever heard
  -- of, and an unscoped count would fail this migration on a database that had
  -- loaded them.
  SELECT count(*) INTO n_munis
    FROM public.locations
   WHERE country_code = ${sqlText(iso)} AND type = 'municipality' AND geonames_id IS NOT NULL;

  IF n_munis <> ${postal.stats.municipalities} THEN
    RAISE EXCEPTION
      '${title} postal seed: expected ${postal.stats.municipalities} sourced ${iso} municipalities to attach codes to, found %',
      n_munis;
  END IF;

  SELECT count(*) INTO n_uncovered
    FROM public.locations l
   WHERE l.country_code = ${sqlText(iso)} AND l.type = 'municipality' AND l.geonames_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.postal_codes p WHERE p.location_id = l.id
     );

  IF n_uncovered <> ${postal.uncovered.length} THEN
    RAISE EXCEPTION
      '${title} postal seed: % sourced ${iso} municipalities carry no postal code, expected exactly ${postal.uncovered.length}${postal.uncovered.length === 0 ? "" : ` (${postal.uncovered.map((row) => row.externalCode).join(", ")} — named in the header)`}',
      n_uncovered;
  END IF;
END;
$$;
`;
}

const statements = [];
for (let i = 0; i < postal.rows.length; i += CHUNK_SIZE) {
  statements.push(insertStatement(postal.rows.slice(i, i + CHUNK_SIZE), i / CHUNK_SIZE, postal.rows.length));
}

// An explicit transaction for the same reason the geography seeds carry one:
// under a bare `psql -f` (no `-1`) the DELETE and the INSERTs would autocommit
// one by one, and a failure between them would leave the country with its old
// codes gone and its new ones half-written.
const sql = [
  header(),
  "BEGIN;",
  `-- Rebuild, not reconcile. Nothing references a postal row, so the cheapest\n` +
    `-- correct thing is to drop the country's codes and lay them down again.\n` +
    `DELETE FROM public.postal_codes WHERE country_code = ${sqlText(iso)};\n`,
  ...statements,
  assertions(),
  "COMMIT;\n",
].join("\n");

const file = join(MIGRATIONS_DIR, migrationFile);
writeFileSync(file, sql, "utf8");

/* ------------------------------------------------------------------- report */

const { size } = statSync(file);
console.log(`Wrote ${file}`);
for (const source of postal.files) {
  console.log(`  source: ${source.source} — ${source.rows} rows, published ${source.published}`);
}
console.log(`  upstream pairs: ${postal.stats.upstreamPairs}${postal.stats.rolledUp > 0 ? `  (${postal.stats.rolledUp} rewritten by the PLM rollup)` : ""}`);
console.log(`  emitted: ${postal.rows.length} rows over ${postal.stats.distinctCodes} distinct codes`);
console.log(
  `  coverage: ${postal.stats.covered} / ${postal.stats.municipalities} municipalities ` +
    `(${(postal.coverage * 100).toFixed(4)}%, floor ${(config.postal.minCoverage * 100).toFixed(4)}%)`,
);
if (postal.uncovered.length > 0) {
  console.log(`  uncovered municipalities (${postal.uncovered.length}):`);
  for (const row of postal.uncovered.slice(0, 20)) console.log(`      ${row.externalCode} ${row.name}`);
  if (postal.uncovered.length > 20) console.log(`      … and ${postal.uncovered.length - 20} more`);
}
console.log(`  unmatched upstream codes (${postal.unmatched.length}) — reported, never failed on:`);
for (const entry of postal.unmatched.slice(0, 20)) {
  console.log(
    `      ${entry.municipalityCode}${entry.placeName === "" ? "" : ` ${entry.placeName}`}: ` +
      `${entry.postalCodes.length} code(s) — ${entry.postalCodes.slice(0, 5).join(", ")}`,
  );
}
if (postal.unmatched.length > 20) console.log(`      … and ${postal.unmatched.length - 20} more`);
console.log(`  ${statements.length} INSERT statements, ${(size / 1024).toFixed(1)} KB`);
