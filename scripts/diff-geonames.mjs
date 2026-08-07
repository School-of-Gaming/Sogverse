/**
 * Reconciles one country's live location rows against today's GeoNames dumps.
 *
 *   node scripts/diff-geonames.mjs GB
 *   node scripts/diff-geonames.mjs FI --unretire
 *   node scripts/diff-geonames.mjs GB --from-migration supabase/migrations/00161_seed_uk_geonames.sql
 *
 * One procedure for every country — Finland and France included since the
 * cutover, which is why there is no annual national-classification diff any
 * more. It reads the config's dumps and the live table (**read-only, always**)
 * and produces two things: a report on stdout for a human to read, and a
 * reconciliation migration for that human to renumber and push.
 *
 * ## The run procedure
 *
 *  1. **Run it for the country.** Nothing is written to any database, ever —
 *     the only statement this script sends is a `SELECT`.
 *  2. **Read the report.** Anything ambiguous is a human decision made here and
 *     not by the tool: a merge's coverage implications, a retirement that
 *     something references, a rename that looks like vandalism. A wrong
 *     upstream name is fixed *in GeoNames*, never by hand-editing the emitted
 *     migration into a local override.
 *  3. **Renumber the migration and move it into `supabase/migrations/`.** It is
 *     written to `supabase/reconciliations/` under a name with no version
 *     number at all, because this script cannot know the next free one: an
 *     already-used version is silently treated as applied, so the number has to
 *     be picked against *remote* migration history at the moment of pushing,
 *     not at the moment of emitting. The file name says so loudly.
 *  4. **Push it through the normal workflow.**
 *
 * ## What it may emit, and what it may never emit
 *
 * Insert, rename, `name_i18n` update, `external_code` correction, and
 * `retired_at` stamp. That is the whole list, and the omissions are the design:
 *
 * - **Never a DELETE.** `gedu_locations.location_id` is ON DELETE CASCADE, so
 *   deleting a superseded place silently erases a gedu's coverage. Retirement
 *   hides a row from every read that *offers* a place while every foreign key,
 *   coverage claim and ancestor walk keeps working. Deleting a retired,
 *   unreferenced row stays a manual, human-decided migration.
 * - **Never a reparent.** A row that moved between parents upstream is a
 *   *reported* change and nothing more. Re-parenting a non-leaf leaves its
 *   descendants' `depth` stale (the trigger is a row trigger and says so), and
 *   an administrative re-levelling is exactly the kind of upstream change that
 *   wants a human writing the migration by hand.
 * - **Un-retirement is reported, and emitted only with `--unretire`.** The plan
 *   this tool comes from is silent on it, so the conservative reading wins: a
 *   row reappearing upstream is more often GeoNames flapping than a place
 *   coming back, and bringing it back into every picker is a visible change to
 *   what people can choose. Seeing it in the report costs nothing; taking it
 *   deliberately costs one flag.
 *
 * ## It is gated exactly like the generator, and that is not a bug
 *
 * The upstream side comes from the same `ingestCountry` the seed generator
 * uses, with the same gates — including the `expected` counts, which come from
 * the national statistical agency and never from the files. So if upstream has
 * drifted far enough to break a count, this script **stops and says so instead
 * of emitting a migration**. That is the point: a count that no longer matches
 * the authoritative number is the human-judgment moment the whole design names,
 * and reconciling it means re-sourcing the count, extending the named
 * allowances, or extending `exclude` — in the config, deliberately — before any
 * of the drift reaches reference data.
 *
 * ## `--from-migration`: diffing against a file instead of a database
 *
 * The same comparison, with the live-table image built by parsing a generated
 * seed or cutover migration rather than by reading Postgres. It is what makes
 * "an empty diff" a checkable claim for a country whose seed has not been
 * pushed anywhere yet: the dumps go in one end, the emitted SQL comes out the
 * other, and this reads the SQL back and asserts the round trip is closed. The
 * parser is deliberately narrow — it reads only the shape this repository's
 * generator emits, and fails loudly on anything else.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { fail } from "./lib/geonames/cache.mjs";
import { countryConfig } from "./lib/geonames/config.mjs";
import { ingestCountry } from "./lib/geonames/ingest.mjs";
import { locationInsert, sqlBigint, sqlJsonb, sqlText } from "./lib/geonames/sql.mjs";

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "supabase", "reconciliations");

/**
 * Staging's pooler. Overridable by environment so the same script can be
 * pointed at production, which is the only difference between the two runs —
 * there is deliberately no `--prod` flag, because a read-only tool that names
 * its own target in a flag is one typo from being run against the wrong one
 * without noticing.
 */
