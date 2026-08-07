/**
 * Emits one country's seed migration from GeoNames.
 *
 *   node scripts/generate-geonames-seed.mjs SE
 *   node scripts/generate-geonames-seed.mjs FI --cutover
 *
 * GeoNames is the single source and the single authority for every country's
 * geography. Adding a country is a config entry in
 * `scripts/lib/geonames/config.mjs` plus a run of this script — there is no
 * country-specific executable code anywhere, and this file contains nothing
 * that knows what a län, a kunta or a commune is.
 *
 * ## What it emits
 *
 * One data-only migration: the country row first, then each level top-down,
 * every insert NOT EXISTS-guarded so a rerun inserts nothing, every row
 * carrying `geonames_id`, `country_code`, its parentage and its
 * `external_code` where the config maps an official code. It ends with an
 * assertion block that refuses a seed which did not land whole — the gates are
 * restated in SQL because the migration can be applied by hand, long after this
 * script's own gates ran.
 *
 * **Rows deliberately do not carry `depth`.** A trigger derives it from the
 * parent row, so an emitted value would be overwritten on the way in —
 * decorative at best and misleading at worst.
 *
 * ## `--cutover`: the same statements, bracketed
 *
 * A country already seeded from a national classification cannot simply have
 * the GeoNames seed applied on top of it — the two trees would sit side by side
 * under one country code, and the NOT EXISTS guards (which key on
 * `geonames_id`) would not notice. `--cutover` emits **the same seed
 * statements**, wrapped in the capture / wipe / re-point / assert bracket in
 * `scripts/lib/geonames/cutover.mjs`, as one transactional migration. The end
 * state is a tree indistinguishable from a country added yesterday, which is
 * the whole reason the wipe was preferred over an adoption pass that would have
 * left two countries whose rows predate their source.
 *
 * The bracket is country-agnostic and this file stays so too: nothing here
 * knows that Finland has an Åland or that France has a Mayotte.
 *
 * ## Determinism, stated honestly
 *
 * GeoNames publishes no archive of country files, so "a rerun is byte
 * identical" holds against the same downloaded snapshot and no further. Three
 * things buy that much:
 *
 *   - Rows are sorted by geonameid — the row identity, stable across dumps —
 *     and every tiebreak downstream (an alternate name, a jsonb key order) is
 *     resolved by an explicit sort rather than by file order.
 *   - Nothing run-dependent is written: no generation timestamp, no
 *     environment, no row ids (the table mints its own uuids). The one date in
 *     the file is the dump's own `Last-Modified`, which is a property of the
 *     bytes read, not of the run.
 *   - Downloads are cached and reused (see `scripts/lib/geonames/cache.mjs`),
 *     so a rerun reads exactly the bytes the previous run read unless someone
 *     asks for a refresh.
 *
 * The committed migration is therefore the reviewable snapshot of record. A
 * count mismatch at generation time is the human-judgment moment: identify the
 * surplus or shortfall by name against the national list, then fix the config,
 * extend `exclude`, or fix GeoNames upstream.
 *
 * ## Never regenerate an applied migration
 *
 * The emitted file becomes history the moment it is pushed. Upstream renames
 * and merges can invalidate live references, so reconciling a newer dump is a
 * *new* migration written by the sync tooling and read by a human — never a
 * rewrite of this one.
 */
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fail } from "./lib/geonames/cache.mjs";
import { countryConfig } from "./lib/geonames/config.mjs";
import {
  assertions as cutoverAssertions,
  capture as cutoverCapture,
  repoint as cutoverRepoint,
  wipe as cutoverWipe,
} from "./lib/geonames/cutover.mjs";
import { ingestCountry, nameResolutionCrossCheck } from "./lib/geonames/ingest.mjs";
import { locationInsert, sqlBigint, sqlJsonb, sqlText } from "./lib/geonames/sql.mjs";

