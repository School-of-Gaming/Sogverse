import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The tint ban, as a test.
 *
 * A brand colour exists at exactly the values it was authored at — strong,
 * soft, or the token's own full value. Painting one at `/10` over the
 * near-black ground does not produce a lighter brand colour; it composites to
 * a darker, duller one, and what the reader sees is no longer the brand. The
 * rule and its exemptions live in the root `CLAUDE.md` Styling section; this
 * file is the mechanism that keeps them true, because prose decays and a
 * failing test does not.
 *
 * The census this regenerates swept `src/` once and was corrected to a closed
 * list of survivors. Everything below that list is a violation by definition —
 * the exemptions were argued and ruled, and a new one is a decision to raise,
 * not a line to append.
 */

// Resolved from this file rather than `process.cwd()`, and deliberately not
// through `new URL(…, import.meta.url)` — Vite rewrites that form into an
// asset-module lookup that does not resolve to a readable path.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const srcRoot = join(repoRoot, "src");

// Preview scenes are fixture surfaces, not shipped UI; the census excluded
// them, and so does this. (They no longer hold any brand tint, but the scan's
// boundary is the census's boundary.)
const EXCLUDED_DIRS = [join(srcRoot, "components", "preview")];

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const STYLE_EXTENSIONS = [".css"];

/**
 * The families the rule governs, as a regex fragment: the six brand families —
 * amber, violet, and the four Yty elements in both their authored variants —
 * plus the two status tokens that converged onto a family's hue and therefore
 * draw a brand colour under another name.
 *
 * **`warning` and `destructive` are deliberately absent.** They are functional
 * status tokens rather than brand families, and the rule this guard enforces is
 * about brand colours — a colour whose whole job is to be recognised as ours,
 * which is what makes a mixed-down version of it a different colour rather than
 * a quieter one. Adding them here would be widening the rule, not the guard.
 */
const BRAND_FAMILIES =
  "primary|secondary|info|success|yty-(?:harmony|glow|valor|wit)-(?:strong|soft)";

/**
 * The census pattern, pinned: any brand family painted at an alpha step, in
 * any state prefix, on any property that carries colour.
 */
const UTILITY_TINT = new RegExp(
  `(?:hover:|focus:|focus-visible:|focus-within:|group-hover:|active:)?(?:text|bg|border|from|to|via|ring)-(?:${BRAND_FAMILIES})\\/\\d+`,
  "g",
);

/**
 * The same violation spelled as an arbitrary value — `hsl(var(--primary)/0.2)`
 * inside a `bg-[…]`. The utility pattern cannot see it (the token name is
 * followed by a paren, not a slash), and a tint written this way would
 * otherwise be invisible to the guard while rendering identically. The Yty
 * tokens are spelled `--color-yty-…` in the stylesheet, so both prefixes are
 * matched.
 */
const ARBITRARY_TINT = new RegExp(
  `var\\(--(?:color-)?(?:${BRAND_FAMILIES})\\)\\s*\\/\\s*[\\d.]+`,
  "g",
);

/**
 * The closed exemption list — file plus exact class, never line number, because
 * lines drift and a line-keyed allowlist rots into permission for whatever
 * moved into that slot.
 */
const EXEMPT: readonly { file: string; classes: readonly string[]; why: string }[] = [
  {
    file: "src/app/(public)/roblox/page.tsx",
    classes: ["bg-primary/10"],
    why: "Chip-scale icon medallion: a brand colour lighting a glyph, not a colour painted as a card's ground. The card behind it stays neutral, which is the constraint the exemption came with.",
  },
  {
    file: "src/components/about/about-section.tsx",
    classes: ["bg-primary/10"],
    why: "Chip-scale icon medallion behind each value's glyph; the card it sits on is neutral.",
  },
  {
    file: "src/components/public/products/purchase-confirmation-view.tsx",
    classes: ["bg-primary/10"],
    why: "Chip-scale icon medallions on the confirmation and waitlist outcome states — the glyph's accent disc, not the panel's ground.",
  },
  {
    file: "src/components/home/home-page-body.tsx",
    classes: ["from-primary/10", "to-secondary/10", "var(--primary)/0.2", "var(--secondary)/0.1"],
    why: "The two sanctioned keeps, both pre-existing identity moments the owner ruled kept exactly as they are: the hero's amber-violet band (the arbitrary-value pair) and the closing CTA's wash (the gradient pair). Not a licence for new washes.",
  },
  {
    file: "src/components/roblox/roblox-hero.tsx",
    classes: ["var(--primary)/0.2", "var(--secondary)/0.1"],
    why: "The hero band again, byte-identical to home's — /roblox is the other first-contact page and wears the same sanctioned identity band.",
  },
  {
    file: "src/lib/constants/yty.ts",
    classes: [
      "bg-yty-harmony-strong/10",
      "bg-yty-glow-strong/10",
      "bg-yty-valor-strong/10",
      "bg-yty-wit-strong/10",
    ],
    why: "The Yty accent tile, ruled in full: a tint ground inside a full-value family edge, under a soft glyph. It is the chip-scale icon-accent exemption in its canonical form, and every consumer of the map draws all three parts — the About element cards and the four Yty voice zones alike. The tint lights one glyph and nothing else: no surface this map feeds washes the ground behind the tile.",
  },
  {
    file: "src/components/home/home-page-body.tsx",
    classes: [
      "bg-yty-harmony-strong/10",
      "bg-yty-glow-strong/10",
      "bg-yty-valor-strong/10",
      "bg-yty-wit-strong/10",
    ],
    why: "The home feature accents draw the same ruled tile recipe as the Yty map — icon-sized tint, full-value family edge, soft glyph — on a neutral card. Same exemption, a second consumer of the one recipe.",
  },
];

