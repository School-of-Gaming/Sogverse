import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";

/**
 * The generated stylesheet and its TypeScript source cannot drift.
 *
 * `theme.css` is committed beside `brand.ts` and `typography.ts` because CSS is
 * what a consumer imports and there is no build step to produce it on demand.
 * That leaves exactly one failure mode — a token edited in TypeScript and never
 * regenerated — and this is the check that closes it.
 */
// Anchored on the Vitest project root rather than on `import.meta.url`, which a
// test runner does not have to expose as a file: URL.
const THEME_CSS = join(
  process.cwd(),
  "packages",
  "sog-ui",
  "src",
  "tokens",
  "theme.css",
);

describe("the generated theme", () => {
  it("matches the committed theme.css byte for byte", () => {
    const committed = readFileSync(THEME_CSS, "utf8");
    expect(
      renderTheme(),
      "theme.css is stale — run `npm run tokens --workspace=@sog/ui` and commit the result",
    ).toBe(committed);
  });
});
