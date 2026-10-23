import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **What reads a message catalog is visible to the test-selection graph.**
 *
 * Each locale is a directory of one file per namespace (`src/i18n/CLAUDE.md`)
 * so that the import graph says which namespaces a module reads, and a copy
 * edit in one namespace reruns only the tests that read it. Two shapes undo
 * that silently, and this sweep fails on both:
 *
 * - **A test importing a locale's whole catalog** — its index, the directory,
 *   or an old single-file bundle. It puts every namespace back in the test's
 *   closure. A test imports the namespace files its tree reads instead.
 * - **A test reading the loader's whole catalogs** — a value import of
 *   `@/i18n/messages`, static or dynamic, whose `loadMessages` assembles every
 *   namespace. (`import type` is erased and fine.)
 * - **A computed path into `messages/`**, anywhere — a template literal or a
 *   concatenation. The graph cannot see it at all, so whatever it loads drops
 *   out of every namespace's test run.
 *
 * And app code reaches the catalogs only through `src/i18n/`: the whole-catalog
 * loader, and the per-namespace tables under `src/i18n/namespaces/`, each of
 * which names only its own namespace's files. Only the request config takes the
 * whole catalog; any other app module loading it would put every namespace back
 * in its closure, so it loads the namespaces it reads from their tables.
 *
 * The surface is the files on disk, read on every run.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Tests whose subject is a catalog as a whole, so the whole catalog is what
 * they read.
 */
const WHOLE_CATALOG_TESTS: Record<string, string> = {
  // The loader and the Klingon fallback merge: it compares whole catalogs.
  "tests/unit/lib/i18n-messages.test.ts": "tests the catalog loader",
  // The outbound-link census runs over every string of every catalog, and the
  // Klingon half asserts which namespaces the catalog does not carry.
  "tests/unit/components/policy-cross-links.test.tsx": "a census over every catalog",
};

/**
 * App modules that genuinely need every namespace, and so load the whole catalog.
 */
const WHOLE_CATALOG_APP_MODULES: Record<string, string> = {
  // next-intl's request config: every page's messages, before the layout strips
  // the server-only namespaces for the client.
  "src/i18n/request.ts": "the app's own request config hands next-intl the whole catalog",
};

const LOADER = "src/i18n/messages";

/** Whether a module specifier, written in `file`, names the catalog loader. */
function namesLoader(file: string, specifier: string): boolean {
  const bare = specifier.replace(/\.ts$/, "");
  if (bare.startsWith("@/")) return `src/${bare.slice(2)}` === LOADER;
  if (bare.startsWith(".")) return posix.join(posix.dirname(file), bare) === LOADER;
  return false;
}

/**
 * A value import of the catalog loader from `file`, by the alias or by a
 * relative path: `import … from`, a bare `import "…"`, `export … from`, or a
 * dynamic `import(…)`, `require(…)` or `vi.importActual(…)`. `import type` /
 * `export type` are erased at build time and do not count, and a
 * `vi.mock("@/i18n/messages")` names the module without loading it.
 */
function importsLoader(text: string, file: string): boolean {
  return [...text.matchAll(/["']([^"'\n]*\/messages(?:\.ts)?)["']/g)].some((match) => {
    if (!namesLoader(file, match[1])) return false;
    // The statement up to the module name: from the previous `;` (or the file start).
    const before = text.slice(text.lastIndexOf(";", match.index) + 1, match.index);
    if (/\b(?:import|require|importActual)\s*\(\s*$/.test(before)) return true;
    const keyword = Math.max(before.lastIndexOf("import"), before.lastIndexOf("export"));
    return keyword >= 0 && !/^(?:import|export)\s+type\b/.test(before.slice(keyword));
  });
}

const THIS_FILE = relative(repoRoot, fileURLToPath(import.meta.url)).split(sep).join("/");

function walk(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks fixed in-repo directories (src/, tests/, scripts/), no external input
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- an entry the fixed in-repo walk just listed
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return /\.(ts|tsx|mts|mjs|js)$/.test(name) ? [path] : [];
  });
}

const files = (root: string) =>
  walk(join(repoRoot, root)).map((path) => ({
    file: relative(repoRoot, path).split(sep).join("/"),
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file the fixed in-repo walk found
    text: readFileSync(path, "utf8"),
  }));

// Each tree is read once, while the file is collected, so the reads stay out of
// every test's time budget: reading all of src/ and tests/ is disk-bound, and
// inside a test it ran past the five-second timeout on a machine under load.
const TEST_FILES = files("tests");
const SRC_FILES = files("src");

/** Every quoted string or template literal naming a path under the repo's `messages/`. */
function messagePaths(text: string): string[] {
  return [...text.matchAll(/["'`]([^"'`\n]*\.\.\/messages\/[^"'`\n]*)["'`]/g)].map(
    (match) => match[1],
  );
}