const DB_HOST = process.env.SUPABASE_DB_HOST ?? "aws-1-eu-north-1.pooler.supabase.com";
const DB_PORT = process.env.SUPABASE_DB_PORT ?? "6543";

/* -------------------------------------------------------------------- setup */

const args = process.argv.slice(2);
const iso = args.find((arg) => !arg.startsWith("--") && !isFlagValue(arg))?.toUpperCase();

function isFlagValue(arg) {
  const i = args.indexOf(arg);
  return i > 0 && (args[i - 1] === "--out" || args[i - 1] === "--from-migration");
}

function flagValue(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) fail(`${name} needs a path`);
  return value;
}

const KNOWN_FLAGS = ["--unretire", "--out", "--from-migration"];
const unknownFlag = args.find((arg) => arg.startsWith("--") && !KNOWN_FLAGS.includes(arg));
if (unknownFlag) fail(`Unknown flag ${unknownFlag}. Known flags: ${KNOWN_FLAGS.join(", ")}.`);
if (!iso) {
  fail(
    "Usage: node scripts/diff-geonames.mjs <CC> [--unretire] [--out <path>] [--from-migration <path>]",
  );
}

const emitUnretire = args.includes("--unretire");
const fromMigration = flagValue("--from-migration");
const outPath = flagValue("--out") ?? join(OUT_DIR, `RENUMBER_ME_reconcile_${iso.toLowerCase()}_geonames.sql`);

/* ------------------------------------------------------- the upstream image */

const config = countryConfig(iso);
const ingested = await ingestCountry(config);

/** Every upstream row, country first then each level in `levelOrder`. */
function upstreamRows() {
  const rows = [
    {
      geonameid: ingested.country.geonameid,
      type: "country",
      name: ingested.country.name,
      nameI18n: ingested.country.nameI18n,
      externalCode: null,
      parent: null,
    },
  ];
  for (const { level, rows: levelRows } of ingested.levels) {
    for (const row of levelRows) {
      rows.push({
        geonameid: row.geonameid,
        type: level,
        name: row.name,
        nameI18n: row.nameI18n,
        externalCode: row.externalCode,
        parent: {
          geonameid: row.parent.geonameid,
          type: row.parent.type,
          externalCode: row.parent.externalCode,
        },
      });
    }
  }
  return rows;
}

/* ----------------------------------------------------------- the live image */

/**
 * A row's identity across a change of nothing but time. `geonames_id` where
 * there is one — it is stable across renames, re-levellings and code
 * corrections alike, which is exactly why the schema carries it — and
 * `(type, official code)` for the config-declared synthetic rows, which have no
 * upstream record to be keyed by.
 */
function keyOf(row) {
  if (row.geonameid !== null && row.geonameid !== undefined) return `g:${row.geonameid}`;
  return `s:${row.type}:${row.externalCode ?? ""}`;
}

/** `.env.local`, parsed just far enough to find the two values this needs. */
function readEnvLocal() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) fail(`No .env.local at ${file} — the database connection is configured there.`);
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

/**
 * The live rows, read through `psql`. **The only statement this sends is a
 * SELECT**, and the password goes in the environment rather than in a
 * connection string, so it never reaches a command line another process can
 * read.
 */