/**
 * The migration each country's seed lands in, per mode. Deliberately literals:
 * migrations are append-only history, so a file name is chosen once by a human
 * — against the remote migration history, since an already-used version number
 * is silently treated as applied — and never inferred from a directory listing,
 * which would mint a second file on a rerun. Adding a country adds a line.
 *
 * A country appears under `cutover` when it had a tree before GeoNames did:
 * Finland and France were seeded from Tilastokeskus and the COG, and their one
 * migration replaces that tree with this one. Every country after them is a
 * plain `seed`.
 */
const MIGRATIONS = {
  seed: {
    SE: "00158_seed_sweden_geonames.sql",
    GB: "00161_seed_uk_geonames.sql",
  },
  cutover: {
    FI: "00159_cutover_finland_geonames.sql",
    FR: "00160_cutover_france_geonames.sql",
  },
};

/** Human-readable country names for the migration header. */
const TITLES = {
  SE: "Sweden",
  FI: "Finland",
  FR: "France",
  GB: "the United Kingdom",
};

/**
 * Plural forms of the level names, for prose in the emitted header and
 * comments. The level set is ours and fixed (`SEEDED_LEVELS`), so this is a
 * closed map rather than a pluralization rule that would eventually meet a word
 * it gets wrong.
 */
const PLURALS = {
  region: "regions",
  district: "districts",
  municipality: "municipalities",
};

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

/** One allowance entry, for prose in the emitted header and the run report. */
function describeAllowance(entry) {
  if (entry.by === "code") return entry.value;
  if (entry.by === "name") return `"${entry.value}"`;
  return `geonameid ${entry.value}`;
}

/**
 * Rows per INSERT statement. Large enough that small countries emit one
 * statement per level, small enough that France's 34,875 communes stay
 * readable as diff hunks. The value is load-bearing for determinism —
 * statement boundaries have to land in the same places on every run.
 */
const CHUNK_SIZE = 2000;

/* -------------------------------------------------------------------- setup */

const args = process.argv.slice(2);
const iso = args.find((arg) => !arg.startsWith("--"))?.toUpperCase();
const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--cutover");
if (unknownFlag) fail(`Unknown flag ${unknownFlag}. The only flag is --cutover.`);
if (!iso) fail("Usage: node scripts/generate-geonames-seed.mjs <CC> [--cutover]   (e.g. SE, or FI --cutover)");

const mode = args.includes("--cutover") ? "cutover" : "seed";
const migrationFile = MIGRATIONS[mode][iso];
if (!migrationFile) {
  const other = mode === "seed" ? "cutover" : "seed";
  if (MIGRATIONS[other][iso]) {
    fail(
      `${iso} is recorded as a ${other}, not a ${mode}. ` +
        `${other === "cutover" ? "It had a tree before GeoNames did, so its migration replaces that tree — rerun with --cutover." : "It has no pre-GeoNames tree to replace — rerun without --cutover."}`,
    );
  }
  fail(
    `No ${mode} migration file name recorded for ${iso}. Pick the next free migration number — ` +
      `checked against remote migration history first — and add it to MIGRATIONS in ` +
      `scripts/generate-geonames-seed.mjs.`,
  );
}

const config = countryConfig(iso);
const ingested = await ingestCountry(config);
const title = TITLES[iso] ?? iso;

/** The dump's own publication date, which is what the header stamps. */
const dumpDate = ingested.files.map((file) => file.dumpDate).sort().at(-1);

/* --------------------------------------------------------------------- emit */

const levelCounts = ingested.levels
  .map(({ level, rows }) => `${rows.length} ${PLURALS[level] ?? level}`)
  .join(", ");

/** The parent types a level's rows actually resolved to, for the orphan check. */
function parentTypesOf(rows) {
  return [...new Set(rows.map((row) => row.parent.type))].sort();
}

