import { beforeAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  type AssignmentReadKind,
  DB_ASSIGNMENT_READERS,
  TS_ASSIGNMENT_READERS,
} from "../helpers/assignment-reader-registry";

/**
 * Every reader of gedu assignments says whether it means the staff now or the
 * staff at a session.
 *
 * An assignment is a period that ends and stays, so a read of
 * `gedu_group_assignments` that never asks about its bounds treats a gedu taken
 * off a group as one still on it. The registry in
 * `tests/helpers/assignment-reader-registry.ts` classifies each read; this check
 * enumerates the reads afresh on every run and fails on one the registry does
 * not name, and on an entry whose read no longer exists. It also holds each
 * entry to the mark of its class in the read itself, so a `current` reader
 * that forgot to filter ended periods fails rather than passing on its label.
 *
 * A call to `group_assignments_at` counts as a read: it is the table read at an
 * instant, the one containment rule, and the at-session readers reach the table
 * through it rather than by name.
 *
 * The database half reads `supabase/schema/` rather than the catalog: CI
 * regenerates that directory from the migrations and fails when it differs, so
 * it is the catalog, readable on every run without a database.
 */

const ROOT = join(__dirname, "..", "..");
const OWN_TABLE = "gedu_group_assignments";
const TABLE = /\b(?:gedu_group_assignments|group_assignments_at)\b/;

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
 * Every function, view and policy in the schema dump that reads assignments,
 * with its definition. pg_dump heads each object with
 * `-- Name: <name>; Type: <type>; …`, so the dump splits into one chunk per
 * object on that header; overloads of one function share a key, and their
 * definitions are joined.
 */
function dbReaders(): Map<string, string> {
  const found = new Map<string, string>();
  const add = (key: string, definition: string) =>
    found.set(key, (found.get(key) ?? "") + definition);
  for (const file of walk(join(ROOT, "supabase", "schema"), (f) => f.endsWith(".sql"))) {
    for (const chunk of read(file).split(/^-- Name: /m).slice(1)) {
      const [name, typeField] = chunk.split("; Type: ", 2);
      const type = typeField.slice(0, typeField.indexOf(";"));
      const definition = withoutSqlComments(chunk.slice(chunk.indexOf("\n")));
      if (type === "FUNCTION") {
        if (TABLE.test(definition)) add(`function:${name.slice(0, name.indexOf("("))}`, definition);
      } else if (type === "VIEW" || type === "MATERIALIZED VIEW") {
        if (TABLE.test(definition)) add(`view:${name}`, definition);
      } else if (type === "POLICY") {
        // A policy on the table reads it whatever its expression says, and its
        // expression need not name it; on any other table, the expression only,
        // since the policy's own table is named in its ON clause.
        const using = definition.search(/ (?:USING|WITH CHECK) /);
        const [table, policy] = name.split(" ");
        if (table === OWN_TABLE || (using >= 0 && TABLE.test(definition.slice(using)))) {
          add(`policy:${table}.${policy}`, definition);
        }
      }
    }
  }
  return found;
}

/** The at-session functions, each holding its own mark, that another may delegate to. */
const AT_SESSION_FUNCTIONS = Object.entries(DB_ASSIGNMENT_READERS)
  .filter(([key, e]) => e.kind === "at-session" && key.startsWith("function:"))
  .map(([key]) => key.slice("function:".length));

/**
 * What each class's definition must contain, as a description of what is
 * missing, or `undefined` when it carries its mark. `writer` and `own-history`
 * read every period by design, so there is nothing to look for.
 */
const DB_MARKS: Partial<
  Record<AssignmentReadKind, (definition: string, key: string) => string | undefined>
