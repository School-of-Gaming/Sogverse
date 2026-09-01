/**
 * WCAG contrast audit for the Yty-Element palette on the dark ground.
 *
 * The brand's Yty hues were tuned for a white page; this app has exactly one
 * theme and it is dark, so every pairing the UI actually ships has to be
 * measured rather than eyeballed (the amber/violet drift this effort fixes was
 * caused by hand-rounded HSL — colour maths is done with scripts here).
 *
 * Run: `node scripts/yty-contrast.mjs`
 *
 * **Every number here is read out of `globals.css`** — the two grounds, the app
 * foreground, and all eight Yty hexes. Nothing is restated in this file, so a
 * token tuned in the stylesheet cannot keep reporting a verified value it no
 * longer carries.
 *
 * **Two grounds, because the palette does not sit on one.** The app background
 * is `--background`; but the shipped Yty pairings sit inside Cards, whose ground
 * is `--card` — the About page's element descriptions sit directly on the card,
 * and the icons sit on a 10% strong tint over it. The card is the lighter
 * of the two, so it is the stricter ground for every hue in this palette, and
 * measuring only against the page would report a pass the product never gets.
 * Both are printed for every pairing; the summary at the end passes a variant
 * only when it clears its threshold on both.
 *
 * The five pairings are the five ways a Yty colour meets text or a ground in
 * this product:
 *
 *   1. accent on ground   — the icon / short label in the element's colour on
 *                           the ground. WCAG 1.4.11 (non-text) and 1.4.3
 *                           large-text both ask 3:1.
 *   2. body text on ground— the same colour set at body size. 4.5:1.
 *   3. foreground on tint — the app's own text over a 10%-alpha wash of the
 *                           hue composited on the ground; this is what the
 *                           10%-alpha Yty card tints actually render. 4.5:1.
 *   4. ground on fill     — ink text on a full fill of the hue (button/badge
 *                           shaped usage). 4.5:1.
 *   5. soft on strong tint— the element's soft text over a 10% wash of its own
 *                           strong composited on the ground. This is what a
 *                           voice zone's tile draws — a coloured label on its
 *                           own tint — and it is the tightest of the five. It
 *                           is printed as its own table because it is the only
 *                           one that needs both variants at once. 4.5:1.
 *
 * WCAG contrast is symmetric, so row 4's ratio is by construction identical to
 * rows 1–2 — what differs is the threshold that applies and the usage being
 * judged. It is printed anyway because "does this hue work as a filled chip
 * with ink on it" is a separate design question from "does it work as a label".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOBALS_CSS = join(import.meta.dirname, "..", "src", "app", "globals.css");

// ---------------------------------------------------------------- colour math

/** `#rrggbb` → `[r, g, b]` in 0–255. */
function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** CSS `h s% l%` triple → `[r, g, b]` in 0–255, the way a browser resolves it. */
function hslToRgb(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = lig - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255].map((v) =>
    Math.round(v),
  );
}

/** WCAG 2.x relative luminance (sRGB, the 0.03928 / 2.4 formulation). */
function relativeLuminance([r, g, b]) {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG 2.x contrast ratio, 1–21. Symmetric in its arguments. */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `over` composited on `under` at the given alpha (simple source-over). */
function composite(over, under, alpha) {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha));
}

// ------------------------------------------------------- tokens from the CSS

/**
 * Read a `--name: h s% l%;` token out of `globals.css` rather than restating a
 * hex here. The whole point of this script is that the numbers come from the
 * source of truth, not from a comment beside it.
 */
