import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A service domain has no index barrel; a module imports the file it means.**
 *
 * A barrel re-exporting a domain's queries, service and contracts makes every
 * importer depend on all of them. The gates select the tests to run from the
 * import graph, and a barrel makes that graph claim a change to one service
 * file reaches every test that only wanted a contract or a query hook.
 *
 * A barrel is also where a mock goes quietly wrong. `vi.mock` applies to the
 * exact module id the code under test imports, so a mock aimed at
 * `@/services/groups` mocks nothing once the code imports
 * `@/services/groups/groups.queries`, and the test then runs real code without
 * failing. A mock path is a string the compiler never resolves, so this sweep
 * is what checks it: every mocked or imported `@/services/…` path a test names
 * must be a file.
 *
 * `src/lib/constants` is the same hub one level down: an index re-exporting
 * every constants module made editing any one of them select every test that
 * read any constant. Its mocked and imported paths are checked the same way.
 *
 * Imports from source are held by lint (`noServiceBarrelImports` and
 * `noConstantsBarrelImports` in `eslint.config.mjs`) and, with the index files
 * gone, by the compiler.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const servicesDir = join(repoRoot, "src", "services");
const constantsDir = join(repoRoot, "src", "lib", "constants");

function walk(dir: string, out: string[] = []): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed in-repo directory, walked from this file's own location
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const toPosix = (path: string) => relative(repoRoot, path).split(sep).join("/");

/**
 * A `vi.mock`-family call or an `import("…")` naming a service or constants
 * path. The `import(` branch also catches the `typeof import("…")` an
 * `importOriginal` or `vi.importActual` is typed with.
 */
const MODULE_PATH =
  /(?:vi\.(?:mock|doMock|unmock|doUnmock|importActual)\(|\bimport\()\s*["'](@\/(?:services|lib\/constants)\b[^"']*)["']/g;

const isIndexFile = (path: string) => /^index\.[cm]?[jt]sx?$/.test(path.split(sep).at(-1) ?? "");

function resolvesToFile(specifier: string): boolean {
  const base = join(repoRoot, "src", specifier.slice("@/".length));
  return [".ts", ".tsx"].some(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path under src/ built from a specifier read out of this repo's own tests
    (extension) => existsSync(base + extension),
  );
}

describe("service barrels, the constants barrel and the utils hub", () => {
  it("src/lib has no utils module and no utils directory", () => {
    const libDir = join(repoRoot, "src", "lib");
    const hubs = readdirSync(libDir)
      .filter((name) => name === "utils" || name.startsWith("utils."))
      .map((name) => `src/lib/${name}`);
    expect(hubs).toEqual([]);
  });

  it("no src/services directory holds an index file", () => {
    expect(walk(servicesDir).filter(isIndexFile).map(toPosix)).toEqual([]);
  });

  it("src/lib/constants holds no index file", () => {
    expect(walk(constantsDir).filter(isIndexFile).map(toPosix)).toEqual([]);
  });

  it("every service or constants path a test mocks or imports names a file", () => {
    const unresolved: string[] = [];
    for (const file of walk(join(repoRoot, "tests"))) {
      if (!/\.(?:ts|tsx|mts)$/.test(file)) continue;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(MODULE_PATH)) {
        if (!resolvesToFile(match[1])) unresolved.push(`${toPosix(file)}: ${match[1]}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