function header() {
  // One file per line once there is more than one: France's set is six, and a
  // single joined line runs past 250 characters in a comment nobody can then
  // read in a diff.
  const fileList = ingested.files
    .map((file) => `${file.iso}.txt (published ${file.dumpDate})`)
    .join(",\n-- ");
  const excludeNote =
    config.exclude.size > 0
      ? `-- ${ingested.stats.excluded} row(s) were dropped by the config's exclusion list —\n` +
        `-- places GeoNames still carries live after they were abolished. Every entry is a\n` +
        `-- recorded human decision, and the durable fix is correcting GeoNames upstream.\n--\n`
      : "";
  const syntheticNote =
    ingested.stats.synthetic > 0
      ? `-- ${ingested.stats.synthetic} row(s) are config-declared synthetic rows with geonames_id\n` +
        `-- NULL: levels GeoNames models in no file, pinned outright so the subtree below\n` +
        `-- them has a parent.\n--\n`
      : "";
  const attachedNote =
    ingested.stats.attached > 0
      ? `-- ${ingested.stats.attached} row(s) are config-declared pins onto a GeoNames record the level\n` +
        `-- filters would not have picked up — a record standing for a level of our hierarchy\n` +
        `-- that upstream models somewhere else. They carry their real geonames_id.\n--\n`
      : "";

  const allowanceNote = ingested.levels
    .map(({ level }) => {
      const { count, allowMissing, allowExtra } = config.expected[level];
      if (allowMissing.length === 0 && allowExtra.length === 0) return null;
      // An allowance names rows by whatever key its level has, and the two
      // cases are different facts rather than two spellings of one. A coded
      // level's surplus is a row filed under a code the classification retired
      // — present, under the wrong key, and lost to any official-data join. A
      // code-less level has no such key to be wrong about: its surplus is
      // simply a place the classification no longer has.
      const coded = allowMissing.concat(allowExtra).every((entry) => entry.by === "code");
      if (coded) {
        return (
          `-- The ${level} count is the national classification's ${count}, minus the\n` +
          `-- ${allowMissing.length} code(s) GeoNames does not carry (${allowMissing.map((entry) => entry.value).join(", ")})\n` +
          `-- and plus the ${allowExtra.length} it carries under a code the classification retired\n` +
          `-- (${allowExtra.map((entry) => entry.value).join(", ")}). Both lists are named in the config and are re-surfaced by\n` +
          `-- every sync report until upstream heals; an official-data join misses the second\n` +
          `-- group until it does.\n--\n`
        );
      }
      return (
        `-- The ${level} count is the national classification's ${count}, minus the\n` +
        `-- ${allowMissing.length} it names that GeoNames does not carry and plus the ${allowExtra.length} GeoNames\n` +
        `-- carries that the classification does not. This level maps no official code, so\n` +
        `-- each row is named by the key it does have:\n` +
        `--   missing: ${allowMissing.map(describeAllowance).join(", ")}\n` +
        `--   extra:   ${allowExtra.map(describeAllowance).join(", ")}\n` +
        `-- Both lists are named in the config and are re-surfaced by every sync report\n` +
        `-- until upstream heals.\n--\n`
      );
    })
    .filter(Boolean)
    .join("");

  const cutoverPreamble =
    mode !== "cutover"
      ? ""
      : `--
-- THIS IS A CUTOVER, NOT A FIRST SEED
--
-- ${title} already had a location tree, seeded by hand or by a bespoke generator
-- from its national statistical classification. This migration REPLACES it: the
-- old country/${config.levelOrder.join("/")} rows are wiped and the GeoNames tree
-- is seeded in their place, so that from here on ${title} is indistinguishable
-- from a country added yesterday — same config shape, same sync procedure, no
-- national-classification refresh.
--
-- New row uuids throughout are accepted: nothing durable outside the database
-- holds a location uuid (caches are ephemeral, public links use slugs). What is
-- NOT accepted is losing a live reference, so the seed statements below sit
-- inside a five-section bracket — capture, wipe, reseed, re-point, assert —
-- that carries sites, gedu coverage ticks and family location picks across by
-- official code. Each section explains itself where it starts.
--
-- \`site\` rows are never wiped: they are ours, they are what products point at,
-- and they are simply re-parented. The one thing that can be lost is a
-- reference to a row the new tree has no counterpart for, and every such loss
-- raises a WARNING naming it.
`;

  return `-- ${mode === "cutover" ? `Cuts ${title} over to GeoNames` : `Seeds ${title}'s location tree from GeoNames`}: the country row plus ${levelCounts}.
${cutoverPreamble}--
-- SOURCE
--
-- GeoNames country dump ${fileList}, its matching alternate-names file, and
-- countryInfo.txt — CC BY 4.0, republished daily by download.geonames.org.
-- GeoNames is the single source and the single authority for every country's
-- geography here: adding a country is a config entry plus a generator run, and
-- keeping one current is one uniform sync procedure with no country special-
-- cased.
--
-- Rows are filtered on exact live feature codes — never the \`H\` variants,
-- which are GeoNames' abolished divisions and carry the same admin codes as the
-- live rows that replaced them — and deduped on geonameid, because official
-- codes are not unique across that split and names are not unique at all.
--
-- NAMES
--
-- \`name\` is the canonical native-language name, resolved by the country's
-- configured rule (${config.nameResolution === "dump" ? "the dump's own name column" : `the ${config.nameResolution.language} alternates`}).
-- \`name_i18n\` holds only the locales that differ from it — never a key equal to
-- \`name\`, which is the convention the display resolver depends on. The country
-- row takes an alternate for every supported UI locale, which is the one level
-- where every locale has real payload; the levels below take the locales the
-- config lists${config.alternateLocales.length === 0 ? " (none for this country)" : ` (${config.alternateLocales.join(", ")})`}.
--
-- CODES
--
${
    ingested.levels.every(({ rows }) => rows.every((row) => row.externalCode === null))
      ? `-- \`external_code\` is NULL on every row below the country here, and that is a
-- decision rather than a gap. GeoNames' admin codes for this country are its
-- own invention and match no national classification, and the column's contract
-- is the *official* code — putting a made-up value in it would break every join
-- it exists for. What is forfeited is named: joins against this country's
-- official datasets, postal data included, cannot run on this column. What is
-- not affected is identity — \`geonames_id\` is what ingestion, sync and every
-- dedupe run on, and every row below carries one.`
      : `-- \`external_code\` keeps its existing contract — the row's code in its
-- country's official statistical classification, unique per (country, type) —
-- and never holds a geonameid. GeoNames' admin-code columns are what supply it,
-- so joins against official data keep working.`
  }
