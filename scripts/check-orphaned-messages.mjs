/**
 * CI check: find message keys in `en.json` that no code can reach.
 *
 * ## Why this exists
 *
 * Nothing failed when a key stopped being used. Deleting a template, a page or
 * a whole feature leaves its copy behind in five catalogs, and the cost is paid
 * later — by translators carrying dead strings, and by whoever greps the catalog
 * and reads them as shipping features. Roughly a hundred keys had accumulated by
 * the time anyone counted, every one from a removal that swept its code but not
 * its copy.
 *
 * ## The guarantee, and the deliberate asymmetry
 *
 * **A key reported here is unreachable. A key not reported may still be dead.**
 * That trade is the whole design: this gates CI, so a false positive deletes
 * live copy and breaks a page in production, while a false negative merely
 * leaves a dead key for the next sweep. Every ambiguous branch below resolves by
 * *keeping* the key, and anything the analysis cannot account for fails the run
 * loudly rather than quietly narrowing what it claims to have checked.
 *
 * ## How it decides
 *
 * A key is reachable only through a translator scoped to one of its ancestors,
 * so the analysis is: find every scope, then read every key used at it.
 *
 * 1. `useTranslations("x")` / `getTranslations("x")` / `createTranslator({...})`
 *    bind a variable to a namespace.
 * 2. A call whose first parameter is *declared inside next-intl* is a translator
 *    call — which is what distinguishes `t("save")` from the many ordinary
 *    functions here that also take a string-literal union first.
 * 3. The compiler gives the argument's type. A literal, or a template over a
 *    finite union (`` t(`startModes.${option}`) ``), expands to a union of
 *    string literals and is read exactly — which is why this is a compiler
 *    script and not a grep: those composed keys appear nowhere in the source
 *    text, and a grep would report all of them as orphans.
 *
 * ## What poisons a namespace (and is therefore never reported)
 *
 * - `t.raw()` — typed `string`, so the compiler validates nothing at all. The
 *   legal pages read their bodies this way, which is the worst place to be
 *   wrong, so any file using it keeps every namespace it scopes.
 * - A namespace assembled at runtime (`` useTranslations(`voice.instant.${r}`) ``).
 * - An argument the compiler cannot pin to literals.
 *
 * Keys reachable only from outside type-checked source — a `.mjs` script, or a
 * key stored in the database — are beyond what this can see. Nothing does that
 * today; if something starts to, it needs an entry in ALWAYS_KEEP.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/**
 * Namespaces to treat as reachable whatever the analysis concludes, for keys
 * consumed somewhere the compiler cannot follow. Empty today; a new entry wants
 * a comment naming the non-TypeScript consumer that needs it.
 */
const ALWAYS_KEEP = [];

const SCOPE_FUNCTIONS = new Set(["useTranslations", "getTranslations", "createTranslator"]);

// --- The catalog ---------------------------------------------------------

const catalog = JSON.parse(readFileSync(join(ROOT, "messages", "en.json"), "utf8"));

function leafPaths(node, prefix = "", out = []) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) leafPaths(value, path, out);
    else out.push(path);
  }
  return out;
}

const allKeys = leafPaths(catalog);

// --- The program ---------------------------------------------------------

const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
const parsed = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  ROOT,
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const used = new Set();
const poisoned = new Set(ALWAYS_KEEP);
const unattributable = [];

/** The string literal values of a type, or null if it holds anything else. */
function literalValues(type) {
  const parts = type.isUnion() ? type.types : [type];
  const values = [];
  for (const part of parts) {
    if (!part.isStringLiteral()) return null;
    values.push(part.value);
  }
  return values.length > 0 ? values : null;
}

/**
 * Whether a call's first parameter is next-intl's message-key parameter.
 *
 * Keyed on where the parameter is *declared* rather than on the shape of its
 * type: plenty of ordinary functions here take a string-literal union first
 * (variant props, enum guards), and matching on shape alone swept up thousands.
 */
function isTranslatorParameter(parameter) {
  const file = parameter.valueDeclaration?.getSourceFile()?.fileName ?? "";
  return file.includes("use-intl") && file.includes("createTranslator");
}

/**
 * The namespace a translator value carries, read straight off its type:
 * next-intl types every translator as `Translator<Messages, "the.namespace">`,
 * so this works the same for one built by a scope call, one destructured out of
 * an options object, and one handed to a function as an untyped parameter — the
 * three shapes the email builders and page components use between them.
 *
 * Returns "" for the root translator, and undefined when the namespace is not a
 * literal, which the caller escalates rather than guesses at.
 */
function translatorNamespaces(expression) {
  const identifier = rootIdentifier(expression);
  if (!identifier) return undefined;
  const type = checker.getTypeAtLocation(identifier);
  const namespace = type.aliasTypeArguments?.[1];
  if (!namespace) return undefined;

  // `useTranslations()` with no argument scopes the root of the catalog.
  const printed = checker.typeToString(namespace);
  if (printed === "undefined" || printed === "never") return [""];

  // A namespace assembled at runtime (`` useTranslations(`voice.instant.${r}`) ``)
  // types as the union of every namespace it could open. Every branch counts as
  // used, because any of them may be the one taken.
  const namespaces = literalValues(namespace);
  return namespaces ?? undefined;
}

function isScopeCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    SCOPE_FUNCTIONS.has(node.expression.text)
  );
}

/**
 * Whether this identifier is the thing being called, rather than a value being
 * handed somewhere. `t` in `t("x")` and in `t.rich("x")` is being called; `t` in
 * `renderHint(t)` is escaping, and what the receiver does with it is out of
 * sight.
 */
function isCallee(identifier) {
  let node = identifier;
  while (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
    node = node.parent;
  }
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

/** Whether this identifier is the name being declared, not a use of it. */
function isDeclarationName(identifier) {
  const parent = identifier.parent;
  return (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    parent.name === identifier
  );
}

/** The identifier a call hangs off — `t` for both `t(...)` and `t.rich(...)`. */
function rootIdentifier(expression) {
  let node = expression;
  while (ts.isPropertyAccessExpression(node)) node = node.expression;
  return ts.isIdentifier(node) ? node : null;
}

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile || sourceFile.fileName.includes("node_modules")) continue;
  const text = sourceFile.getFullText();

  // A namespace built at runtime: keep everything under its static prefix.
  for (const match of text.matchAll(/(?:useTranslations|getTranslations)\(\s*`([^`]*?)\$\{/g)) {
    poisoned.add(match[1].replace(/\.$/, ""));
  }

  // `t.raw()` is typed `string`, so its keys are invisible to the analysis.
  if (/\.raw\s*\(/.test(text)) {
    for (const match of text.matchAll(
      /(?:useTranslations|getTranslations)\(\s*["'`]([^"'`$]+)["'`]/g,
    )) {
      poisoned.add(match[1]);
    }
  }

  // A translator handed to another function takes its keys out of sight: the
  // receiver's parameter may name any of them, and nothing here can follow it.
  // Keep the whole namespace rather than reason about where it went.
  const escapes = (node) => {
    if (
      ts.isIdentifier(node) &&
      !isCallee(node) &&
      !isDeclarationName(node) &&
      checker.getTypeAtLocation(node).aliasSymbol?.name === "Translator"
    ) {
      const namespaces = translatorNamespaces(node);
      if (namespaces) for (const namespace of namespaces) poisoned.add(namespace);
      else unattributable.push(`${sourceFile.fileName}: escaping translator`);
    }
    ts.forEachChild(node, escapes);
  };
  escapes(sourceFile);

  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0 && !isScopeCall(node)) {
      const parameter = checker.getResolvedSignature(node)?.parameters?.[0];
      if (parameter && isTranslatorParameter(parameter)) {
        const namespaces = translatorNamespaces(node.expression);
        if (namespaces === undefined) {
          unattributable.push(
            `${sourceFile.fileName.replace(`${ROOT.replace(/\\/g, "/")}/`, "")}: ${node
              .getText()
              .replace(/\s+/g, " ")
              .slice(0, 70)}`,
          );
        } else {
          const argumentKeys = literalValues(checker.getTypeAtLocation(node.arguments[0]));
          for (const namespace of namespaces) {
            if (argumentKeys) {
              for (const key of argumentKeys) used.add(namespace ? `${namespace}.${key}` : key);
            } else {
              poisoned.add(namespace);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// --- The verdict ---------------------------------------------------------

if (unattributable.length > 0) {
  console.error(
    `Could not identify the namespace of ${unattributable.length} translator call(s).\n` +
      "Reporting nothing rather than guessing — this check does not run on a partial\n" +
      "picture. Teach it the shape below, or add the namespace to ALWAYS_KEEP.\n",
  );
  for (const call of unattributable.slice(0, 20)) console.error(`  ${call}`);
  if (unattributable.length > 20) console.error(`  … and ${unattributable.length - 20} more`);
  process.exit(1);
}

const isPoisoned = (key) =>
  [...poisoned].some((prefix) => prefix === "" || key === prefix || key.startsWith(`${prefix}.`));

const orphans = allKeys.filter((key) => !used.has(key) && !isPoisoned(key));

if (orphans.length === 0) {
  console.log(`No orphaned message keys. (${allKeys.length} keys, ${used.size} reachable.)`);
  process.exit(0);
}

// `--list` prints one dotted key per line, for feeding a deletion script.
if (process.argv.includes("--list")) {
  console.log(orphans.join("\n"));
  process.exit(1);
}

const byNamespace = new Map();
for (const key of orphans) {
  const namespace = key.split(".").slice(0, -1).join(".") || "(root)";
  byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), key]);
}

console.error(`${orphans.length} orphaned message key(s) — no code can reach these:\n`);
for (const [namespace, keys] of [...byNamespace].sort()) {
  console.error(`  ${namespace}`);
  for (const key of keys) console.error(`    - ${key.slice(namespace.length + 1)}`);
}
console.error(
  "\nDelete them from every catalog in messages/. If one is genuinely needed, it is\n" +
    "reached from somewhere this check cannot see — say where, in ALWAYS_KEEP.",
);
process.exit(1);
