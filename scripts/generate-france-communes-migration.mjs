/**
 * Emits the France commune seed migration.
 *
 *   node scripts/generate-france-communes-migration.mjs
 *
 * All 34,875 communes of INSEE's Code officiel géographique become
 * `type = 'municipality'` rows in `public.locations`, each parented to its
 * département and stamped with its INSEE code. Why the table holds all of them
 * is written into the emitted migration's own header, which is where a future
 * reader will look.
 *
 * ## Where the data comes from
 *
 * The COG download, CSV parse, TYPECOM filtering and orphan checks come from
 * `scripts/lib/location-classifications.mjs`. That module used to have a second
 * consumer emitting static per-country catalogs for the browser, and keeping a
 * catalog name and a row name from drifting was why the parse lived in one
 * place; the catalogs are gone and `locations.name` is now the only name of a
 * place anything renders. Nothing about names is decided here — INSEE's LIBELLE
 * is the canonical French name.
 *
 * ## Determinism
 *
 * Rerunning this against the same COG release must produce a byte-identical
 * file, or the committed migration stops being reviewable. Three things buy
 * that:
 *
 *   - Rows are sorted by INSEE code in **code-unit order** (a plain `<`
 *     comparison), never by a locale collation. Collation depends on the ICU
 *     version bundled with Node; code-unit order does not.
 *     It also groups the file by département for free, since a commune code is
 *     prefixed by its département code.
 *   - Nothing run-dependent is written — no generation timestamp, no
 *     environment, no row ids (the table mints its own uuids).
 *   - The chunk size is a constant, so statement boundaries land in the same
 *     places every time.
 *
 * ## Regenerating
 *
 * The emitted file is applied history. Rerun this only to reproduce or review
 * the *same* release; after an annual COG refresh, write a new reconciliation
 * migration instead of rewriting this one (see the refresh procedure in
 * `scripts/lib/location-classifications.mjs`).
 */
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FR, fail, buildFrance } from "./lib/location-classifications.mjs";

/**
 * The migration this emits. Deliberately a literal: migrations are append-only
 * history, so the number is chosen once by a human and never inferred from a
 * directory listing (which would silently mint a second file on a rerun).
 */
const MIGRATION_FILE = "00133_seed_france_communes.sql";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

/**
 * Communes per INSERT statement. 34,875 rows in one VALUES list is a single
 * enormous statement to parse and an unreadable diff hunk; 2,000 keeps each
 * statement well inside anything Postgres or a reviewer cares about, at 18
 * statements total. The value is load-bearing for determinism — see the header.
 */
const CHUNK_SIZE = 2000;

const EXPECTED_COMMUNES = FR.expected[2];
const EXPECTED_DISTRICTS = FR.expected[1];

/* ------------------------------------------------------------------- utils */

/**
 * Postgres string literal. `standard_conforming_strings` is on (the default
 * since 9.1), so a backslash is an ordinary character and doubling the quote is
 * the whole escape. The assertion below refuses anything that would make that
 * assumption interesting.
 */
function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A value carrying a control character would produce a migration that is valid
 * SQL but not the data we meant. INSEE has never shipped one; if it ever does,
 * stop rather than emit. Scanned by code point rather than by a regex character
 * class, which would have to spell the control characters out and so put real
 * control bytes in this file.
 */
function assertLiteralSafe(kind, code, value) {
  if (value.length === 0) fail(`FR: ${kind} ${code} has an empty value`);
  for (const char of value) {
    const point = char.codePointAt(0);
    if (point < 0x20 || point === 0x7f) {
      fail(`FR: ${kind} ${code} contains a control character: ${JSON.stringify(value)}`);
    }
  }
}

/* -------------------------------------------------------------------- main */

const tree = await buildFrance();

/** Flatten région -> département -> commune to `{ code, name, department }`. */
const communes = [];
for (const [, , departments] of tree) {
  for (const [departmentCode, , leaves] of departments) {
    for (const [code, name] of leaves) {
      communes.push({ code, name, department: departmentCode });
    }
  }
}

// Code-unit order, the determinism guarantee (see header).
communes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

