import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `src/app/icon.svg` is a byte-copy of `src/assets/brand/sog-gem-square.svg`,
 * and this is the only thing holding the two together.
 *
 * The duplication is not a mistake to be refactored away: Next's icon
 * convention is a *file at a path*, so the favicon has to exist as a real
 * `icon.svg` in the app directory — it cannot be an import, a re-export or a
 * symlink checked into git on Windows. The brand copy lives in `assets/`
 * because that is where every other mark this app draws comes from, and where
 * a re-cut of the gem would land.
 *
 * So the failure this guards is a re-cut that updates the asset and leaves the
 * tab icon showing the old mark — silently, because a favicon is the one image
 * nobody looks at while working and every visitor sees. Neither file can carry
 * a comment saying so: an XML comment is bytes, and adding one to a single file
 * is exactly the drift being tested for. The knowledge lives here instead.
 */
describe("the app icon and the brand asset it is copied from", () => {
  // Resolved from this file rather than from `process.cwd()`, and deliberately
  // *not* through `new URL(…, import.meta.url)`: Vite rewrites that form into
  // an asset-module lookup, and the rewritten expression does not resolve to a
  // readable path (the same trap `tests/unit/email-templates/layout.test.ts`
  // documents for files under `public/`).
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (...segments: string[]) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this file's own directory joined to two string literals written above; reading both files is the whole point of the check
    readFileSync(join(repoRoot, ...segments));

  const icon = read("src", "app", "icon.svg");
  const asset = read("src", "assets", "brand", "sog-gem-square.svg");

  it("are byte-identical", () => {
    expect(icon.equals(asset)).toBe(true);
  });

  /**
   * Keeps the equality claim from being satisfiable by two empty or truncated
   * files — the shape a botched export leaves behind, which would otherwise
   * pass the assertion above while serving a blank tab icon.
   */
  it("are the gem, not an empty file that happens to match", () => {
    expect(icon.byteLength).toBeGreaterThan(200);
    expect(icon.toString("utf8")).toContain("<svg");
  });
});