/** A whole catalog: a locale's directory or its index, or an old single-file bundle. */
function isWholeCatalog(path: string): boolean {
  const tail = path.slice(path.lastIndexOf("../messages/") + "../messages/".length);
  return /^[a-z]+(\.json|\/index|\/index\.ts)?$/.test(tail);
}

describe("imports of the message catalogs", () => {
  it("a test imports namespace files, never a whole catalog", () => {
    const offenders = TEST_FILES
      .filter(({ file }) => file !== THIS_FILE && !(file in WHOLE_CATALOG_TESTS))
      .flatMap(({ file, text }) =>
        messagePaths(text)
          .filter(isWholeCatalog)
          .map((path) => `${file}: ${path}`),
      );
    expect(offenders).toEqual([]);
  });

  it("a test imports no value from the catalog loader", () => {
    const offenders = TEST_FILES
      .filter(({ file }) => file !== THIS_FILE && !(file in WHOLE_CATALOG_TESTS))
      .filter(({ file, text }) => importsLoader(text, file))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("app code imports no value from the catalog loader, but the modules that need every namespace", () => {
    const importers = SRC_FILES
      .filter(({ file, text }) => importsLoader(text, file))
      .map(({ file }) => file);
    expect([...importers].sort()).toEqual(Object.keys(WHOLE_CATALOG_APP_MODULES).sort());
  });

  it("recognises each form of loader import, and not a type import or a mock", () => {
    const test = "tests/unit/x.test.ts";
    expect(importsLoader('import { loadMessages } from "@/i18n/messages";', test)).toBe(true);
    expect(importsLoader('import {\n  loadMessages,\n} from "@/i18n/messages";', test)).toBe(true);
    expect(importsLoader('import "@/i18n/messages";', test)).toBe(true);
    expect(importsLoader('export { loadMessages } from "@/i18n/messages";', test)).toBe(true);
    expect(importsLoader('const m = await import("@/i18n/messages");', test)).toBe(true);
    expect(importsLoader('await vi.importActual("@/i18n/messages");', test)).toBe(true);
    expect(importsLoader('import type { Messages } from "@/i18n/messages";', test)).toBe(false);
    expect(importsLoader('vi.mock("@/i18n/messages", () => ({}));', test)).toBe(false);
    // By relative path, resolved from the importing file.
    expect(importsLoader('import { loadMessages } from "./messages";', "src/i18n/x.ts")).toBe(true);
    expect(importsLoader('import { loadMessages } from "../i18n/messages";', "src/lib/x.ts")).toBe(true);
    expect(importsLoader('import type { Messages } from "./messages";', "src/i18n/x.ts")).toBe(false);
    // Another module that happens to be named `messages` is not the loader.
    expect(importsLoader('import { x } from "./messages";', "src/lib/x.ts")).toBe(false);
  });

  it("names every path into messages/ as a literal, never a computed one", () => {
    const offenders = ["src", "tests", "scripts"]
      .flatMap(files)
      .filter(({ file }) => file !== THIS_FILE)
      .flatMap(({ file, text }) => [
        ...messagePaths(text)
          .filter((path) => path.includes("${"))
          .map((path) => `${file}: ${path}`),
        ...[...text.matchAll(/\.\.\/messages\/["'`]\s*\+/g)].map(() => `${file}: a concatenated path`),
      ]);
    expect(offenders).toEqual([]);
  });

  it("app code reads the catalogs only through the loader and the namespace tables", () => {
    const readers = files("src")
      .filter(({ text }) => messagePaths(text).length > 0)
      .map(({ file }) => file)
      .filter((file) => !file.startsWith("src/i18n/namespaces/"));
    expect(readers).toEqual(["src/i18n/messages.ts"]);
  });

  it("a namespace table names only its own namespace's files", () => {
    const tables = files("src/i18n/namespaces");
    expect(tables.length).toBeGreaterThan(0);
    const offenders = tables.flatMap(({ file, text }) => {
      const namespace = posix.basename(file, ".ts");
      const paths = messagePaths(text);
      if (paths.length === 0) return [`${file}: names no namespace file`];
      return paths
        .filter((path) => {
          const tail = path.slice(path.lastIndexOf("../messages/") + "../messages/".length);
          return /^[a-z]+\/([A-Za-z]+)\.json$/.exec(tail)?.[1] !== namespace;
        })
        .map((path) => `${file}: ${path}`);
    });
    expect(offenders).toEqual([]);
  });

  it("names only tests that exist as whole-catalog readers", () => {
    const tests = new Set(files("tests").map(({ file }) => file));
    for (const file of Object.keys(WHOLE_CATALOG_TESTS)) expect(tests, file).toContain(file);
  });
});