if (communes.length !== EXPECTED_COMMUNES) {
  fail(
    `FR: flattened ${communes.length} communes, expected ${EXPECTED_COMMUNES}. ` +
      `If the official release genuinely changed, bump the expected count in the config ` +
      `block of scripts/lib/location-classifications.mjs — and write a reconciliation ` +
      `migration rather than rewriting an applied one.`
  );
}

const seenCodes = new Set();
for (const { code, name, department } of communes) {
  if (seenCodes.has(code)) fail(`FR: duplicate commune code "${code}" (${name})`);
  seenCodes.add(code);
  assertLiteralSafe("commune", code, name);
  assertLiteralSafe("commune code", code, code);
  assertLiteralSafe("département code", code, department);
}

const departmentCodes = new Set(communes.map((c) => c.department));
if (departmentCodes.size !== EXPECTED_DISTRICTS) {
  fail(
    `FR: communes reference ${departmentCodes.size} départements, expected ${EXPECTED_DISTRICTS}`
  );
}

/* -------------------------------------------------------------------- emit */

const header = `-- Seeds every French commune: all ${EXPECTED_COMMUNES.toLocaleString("en-US")} of them, as
-- \`municipality\` rows under the ${EXPECTED_DISTRICTS} départements migration 00129 seeded.
--
-- WHY THE WHOLE COUNTRY
--
-- This table is the only copy of the geography, and everything reads it:
-- foreign-key integrity, ancestor-chain CTEs, substitute matching, RLS-scoped
-- gedu coverage reads, and the picker a human browses and searches. All of
-- those want every commune to *be* a row, so a gedu can claim one and a product
-- can sit under one without anything having to mint the row first. What keeps
-- that affordable is not caching the table but never reading more of it than a
-- screen shows — one level of children, or a ranked top-N from the search
-- index.
--
-- This supersedes the earlier arrangement where a commune became a row the
-- first time an admin picked it. Minting rows on demand made row existence a
-- function of who had clicked what, which is a poor thing for referential
-- integrity to depend on. ${EXPECTED_COMMUNES.toLocaleString("en-US")} reference rows are trivial for Postgres;
-- the constraint that made the old design look necessary was a fetch-the-whole-
-- table read pattern, and that read pattern is what got retired instead.
--
-- SOURCE
--
-- ${FR.source}, file v_commune_${FR.release}.csv, TYPECOM = 'COM' only
-- (the file also carries communes déléguées/associées and the arrondissements
-- municipaux of Paris, Lyon and Marseille — none of those is a commune).
-- \`name\` is the LIBELLE column verbatim: the official French name with its
-- article and typography intact ("L'Abergement-Clémenciat", "Saint-Étienne"),
-- which is the canonical native-language name per the locations name/name_i18n
-- convention. No name_i18n entries — French *is* the canonical language for
-- these rows, and the convention forbids duplicating \`name\` into it.
--
-- REGENERATING
--
--   node scripts/generate-france-communes-migration.mjs
--
-- Deterministic: rows are ordered by INSEE code in code-unit order (not by
-- locale collation, which moves with the bundled ICU), no timestamp or other
-- run-dependent value is written, and the ${CHUNK_SIZE}-row chunking is fixed. Rerunning
-- against the ${FR.release} release reproduces this file byte for byte.
--
-- Rerun it only to reproduce or review this release. The COG is republished
-- each January; communes merge and rename, and reconciling that against live
-- references (products, sites, gedu coverage) is a judgement call. So a new
-- release gets a NEW reconciliation migration — never a rewrite of this one,
-- which is already applied history.
--
-- IDEMPOTENT
--
-- Every insert is NOT EXISTS-guarded on (country_code, type, external_code) —
-- the key 00128's unique index enforces — so re-running inserts nothing. The
-- guard is on the code rather than the name because commune names are not
-- unique: France has many homonymous communes in different départements.
--
-- Each commune is joined to its département by that département's INSEE code,
-- so this migration depends on 00129 having run. A commune whose département is
-- missing would simply not be inserted by the JOIN — which is precisely what
-- the assertion block at the end refuses to let pass silently.
--
-- Data-only migration: no schema change, no type/grant change.
`;

