import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Compositing belongs to @sog/ui, and Sogverse's stylesheet holds none of it.
 *
 * This app had six translucent strengths across five files before the two
 * constructs landed — a header at 70/90, a pill at 70/90 *and* a plain 80, a
 * viewer at 80, chips at 80, 85 and 90, backdrops at 50 and 60 — because every
 * surface that needed to see through invented its own. `.glass-panel` was the
 * one attempt to stop that, and it stopped it for three sites out of fifteen:
 * a rule in the app's own stylesheet is one more thing a page can copy, edit or
 * shadow, and it cannot say no to the next hand-rolled recipe beside it.
 *
 * So the rule is not "use the shared class", it is "the app defines none": the
 * scrim and the glass are the library's, they arrive with the theme, and the
 * only way to get a translucent surface here is to spend one of them. A second
 * recipe declared in `globals.css` would be the seventh strength, and it would
 * look exactly as deliberate as the six did.
 *
 * The test asserts the shape rather than the text — no blur, no glass selector,
 * no ground thinned with a `color-mix` — so a differently-named copy of the
 * same idea fails too.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
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

  it("finds both constructs in the library's theme instead", () => {
    // The other half of the claim: this is not a ban on translucency, it is an
    // address for it. A theme that shipped neither would make the ban above
    // pass by leaving the app with nothing to spend.
    const theme = readFileSync(themePath, "utf8");
    expect(theme).toMatch(/--color-scrim:/);
    expect(theme).toMatch(/@utility glass\b/);
  });
});
