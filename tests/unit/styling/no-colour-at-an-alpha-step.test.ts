import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A brand colour exists only at the value it was authored at.** Sogverse
 * spends no brand token at an alpha step.
 *
 * 270 sites in 120 files carried a `/n` modifier before the theme adoption, in
 * six different strengths, and the drawings that settled it showed what they
 * actually were: a `bg-act/10` behind a chip is not a soft amber, it is a
 * different grey that happens to have been reached by mixing amber into the
 * ground — the same colour a neutral token already names, stated twice and
 * agreeing with nothing. So the rule this holds is not "less alpha", it is: **a
 * ground that needs to lift goes to a neutral, and the brand arrives at full
 * value on an edge, ink, mark or fill.** A `/n` on a brand token is a colour
 * the library never authored and cannot measure a contrast pairing for.
 *
 * **The ban is on the brand, which is why the neutrals are not in the regex
 * below.** A grey is not the brand speaking — it is the ground, the ink and the
 * edge, and a grey at a fraction of itself misrepresents nothing — so what
 * governs a neutral is whether the transparency is doing a job a solid cannot,
 * which is to be a layer over a ground it does not know. Three constructs are,
 * and all three are the library's: `bg-scrim` over media, the `glass` utility
 * over whatever scrolls beneath it, and `bg-hover` over whatever surface an
 * element sits on. Each carries its own alpha, so a call site spends the
 * construct and never a strength — and that half of the rule is held next door,
 * in `glass-belongs-to-the-library.test.ts`, which is where the constructs are
 * described. What a neutral may still not be is a *duller ink*: nothing moves
 * beneath a word, so an alpha there buys nothing, and the 24 sites that were
 * doing it took the plain token in the enforcement pass. That one is prose, not
 * a regex, because a grey at alpha over a photograph is a different thing from
 * a grey at alpha under a caption and no class string can tell them apart.
 *
 * Two more things are deliberately out of scope. Opacity applied to a *whole
 * element* as a state (`disabled:opacity-50`) is a component recipe, not a
 * colour, and is untouched. And `text-white/*` is not in the token list below —
 * white is not one of the brand's inks, so it is the palette-class ban in
 * `eslint.config.mjs` that owns it, not this test.
 *
 * The surface is regenerated from disk on every run rather than pinned to a
 * count, and the exemptions are named one by one, so a new `/n` fails here and a
 * retired one has to be struck from the list. The match runs over the file's
 * text, comments included — a class spelled in a comment is a class the next
 * reader can copy, and the two exemptions below make their point without
 * spelling anything.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const srcRoot = join(repoRoot, "src");

/**
 * A colour utility carrying an alpha modifier: any variant prefix, a property
 * that takes a colour, one of the **brand's** token names, and a `/n`.
 *
 * The token names are spelled out rather than matched as "any word", so the test
 * says what it is about — a *brand* token at an alpha step. The list is the
 * whole of what the brand says in colour: the signature pair, the four Yty
 * families, the four statuses and the sixteen picks, each with its
 * `-foreground` companion. The neutrals are absent on purpose and the paragraph
 * above says why. An arbitrary value (`bg-[#ffffff]/50`) is not a token and is
 * the hex ban's business, in `eslint.config.mjs`; `text-white/70` is not a token
 * either and belongs to the palette-class ban in the same file.
 *
 * A literal, not a `new RegExp` built from a list: the list read a little better
 * and cost a lint suppression, and a regex assembled from parts is also a regex
 * nobody can read in one piece.
 */
const ALPHA_UTILITY =
  /\b[a-z:-]*(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|divide|decoration)-(?:destructive|success|info|warning|act|world|pick-[0-9]+|yty-[a-z]+)(?:-foreground)?\/[0-9]+/g;

/**
 * The sites that may still carry one, as `path :: class`, each with the reason
 * it is exempt and the thing that will retire it.
 *
 * Both are hover shades on a **filled** control, and both are held by the same
 * argument: a filled button is the one place a brand colour is deliberately a
 * ground rather than a figure, so what it does under a pointer is a decision
 * about the button rather than about the colour. The Button adoption makes it,
 * and whatever it decides, the shade is not a derived tint of act — at which
 * point these lines leave the list with the classes.
 */
const EXEMPT: Record<string, string> = {
  "src/components/ui/button.tsx :: hover:bg-act/90":
    "the filled button's hover shade, held for the Button adoption's hover ruling",
  "src/components/ui/button.tsx :: hover:bg-destructive/90":
    "the filled destructive button's hover shade, held for the same ruling",
  "src/components/ui/button.tsx :: hover:bg-world/80":
    "the filled secondary button's hover shade, held for the same ruling",
  "src/components/parent/PaymentProblemBadge.tsx :: hover:bg-destructive/90":
    "the badge is a filled control of the same shape and waits on the same ruling",
};

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

const WHY =
  "A brand token at an alpha step is a colour @sog/ui never authored: it composites to a value nothing in the palette names and nothing has measured a contrast pairing for. A ground that needs to lift takes a neutral (`lifted`, `card`); a brand or status colour arrives at full value as an edge, an ink, a mark or a fill. The three constructs that really do see through are the library's — `bg-scrim`, the `glass` utility and `bg-hover` — and all three are neutral and carry their own alpha.";

describe("Sogverse spends no brand colour at an alpha step", () => {
  const found = sourceFiles(srcRoot).flatMap((file) =>
    [
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
      ...readFileSync(join(repoRoot, file), "utf8").matchAll(ALPHA_UTILITY),
    ].map((match) => `${file} :: ${match[0]}`),
  );

  it("carries only the named exemptions", () => {
    expect([...new Set(found)].sort(), WHY).toEqual(Object.keys(EXEMPT).sort());
  });

  it("names a reason for every exemption it still lists", () => {
    // The other half of an allowlist's job: an exemption whose site is gone has
    // to leave the list, or the list slowly becomes a record of what used to be
    // wrong. Allowlist growth is the failure mode of every allowlist.
    expect(
      Object.keys(EXEMPT).filter((site) => !found.includes(site)),
      "An exemption listed here matches nothing in src/ any more — delete it.",
    ).toEqual([]);
  });
});
