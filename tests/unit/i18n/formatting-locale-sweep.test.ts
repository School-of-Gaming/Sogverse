import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * **Every reader-locale formatting call passes `formattingLocale(…)`.**
 *
 * An app locale is not an `Intl` tag: bare `en` handed to `Intl` formats the
 * American way (month-first dates, 12-hour clocks). `formattingLocale()` maps
 * the app locale to the tag its readers expect, so every `Intl` constructor,
 * every `toLocale*String` and every locale-aware `localeCompare` takes its
 * locale argument as a `formattingLocale(…)` call (or an array led by one). A
 * call with no locale, or `undefined`, formats in the runtime's locale — the
 * server's on the server — and fails too. A no-argument
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` reads the runtime's zone,
 * formats nothing, and passes.
 *
 * A fixed tag that is right on purpose — machine output, a probe whose result
 * is discarded — is listed below by file, enclosing function and the literal
 * locale argument, with its reason. An entry that matches no call fails, so a
 * fix that removes the call removes its entry in the same change.
 *
 * The calls are found by parsing every source file under `src/`, so a call
 * split across lines is found and a mention in a comment is not.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SWEPT = /\.tsx?$/;

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next"]);

/** Generated, and holds no code. */
const SKIPPED_FILES = new Set(["src/types/database.types.ts"]);

const INTL_CONSTRUCTORS = new Set([
  "DateTimeFormat",
  "NumberFormat",
  "RelativeTimeFormat",
  "ListFormat",
  "PluralRules",
  "DisplayNames",
  "Collator",
  "Segmenter",
]);

const TO_LOCALE = new Set(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]);

interface FixedTag {
  readonly file: string;
  /** The nearest named function around the call, or `<module>`. */
  readonly within: string;
  /** The locale argument's source text, exactly. */
  readonly locale: string;
  readonly reason: string;
}

const FIXED_TAGS: readonly FixedTag[] = [
  {
    file: "src/lib/timezone.ts",
    within: "isValidTimezone",
    locale: `"en-US"`,
    reason: "a zone-validity probe; the formatter is built and discarded",
  },
  {
    file: "src/lib/utils.ts",
    within: "computeAge",
    locale: `"en"`,
    reason: "reads numeric date parts only, which no locale changes",
  },
  {
    file: "src/app/api/admin/municipality-invoicing/finvoice/route.ts",
    within: "monthName",
    locale: `"en-GB"`,
    reason: "the Finvoice export is English machine output, whoever runs it",
  },
  {
    file: "src/lib/products/format-product-schedule.ts",
    within: "viewerClock",
    locale: `"en-GB"`,
    reason: "a fixed 24-hour HH:MM that is also the key slots are grouped and sorted by",
  },
  {
    file: "src/app/llms.txt/route.ts",
    within: "languageName",
    locale: `["en"]`,
    reason: "/llms.txt is English-only machine output with no reader locale",
  },
  {
    file: "src/lib/schools/municipalities.ts",
    within: "groupByRegion",
    locale: `"fi"`,
    reason: "the region list is sorted in Finnish collation whoever reads it, so Ä and Ö follow Z",
  },
];

interface Call {
  readonly file: string;
  readonly line: number;
  readonly within: string;
  /** Source text of the locale argument; null when there is none. */
  readonly locale: string | null;
  readonly conforms: boolean;
  readonly text: string;
}

function walk(directory: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks the fixed in-repo src/ root, resolved against this file's own location
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return SWEPT.test(entry.name) ? [path] : [];
  });
}

function isFormattingLocaleCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "formattingLocale"
  );
}

function conforms(locale: ts.Expression): boolean {
  if (isFormattingLocaleCall(locale)) return true;
  return (
    ts.isArrayLiteralExpression(locale) &&
    locale.elements.length > 0 &&
    isFormattingLocaleCall(locale.elements[0])
  );
}

function enclosingName(node: ts.Node): string {
  for (let at = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at) || ts.isFunctionExpression(at)) &&
      at.name !== undefined
    ) {
      return at.name.getText();
    }
    if (
      ts.isVariableDeclaration(at) &&
      at.initializer !== undefined &&
      (ts.isArrowFunction(at.initializer) || ts.isFunctionExpression(at.initializer))
    ) {
      return at.name.getText();
    }
  }
  return "<module>";
}

/** `Intl.DateTimeFormat().resolvedOptions().timeZone`: the runtime's zone, not a format. */
function isZoneRead(node: ts.CallExpression | ts.NewExpression): boolean {
  const options = node.parent;
  if (!ts.isPropertyAccessExpression(options) || options.name.text !== "resolvedOptions") return false;
  const resolved = options.parent;
  if (!ts.isCallExpression(resolved)) return false;
  const field = resolved.parent;
  return ts.isPropertyAccessExpression(field) && field.name.text === "timeZone";
}

/** The locale argument of a formatting call; undefined when the node is no such call. */
function localeArgument(node: ts.Node): { arg: ts.Expression | null } | undefined {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return undefined;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const name = callee.name.text;
  const args: readonly ts.Expression[] = node.arguments ?? [];
  const first = args.at(0) ?? null;

  if (ts.isIdentifier(callee.expression) && callee.expression.text === "Intl" && INTL_CONSTRUCTORS.has(name)) {
    if (first === null && name === "DateTimeFormat" && isZoneRead(node)) return undefined;
    return { arg: first };
  }
  if (!ts.isCallExpression(node)) return undefined;
  if (TO_LOCALE.has(name)) return { arg: first };
  if (name === "localeCompare" && args.length >= 2) return { arg: args[1] };
  return undefined;
}

function callsIn(file: string, source: string): Call[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const calls: Call[] = [];
  const visit = (node: ts.Node): void => {
    const found = localeArgument(node);
    if (found !== undefined) {
      const { arg } = found;
      const isUndefined = arg !== null && ts.isIdentifier(arg) && arg.text === "undefined";
      calls.push({
        file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        within: enclosingName(node),
        locale: arg === null || isUndefined ? null : arg.getText(),
        conforms: arg !== null && !isUndefined && conforms(arg),
        text: node.getText().split("\n")[0].trim(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

function sweptCalls(): Call[] {
  return walk(join(repoRoot, "src"))
    .map((path) => relative(repoRoot, path).split(sep).join("/"))
    .filter((file) => !SKIPPED_FILES.has(file))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file the fixed in-repo walk above discovered
    .flatMap((file) => callsIn(file, readFileSync(join(repoRoot, file), "utf8")));
}

function matches(entry: FixedTag, call: Call): boolean {
  return entry.file === call.file && entry.within === call.within && entry.locale === call.locale;
}

describe("reader-locale formatting goes through formattingLocale()", () => {
  const calls = sweptCalls();

  it("passes formattingLocale(…) as every formatting call's locale", () => {
    const offending = calls
      .filter((call) => !call.conforms && !FIXED_TAGS.some((entry) => matches(entry, call)))
      .map((call) => `${call.file}:${call.line} (${call.within}) locale=${call.locale ?? "none"}  ${call.text}`);
    expect(
      offending,
      "Pass formattingLocale(locale) as the locale argument; a fixed tag that is right on purpose is listed in FIXED_TAGS with its reason (src/i18n/CLAUDE.md)",
    ).toEqual([]);
  });

  it("lists only fixed tags that still match a call", () => {
    const stale = FIXED_TAGS.filter((entry) => !calls.some((call) => matches(entry, call))).map(
      (entry) => `${entry.file} (${entry.within}) locale=${entry.locale}`,
    );
    expect(stale).toEqual([]);
  });

  it("gives every fixed tag a reason", () => {
    expect(FIXED_TAGS.filter((entry) => entry.reason.trim() === "")).toEqual([]);
  });

  it("classifies each call shape", () => {
    const one = (source: string): Call[] => callsIn("snippet.ts", source);
    const verdicts = (source: string) => one(source).map((call) => call.conforms);

    expect(verdicts(`new Intl.DateTimeFormat(formattingLocale(locale), {});`)).toEqual([true]);
    expect(verdicts(`new Intl.DateTimeFormat(\n  locale,\n  { hour: "2-digit" },\n);`)).toEqual([false]);
    expect(verdicts(`Intl.NumberFormat(locale).format(1);`)).toEqual([false]);
    expect(verdicts(`new Intl.DisplayNames([formattingLocale(locale), "en"], o);`)).toEqual([true]);
    expect(verdicts(`new Intl.DisplayNames([locale, "en"], o);`)).toEqual([false]);
    expect(verdicts(`date.toLocaleDateString();`)).toEqual([false]);
    expect(verdicts(`date.toLocaleString(undefined, { hour: "2-digit" });`)).toEqual([false]);
    expect(verdicts(`n.toLocaleString(formattingLocale(locale));`)).toEqual([true]);
    expect(verdicts(`a.localeCompare(b, locale);`)).toEqual([false]);
    expect(verdicts(`a.localeCompare(b, formattingLocale(locale));`)).toEqual([true]);
    expect(one(`a.localeCompare(b);`)).toEqual([]);
    expect(one(`const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;`)).toEqual([]);
    expect(one(`// new Intl.DateTimeFormat(locale)\nconst options: Intl.DateTimeFormatOptions = {};`)).toEqual(
      [],
    );
  });

  it("names the function around a call", () => {
    expect(callsIn("snippet.ts", `function monthName() { return new Intl.DateTimeFormat("en-GB"); }`)[0].within).toBe(
      "monthName",
    );
    expect(callsIn("snippet.ts", `const label = () => n.toLocaleString("en");`)[0].within).toBe("label");
    expect(callsIn("snippet.ts", `n.toLocaleString("en");`)[0].within).toBe("<module>");
  });
});