--
${allowanceNote}${excludeNote}${attachedNote}${syntheticNote}-- DEPTH
--
-- No row carries \`depth\`: a trigger derives it from the parent row, so an
-- emitted value would be overwritten on the way in.
--
-- REGENERATING
--
--   node scripts/generate-geonames-seed.mjs ${iso}${mode === "cutover" ? " --cutover" : ""}
--
-- Deterministic against the same downloaded snapshot: rows are ordered by
-- geonameid, nothing run-dependent is written, and the ${CHUNK_SIZE}-row chunking is
-- fixed. GeoNames publishes no archive, so that is the honest extent of the
-- guarantee — this committed file is the reviewable snapshot of record.
--
-- Rerun it only to reproduce or review this snapshot. A newer dump is
-- reconciled by a NEW migration from the sync tooling, read by a human first —
-- never by rewriting this one, which is applied history.
--
-- IDEMPOTENT
--
-- Every insert is NOT EXISTS-guarded on \`geonames_id\`, so re-running inserts
-- nothing. Each row is joined to its parent by the parent's \`geonames_id\`, so
-- this migration depends on the levels above it having landed — which is
-- exactly what the assertion block at the end refuses to let pass silently.
--${mode === "cutover" ? `
-- The bracket around them is idempotent in the same sense and no further: a
-- second run captures the tree this one produced, wipes it, seeds it again and
-- re-points everything by the same codes, landing in the same state. It is not
-- a no-op, and nothing should ask it to be — a migration runs once.
--` : ""}
-- Data-only migration: no schema change, no type/grant change. It does depend
-- on the groundwork migration that adds \`locations.geonames_id\` and the depth
-- trigger, which migration ordering guarantees has already run.${mode === "cutover" ? `
-- It also depends on \`external_code\` being populated on the old tree, which
-- the backfill migrations well before it guarantee — that is what makes the
-- re-point join work identically on production, on staging and on CI's
-- from-scratch build, where it wipes rows seeded minutes earlier and reseeds
-- them. That cost is seconds per CI run and is accepted.` : ""}
`;
}

function countryStatement() {
  const { country } = ingested;
  return (
    `-- The country row. Guarded on both keys: a second country row for ${iso} would\n` +
    `-- surface twice at the picker's root level.\n` +
    `INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)\n` +
    `SELECT ${sqlBigint(country.geonameid)}, ${sqlText(country.name)}, ${sqlJsonb(country.nameI18n)}, 'country', NULL, ${sqlText(iso)}, NULL\n` +
    `WHERE NOT EXISTS (\n` +
    `  SELECT 1 FROM public.locations l\n` +
    `   WHERE l.geonames_id = ${sqlBigint(country.geonameid)}\n` +
    `      OR (l.type = 'country' AND l.country_code = ${sqlText(iso)})\n` +
    `);\n`
  );
}

