import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  DB_SEAT_READERS,
  TS_SEAT_READERS,
} from "../helpers/seat-reader-registry";

/**
 * Every reader of seats says whether it means the seats held now or the history.
 *
 * A seat ends and stays, so a read of `participations` or `family_subscriptions`
 * that never asks about status treats a family who left as a current one. The
 * registry in `tests/helpers/seat-reader-registry.ts` classifies each read; this
 * check enumerates the reads afresh on every run and fails on one the registry
 * does not name, and on an entry whose read no longer exists.
 *
 * The database half reads `supabase/schema/` rather than the catalog: CI
 * regenerates that directory from the migrations and fails when it differs, so
 * it is the catalog, readable on every run without a database.
 */

const ROOT = join(__dirname, "..", "..");
const TABLE = /\b(?:participations|family_subscriptions)\b/;

function walk(dir: string, keep: (file: string) => boolean, out: string[] = []): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed in-repo directory, walked from this file's own location
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, keep, out);
    else if (keep(path)) out.push(path);
  }
  return out;
}

function read(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
  return readFileSync(path, "utf8");
}

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

const withoutSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

/**
 * Every function, view and policy in the schema dump that names a seat table.
 * pg_dump heads each object with `-- Name: <name>; Type: <type>; …`, so the
 * dump splits into one chunk per object on that header.
 */
function dbReaders(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(join(ROOT, "supabase", "schema"), (f) => f.endsWith(".sql"))) {
    for (const chunk of read(file).split(/^-- Name: /m).slice(1)) {
      const [name, typeField] = chunk.split("; Type: ", 2);
      const type = typeField.slice(0, typeField.indexOf(";"));
      const definition = withoutSqlComments(chunk.slice(chunk.indexOf("\n")));
      if (type === "FUNCTION") {
        if (TABLE.test(definition)) found.add(`function:${name.slice(0, name.indexOf("("))}`);
      } else if (type === "VIEW" || type === "MATERIALIZED VIEW") {
        if (TABLE.test(definition)) found.add(`view:${name}`);
      } else if (type === "POLICY") {
        // The expression only: the policy's own table is named in its ON clause.
        const using = definition.search(/ (?:USING|WITH CHECK) /);
        const [table, policy] = name.split(" ");
        if (using >= 0 && TABLE.test(definition.slice(using))) {
          found.add(`policy:${table}.${policy}`);
        }
      }
    }
  }
  return found;
}

const TS_READ =
  /\.from\(\s*["'](?:participations|family_subscriptions)["']|\b(?:participations|family_subscriptions)(?:\(|!\w)/g;

/** Comments out, so prose naming a table is not a read. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Every read of a seat table under `src/`, by file, as the source between the
 * read before it (or the top of the file) and this one.
 */
function tsReaders(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const files = walk(
    join(ROOT, "src"),
    (f) => /\.tsx?$/.test(f) && !f.endsWith("database.types.ts"),
  );
  for (const file of files) {
    const source = stripComments(read(file));
    const starts = [...source.matchAll(TS_READ)].map((m) => m.index);
    const spans = starts.map((start, i) => source.slice(i === 0 ? 0 : starts[i - 1], start));
    if (spans.length > 0) found.set(repoPath(file), spans);
  }
  return found;
}

describe("seat readers", () => {
  it("the scans see the readers they are known to have", () => {
    // A scan whose pattern stopped matching would pass on an empty set.
    expect(dbReaders()).toContain("function:end_participation");
    expect(tsReaders().has("src/services/participations/switch-club.server.ts")).toBe(true);
  });

  it("every database reader is classified, and every entry still reads", () => {
    const found = dbReaders();
    const registered = new Set(Object.keys(DB_SEAT_READERS));
    expect([...found].filter((k) => !registered.has(k)).sort()).toEqual([]);
    expect([...registered].filter((k) => !found.has(k)).sort()).toEqual([]);
  });

  it("every TypeScript reader is classified, in order, inside the code it names", () => {
    const found = tsReaders();
    const problems: string[] = [];
    for (const [file, reads] of found) {
      const entries = TS_SEAT_READERS[file] ?? [];
      if (entries.length !== reads.length) {
        problems.push(`${file}: ${reads.length} reads, ${entries.length} entries`);
        continue;
      }
      // An entry's code is named between the previous read and its own, unless
      // it shares the previous entry's code.
      entries.forEach((entry, i) => {
        const sharesPrevious = i > 0 && entries[i - 1].in === entry.in;
        const names: readonly string[] = reads[i].match(/\w+/g) ?? [];
        if (!sharesPrevious && !names.includes(entry.in)) {
          problems.push(`${file}: read ${i + 1} is not inside ${entry.in}`);
        }
      });
    }
    for (const file of Object.keys(TS_SEAT_READERS)) {
      if (!found.has(file)) problems.push(`${file}: registered, but reads no seat table`);
    }
    expect(problems).toEqual([]);
  });

  it("every entry gives its reason", () => {
    const entries = [
      ...Object.values(DB_SEAT_READERS),
      ...Object.values(TS_SEAT_READERS).flat(),
    ];
    expect(entries.filter((e) => e.why.trim() === "")).toEqual([]);
  });
});
