import { describe, expect, it } from "vitest";

import { NEUTRALS } from "../../../packages/sog-ui/src/tokens/brand";
import {
  GROUNDS,
  contrastRatio,
  hexToRgb,
} from "../../../packages/sog-ui/src/tokens/contrast";
import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";
import {
  GLASS,
  HOVER,
  SCRIM,
} from "../../../packages/sog-ui/src/tokens/surfaces";

/**
 * The three constructs that composite reach the stylesheet whole.
 *
 * What is load-bearing here is not that the scrim is 70% — that is a ruling and
 * a ruling is allowed to move — but that **one** strength exists per construct
 * and that the whole construct survives the trip into CSS. The surface these
 * replaced carried six strengths across five files, each one written by whoever
 * needed a translucent thing that afternoon, and the failure mode they are
 * guarded against is the seventh: a token that emits without its alpha, a glass
 * that loses one of its two fills, a blur that is declared for one vendor and
 * not the other, a hover layer so thin that the state it draws cannot be found.
 * Each of those renders *something*, which is why none of them would be noticed
 * by looking.
 *
 * So every assertion below is written against the typed source rather than
 * against a literal. Retuning a construct means editing `surfaces.ts` and
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

describe("the hover layer", () => {
  /**
   * The layer flattened onto a ground, the way a browser composites it.
   *
   * Source-over on an opaque backdrop is a straight per-channel lerp in the
   * space the paint happens in, which for a `background-color` is sRGB — so
   * this is the pixel a reader actually sees when the pointer is on a row, and
   * it is what the step below is measured against.
   */
  const composite = (groundHex: string): string => {
    const ink = hexToRgb(NEUTRALS[HOVER.ink].hex);
    const ground = hexToRgb(groundHex);
    const channel = (index: number) =>
      Math.round(HOVER.alpha * ink[index] + (1 - HOVER.alpha) * ground[index])
        .toString(16)
        .padStart(2, "0");
    return `#${channel(0)}${channel(1)}${channel(2)}`;
  };

  it("reaches the theme as one token carrying its own alpha", () => {
    const mix = `color-mix(in oklab, ${NEUTRALS[HOVER.ink].hex} ${percent(HOVER.alpha)}, transparent)`;
    expect(renderTheme()).toContain(
      `--background-image-hover: linear-gradient(${mix}, ${mix});`,
    );
  });

  it("is an image and not a colour, so it lands on top of a ground", () => {
    // The mechanism: a `background-color` stands in for whatever fill an
    // element had, so an outline button on the card ground went see-through
    // under the pointer. A `background-image` composites over it. The colour
    // namespace must therefore hold no hover at all — which also means
    // `text-hover` and `border-hover` cannot be written.
    const theme = renderTheme();
    expect(theme).not.toContain("--color-hover");
    expect(theme).toContain("--background-image-hover:");
  });

  it("is the theme's ink, not a grey of its own", () => {
    // A grey at low alpha lifts the dark grounds and sinks the light one, so it
    // could not be one layer. Naming the ink rather than spelling a hex is also
    // what keeps the layer following the theme when the ink moves.
    expect(NEUTRALS[HOVER.ink].hex).toBe(NEUTRALS.foreground.hex);
  });

  it("is one strength, not a scale", () => {
    // `bg-hover` is the whole construct. A site able to write `bg-hover/40`
    // would be picking a strength again, which is the drift a single layer
    // exists to end — the same claim the scrim makes above.
    expect(Object.keys(HOVER)).toEqual(["ink", "alpha"]);
  });

  it("lifts every ground by at least the theme's own smallest step", () => {
    // The mechanism the layer exists for: one value, and it has to read as one
    // step up on all three grounds rather than only on the darkest. The bar is
    // the card-to-lifted step, because that is the difference the greys ruling
    // accepted as one a reader can actually find — a layer falling below it
    // would draw a state nobody could locate, which is the fault the deleted
    // fourth grey had.
    const smallestStep = contrastRatio(NEUTRALS.card.hex, NEUTRALS.lifted.hex);
    for (const ground of GROUNDS) {
      expect(
        contrastRatio(ground.hex, composite(ground.hex)),
        `hover over ${ground.label} composites to ${composite(ground.hex)}, which is not a visible step off ${ground.hex}`,
      ).toBeGreaterThanOrEqual(smallestStep);
    }
  });

  it("stays a state and never becomes a surface", () => {
    // Nothing is authored on the layer, so it is not in the ground set and has
    // no `-foreground` companion: a hovered row's text is measured against the
    // ground the row sits on. A `--color-hover-foreground` in the theme would
    // mean somebody had started treating it as a fourth surface.
    expect(GROUNDS.map((ground) => ground.token)).not.toContain("hover");
    expect(renderTheme()).not.toContain("hover-foreground");
  });
});