/**
 * One chunked INSERT for a level, headed by a comment saying which slice of the
 * level it is. The statement itself is the shared one in
 * `scripts/lib/geonames/sql.mjs` — the same one the differ emits, so a row
 * inserted by a reconciliation lands exactly as a row inserted here would have.
 */
function levelStatement(level, chunk, index, total) {
  const plural = PLURALS[level] ?? level;
  const range =
    total > chunk.length
      ? ` ${index * CHUNK_SIZE + 1}–${index * CHUNK_SIZE + chunk.length} of ${total}`
      : ` (${total})`;

  return `-- ${plural[0].toUpperCase()}${plural.slice(1)}${range}.\n` + locationInsert(iso, level, chunk);
}

function assertions() {
  // The levels that carry an official code at all. A country whose config maps
  // none below the country row — the United Kingdom, whose GeoNames admin codes
  // are GeoNames' own invention rather than ONS/GSS codes — has an empty list
  // here, and the code-less check is omitted rather than emitted as an
  // `IN ()` that would not parse. Nothing is lost by that: the claim it makes
  // is vacuous for such a country, and the config's `officialCode: null` is
  // where the fact lives.
  const codedLevels = ingested.levels
    .filter(({ rows }) => rows.some((row) => row.externalCode !== null))
    .map(({ level }) => sqlText(level))
    .join(", ");

  const declarations = [
    "  n_country integer;",
    ...ingested.levels.map(({ level }) => `  n_${level} integer;`),
    ...(codedLevels === "" ? [] : ["  n_codeless integer;"]),
    "  n_keyless integer;",
    "  n_dupes integer;",
    "  orphans integer;",
  ].join("\n");

  const perLevel = ingested.levels
    .map(({ level, rows }) => {
      const parents = parentTypesOf(rows);
      const parentTest =
        parents.length === 1
          ? `p.type <> ${sqlText(parents[0])}`
          : `p.type NOT IN (${parents.map((type) => sqlText(type)).join(", ")})`;
      return `  SELECT count(*) INTO n_${level}
    FROM public.locations
   WHERE country_code = ${sqlText(iso)} AND type = ${sqlText(level)};

  IF n_${level} <> ${rows.length} THEN
    RAISE EXCEPTION
      '${title} GeoNames seed: expected ${rows.length} ${level} rows for ${iso}, found %. A shortfall means a level above did not land; a surplus means rows exist this seed does not explain.',
      n_${level};
  END IF;

  -- Orphans, LEFT JOIN shape: a NULL or dangling parent_id has to be visible,
  -- which an inner join would silently drop.
  SELECT count(*) INTO orphans
    FROM public.locations c
    LEFT JOIN public.locations p ON p.id = c.parent_id
   WHERE c.country_code = ${sqlText(iso)} AND c.type = ${sqlText(level)}
     AND (p.id IS NULL OR p.country_code <> ${sqlText(iso)} OR ${parentTest});

  IF orphans > 0 THEN
    RAISE EXCEPTION '${title} GeoNames seed: % ${level} rows are not parented to a ${parents.join("/")} row in ${iso}', orphans;
  END IF;`;
    })
    .join("\n\n");

  const seededTypes = ingested.levels.map(({ level }) => sqlText(level)).join(", ");

  return `-- Fail the migration if the seed did not land whole.
--
-- A partial seed is worse than none: it is a hole in the tree an admin browses
-- and a gedu claims coverage over — places that simply are not there, with
-- nothing pointing at the cause. Every count is exact rather than "at least",
-- because a surplus means rows exist that this seed does not explain, and that
-- wants a human rather than a pass.
--
-- The counts here are the national statistical agency's, carried through the
-- generator's own gate; they are restated in SQL because this file can be
-- applied by hand long after that gate ran.
DO $$
DECLARE
${declarations}
BEGIN
  SELECT count(*) INTO n_country
    FROM public.locations
   WHERE country_code = ${sqlText(iso)} AND type = 'country';

  IF n_country <> 1 THEN
    RAISE EXCEPTION '${title} GeoNames seed: expected exactly 1 ${iso} country row, found %', n_country;
  END IF;

${perLevel}

  -- Every seeded row is a GeoNames row${ingested.stats.synthetic > 0 ? `, bar the ${ingested.stats.synthetic} config-declared synthetic one(s)` : ""}.
  SELECT count(*) INTO n_keyless
    FROM public.locations
   WHERE country_code = ${sqlText(iso)} AND type IN ('country', ${seededTypes})
     AND geonames_id IS NULL;

  IF n_keyless <> ${ingested.stats.synthetic} THEN
    RAISE EXCEPTION
      '${title} GeoNames seed: % seeded ${iso} rows carry no geonames_id, expected ${ingested.stats.synthetic}',
      n_keyless;
  END IF;

${
    codedLevels === ""
      ? `  -- No code-less check: this country's config maps no official code below the
  -- country row, because GeoNames' admin codes for it are its own invention
  -- rather than the national classification's. Every row is still keyed by
  -- geonames_id, which is what ingestion, sync and the dedupe below run on;
  -- what is forfeited is joins against official data, named in the config.
`
      : `  -- Every row at a level the config maps a code for carries one. A code-less
  -- row cannot be re-pointed by a reconciliation or joined by postal data.
  SELECT count(*) INTO n_codeless
    FROM public.locations
   WHERE country_code = ${sqlText(iso)} AND type IN (${codedLevels})
     AND external_code IS NULL;

  IF n_codeless > 0 THEN
    RAISE EXCEPTION
      '${title} GeoNames seed: % ${iso} rows carry no external_code at a level that must have one',
      n_codeless;
  END IF;
`
  }
  -- Codes are unique within (country, type) — the key every reconciliation and
  -- official-data join runs on.
  SELECT count(*) INTO n_dupes
    FROM (
      SELECT type, external_code
        FROM public.locations
       WHERE country_code = ${sqlText(iso)} AND external_code IS NOT NULL
       GROUP BY type, external_code
      HAVING count(*) > 1
    ) d;

  IF n_dupes > 0 THEN
    RAISE EXCEPTION '${title} GeoNames seed: % (type, external_code) pairs are duplicated for ${iso}', n_dupes;
  END IF;
END;
$$;
`;
}