const exemptKeys = new Set(
  EXEMPT.flatMap(({ file, classes }) => classes.map((className) => `${file}::${className}`)),
);

/**
 * Blanks out everything the build cannot turn into a rendered class, keeping
 * offsets (and newlines) intact so a hit still reports its own line.
 *
 * Tailwind only ever sees a class inside a string literal, so in code that is
 * the only region worth scanning — which is also what makes a comment free to
 * quote a banned class while explaining why it is banned (several do). In CSS
 * the whole declaration block is scannable and only comments are masked.
 *
 * The one known imprecision: a regex literal ending `\//` reads as the start of
 * a line comment here, so the rest of that line is masked. No class lives on
 * such a line, and erring toward masking cannot manufacture a false failure.
 */
function scannableRegions(source: string, kind: "code" | "style"): string {
  const keep = new Uint8Array(source.length);
  let state: "code" | "line" | "block" | "string" = kind === "style" ? "string" : "code";
  let quote = "";
  let i = 0;

  while (i < source.length) {
    const c = source[i];
    const d = source[i + 1];

    if (state === "code") {
      if (c === "/" && d === "/") {
        state = "line";
        i += 2;
      } else if (c === "/" && d === "*") {
        state = "block";
        i += 2;
      } else if (c === "'" || c === '"' || c === "`") {
        quote = c;
        state = "string";
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (state === "line") {
      if (c === "\n") state = "code";
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && d === "/") {
        state = kind === "style" ? "string" : "code";
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // Inside scannable content.
    if (kind === "style" && c === "/" && d === "*") {
      state = "block";
      i += 2;
      continue;
    }
    if (kind === "code" && c === "\\") {
      i += 2;
      continue;
    }
    if (kind === "code" && c === quote) {
      state = "code";
      i += 1;
      continue;
    }
    keep[i] = 1;
    i += 1;
  }

  return Array.from(source, (char, index) =>
    keep[index] === 1 ? char : char === "\n" ? "\n" : " ",
  ).join("");
}

function collectFiles(dir: string, extensions: readonly string[], into: string[]): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks a fixed in-repo directory (src/, resolved from this file), no external input
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(full)) collectFiles(full, extensions, into);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      into.push(full);
    }
  }
  return into;
}

type Hit = { file: string; line: number; className: string };

function census(): Hit[] {
  const hits: Hit[] = [];
  const files = collectFiles(srcRoot, [...CODE_EXTENSIONS, ...STYLE_EXTENSIONS], []).sort();

  for (const path of files) {
    const kind = STYLE_EXTENSIONS.some((extension) => path.endsWith(extension)) ? "style" : "code";
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
    const scannable = scannableRegions(readFileSync(path, "utf8"), kind);
    const file = relative(repoRoot, path).split(sep).join("/");

    for (const pattern of [UTILITY_TINT, ARBITRARY_TINT]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(scannable)) !== null) {
        const line = scannable.slice(0, match.index).split("\n").length;
        hits.push({ file, line, className: match[0] });
      }
    }
  }

  return hits;
}

describe("the shading rule — brand colours ship only at their authored values", () => {
  it("finds no brand tint outside the closed exemption list", () => {
    const violations = census().filter(
      ({ file, className }) => !exemptKeys.has(`${file}::${className}`),
    );

    expect(
      violations.map(({ file, line, className }) => `${file}:${line}  ${className}`),
      "A brand colour painted at an alpha step composites to a darker, duller colour that is no longer the brand. Replace the ground with a neutral (`bg-muted`, `bg-accent`) and let the brand arrive at its authored value — on the edge, the ink or the fill. See the shading rule in the root CLAUDE.md Styling section; the exemptions are closed, and a new one is a decision to raise with the owner.",
    ).toEqual([]);
  });

  it("keeps the exemption list honest — every entry still describes a real site", () => {
    const found = new Set(census().map(({ file, className }) => `${file}::${className}`));
    const stale = [...exemptKeys].filter((key) => !found.has(key));

    expect(
      stale,
      "An exemption that no longer matches anything is standing permission for whatever lands in that file next. Delete it in the change that removed the construct.",
    ).toEqual([]);
  });

  it("states why each exemption exists", () => {
    for (const { file, why } of EXEMPT) {
      expect(why.length, `${file} needs a one-line why`).toBeGreaterThan(40);
    }
  });
});
