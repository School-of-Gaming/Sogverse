import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Compositing belongs to @sog/ui, and Sogverse neither declares one nor tunes
 * one.
 *
 * This app had six translucent strengths across five files before the library's
 * constructs landed — a header at 70/90, a pill at 70/90 *and* a plain 80, a
 * viewer at 80, chips at 80, 85 and 90, backdrops at 50 and 60 — because every
 * surface that needed to see through invented its own. `.glass-panel` was the
 * one attempt to stop that, and it stopped it for three sites out of fifteen:
 * a rule in the app's own stylesheet is one more thing a page can copy, edit or
 * shadow, and it cannot say no to the next hand-rolled recipe beside it.
 *
 * There are **three** such constructs and they are the whole list, because a
 * neutral carries an alpha only where the alpha does a job a solid cannot — a
 * layer over a ground it does not know. `bg-scrim` dims media; the `glass`
 * utility carries its own contents over whatever scrolls beneath it; `bg-hover`
 * lifts an element off whatever surface it is already sitting on, which is what
 * lets one value draw the same visible step on the page, on a card and on a
 * lifted panel. All three are the library's, all three carry their own alpha,
 * and Sogverse spends them whole.
 *
 * So this file holds two halves of one rule. **The app declares none**: a second
 * recipe in `globals.css` would be the seventh strength and would look exactly
 * as deliberate as the six did — asserted by shape rather than by text (no blur,
 * no glass selector, no ground thinned with a `color-mix`), so a differently
 * named copy of the same idea fails too. **And the app tunes none**: the scrim
 * or the hover layer spent at a fraction of itself is a call site picking a
 * strength again, which is the drift a single construct exists to end, and it
 * is the one alpha suffix the brand-colour test next door deliberately does not
 * look for. The regex below is the only place either is spelled with a
 * modifier, because Tailwind scans this file's text like any other and a class
 * written into a paragraph is a class it emits.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const srcRoot = join(repoRoot, "src");
const globalsPath = join(repoRoot, "src", "app", "globals.css");
const themePath = join(
  repoRoot,
  "packages",
  "sog-ui",
  "src",
  "tokens",
  "theme.css",
);

/** The stylesheet with its comments stripped: a comment about glass is not glass. */
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const globals = withoutComments(readFileSync(globalsPath, "utf8"));

const WHY =
  "Compositing is @sog/ui's: `bg-scrim` dims what is behind it and the `glass` utility carries its own contents over what moves beneath. A recipe declared here is the seventh translucent strength this app had before those two landed — spend the library's construct instead.";

describe("Sogverse declares no glass of its own", () => {
  it("has no backdrop blur in its stylesheet", () => {
    expect([...globals.matchAll(/[-\w]*backdrop-filter\s*:/g)].length, WHY).toBe(
      0,
    );
  });

  it("has no rule named for glass", () => {
    expect([...globals.matchAll(/\.[\w-]*glass[\w-]*/gi)].map(String), WHY).toEqual(
      [],
    );
  });

  it("thins no ground into a translucent fill", () => {
    // `color-mix(… , transparent)` is how a fill is made translucent in a
    // stylesheet — it is what Tailwind's own `/n` modifier compiles to — so its
    // presence here is a hand-rolled surface whatever the rule is called.
    expect(
      [...globals.matchAll(/color-mix\([^)]*transparent/g)].map(String),
      WHY,
    ).toEqual([]);
  });

  it("finds all three constructs in the library's theme instead", () => {
    // The other half of the claim: this is not a ban on translucency, it is an
    // address for it. A theme that shipped none of them would make the ban above
    // pass by leaving the app with nothing to spend.
    const theme = readFileSync(themePath, "utf8");
    expect(theme).toMatch(/--color-scrim:/);
    expect(theme).toMatch(/@utility glass\b/);
    expect(theme).toMatch(/--color-hover:/);
  });
});

/** Every `.ts`/`.tsx` under `src`, as repo-relative POSIX paths. */
function sourceFiles(directory: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks a fixed in-repo directory (src/) resolved from this file's own location, no external input
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    return [relative(repoRoot, full).split(sep).join("/")];
  });
}

/**
 * A compositing construct spent at a strength of the call site's own choosing.
 *
 * The alpha is the construct, not a parameter of it, so any variant prefix and
 * any colour property in front of `scrim` or `hover` followed by a `/n` is a
 * second strength being invented — the same failure the six translucent
 * recipes were, arriving one class at a time instead of one stylesheet rule at
 * a time. The `glass` utility cannot be written this way at all, which is why
 * only the two token-shaped constructs are matched.
 */
const CONSTRUCT_AT_A_STRENGTH =
  /\b[a-z:-]*(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|divide|decoration)-(?:scrim|hover)\/[0-9]+/g;

describe("Sogverse tunes none of the library's constructs", () => {
  it("spends the scrim and the hover layer whole, never at a strength", () => {
    const found = sourceFiles(srcRoot).flatMap((file) =>
      [
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
        ...readFileSync(join(repoRoot, file), "utf8").matchAll(
          CONSTRUCT_AT_A_STRENGTH,
        ),
      ].map((match) => `${file} :: ${match[0]}`),
    );
    expect(
      found,
      "`bg-scrim` and `bg-hover` each carry their own alpha, decided once in @sog/ui's surfaces.ts and measured there. A `/n` on one is a call site picking a strength again, which is exactly the drift a single construct exists to end — spend the construct whole, or take it to the library and change the value for everyone.",
    ).toEqual([]);
  });
});