const statements = [];
for (const { level, rows } of ingested.levels) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    statements.push(levelStatement(level, rows.slice(i, i + CHUNK_SIZE), i / CHUNK_SIZE, rows.length));
  }
}

// An explicit transaction, although `supabase db push` already wraps each
// migration in one: under a bare `psql -f` (no `-1`) the INSERTs would
// autocommit one by one, leaving a committed partial seed behind the very
// assertion that exists to prevent one. For a cutover the same statement is
// what keeps the wipe and the reseed from ever being separately visible.
const seedSection =
  mode === "cutover"
    ? [
        "-- ---------------------------------------------------------------------------\n" +
          "-- 3. RESEED — the ordinary seed statements, unchanged\n" +
          "-- ---------------------------------------------------------------------------\n" +
          "--\n" +
          "-- Byte for byte what this generator emits for a brand-new country. That is the\n" +
          "-- point of the cutover: one code path produces every country's tree, so there\n" +
          "-- is no such thing as a country whose rows were made differently. The section\n" +
          "-- ends with the standard seed gates; section 5 adds the cutover's own.\n",
        countryStatement(),
        ...statements,
      ]
    : [countryStatement(), ...statements];

const sql = [
  header(),
  "BEGIN;",
  ...(mode === "cutover" ? [cutoverCapture(iso, config.levelOrder, title), cutoverWipe(iso, config.levelOrder, title)] : []),
  ...seedSection,
  assertions(),
  ...(mode === "cutover"
    ? [cutoverRepoint(iso, config.levelOrder, title), cutoverAssertions(iso, config.levelOrder, title)]
    : []),
  "COMMIT;\n",
].join("\n");