/** One chunked INSERT … SELECT FROM (VALUES …) JOIN département statement. */
function chunkStatement(chunk, index, total) {
  const rows = chunk
    .map(
      ({ code, name, department }) =>
        `    (${sqlString(code)}, ${sqlString(name)}, ${sqlString(department)})`
    )
    .join(",\n");

  return (
    `-- Communes ${index * CHUNK_SIZE + 1}–${index * CHUNK_SIZE + chunk.length} of ${total} ` +
    `(INSEE ${chunk[0].code}–${chunk[chunk.length - 1].code}).\n` +
    `INSERT INTO public.locations (name, type, parent_id, country_code, external_code)\n` +
    `SELECT c.name, 'municipality', dep.id, 'FR', c.code\n` +
    `FROM (VALUES\n${rows}\n` +
    `) AS c(code, name, dep_code)\n` +
    `JOIN public.locations dep\n` +
    `  ON dep.country_code = 'FR'\n` +
    ` AND dep.type = 'district'\n` +
    ` AND dep.external_code = c.dep_code\n` +
    `WHERE NOT EXISTS (\n` +
    `  SELECT 1 FROM public.locations l\n` +
    `   WHERE l.country_code = 'FR' AND l.type = 'municipality' AND l.external_code = c.code\n` +
    `);\n`
  );
}

const chunks = [];
for (let i = 0; i < communes.length; i += CHUNK_SIZE) {
  chunks.push(communes.slice(i, i + CHUNK_SIZE));
}

const assertion = `-- Fail the migration if the seed did not land whole.
--
-- A partial commune seed is worse than none: it is a hole in the tree an admin
-- browses and a gedu claims coverage over — places that simply are not there,
-- with nothing pointing at the cause. All three checks are
-- exact rather than "at least" — an FR municipality outside the ${FR.release} release
-- means rows exist that this seed does not explain, which wants a human, not a
-- pass.
DO $$
DECLARE
  n_communes integer;
  n_codeless integer;
  orphans    integer;
BEGIN
  SELECT count(*) INTO n_communes
    FROM public.locations
   WHERE country_code = 'FR' AND type = 'municipality' AND external_code IS NOT NULL;

  IF n_communes <> ${EXPECTED_COMMUNES} THEN
    RAISE EXCEPTION
      'France commune seed incomplete: expected ${EXPECTED_COMMUNES} coded FR municipalities, found %. Were the 00129 départements seeded first?',
      n_communes;
  END IF;

  SELECT count(*) INTO n_codeless
    FROM public.locations
   WHERE country_code = 'FR' AND type = 'municipality' AND external_code IS NULL;

  IF n_codeless > 0 THEN
    RAISE EXCEPTION
      'France commune seed: % FR municipality rows carry no INSEE code — every commune is an official one, so a code-less row is a hand-created row that needs reconciling',
      n_codeless;
  END IF;

  SELECT count(*) INTO orphans
    FROM public.locations m
    LEFT JOIN public.locations d ON d.id = m.parent_id
   WHERE m.country_code = 'FR' AND m.type = 'municipality'
     AND (d.id IS NULL OR d.type <> 'district' OR d.country_code <> 'FR');

  IF orphans > 0 THEN
    RAISE EXCEPTION 'France commune seed: % commune rows are not parented to a FR département', orphans;
  END IF;
END;
$$;
`;

// An explicit transaction, although `supabase db push` already wraps each
// migration in one: this file is deliberately held back from staging and will
// be applied by hand at release, and under a bare `psql -f` (no `-1`) the
// INSERTs would autocommit one by one — leaving a committed partial seed
// behind the very assertion that exists to prevent one.
const sql = [
  header,
  "BEGIN;",
  ...chunks.map((chunk, i) => chunkStatement(chunk, i, communes.length)),
  assertion,
  "COMMIT;\n",
].join("\n");

const file = join(MIGRATIONS_DIR, MIGRATION_FILE);
writeFileSync(file, sql, "utf8");

const { size } = statSync(file);
console.log(`Wrote ${file}`);
console.log(
  `  ${communes.length.toLocaleString("en-US")} communes across ${departmentCodes.size} départements`
);
console.log(`  ${chunks.length} INSERT statements of up to ${CHUNK_SIZE} rows`);
console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB`);
