/**
 * Generates `theme.css` from `brand.ts` and `typography.ts`.
 *
 *     npm run tokens --workspace=@sog/ui
 *
 * There is no build step: Node strips the types and runs this file directly, so
 * the generator stays in erasable syntax (no enums, no parameter properties) and
 * its relative imports carry explicit `.ts` extensions, which is what Node's ESM
 * resolver needs and why `allowImportingTsExtensions` is set in both tsconfigs
 * that compile this file.
 *
 * `renderTheme()` is pure and returns the whole stylesheet as a string, so the
 * parity test can regenerate and diff without touching disk. `main()` is the
 * only part that writes, and it runs only when this file is executed directly.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BRAND, NEUTRALS, YTY_FAMILIES, type NeutralId } from "./brand.ts";
import { FACES, TYPE_SCALE } from "./typography.ts";

/** CSS pixels → rem at the 16px root, with no trailing zeros. */
export function remFromPx(px: number): string {
  const rem = px / 16;
  return `${Number(rem.toFixed(5))}rem`;
}

/** `mutedForeground` → `muted-foreground`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The surfaces that ship a `-foreground` companion token.
 *
 * One of the four, and the difference is naming rather than use: every surface
 * reads `foreground`, so for the page ground, the hover fill and the muted
 * block a companion would only be a second name for `--color-foreground`,
 * which is already in the stylesheet. For `muted` it would be worse than
 * redundant — `--color-muted-foreground` already ships as the secondary-text
 * token, which reads on every ground rather than on that one, so generating a
 * companion would emit a second, different value under a name that is taken.
 * The card keeps its companion because it is the ground a component is handed
 * as a pair, and a pair wants both halves named.
 */
const SURFACES_WITH_FOREGROUND = ["card"] as const satisfies readonly NeutralId[];

function declaration(name: string, value: string): string {
  return `  ${name}: ${value};`;
}

function section(comment: string, lines: string[]): string {
  return [`  /* ${comment} */`, ...lines].join("\n");
}

function neutralLines(): string[] {
  const lines: string[] = [];
  for (const [id, neutral] of Object.entries(NEUTRALS)) {
    lines.push(declaration(`--color-${kebab(id)}`, neutral.hex));
  }
  for (const id of SURFACES_WITH_FOREGROUND) {
    lines.push(
      declaration(
        `--color-${kebab(id)}-foreground`,
        NEUTRALS[NEUTRALS[id].on].hex,
      ),
    );
  }
  return lines;
}

function brandLines(): string[] {
  return Object.entries(BRAND).flatMap(([id, colour]) => [
    declaration(`--color-${id}`, colour.hex),
    declaration(`--color-${id}-foreground`, colour.foreground),
  ]);
}

function ytyLines(): string[] {
  return Object.entries(YTY_FAMILIES).flatMap(([id, family]) => [
    declaration(`--color-yty-${id}-strong`, family.strong),
    declaration(`--color-yty-${id}-soft`, family.soft),
  ]);
}

function faceLines(): string[] {
  return Object.values(FACES).map((face) =>
    declaration(face.token, `var(${face.variable}), ${face.fallback}`),
  );
}

function typeScaleLines(): string[] {
  return TYPE_SCALE.flatMap((step) => {
    const lines = [
      declaration(step.cssName, remFromPx(step.px)),
      declaration(`${step.cssName}--line-height`, String(step.lineHeight)),
      declaration(`${step.cssName}--font-weight`, String(step.weight)),
    ];
    if (step.mobilePx !== null) {
      lines.push(
        declaration(`${step.cssName}-mobile`, remFromPx(step.mobilePx)),
        declaration(
          `${step.cssName}-mobile--line-height`,
          String(step.lineHeight),
        ),
        declaration(`${step.cssName}-mobile--font-weight`, String(step.weight)),
      );
    }
    return lines;
  });
}

/** The whole stylesheet, as a string. Pure — the test calls this instead of reading disk. */
export function renderTheme(): string {
  const header = [
    "/* SOG-UI theme tokens — GENERATED FILE, DO NOT EDIT.",
    " *",
    " * Generated from src/tokens/brand.ts and src/tokens/typography.ts, which are",
    " * the source of truth for every value below.",
    " *",
    " * Regenerate with:  npm run tokens --workspace=@sog/ui",
    " *",
    " * tests/unit/sog-ui/theme-generated.test.ts regenerates this file and diffs it,",
    " * so the TypeScript source and this stylesheet cannot drift apart. */",
  ].join("\n");

  const theme = [
    "@theme {",
    section(
      "Ground and ink. There is one theme and it is dark: these are the surfaces a page is built from, and the text that reads on each.",
      neutralLines(),
    ),
    "",
    section(
      "The signature pair. A fill and its foreground are one decision — amber is light and takes only a dark label, violet is dark and takes only a light one.",
      brandLines(),
    ),
    "",
    section(
      "The four Yty-Element families. Strong fills, borders, rings and glows; soft carries text and glyphs. That split is a contrast result — see src/tokens/contrast.ts.",
      ytyLines(),
    ),
    "",
    section(
      "Faces. The package owns the names; the consumer loads the files and defines the var() each token points at, on <html> and never on <body>.",
      faceLines(),
    ),
    "",
    section(
      "The working type scale. Each step carries its size, line height and weight, so a `text-*` utility sets all three.",
      typeScaleLines(),
    ),
    "}",
  ].join("\n");

  const root = [
    "/* Render native form-control internals dark too: the date input's picker glyph,",
    "   autofill backgrounds, native dropdowns, scrollbars. Without it the UA draws them",
    "   light against our dark tokens. There is one theme, so this is stated once and",
    "   never switched. */",
    ":root {",
    "  color-scheme: dark;",
    "}",
  ].join("\n");

  return `${header}\n\n${theme}\n\n${root}\n`;
}

function main(): void {
  // Resolved inside `main` rather than at module scope: the parity test imports
  // `renderTheme` from this file, and a test runner's `import.meta.url` is not
  // always a file: URL. Nothing above this line touches the filesystem.
  const output = fileURLToPath(new URL("theme.css", import.meta.url));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this module's own location, derived from import.meta.url; nothing outside the file reaches it, so there is no untrusted input for the rule's threat model to apply to.
  writeFileSync(output, renderTheme(), "utf8");
  process.stdout.write(`wrote ${output}\n`);
}

// Only when run directly. The `file:` guard short-circuits before `fileURLToPath`
// for the same reason the output path is resolved lazily above.
if (
  import.meta.url.startsWith("file:") &&
  process.argv[1] === fileURLToPath(import.meta.url)
) {
  main();
}
