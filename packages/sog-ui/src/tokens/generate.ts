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
import { PICKS } from "./picks.ts";
import { GLASS, SCRIM } from "./surfaces.ts";
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

function pickLines(): string[] {
  return PICKS.map((pick) => declaration(`--color-pick-${pick.id}`, pick.hex));
}

/** `0.7` → `70%`, with no trailing zeros. The form a `color-mix` percentage takes. */
function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(5))}%`;
}

/**
 * The scrim, as one colour token that carries its own alpha.
 *
 * The alpha belongs to the value, not to the call site: `bg-scrim` is the
 * whole construct, and a site able to write `bg-scrim/40` would be picking a
 * strength again, which is the drift a single scrim exists to end.
 *
 * Written as a `color-mix` with `transparent` — the form Tailwind's own `/n`
 * modifier compiles to — so the authored hex and the authored fraction reach
 * the stylesheet verbatim and nothing is converted on the way. Mixing with
 * `transparent` is done on premultiplied alpha, so the transparent half
 * contributes no colour and the result is exactly the hex at that alpha.
 */
function scrimLines(): string[] {
  return [
    declaration(
      "--color-scrim",
      `color-mix(in oklab, ${SCRIM.hex} ${percent(SCRIM.alpha)}, transparent)`,
    ),
  ];
}

/**
 * The glass, as a Tailwind utility rather than a token.
 *
 * It is three declarations and a fallback, not a colour, so there is no token
 * shape that can hold it: emitted as `@utility` it is a real utility, scanned
 * like any other, able to take variants, and it lands in the utilities layer
 * where a consumer's own utilities can sit beside it. A plain `.glass` rule
 * would be unlayered and would beat every utility on the same element.
 *
 * The `color-mix(… , transparent)` form is what Tailwind's own `/n` modifier
 * compiles to and the form that survives Lightning CSS; a hand-written slash
 * alpha inside a `var()` fill is dropped by the optimiser and leaves the panel
 * with no background at all.
 */
function glassUtility(): string {
  const ground = `var(--color-${kebab(GLASS.ground)})`;
  const blur = `blur(${GLASS.blurPx}px)`;
  const fill = (opacity: number) =>
    `color-mix(in oklab, ${ground} ${percent(opacity)}, transparent)`;
  return [
    "/* Glass — the page's own ground, thinned and blurred, for a surface that",
    "   carries its own contents over whatever moves beneath it. The stronger",
    "   fill is the base: where the browser cannot blur, opacity is the only",
    "   thing left holding those contents legible, so it goes up. */",
    "@utility glass {",
    `  background-color: ${fill(GLASS.fallbackOpacity)};`,
    `  -webkit-backdrop-filter: ${blur};`,
    `  backdrop-filter: ${blur};`,
    `  @supports ((backdrop-filter: ${blur}) or (-webkit-backdrop-filter: ${blur})) {`,
    `    background-color: ${fill(GLASS.opacity)};`,
    "  }",
    "}",
  ].join("\n");
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
      "The sixteen picks — the colours a person chooses for their own thing. Numbered because a pick means nothing but whose it is; the number is a stable id, never a position.",
      pickLines(),
    ),
    "",
    section(
      "The scrim — the one colour in the theme that carries its own alpha. It dims what is behind it and nothing sits inside it; black, because a tint that adds a hue is a tint that recolours a photograph. See src/tokens/surfaces.ts.",
      scrimLines(),
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

  return `${header}\n\n${theme}\n\n${glassUtility()}\n\n${root}\n`;
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
