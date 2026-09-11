import { describe, expect, it } from "vitest";

import {
  STATUS,
  STATUS_IDS,
  STATUS_INK,
  YTY_FAMILIES,
  statusHex,
} from "../../../packages/sog-ui/src/tokens/brand";
import {
  THRESHOLDS,
  contrastRatio,
} from "../../../packages/sog-ui/src/tokens/contrast";
import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";

/**
 * One colour per element, and a status that takes a family rather than
 * resembling one.
 *
 * Neither claim is a value restating itself. The first is a *shape*: the brand
 * fixes two values per family and this theme emits one, so the failure guarded
 * against is a second value creeping back — as a key on the entry, or as a
 * `-strong` / `-soft` token in the stylesheet — which would hand every call site
 * a choice the owner ruled out of existence. The second is a *mechanism*:
 * success and info are Glow and Wit, and the whole reason the entries point at
 * the family instead of spelling its hex is that the two can then never drift
 * into being the near neighbours the owner refused. A test that let `success`
 * carry its own green would let exactly that back in.
 */

const theme = renderTheme();

describe("the four families", () => {
  const families = Object.entries(YTY_FAMILIES);

  it("is four", () => {
    expect(families).toHaveLength(4);
  });

  it("gives each family exactly one colour, with no variant to choose", () => {
    for (const [id, family] of families) {
      expect(Object.keys(family).sort(), `${id}'s keys`).toEqual([
        "hex",
        "hue",
        "name",
      ]);
    }
  });

  it("emits one token per family", () => {
    for (const [id, family] of families) {
      expect(theme).toContain(`--color-yty-${id}: ${family.hex};`);
    }
  });

  it.each(Object.keys(YTY_FAMILIES).flatMap((id) => [`${id}-strong`, `${id}-soft`]))(
    "--color-yty-%s is not in the theme",
    (name) => {
      expect(theme).not.toContain(`--color-yty-${name}:`);
    },
  );
});

describe("the four statuses", () => {
  it("is the four the palette declares, in one order", () => {
    expect([...STATUS_IDS].sort()).toEqual(Object.keys(STATUS).sort());
  });

  it("resolves success and info through the family rather than beside it", () => {
    expect(statusHex("success")).toBe(YTY_FAMILIES.glow.hex);
    expect(statusHex("info")).toBe(YTY_FAMILIES.wit.hex);
  });

  it("reaches the stylesheet at the value it resolves to", () => {
    for (const id of STATUS_IDS) {
      expect(theme).toContain(`--color-${id}: ${statusHex(id)};`);
    }
  });

  it("carries one ink, generated for every status", () => {
    for (const id of STATUS_IDS) {
      expect(theme).toContain(`--color-${id}-foreground: ${STATUS_INK};`);
    }
  });

  // The reason there is one ink rather than four, kept as the arithmetic that
  // implies it: every status fill is light enough to take a dark label and none
  // of them is dark enough to take a white one. A retuned status that broke
  // either half would need a second ink, and would fail here first.
  it.each([...STATUS_IDS])("%s is a fill only a dark label reads on", (id) => {
    expect(contrastRatio(statusHex(id), STATUS_INK)).toBeGreaterThanOrEqual(
      THRESHOLDS.bodyText,
    );
    expect(contrastRatio(statusHex(id), "#FFFFFF")).toBeLessThan(
      THRESHOLDS.bodyText,
    );
  });
});
