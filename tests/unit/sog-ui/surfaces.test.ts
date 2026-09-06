import { describe, expect, it } from "vitest";

import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";
import { GLASS, SCRIM } from "../../../packages/sog-ui/src/tokens/surfaces";

/**
 * The two constructs that composite reach the stylesheet whole.
 *
 * What is load-bearing here is not that the scrim is 70% — that is a ruling and
 * a ruling is allowed to move — but that **one** strength exists and that the
 * whole construct survives the trip into CSS. The surface these two replaced
 * carried six strengths across five files, each one written by whoever needed a
 * translucent thing that afternoon, and the failure mode they are guarded
 * against is the seventh: a token that emits without its alpha, a glass that
 * loses one of its two fills, a blur that is declared for one vendor and not
 * the other. Each of those renders *something*, which is why none of them would
 * be noticed by looking.
 *
 * So every assertion below is written against the typed source rather than
 * against a literal. Retuning either construct means editing `surfaces.ts` and
 * regenerating; it does not mean editing this file, and a test that had to be
 * edited alongside the value would be proving only that somebody edited both.
 */

/** `0.7` → `70%`, the form the generator writes a fraction as. */
const percent = (fraction: number) => `${Number((fraction * 100).toFixed(5))}%`;

describe("the scrim", () => {
  it("reaches the theme as one token carrying its own alpha", () => {
    expect(renderTheme()).toContain(
      `--color-scrim: color-mix(in oklab, ${SCRIM.hex} ${percent(SCRIM.alpha)}, transparent);`,
    );
  });

  it("is black — a tint that adds a hue recolours what it dims", () => {
    expect(SCRIM.hex).toBe("#000000");
  });

  it("is one strength, not a scale", () => {
    // The construct is `bg-scrim`, with no `/n` a call site could vary. If a
    // second strength is ever wanted it is a second named construct with its
    // own reason, not a modifier on this one.
    expect(Object.keys(SCRIM)).toEqual(["hex", "alpha"]);
  });
});

describe("the glass", () => {
  const theme = renderTheme();
  const blur = `blur(${GLASS.blurPx}px)`;
  const fill = (opacity: number) =>
    `color-mix(in oklab, var(--color-${GLASS.ground}) ${percent(opacity)}, transparent)`;

  it("is a real utility, so it takes variants and is scanned like any other", () => {
    expect(theme).toContain("@utility glass {");
  });

  it("carries both strengths — the blurred one and the fallback", () => {
    // Two answers to one question: with a blur holding the panel's contents
    // legible it can be thinner, and without one it cannot. A generated file
    // carrying only the base fill is a panel that never blurs; carrying only
    // the supported fill is a panel that goes transparent where it cannot.
    expect(theme).toContain(`background-color: ${fill(GLASS.fallbackOpacity)};`);
    expect(theme).toContain(`background-color: ${fill(GLASS.opacity)};`);
    expect(GLASS.fallbackOpacity).toBeGreaterThan(GLASS.opacity);
  });

  it("blurs for both vendor spellings, and only inside the support query", () => {
    expect(theme).toContain(`-webkit-backdrop-filter: ${blur};`);
    expect(theme).toContain(`backdrop-filter: ${blur};`);
    expect(theme).toContain(
      `@supports ((backdrop-filter: ${blur}) or (-webkit-backdrop-filter: ${blur})) {`,
    );
  });

  it("draws its fill from the page ground rather than a colour of its own", () => {
    // Glass is the page, thinned: a hex here would be a second ground that
    // stops following the theme the moment the page's own colour moves.
    expect(GLASS.ground).toBe("background");
  });
});
