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
 * The four pairings are the four ways a Yty colour meets text or a ground in
 * this product:
 *
 *   1. accent on ground   — the icon / short label in the element's colour on
 *                           the app background. WCAG 1.4.11 (non-text) and
 *                           1.4.3 large-text both ask 3:1.
 *   2. body text on ground— the same colour set at body size. 4.5:1.
 *   3. foreground on tint — the app's own text over a 10%-alpha wash of the
 *                           hue composited on the ground; this is what the
 *                           10%-alpha Yty card tints actually render. 4.5:1.
 *   4. ground on fill     — ink text on a full fill of the hue (button/badge
 *                           shaped usage). 4.5:1.
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

const css = readFileSync(GLOBALS_CSS, "utf8");
const GROUND = readHslToken(css, "background");
const FOREGROUND = readHslToken(css, "foreground");

// ------------------------------------------------------------------- palettes

/** The brand's exact Yty hues (owner ruling), as strong/soft pairs. */
const BRAND = [
  ["harmony", "strong", "#F55B9A"],
  ["harmony", "soft", "#FA7FA3"],
  ["glow", "strong", "#1AB061"],
  ["glow", "soft", "#6AC66B"],
  ["valor", "strong", "#FD700D"],
  ["valor", "soft", "#FF993D"],
  ["wit", "strong", "#3A71DE"],
  ["wit", "soft", "#4DB3F5"],
];

/** What the tokens carry today — raw Tailwind defaults, for comparison. */
const CURRENT = [
  ["harmony", "current", "#34d399"],
  ["glow", "current", "#fbbf24"],
  ["valor", "current", "#fb7185"],
  ["wit", "current", "#a78bfa"],
];

/** The alpha the Yty card tints are drawn at — the `/10` slash-alpha classes. */
const TINT_ALPHA = 0.1;

const PAIRINGS = [
  {
    key: "accentOnGround",
    label: "accent/icon on ground",
    threshold: 3,
    thresholdNote: "3:1 — WCAG 1.4.11 non-text + 1.4.3 large text",
    measure: (hue) => contrastRatio(hue, GROUND),
  },
  {
    key: "bodyOnGround",
    label: "body text on ground",
    threshold: 4.5,
    thresholdNote: "4.5:1 — WCAG 1.4.3 body-size text",
    measure: (hue) => contrastRatio(hue, GROUND),
  },
  {
    key: "fgOnTint",
    label: `app text on ${TINT_ALPHA * 100}% tint`,
    threshold: 4.5,
    thresholdNote: "4.5:1 — body text over the composited card tint",
    measure: (hue) =>
      contrastRatio(FOREGROUND, composite(hue, GROUND, TINT_ALPHA)),
  },
  {
    key: "groundOnFill",
    label: "ink text on full fill",
    threshold: 4.5,
    thresholdNote: "4.5:1 — button/badge, ground colour as the text",
    measure: (hue) => contrastRatio(GROUND, hue),
  },
];

// -------------------------------------------------------------------- reporting

function fmt(n) {
  return n.toFixed(2).padStart(5);
}

function verdict(ratio, threshold) {
  return ratio >= threshold ? "PASS" : "FAIL";
}

function rowsFor(palette) {
  return palette.map(([element, variant, hex]) => {
    const rgb = parseHex(hex);
    const results = {};
    for (const pairing of PAIRINGS) {
      const ratio = pairing.measure(rgb);
      results[pairing.key] = { ratio, pass: ratio >= pairing.threshold };
    }
    return { element, variant, hex, results };
  });
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));
  const head =
    "element   variant  hex        " +
    PAIRINGS.map((p) => p.label.padEnd(24)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const row of rows) {
    const cells = PAIRINGS.map((p) => {
      const { ratio, pass } = row.results[p.key];
      return `${fmt(ratio)}:1 ${verdict(ratio, p.threshold)}      `.padEnd(24);
    }).join("");
    console.log(
      `${row.element.padEnd(10)}${row.variant.padEnd(9)}${row.hex.padEnd(11)}${cells}`,
    );
  }
}

console.log("Yty palette contrast on the dark ground");
console.log(`ground      ${toHex(GROUND)}  (--background, from globals.css)`);
console.log(`foreground  ${toHex(FOREGROUND)}  (--foreground, from globals.css)`);
console.log("\nThresholds:");
for (const pairing of PAIRINGS) {
  console.log(`  ${pairing.label.padEnd(26)} ${pairing.thresholdNote}`);
}
console.log(
  "\nNote: WCAG contrast is symmetric, so 'ink text on full fill' carries the\n" +
    "same ratio as the two on-ground columns — only the threshold and the\n" +
    "usage being judged differ.",
);

const brandRows = rowsFor(BRAND);
const currentRows = rowsFor(CURRENT);

printTable("Brand palette (strong / soft)", brandRows);
printTable("Current tokens (raw Tailwind defaults), for comparison", currentRows);

// ------------------------------------------------------------------ summary

console.log("\nPer-element summary — which variant is text-safe on dark");
console.log("=======================================================");

const elements = ["harmony", "glow", "valor", "wit"];
const escalations = [];

for (const element of elements) {
  const variants = brandRows.filter((r) => r.element === element);
  const accentOk = variants.filter((v) => v.results.accentOnGround.pass);
  const bodyOk = variants.filter((v) => v.results.bodyOnGround.pass);
  const fillOk = variants.filter((v) => v.results.groundOnFill.pass);
  const tintOk = variants.filter((v) => v.results.fgOnTint.pass);

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
    "\nNo escalation: every element has at least one variant clearing 3:1 as an\naccent on the dark ground.",
  );
}
