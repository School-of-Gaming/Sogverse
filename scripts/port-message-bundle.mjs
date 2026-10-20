/**
 * Port a whole-locale message bundle (the old `messages/<locale>.json`) into the
 * per-namespace layout (`messages/<locale>/<namespace>.json` plus the
 * directory's `index.ts`).
 *
 * For a branch cut before the catalogs were split, whose merge conflicts with
 * the bundle modified on its side and deleted on this one:
 *
 *   node scripts/port-message-bundle.mjs en <branch>
 *
 * one locale at a time, then `git rm messages/en.json` to settle the conflict.
 * The script reads `<branch>:messages/en.json` itself through `git show`: piping
 * it in is not offered, because Windows PowerShell re-encodes a pipe and turns
 * ä, ö, å and ’ into `?`.
 *
 * **It merges per key against a base, never overwrites wholesale.** The base is
 * the bundle as it was where the branch left off — `--base <ref>`, or, during a
 * merge, the merge base of HEAD and MERGE_HEAD found on its own. A rebase or a
 * cherry-pick has no MERGE_HEAD, so there the base has to be given. The merge
 * is three-way at every level of the tree: a key only the branch changed takes
 * the branch's value, one only this checkout changed keeps its own, one both
 * changed the same way is fine, and one both changed differently — a leaf, or a
 * key one side made an object and the other a string — is a conflict. A
 * conflict keeps this checkout's value, the script lists its dotted key path,
 * writes the branch's and the base's copies of the namespace to
 * `scripts/output/port-message-bundle/<locale>/` for a hand merge, and exits 1.
 * Key order is this checkout's, with a key new from the branch placed after the
 * sibling it follows there.
 *
 * `--no-base` takes the branch's bundle as it stands, every namespace — which
 * reverts copy changed here since the branch point and deletes namespaces added
 * here since, so it is never the default.
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
const USAGE = "Usage: node scripts/port-message-bundle.mjs <locale> <branch-ref> [--base <ref> | --no-base]";

function fail(message) {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
let baseRef = null;
const baseFlag = args.indexOf("--base");
if (baseFlag !== -1) {
  baseRef = args[baseFlag + 1];
  if (!baseRef || baseRef.startsWith("--")) fail("--base needs a ref.");
  args.splice(baseFlag, 2);
}
const noBaseFlag = args.indexOf("--no-base");
const noBase = noBaseFlag !== -1;
if (noBase) args.splice(noBaseFlag, 1);
if (noBase && baseRef) fail("--base and --no-base contradict each other.");
const [locale, branchRef] = args;
if (!locale || !branchRef || args.length !== 2) fail(USAGE);

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

const hasRef = (ref) => tryGit("rev-parse", "-q", "--verify", ref) !== null;

function readBundle(ref, role) {
  const raw = tryGit("show", `${ref}:messages/${locale}.json`);
  if (raw === null) fail(`messages/${locale}.json does not exist at ${ref}, so it cannot be the ${role}.`);
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`messages/${locale}.json at ${ref} is not valid JSON: ${error.message}`);
  }
}

const branch = readBundle(branchRef, "branch");

if (!baseRef && !noBase) {
  if (hasRef("MERGE_HEAD")) {
    baseRef = tryGit("merge-base", "HEAD", "MERGE_HEAD");
    if (!baseRef) fail("A merge is in progress, but HEAD and MERGE_HEAD have no merge base. Pass --base <ref>.");
  } else {
    const replaying = ["REBASE_HEAD", "CHERRY_PICK_HEAD"].find(hasRef);
    fail(
      replaying
        ? `A ${replaying === "REBASE_HEAD" ? "rebase" : "cherry-pick"} is in progress, and it has no MERGE_HEAD to find a base from.\n` +
            `Pass --base <branch-point>: the bundle as it was before the commit being applied, which is its parent —\n` +
            `  node scripts/port-message-bundle.mjs ${locale} ${replaying} --base ${replaying}^\n` +
            `To port a whole branch at once instead, the branch point is \`git merge-base <upstream> <branch>\`.`
        : `No base. Pass --base <ref> — the commit the branch was cut from, \`git merge-base <upstream> <branch>\` —\n` +
            `or run this during the merge, where the base is found from MERGE_HEAD. --no-base takes the branch's\n` +
            `bundle as it stands, reverting copy changed here since and deleting namespaces added here since.`,
    );
  }
}
const base = baseRef ? readBundle(baseRef, "base") : null;

// This checkout's catalog, in its index's order. A line the parse misses would
// read as a namespace absent here, and the merge would then delete its file —
// so the parsed list must match the directory before anything is written.
const index = readFileSync(path.join(localeDir, "index.ts"), "utf8").replace(/\r\n/g, "\n");
// Either quote style, and an optional `with { type: "json" }` (or `assert`) clause.
function importedNamespace(line) {
  const match = /^import\s+\w+\s+from\s+(["'])\.\/([\w-]+)\.json\1(.*)$/.exec(line.trim());
  if (!match) return null;
  const tail = match[3].replace(/;$/, "").trim();
  return tail === "" || /^(with|assert)\s*\{[^}]*\}$/.test(tail) ? match[2] : null;
}
const currentOrder = index
  .split("\n")
  .map(importedNamespace)
  .filter((ns) => ns !== null);
const onDisk = readdirSync(localeDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5));
const unparsed = onDisk.filter((ns) => !currentOrder.includes(ns));
const missing = currentOrder.filter((ns) => !onDisk.includes(ns));
if (unparsed.length > 0 || missing.length > 0) {
  fail(
    `messages/${locale}/index.ts and the files beside it disagree, so this checkout's catalog cannot be read safely:\n` +
      (unparsed.length > 0 ? `  a file with no import line the script recognises: ${unparsed.map((ns) => `${ns}.json`).join(", ")}\n` : "") +
      (missing.length > 0 ? `  an import with no file: ${missing.map((ns) => `${ns}.json`).join(", ")}\n` : "") +
      `Each namespace needs one line of the form \`import <name> from "./<name>.json";\`. Nothing was written.`,
  );
}
const current = {};
for (const ns of currentOrder) {
  current[ns] = JSON.parse(readFileSync(path.join(localeDir, `${ns}.json`), "utf8"));
}

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `ours`' keys in their order, with each key new from `theirs` placed after the
 * nearest key it follows in `theirs` that is kept — or before the nearest one
 * it precedes, or else at the end.
 */
