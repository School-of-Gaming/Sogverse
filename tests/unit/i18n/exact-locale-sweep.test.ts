import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **One picker shows authored content; every other per-locale lookup says why
 * it is exact.**
 *
 * Content written per locale is stored one row per (thing, locale), and not
 * every thing has every locale. Showing such content to a reader goes through
 * `resolveTranslation()` alone, so every surface showing one thing to one
 * reader shows the same version. A lookup that compares locales by hand — a
 * `find` on a row's locale, the first row of a list of versions, a query
 * filtered to one locale — is either a second picker, which sooner or later
 * disagrees with the first, or an exact-locale lookup the design needs: a slug
 * that resolves only in its own locale, an editor working on the tab it shows,
 * a writer saving the version it names, an hreflang list naming every written
 * locale, or a comparison of the UI locale that is about no written version at
 * all.
 *
 * The sweep cannot tell those apart, so the author says which: a hit that is
 * exact on purpose carries a comment `exact-locale: <reason>` on its own line
 * or the line directly above. An unmarked hit fails, and so does a mark with no
 * reason or a mark beside no hit — a fix that removes the lookup removes its
 * mark in the same change. A hit that turns out to be a display pick is
 * converted to `resolveTranslation()`, never marked.
 *
 * The surface is regenerated from disk on every run; the shapes below are
 * deliberately broad, and a false hit costs one short comment.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const ROOTS = ["src", "scripts"] as const;

const SWEPT = /\.(?:ts|tsx|mjs|js)$/;

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage", "output"]);

/** Generated, and the primitive the rule routes everything else through. */
const SKIPPED_FILES = new Set([
  "src/types/database.types.ts",
  "src/lib/i18n/resolve-translation.ts",
  "src/lib/i18n/locale-order.ts",
]);

/** The hand-written per-locale lookup shapes. */
const SHAPES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    name: "a locale compared by hand",
    pattern: /[\w.]*[lL]ocale\b\s*[!=]==|[!=]==\s*[\w.]*[lL]ocale\b/,
  },
  {
    name: "the first of a list of versions",
    pattern: /(?:translations|versions)(?:\[0\]|\.at\(0\))/i,
  },
  {
    name: "versions keyed by locale",
    pattern: /\b\w*(?:translations|versions|names)\[\s*[\w.]*[lL]ocale\s*\]/i,
  },
  {
    name: "a query filtered to one locale",
    pattern: /\.(?:eq|neq|in|match)\(\s*["'`]\w*locale["'`]|\blocale=(?:eq|neq|in)\./,
  },
];

/** A locale compared with null or undefined is a presence check, not a lookup. */
const PRESENCE_CHECK = /[!=]==\s*(?:null|undefined)\b|\b(?:null|undefined)\s*[!=]==/;

/** A line that is only comment text: prose mentioning a shape, not code. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\s*\/\*)/;

const MARK = /exact-locale:(.*)/;

function walk(path: string, files: string[]): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed in-repo root from ROOTS, resolved against this file's own location; nothing here comes from outside the repo
  const stats = statSync(path);
  if (stats.isDirectory()) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the same fixed in-repo root, walked directory by directory
    for (const entry of readdirSync(path)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      walk(join(path, entry), files);
    }
  } else if (SWEPT.test(path)) {
    files.push(path);
  }
}

function sweptFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) walk(join(repoRoot, root), files);
  return files
    .map((file) => relative(repoRoot, file).split(sep).join("/"))
    .filter((file) => !SKIPPED_FILES.has(file) && !/\.test\.tsx?$/.test(file));
}

function isHit(line: string): boolean {
  if (COMMENT_LINE.test(line)) return false;
  const code = line.replace(PRESENCE_CHECK, "");
  return SHAPES.some(({ pattern }) => pattern.test(code));
}

/** The reason a mark gives, with comment closers stripped; null when the line has no mark. */
function markReason(line: string): string | null {
  const match = MARK.exec(line);
  if (match === null) return null;
  return match[1].replace(/\*\/\s*\}?\s*$/, "").trim();
}

interface Finding {
  readonly unmarked: string[];
  readonly emptyReasons: string[];
  readonly stray: string[];
}

function sweep(): Finding {
  const unmarked: string[] = [];
  const emptyReasons: string[] = [];
  const stray: string[] = [];
  for (const file of sweptFiles()) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file the fixed in-repo walk above discovered
    const lines = readFileSync(join(repoRoot, file), "utf8").split(/\r?\n/);
    const hits = new Set<number>();
    lines.forEach((line, i) => {
      if (isHit(line)) hits.add(i);
    });
    lines.forEach((line, i) => {
      const reason = markReason(line);
      if (reason === null) return;
      const where = `${file}:${i + 1}`;
      if (reason === "") emptyReasons.push(`${where}  ${line.trim()}`);
      if (!hits.has(i) && !hits.has(i + 1)) stray.push(`${where}  ${line.trim()}`);
    });
    for (const i of hits) {
      const marked = markReason(lines[i]) !== null || (i > 0 && markReason(lines[i - 1]) !== null);
      if (!marked) unmarked.push(`${file}:${i + 1}  ${lines[i].trim()}`);
    }
  }
  return { unmarked, emptyReasons, stray };
}

describe("per-locale lookups go through resolveTranslation() or say why they are exact", () => {
  const finding = sweep();

  it("marks every hand-written per-locale lookup with `exact-locale: <reason>`", () => {
    expect(finding.unmarked).toEqual([]);
  });

  it("gives every mark a reason", () => {
    expect(finding.emptyReasons).toEqual([]);
  });

  it("puts every mark beside a lookup", () => {
    expect(finding.stray).toEqual([]);
  });

  it("catches each shape", () => {
    expect(isHit(`rows.find((row) => row.locale === locale)`)).toBe(true);
    expect(isHit(`const first = article.versions[0]?.title;`)).toBe(true);
    expect(isHit(`return names[row.locale];`)).toBe(true);
    expect(isHit(`.eq("locale", locale)`)).toBe(true);
    expect(isHit("`product_translations?locale=eq.en`")).toBe(true);
    expect(isHit(`if (profile.locale !== null) {`)).toBe(false);
    expect(isHit(`// a row whose locale === the reader's`)).toBe(false);
  });

  it("reads a mark's reason through a JSX comment's closer", () => {
    expect(markReason(`{/* exact-locale: the tab's own version */}`)).toBe(
      "the tab's own version",
    );
    expect(markReason(`// exact-locale:   `)).toBe("");
  });
});