function readHslToken(css, name) {
  const re = new RegExp(
    `--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`,
  );
  const m = re.exec(css);
  if (!m) throw new Error(`could not read --${name} from globals.css`);
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

/**
 * The same, for the tokens written as literal hex — which is what every Yty
 * colour is. The colon in the pattern is load-bearing: one token name can be a
 * prefix of another, and without the colon a lookup would match the longer name
 * and certify the wrong hue.
 */
function readHexToken(css, name) {
  const re = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = re.exec(css);
  if (!m) throw new Error(`could not read --${name} from globals.css`);
  return parseHex(m[1]);
}

const css = readFileSync(GLOBALS_CSS, "utf8");
const FOREGROUND = readHslToken(css, "foreground");

/**
 * The two grounds a Yty colour is drawn on. Order matters only for the printed
 * output; the summary treats them as a set and requires a pass on both.
 */
const GROUNDS = [
  {
    key: "background",
    label: "app background",
    rgb: readHslToken(css, "background"),
    token: "--background",
    note: "the page itself",
  },
  {
    key: "card",
    label: "card",
    rgb: readHslToken(css, "card"),
    token: "--card",
    note: "where every shipped Yty pairing actually sits",
  },
];

// ------------------------------------------------------------------- palettes

const ELEMENTS = ["harmony", "glow", "valor", "wit"];

/** The brand's exact Yty hues (owner ruling), as strong/soft pairs. */
const BRAND = ELEMENTS.flatMap((element) => [
  [element, "strong", readHexToken(css, `color-yty-${element}-strong`)],
  [element, "soft", readHexToken(css, `color-yty-${element}-soft`)],
]);

/** The alpha the Yty card tints are drawn at — the `/10` slash-alpha classes. */
const TINT_ALPHA = 0.1;

const PAIRINGS = [
  {
    key: "accentOnGround",
    label: "accent/icon on ground",
    threshold: 3,
    thresholdNote: "3:1 — WCAG 1.4.11 non-text + 1.4.3 large text",
    measure: (hue, ground) => contrastRatio(hue, ground),
  },
  {
    key: "bodyOnGround",
    label: "body text on ground",
    threshold: 4.5,
    thresholdNote: "4.5:1 — WCAG 1.4.3 body-size text",
    measure: (hue, ground) => contrastRatio(hue, ground),
  },
  {
    key: "fgOnTint",
    label: `app text on ${TINT_ALPHA * 100}% tint`,
    threshold: 4.5,
    thresholdNote: "4.5:1 — body text over the composited card tint",
    measure: (hue, ground) =>
      contrastRatio(FOREGROUND, composite(hue, ground, TINT_ALPHA)),
  },
  {
    key: "groundOnFill",
    label: "ink text on full fill",
    threshold: 4.5,
    thresholdNote: "4.5:1 — button/badge, ground colour as the text",
    measure: (hue, ground) => contrastRatio(ground, hue),
  },
];

/**
 * The fifth pairing, kept apart because it is the only one that reads both
 * variants of an element at once: the element's soft, set as text, over a 10%
 * wash of its own strong. That is what the Yty zone draws — a tinted tile with
 * a coloured label on it — and it is the tightest of the five.
 */
const SOFT_ON_STRONG_TINT = {
  label: "soft text on 10% strong tint",
  threshold: 4.5,
  thresholdNote: "4.5:1 — the Yty zone's own label over its own tile",
  measure: (soft, strong, ground) =>
    contrastRatio(soft, composite(strong, ground, TINT_ALPHA)),
};

// -------------------------------------------------------------------- reporting

function fmt(n) {
  return n.toFixed(2).padStart(5);
}

function verdict(ratio, threshold) {
  return ratio >= threshold ? "PASS" : "FAIL";
}

function rowsFor(palette) {
  return palette.map(([element, variant, rgb]) => {
    const results = {};
    for (const pairing of PAIRINGS) {
      results[pairing.key] = {};
      for (const ground of GROUNDS) {
        const ratio = pairing.measure(rgb, ground.rgb);
        results[pairing.key][ground.key] = {
          ratio,
          pass: ratio >= pairing.threshold,
        };
      }
    }
    return { element, variant, rgb, hex: toHex(rgb), results };
  });
}

function printTable(title, rows, ground) {
  const heading = `${title} — on the ${ground.label} (${toHex(ground.rgb)})`;
  console.log(`\n${heading}`);
  console.log("=".repeat(heading.length));
  const head =
    "element   variant  hex        " +
    PAIRINGS.map((p) => p.label.padEnd(24)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const row of rows) {
    const cells = PAIRINGS.map((p) => {
      const { ratio } = row.results[p.key][ground.key];
      return `${fmt(ratio)}:1 ${verdict(ratio, p.threshold)}      `.padEnd(24);
    }).join("");
    console.log(
      `${row.element.padEnd(10)}${row.variant.padEnd(9)}${row.hex.padEnd(11)}${cells}`,
    );
  }
}

/** Per-element strong/soft lookup, for the pairing that needs both at once. */
function pairsFor(rows) {
  return ELEMENTS.map((element) => ({
    element,
    strong: rows.find((r) => r.element === element && r.variant === "strong"),
    soft: rows.find((r) => r.element === element && r.variant === "soft"),
  }));
}

function printSoftOnStrongTable(pairs) {
  const heading = `Yty zone — ${SOFT_ON_STRONG_TINT.label}`;
  console.log(`\n${heading}`);
  console.log("=".repeat(heading.length));
  const head =
    "element   soft       strong     " +
    GROUNDS.map((g) => `on ${g.label}`.padEnd(24)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const pair of pairs) {
    const cells = GROUNDS.map((ground) => {
      const ratio = SOFT_ON_STRONG_TINT.measure(
        pair.soft.rgb,
        pair.strong.rgb,
        ground.rgb,
      );
      return `${fmt(ratio)}:1 ${verdict(ratio, SOFT_ON_STRONG_TINT.threshold)}      `.padEnd(
        24,
      );
    }).join("");
    console.log(
      `${pair.element.padEnd(10)}${pair.soft.hex.padEnd(11)}${pair.strong.hex.padEnd(11)}${cells}`,
    );
  }
}

console.log("Yty palette contrast on the dark ground");
for (const ground of GROUNDS) {
  console.log(
    `ground      ${toHex(ground.rgb)}  (${ground.token}, from globals.css) — ${ground.note}`,
  );
}
console.log(
  `foreground  ${toHex(FOREGROUND)}  (--foreground, from globals.css)`,
);
console.log("\nThresholds:");
for (const pairing of [...PAIRINGS, SOFT_ON_STRONG_TINT]) {
  console.log(`  ${pairing.label.padEnd(28)} ${pairing.thresholdNote}`);
}
console.log(
  "\nNote: WCAG contrast is symmetric, so 'ink text on full fill' carries the\n" +
    "same ratio as the two on-ground columns — only the threshold and the\n" +
    "usage being judged differ.",
);

const brandRows = rowsFor(BRAND);
const brandPairs = pairsFor(brandRows);

for (const ground of GROUNDS) {
  printTable("Brand palette (strong / soft)", brandRows, ground);
}
printSoftOnStrongTable(brandPairs);

// ------------------------------------------------------------------ summary

console.log("\nPer-element summary — which variant is text-safe on dark");
console.log("=======================================================");
console.log(
  "A variant is listed only when it clears the threshold on BOTH grounds; the\n" +
    "card is the lighter one and therefore the binding one for every hue here.",
);

const escalations = [];

/** Passes on every ground, not just the forgiving one. */
const passesEverywhere = (row, key) =>
  GROUNDS.every((ground) => row.results[key][ground.key].pass);

for (const element of ELEMENTS) {
  const variants = brandRows.filter((r) => r.element === element);
  const accentOk = variants.filter((v) => passesEverywhere(v, "accentOnGround"));
  const bodyOk = variants.filter((v) => passesEverywhere(v, "bodyOnGround"));
  const fillOk = variants.filter((v) => passesEverywhere(v, "groundOnFill"));
  const tintOk = variants.filter((v) => passesEverywhere(v, "fgOnTint"));

  const pair = brandPairs.find((p) => p.element === element);
  const zoneOk = GROUNDS.every(
    (ground) =>
      SOFT_ON_STRONG_TINT.measure(pair.soft.rgb, pair.strong.rgb, ground.rgb) >=
      SOFT_ON_STRONG_TINT.threshold,
  );

  const name = (v) => `${v.variant} ${v.hex}`;
  console.log(`\n${element}`);
  console.log(
    `  accent/icon on ground (3:1):   ${accentOk.length ? accentOk.map(name).join(", ") : "NONE"}`,
  );
  console.log(
    `  body text on ground (4.5:1):   ${bodyOk.length ? bodyOk.map(name).join(", ") : "NONE"}`,
  );
  console.log(
    `  ink on full fill (4.5:1):      ${fillOk.length ? fillOk.map(name).join(", ") : "NONE"}`,
  );
  console.log(
    `  app text on 10% tint (4.5:1):  ${tintOk.length ? tintOk.map(name).join(", ") : "NONE"}`,
  );
  console.log(
    `  soft on 10% strong (4.5:1):    ${zoneOk ? "PASS" : "FAIL"}`,
  );

  if (accentOk.length === 0) {
    escalations.push(element);
  }
}

if (escalations.length > 0) {
  console.log("\n" + "!".repeat(72));
  console.log("ESCALATION — accent-on-dark fails in BOTH strong and soft for:");
  for (const element of escalations) console.log(`  - ${element}`);
  console.log(
    "A tuned dark variant changes a brand colour, which is the owner's call\n" +
      "(and is flagged onward to the Guidebook's author). Do not pick a hue here.",
  );
  console.log("!".repeat(72));
} else {
  console.log(
    "\nNo escalation: every element has at least one variant clearing 3:1 as an\naccent on both grounds.",
  );
}