const file = join(MIGRATIONS_DIR, migrationFile);
writeFileSync(file, sql, "utf8");

/* ------------------------------------------------------------------- report */

const { size } = statSync(file);
console.log(`Wrote ${file}${mode === "cutover" ? "  (cutover: wipes the existing tree and re-points its live references)" : ""}`);
console.log(`  dump published ${dumpDate} (${ingested.files.map((f) => f.iso).join(", ")})`);
console.log(`  country: ${ingested.country.name} ${JSON.stringify(ingested.country.nameI18n)}`);
for (const { level, rows } of ingested.levels) {
  const { count, allowMissing, allowExtra } = config.expected[level];
  const allowance =
    allowMissing.length > 0 || allowExtra.length > 0
      ? ` (national ${count}, ${allowMissing.length} named as missing, ${allowExtra.length} named as extra)`
      : "";
  const target = count - allowMissing.length + allowExtra.length;
  console.log(`  ${level}: ${rows.length} / expected ${target}${allowance} — parents: ${parentTypesOf(rows).join(", ")}`);
}
if (ingested.stats.excluded > 0) console.log(`  excluded by config: ${ingested.stats.excluded}`);
if (ingested.stats.attached > 0) console.log(`  pinned onto an upstream record: ${ingested.stats.attached}`);
if (ingested.stats.synthetic > 0) console.log(`  synthetic (geonames_id NULL): ${ingested.stats.synthetic}`);
console.log(`  ${statements.length + 1} INSERT statements, ${(size / 1024).toFixed(1)} KB`);

console.log(`\nName-resolution cross-check (chosen: ${config.nameResolution === "dump" ? '"dump"' : `${config.nameResolution.language} alternates`}):`);
for (const entry of nameResolutionCrossCheck(config, ingested)) {
  console.log(
    `  ${entry.level}: ${entry.total} rows — ${entry.missing} have no ${entry.language} alternate, ` +
      `${entry.differing.length} would be renamed by switching`,
  );
  for (const sample of entry.differing.slice(0, 3)) console.log(`      dump / ${entry.language}:  ${sample}`);
}