function readLiveTable() {
  const env = readEnvLocal();
  const ref = env.SUPABASE_PROJECT_REF;
  const password = env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) fail("`.env.local` needs SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD.");

  const types = ["country", ...config.levelOrder].map((type) => sqlText(type)).join(", ");
  const query = `
    SELECT coalesce(json_agg(json_build_object(
             'id', l.id,
             'geonameid', l.geonames_id,
             'type', l.type,
             'name', l.name,
             'nameI18n', coalesce(l.name_i18n, '{}'::jsonb),
             'externalCode', l.external_code,
             'retiredAt', l.retired_at,
             'parent', CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object(
                'geonameid', p.geonames_id, 'type', p.type, 'externalCode', p.external_code) END
           ) ORDER BY l.id)::text, '[]')
      FROM public.locations l
      LEFT JOIN public.locations p ON p.id = l.parent_id
     WHERE l.country_code = ${sqlText(iso)}
       AND l.type IN (${types});`;

  let stdout;
  try {
    stdout = execFileSync(
      "psql",
      ["-h", DB_HOST, "-p", DB_PORT, "-U", `postgres.${ref}`, "-d", "postgres",
       "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", query],
      {
        env: { ...process.env, PGPASSWORD: password },
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    // Never echo the environment: the password is in it.
    fail(`psql failed against ${DB_HOST}:${DB_PORT}\n\n${(error.stderr ?? error.message).toString().trim()}`);
  }

  return { rows: JSON.parse(stdout.trim()), source: `${DB_HOST}:${DB_PORT}` };
}

/**
 * The live rows as a generated migration would leave them — the self-check
 * path. The parser reads exactly the shape `generate-geonames-seed.mjs` emits
 * and refuses anything else rather than guessing, because a lenient parser here
 * would turn "the round trip is closed" into "the parser and the emitter happen
 * to agree on a subset".
 */
function readMigrationImage(path) {
  const file = existsSync(path) ? path : join(ROOT, path);
  if (!existsSync(file)) fail(`No migration at ${path}`);
  const text = readFileSync(file, "utf8");

  const rows = [];
  let level = null;

  for (const line of text.split("\n")) {
    // The country row is one self-contained SELECT rather than a VALUES list.
    const country = /^SELECT (\d+)::bigint, ('(?:[^']|'')*'), (NULL::jsonb|'(?:[^']|'')*'::jsonb), 'country', NULL, '(\w+)', NULL$/.exec(line);
    if (country) {
      rows.push({
        geonameid: Number(country[1]),
        type: "country",
        name: unquote(country[2]),
        nameI18n: country[3] === "NULL::jsonb" ? {} : JSON.parse(unquote(country[3].replace(/::jsonb$/, ""))),
        externalCode: null,
        retiredAt: null,
        parent: null,
      });
      continue;
    }

    const header = /^SELECT v\.geonames_id, v\.name, v\.name_i18n, '(\w+)', p\.id, '(\w+)', v\.external_code$/.exec(line);
    if (header) {
      level = header[1];
      continue;
    }

    if (!line.startsWith("    (") || level === null) continue;
    const cells = splitTuple(line.trim().replace(/,$/, ""));
    if (cells.length !== 7) fail(`${path}: could not read a VALUES row of ${cells.length} cells: ${line.trim()}`);
    const [geonameid, name, i18n, code, parentId, parentType, parentCode] = cells;
    rows.push({
      geonameid: geonameid === "NULL::bigint" ? null : Number(geonameid.replace("::bigint", "")),
      type: level,
      name: unquote(name),
      nameI18n: i18n === "NULL::jsonb" ? {} : JSON.parse(unquote(i18n.replace(/::jsonb$/, ""))),
      externalCode: code === "NULL::text" ? null : unquote(code),
      retiredAt: null,
      parent: {
        geonameid: parentId === "NULL::bigint" ? null : Number(parentId.replace("::bigint", "")),
        type: unquote(parentType),
        externalCode: parentCode === "NULL::text" ? null : unquote(parentCode),
      },
    });
  }

  if (rows.length === 0) fail(`${path}: no location rows found — is it a generated seed migration?`);
  return { rows, source: `migration ${path}` };
}

/** A Postgres text literal back to its value. */
function unquote(literal) {
  return literal.slice(1, -1).replace(/''/g, "'");
}

/** One `(a, b, c)` VALUES tuple into its cells, respecting quoted commas. */
function splitTuple(text) {
  if (!text.startsWith("(") || !text.endsWith(")")) fail(`not a VALUES tuple: ${text}`);
  const body = text.slice(1, -1);
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "'") {
      // A doubled quote inside a literal is an escaped quote, not a boundary.
      if (quoted && body[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/* ----------------------------------------------------------------- the diff */

const upstream = upstreamRows();
const live = fromMigration ? readMigrationImage(fromMigration) : readLiveTable();

const upstreamByKey = new Map(upstream.map((row) => [keyOf(row), row]));
const liveByKey = new Map(live.rows.map((row) => [keyOf(row), row]));

/**
 * Rows the live tree carries that no key can reach: no `geonames_id`, and not
 * one of the config's declared synthetic rows. A tree full of them is a tree
 * that was seeded from a national classification and has not been cut over, and
 * diffing it against GeoNames would report every row as new and every row as
 * retired at once — a migration that wipes a country and rebuilds it under a
 * different set of ids, which is exactly what the cutover exists to do
 * carefully and this tool must never do by accident.
 */
const syntheticKeys = new Set(
  upstream.filter((row) => row.geonameid === null).map((row) => keyOf(row)),
);
const unkeyed = live.rows.filter(
  (row) => (row.geonameid === null || row.geonameid === undefined) && !syntheticKeys.has(keyOf(row)),
);

const inserts = [];
const updates = [];
const retires = [];
const unretires = [];
const reparented = [];

for (const row of upstream) {
  const key = keyOf(row);
  const current = liveByKey.get(key);
  if (!current) {
    inserts.push(row);
    continue;
  }
  const changed = [];
  if (current.name !== row.name) changed.push({ column: "name", from: current.name, to: row.name });
  if (canonicalJson(current.nameI18n ?? {}) !== canonicalJson(row.nameI18n)) {
    changed.push({ column: "name_i18n", from: canonicalJson(current.nameI18n ?? {}), to: canonicalJson(row.nameI18n) });
  }
  if ((current.externalCode ?? null) !== row.externalCode) {
    changed.push({ column: "external_code", from: current.externalCode, to: row.externalCode });
  }
  if (changed.length > 0) updates.push({ row, current, changed });

  if (row.parent !== null && current.parent) {
    const before = keyOf(current.parent);
    const after = keyOf(row.parent);
    if (before !== after) reparented.push({ row, current, before, after });
  }

  if (current.retiredAt) unretires.push({ row, current });
}

for (const [key, current] of liveByKey) {
  if (upstreamByKey.has(key)) continue;
  if ((current.geonameid === null || current.geonameid === undefined) && !syntheticKeys.has(key)) continue;
  if (current.retiredAt) continue;
  retires.push(current);
}

/** Object keys sorted, so two equal maps compare equal whatever built them. */
function canonicalJson(map) {
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return "{}";
  const ordered = {};
  for (const key of keys) ordered[key] = map[key];
  return JSON.stringify(ordered);
}

/* --------------------------------------------------------------- the report */

const dumpDate = ingested.files.map((file) => file.dumpDate).sort().at(-1);
const changeCount = inserts.length + updates.length + retires.length + (emitUnretire ? unretires.length : 0);

console.log(`\nGeoNames reconciliation — ${iso}\n`);
console.log(`  dumps        ${ingested.files.map((file) => `${file.iso}.txt`).join(", ")}, published ${dumpDate}`);
console.log(`  live image   ${live.source}`);
console.log(`  compared     ${upstream.length} upstream row(s) against ${live.rows.length} live row(s), keyed on geonames_id`);
console.log(`  scope        ${["country", ...config.levelOrder].join(", ")} rows with country_code = ${iso} (sites are never sourced and never touched)`);
console.log("");
console.log(`  new                ${inserts.length}`);
console.log(`  changed            ${updates.length}`);
console.log(`  retired            ${retires.length}`);
console.log(`  reappeared         ${unretires.length}${emitUnretire ? " (emitted: --unretire)" : " (reported only — pass --unretire to emit)"}`);
console.log(`  reparented         ${reparented.length} (reported only — never emitted)`);
console.log(`  unkeyed live rows  ${unkeyed.length}`);

/** A value as a reviewer wants to read it: quoted when it is a name, bare otherwise. */
function shown(value) {
  if (value === null || value === undefined) return "none";
  return typeof value === "string" && value.startsWith("{") ? value : `"${value}"`;
}

/** A row key as the place it names, so a reparent report is readable. */
function named(key) {
  const row = upstreamByKey.get(key) ?? liveByKey.get(key);
  return row ? `${row.type} ${row.name}` : key;
}

/** Up to `limit` lines of detail, with the remainder counted rather than hidden. */
function detail(title, items, render, limit = 25) {
  if (items.length === 0) return;
  console.log(`\n  ${title}`);
  for (const item of items.slice(0, limit)) console.log(`    ${render(item)}`);
  if (items.length > limit) console.log(`    … and ${items.length - limit} more`);
}

detail("NEW upstream rows", inserts, (row) => `${row.type} ${row.name} (geonameid ${row.geonameid ?? "—"})`);
detail("CHANGED", updates, ({ row, changed }) =>
  `${row.type} ${row.name}: ${changed.map((c) => `${c.column} ${shown(c.from)} → ${shown(c.to)}`).join("; ")}`);
detail("GONE upstream — would be retired", retires, (row) => `${row.type} ${row.name} (geonameid ${row.geonameid ?? "—"})`);
detail("REAPPEARED upstream — currently retired", unretires, ({ row }) => `${row.type} ${row.name} (geonameid ${row.geonameid ?? "—"})`);
detail("REPARENTED upstream — decide by hand", reparented, ({ row, before, after }) =>
  `${row.type} ${row.name}: parent ${named(before)} → ${named(after)}`);

if (unkeyed.length > 0) {
  console.log(
    `\n  ${unkeyed.length} live row(s) in scope carry no geonames_id and are not config-declared synthetic rows.\n` +
      `  This tree was not seeded from GeoNames, so there is nothing to reconcile it against: every\n` +
      `  upstream row reads as new and every live row as retired at once. Run the cutover for ${iso}\n` +
      `  first — that is the one sanctioned path from a national-classification tree to this one, and\n` +
      `  it carries the live references across. No migration was written.`,
  );
  detail("unkeyed", unkeyed, (row) => `${row.type} ${row.name} (external_code ${row.externalCode ?? "—"})`, 10);
  console.log("");
  process.exit(1);
}

/* ------------------------------------------------------------ the migration */

if (changeCount === 0) {
  console.log(
    `\n  Nothing to reconcile. No migration written.` +
      (unretires.length > 0 ? `\n  (${unretires.length} retired row(s) have reappeared upstream — see above.)` : "") +
      "\n",
  );
  process.exit(0);
}

/** How a statement addresses one row: by upstream key, or by the synthetic key. */
function whereClause(row) {
  if (row.geonameid !== null) return `geonames_id = ${sqlBigint(row.geonameid)}`;
  return `country_code = ${sqlText(iso)} AND type = ${sqlText(row.type)} AND external_code = ${sqlText(row.externalCode)}`;
}

const sections = [];

if (inserts.length > 0) {
  const byLevel = ["country", ...config.levelOrder]
    .map((level) => ({ level, rows: inserts.filter((row) => row.type === level) }))
    .filter(({ rows }) => rows.length > 0);

  const statements = byLevel.map(({ level, rows }) => {
    if (level === "country") {
      const [row] = rows;
      return (
        `INSERT INTO public.locations (geonames_id, name, name_i18n, type, parent_id, country_code, external_code)\n` +
        `SELECT ${sqlBigint(row.geonameid)}, ${sqlText(row.name)}, ${sqlJsonb(row.nameI18n)}, 'country', NULL, ${sqlText(iso)}, NULL\n` +
        `WHERE NOT EXISTS (\n` +
        `  SELECT 1 FROM public.locations l\n` +
        `   WHERE l.geonames_id = ${sqlBigint(row.geonameid)}\n` +
        `      OR (l.type = 'country' AND l.country_code = ${sqlText(iso)})\n` +
        `);\n`
      );
    }
    return `-- ${rows.length} new ${level} row(s).\n` + locationInsert(iso, level, rows);
  });

  sections.push(
    `-- ---------------------------------------------------------------------------\n` +
      `-- NEW ROWS\n` +
      `-- ---------------------------------------------------------------------------\n` +
      `--\n` +
      `-- The same guarded INSERT the seed generator emits, so a row that arrives by\n` +
      `-- reconciliation is indistinguishable from one that arrived by seed. Levels are\n` +
      `-- inserted top-down, because each row joins to its parent by the parent's\n` +
      `-- geonames_id — a new row under a new parent needs the parent to land first.\n\n` +
      statements.join("\n"),
  );
}

if (updates.length > 0) {
  const statements = updates.map(({ row, changed }) => {
    const sets = changed
      .map((change) => {
        if (change.column === "name") return `name = ${sqlText(row.name)}`;
        if (change.column === "name_i18n") return `name_i18n = ${sqlJsonb(row.nameI18n)}`;
        return `external_code = ${sqlText(row.externalCode)}`;
      })
      .join(",\n       ");
    const was = changed.map((change) => `${change.column} was ${shown(change.from)}`).join("; ");
    return `-- ${row.type} ${row.name}: ${was}\nUPDATE public.locations\n   SET ${sets}\n WHERE ${whereClause(row)};\n`;
  });

  sections.push(
    `-- ---------------------------------------------------------------------------\n` +
      `-- RENAMES, ALTERNATES AND CODE CORRECTIONS\n` +
      `-- ---------------------------------------------------------------------------\n` +
      `--\n` +
      `-- Each row's previous value is in the comment above its statement, because the\n` +
      `-- review this migration exists for is "is this rename legitimate?" and that is\n` +
      `-- not a question the new value alone can answer. A wrong name here is corrected\n` +
      `-- in GeoNames and re-synced, never by editing the value below into an override.\n\n` +
      statements.join("\n"),
  );
}

if (retires.length > 0) {
  const keyed = retires.filter((row) => row.geonameid !== null && row.geonameid !== undefined);
  const synthetic = retires.filter((row) => row.geonameid === null || row.geonameid === undefined);
  const statements = [];
  if (keyed.length > 0) {
    statements.push(
      keyed.map((row) => `-- ${row.type} ${row.name}`).join("\n") +
        `\nUPDATE public.locations\n   SET retired_at = now()\n WHERE geonames_id IN (${keyed.map((row) => sqlBigint(row.geonameid)).join(", ")})\n   AND retired_at IS NULL;\n`,
    );
  }
  for (const row of synthetic) {
    statements.push(
      `-- ${row.type} ${row.name} (config-declared synthetic row)\nUPDATE public.locations\n   SET retired_at = now()\n WHERE ${whereClause(row)}\n   AND retired_at IS NULL;\n`,
    );
  }

  sections.push(
    `-- ---------------------------------------------------------------------------\n` +
      `-- RETIREMENTS\n` +
      `-- ---------------------------------------------------------------------------\n` +
      `--\n` +
      `-- Rows GeoNames no longer carries live. They are RETIRED, never deleted:\n` +
      `-- gedu_locations.location_id is ON DELETE CASCADE, so a delete here would erase\n` +
      `-- a gedu's coverage silently. A retired row disappears from every read that\n` +
      `-- offers a place and keeps answering every keyed read, so a stored pick stays\n` +
      `-- valid and an ancestor chain still renders whole.\n` +
      `--\n` +
      `-- Check the report for anything that references one of these before pushing.\n\n` +
      statements.join("\n"),
  );
}

if (emitUnretire && unretires.length > 0) {
  const keyed = unretires.map(({ row }) => row).filter((row) => row.geonameid !== null);
  const statements = keyed.map(
    (row) => `-- ${row.type} ${row.name}\nUPDATE public.locations\n   SET retired_at = NULL\n WHERE ${whereClause(row)};\n`,
  );
  sections.push(
    `-- ---------------------------------------------------------------------------\n` +
      `-- UN-RETIREMENTS (emitted because --unretire was passed)\n` +
      `-- ---------------------------------------------------------------------------\n` +
      `--\n` +
      `-- Rows that were retired and that GeoNames carries live again. This section is\n` +
      `-- opt-in because a reappearance is more often upstream flapping than a place\n` +
      `-- coming back, and putting a row back into every picker is a visible change to\n` +
      `-- what people can choose.\n\n` +
      statements.join("\n"),
  );
}

const migration = `-- Reconciles ${iso}'s location tree with GeoNames as published ${dumpDate}.
--
-- RENUMBER THIS FILE BEFORE PUSHING IT
--
-- It is deliberately named with no version number and written outside
-- supabase/migrations/, because the differ that emitted it cannot know the next
-- free number: an already-used version is silently treated as applied, so the
-- number has to be checked against REMOTE migration history at the moment of
-- pushing rather than guessed at the moment of emitting. Pick it, rename this
-- file to <NNNNN>_reconcile_${iso.toLowerCase()}_geonames.sql, and move it into
-- supabase/migrations/.
--
-- REGENERATING
--
--   node scripts/diff-geonames.mjs ${iso}${emitUnretire ? " --unretire" : ""}
--
-- SOURCE
--
-- GeoNames country dump ${ingested.files.map((file) => `${file.iso}.txt`).join(", ")} published ${dumpDate}, plus the
-- matching alternate-names files — CC BY 4.0, republished daily. Compared
-- against ${live.source}.
--
-- WHAT THIS MAY CONTAIN, AND WHAT IT MAY NOT
--
-- Inserts, renames, name_i18n updates, external_code corrections and retired_at
-- stamps. Never a DELETE — gedu_locations.location_id is ON DELETE CASCADE, so
-- deleting a superseded place erases a gedu's coverage silently, and retirement
-- is what exists instead. Never a reparent either: ${reparented.length} row(s) changed parent
-- upstream and are reported rather than moved, because re-parenting a non-leaf
-- leaves its descendants' depth stale and an administrative re-levelling wants a
-- human writing the migration.
--
-- SUMMARY
--
--   new          ${inserts.length}
--   changed      ${updates.length}
--   retired      ${retires.length}
--   un-retired   ${emitUnretire ? unretires.length : 0}${emitUnretire ? "" : ` (${unretires.length} reported, not emitted)`}
--   reparented   ${reparented.length} (reported, not emitted)
--
-- Data-only migration: no schema change, no type change, no grant change.

BEGIN;

${sections.join("\n")}
COMMIT;
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, migration, "utf8");

console.log(`\n  Wrote ${outPath}`);
console.log(`  Renumber it against remote migration history, then move it into supabase/migrations/.\n`);