function orderKeys(oursKeys, theirsKeys, kept) {
  const order = oursKeys.filter(kept);
  theirsKeys.forEach((key, i) => {
    if (!kept(key) || order.includes(key)) return;
    const before = theirsKeys.slice(0, i).reverse().find((k) => order.includes(k));
    const after = theirsKeys.slice(i + 1).find((k) => order.includes(k));
    if (before !== undefined) order.splice(order.indexOf(before) + 1, 0, key);
    else if (after !== undefined) order.splice(order.indexOf(after), 0, key);
    else order.push(key);
  });
  return order;
}

/**
 * Three-way merge of one node; `undefined` means absent on that side and, as a
 * result, that the key goes. A conflict keeps `ours` and records its path.
 */
function merge(ours, theirs, ancestor, keyPath, conflicts) {
  if (isDeepStrictEqual(ours, theirs) || isDeepStrictEqual(theirs, ancestor)) return ours;
  if (isDeepStrictEqual(ours, ancestor)) return theirs;
  if (isRecord(ours) && isRecord(theirs)) {
    const from = isRecord(ancestor) ? ancestor : {};
    const merged = {};
    const keys = [...new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(from)])];
    for (const key of keys) {
      merged[key] = merge(ours[key], theirs[key], from[key], [...keyPath, key], conflicts);
    }
    const out = {};
    for (const key of orderKeys(Object.keys(ours), Object.keys(theirs), (k) => merged[k] !== undefined)) {
      out[key] = merged[key];
    }
    return out;
  }
  conflicts.push(keyPath.join("."));
  return ours;
}

const conflicts = [];
const result = base ? merge(current, branch, base, [], conflicts) : branch;
const order = orderKeys(currentOrder, Object.keys(branch), (ns) => result[ns] !== undefined);
const all = [...new Set([...currentOrder, ...Object.keys(result)])];

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
  const header = index.slice(0, index.search(/^import\s/m));
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

console.log(
  base
    ? `messages/${locale}: merged per key against ${baseRef}.`
    : `messages/${locale}: --no-base — the branch's bundle was taken as it stands, every namespace.`,
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
  const namespaces = [...new Set(conflicts.map((p) => p.split(".")[0]))];
  for (const ns of namespaces) {
    if (branch[ns] !== undefined) writeFileSync(path.join(out, `${ns}.branch.json`), serialize(branch[ns]));
    if (base[ns] !== undefined) writeFileSync(path.join(out, `${ns}.base.json`), serialize(base[ns]));
  }
  console.error(
    `  CONFLICT (both sides changed differently, this checkout's value kept):\n` +
      conflicts.map((p) => `    ${p}\n`).join("") +
      `  The branch's and the base's copies of ${namespaces.map((ns) => `${ns}.json`).join(", ")} are in ` +
      `${path.relative(REPO_ROOT, out)} for a hand merge.`,
  );
  process.exit(1);
}