> = {
  current: (d) =>
    /\bended_at\s+IS\s+NULL\b/i.test(d) ? undefined : "never filters `ended_at IS NULL`",
  "at-session": (d, key) =>
    /\bgroup_assignments_at\s*\(/.test(d) ||
    (/\bstarted_at\b/.test(d) && /\bended_at\b/.test(d)) ||
    // Its own name heads its definition, so it never counts as its own delegate.
    AT_SESSION_FUNCTIONS.some((f) => key !== `function:${f}` && d.includes(`public.${f}(`))
      ? undefined
      : "neither calls `group_assignments_at` or another at-session function nor reads both `started_at` and `ended_at`",
};

const CURRENT_FILTER = /\.is\(\s*["']ended_at["']\s*,\s*null\s*\)/;
const CURRENT_EMBED_FILTER = /\.is\(\s*["'][\w!]+\.ended_at["']\s*,\s*null\s*\)/;

const TS_READ =
  /\.from\(\s*["']gedu_group_assignments["']|\bgedu_group_assignments(?:\(|!\w)/g;

/** Comments out, so prose naming the table is not a read. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

interface TsRead {
  /** The source between the read before it (or the top of the file) and this one. */
  before: string;
  /** The query the read opens: from the read to the next `.from(` or `;`. */
  query: string;
}

/** Every read of the table under `src/`, by file, in order. */
function tsReaders(): Map<string, TsRead[]> {
  const found = new Map<string, TsRead[]>();
  const files = walk(
    join(ROOT, "src"),
    (f) => /\.tsx?$/.test(f) && !f.endsWith("database.types.ts"),
  );
  for (const file of files) {
    const source = stripComments(read(file));
    const starts = [...source.matchAll(TS_READ)].map((m) => m.index);
    const reads = starts.map((start, i) => {
      const rest = source.slice(start + 1);
      const end = rest.search(/\.from\(|;/);
      return {
        before: source.slice(i === 0 ? 0 : starts[i - 1], start),
        query: source.slice(start, end < 0 ? undefined : start + 1 + end),
      };
    });
    if (reads.length > 0) found.set(repoPath(file), reads);
  }
  return found;
}

describe("assignment readers", () => {
  // Each scan walks a whole tree, so it runs once and every test reads the
  // result; its time is the hook's, not any one test's.
  let db: Map<string, string>;
  let ts: Map<string, TsRead[]>;
  beforeAll(() => {
    db = dbReaders();
    ts = tsReaders();
  }, 60_000);

  it("the scans see the readers they are known to have", () => {
    // A scan whose pattern stopped matching would pass on an empty set.
    expect(db.has("function:gedu_holds_seat_at_session")).toBe(true);
    expect(ts.has("src/app/api/voice/token/route.ts")).toBe(true);
  });

  it("every database reader is classified, and every entry still reads", () => {
    const found = db;
    const registered = new Set(Object.keys(DB_ASSIGNMENT_READERS));
    expect([...found.keys()].filter((k) => !registered.has(k)).sort()).toEqual([]);
    expect([...registered].filter((k) => !found.has(k)).sort()).toEqual([]);
  });

  it("every TypeScript reader is classified, in order, inside the code it names", () => {
    const found = ts;
    const problems: string[] = [];
    for (const [file, reads] of found) {
      const entries = TS_ASSIGNMENT_READERS[file] ?? [];
      if (entries.length !== reads.length) {
        problems.push(`${file}: ${reads.length} reads, ${entries.length} entries`);
        continue;
      }
      // An entry's code is named between the previous read and its own, unless
      // it shares the previous entry's code.
      entries.forEach((entry, i) => {
        const sharesPrevious = i > 0 && entries[i - 1].in === entry.in;
        const names: readonly string[] = reads[i].before.match(/\w+/g) ?? [];
        if (!sharesPrevious && !names.includes(entry.in)) {
          problems.push(`${file}: read ${i + 1} is not inside ${entry.in}`);
        }
      });
    }
    for (const file of Object.keys(TS_ASSIGNMENT_READERS)) {
      if (!found.has(file)) problems.push(`${file}: registered, but reads no assignments`);
    }
    expect(problems).toEqual([]);
  });

  it("every database reader carries the mark of its class", () => {
    const problems: string[] = [];
    for (const [key, entry] of Object.entries(DB_ASSIGNMENT_READERS)) {
      const definition = db.get(key);
      if (definition === undefined) continue; // the classification check names it
      const missing = DB_MARKS[entry.kind]?.(definition, key);
      if (missing) problems.push(`${key} (${entry.kind}): ${missing}`);
    }
    expect(problems).toEqual([]);
  });

  it("every current TypeScript reader filters ended periods in its query", () => {
    const problems: string[] = [];
    for (const [file, reads] of ts) {
      (TS_ASSIGNMENT_READERS[file] ?? []).forEach((entry, i) => {
        const read = reads.at(i);
        if (entry.kind !== "current" || read === undefined) return;
        // An embed filters through its own path; a bare `ended_at` there is
        // the outer table's column.
        const mark = read.query.startsWith(".from(") ? CURRENT_FILTER : CURRENT_EMBED_FILTER;
        if (!mark.test(read.query)) {
          problems.push(`${file}: read ${i + 1} in ${entry.in} has no ended_at null filter`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it("every entry gives its reason", () => {
    const entries = [
      ...Object.values(DB_ASSIGNMENT_READERS),
      ...Object.values(TS_ASSIGNMENT_READERS).flat(),
    ];
    expect(entries.filter((e) => e.why.trim() === "")).toEqual([]);
  });
});
