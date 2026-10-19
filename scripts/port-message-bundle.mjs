/**
 * Port a whole-locale message bundle (the old `messages/<locale>.json`) into the
 * per-namespace layout (`messages/<locale>/<namespace>.json` plus the
 * directory's `index.ts`).
 *
 * For a branch cut before the catalogs were split, whose merge conflicts with
 * the bundle modified on its side and deleted on this one:
 *
 *   git show <branch>:messages/en.json | node scripts/port-message-bundle.mjs en
 *
 * one locale at a time, then `git rm messages/en.json` to settle the conflict.
 *
 * **It merges per namespace against a base, never overwrites wholesale.** The
 * base is the bundle as it was where the branch left off — `--base <ref>`, or,
 * during a merge, the merge base of HEAD and MERGE_HEAD found on its own. Per
 * namespace: one the branch left as it was in the base keeps this checkout's
 * file, so copy changed here since the branch point survives; one the branch
 * changed while this checkout did not takes the branch's version; one both
 * changed differently is a conflict — this checkout's file is kept, the
 * branch's version is written to `scripts/output/port-message-bundle/` for a
 * hand merge, and the script exits 1. With no base at all (no `--base` and no
 * merge in progress) the bundle is taken as it stands, every namespace, and the
 * output says so.
 *
 * Prints which namespace files it changed, added and removed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { outputDir } from "./lib/output.mjs";

const REPO_ROOT = path.join(import.meta.dirname, "..");
const MESSAGES_DIR = path.join(REPO_ROOT, "messages");

function fail(message) {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base");
let baseRef = null;
if (baseFlag !== -1) {
  baseRef = args[baseFlag + 1];
  if (!baseRef) fail("--base needs a ref.");
  args.splice(baseFlag, 2);
}
const [locale] = args;
if (!locale || args.length !== 1) {
  fail("Usage: git show <branch>:messages/<locale>.json | node scripts/port-message-bundle.mjs <locale> [--base <ref>]");
}
const localeDir = path.join(MESSAGES_DIR, locale);
if (!existsSync(path.join(localeDir, "index.ts"))) {
  fail(`No catalog at messages/${locale}/ — is "${locale}" a locale here?`);
}

const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function tryGit(...gitArgs) {
  try {
    return git(...gitArgs);
  } catch {
    return null;
  }
}

const branch = JSON.parse(readFileSync(0, "utf8"));

if (!baseRef && tryGit("rev-parse", "-q", "--verify", "MERGE_HEAD")) {
  baseRef = tryGit("merge-base", "HEAD", "MERGE_HEAD");
}
let base = null;
if (baseRef) {
  const raw = tryGit("show", `${baseRef}:messages/${locale}.json`);
  if (raw === null) fail(`messages/${locale}.json does not exist at ${baseRef}, so it cannot be the base.`);
  base = JSON.parse(raw);
}

// This checkout's catalog, in its index's order.
const index = readFileSync(path.join(localeDir, "index.ts"), "utf8");
const currentOrder = [...index.matchAll(/^import (\w+) from "\.\/(\w+)\.json";$/gm)].map((m) => m[2]);
const current = {};
for (const ns of currentOrder) {
  current[ns] = JSON.parse(readFileSync(path.join(localeDir, `${ns}.json`), "utf8"));
}

// Per namespace, `undefined` meaning absent on that side.
const all = [...new Set([...currentOrder, ...Object.keys(branch), ...Object.keys(base ?? {})])];
const result = {};
const conflicts = [];
for (const ns of all) {
  const mine = current[ns];
  const theirs = branch[ns];
  if (!base || isDeepStrictEqual(mine, theirs)) {
    result[ns] = base ? mine : theirs;
  } else if (isDeepStrictEqual(theirs, base[ns])) {
    result[ns] = mine;
  } else if (isDeepStrictEqual(mine, base[ns])) {
    result[ns] = theirs;
  } else {
    conflicts.push(ns);
    result[ns] = mine;
  }
}

// Namespace order: this checkout's, with any new namespace placed after the
// one it follows in the branch's bundle.
const order = currentOrder.filter((ns) => result[ns] !== undefined);
for (const ns of Object.keys(branch)) {
  if (result[ns] === undefined || order.includes(ns)) continue;
  const keys = Object.keys(branch);
  const before = keys.slice(0, keys.indexOf(ns)).reverse().find((k) => order.includes(k));
  order.splice(before ? order.indexOf(before) + 1 : 0, 0, ns);
}

const serialize = (value) => JSON.stringify(value, null, 2) + "\n";
const changed = [];
const added = [];
const removed = [];
for (const ns of all) {
  const file = path.join(localeDir, `${ns}.json`);
  if (result[ns] === undefined) {
    if (existsSync(file)) {
      unlinkSync(file);
      removed.push(ns);
    }
    continue;
  }
  const next = serialize(result[ns]);
  if (!existsSync(file)) {
    writeFileSync(file, next);
    added.push(ns);
  } else if (readFileSync(file, "utf8") !== next) {
    writeFileSync(file, next);
    changed.push(ns);
  }
}

if (added.length > 0 || removed.length > 0) {
  // The same shape every locale's index has; check-translations holds the
  // list and the directory together.
  const header = index.slice(0, index.search(/^import /m));
  writeFileSync(
    path.join(localeDir, "index.ts"),
    [
      header.trimEnd(),
      ...order.map((ns) => `import ${ns} from "./${ns}.json";`),
      "",
      "const messages = {",
      ...order.map((ns) => `  ${ns},`),
      "};",
      "",
      "export default messages;",
      "",
    ].join("\n"),
  );
}

const leftovers = readdirSync(localeDir).filter(
  (f) => f.endsWith(".json") && !order.includes(f.slice(0, -5)),
);
if (leftovers.length > 0) console.warn(`Not in the catalog, left alone: ${leftovers.join(", ")}`);

console.log(
  base
    ? `messages/${locale}: merged per namespace against ${baseRef.slice(0, 12)}.`
    : `messages/${locale}: no base — the bundle was taken as it stands, every namespace.`,
);
const list = (label, names) => {
  if (names.length > 0) console.log(`  ${label}: ${names.map((ns) => `${ns}.json`).join(", ")}`);
};
list("changed", changed);
list("added", added);
list("removed", removed);
if (changed.length + added.length + removed.length === 0) console.log("  no namespace files changed");

if (conflicts.length > 0) {
  const out = path.join(outputDir(import.meta.url), locale);
  mkdirSync(out, { recursive: true });
  for (const ns of conflicts) {
    if (branch[ns] !== undefined) writeFileSync(path.join(out, `${ns}.branch.json`), serialize(branch[ns]));
    if (base[ns] !== undefined) writeFileSync(path.join(out, `${ns}.base.json`), serialize(base[ns]));
  }
  console.error(
    `  CONFLICT (both sides changed, this checkout's file kept): ${conflicts.map((ns) => `${ns}.json`).join(", ")}\n` +
      `  The branch's and the base's versions are in ${path.relative(REPO_ROOT, out)} for a hand merge.`,
  );
  process.exit(1);
}
