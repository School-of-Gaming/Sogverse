import { describe, expect, it } from "vitest";

import { NEUTRALS } from "../../../packages/sog-ui/src/tokens/brand";
import { GROUNDS } from "../../../packages/sog-ui/src/tokens/contrast";
import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";

/**
 * The ladder is three grounds, and it stays three.
 *
 * The theme ran to four steps and the two above the card measured 1.08 and 1.15
 * against it — a difference nobody could point at, bought by spending the quiet
 * ground on a state. Three is the ruling, and the failure mode it is guarded
 * against is arithmetic: a fourth ground added later is a lift somebody has to
 * measure, a contrast ledger that no longer walks every ground a text token can
 * land on, and a sweep that has to be done again. So the count is asserted
 * rather than remembered, and the two deleted names are asserted absent so a
 * revival has to be a deliberate edit to this file rather than a token that
 * quietly reappears.
 *
 * `--color-muted-foreground` is checked *present* in the same breath, because
 * it is the one name a careless sweep of "muted" takes with it: it is ink, it
 * reads on all three grounds, and it is not the companion of anything.
 */

const theme = renderTheme();

/** Every neutral that carries an `on` is a ground; the rest are ink and edges. */
const grounds = Object.entries(NEUTRALS).filter(([, neutral]) => "on" in neutral);

describe("the neutral grounds", () => {
  it("is three, and they are the page, the card and the lifted grey", () => {
    expect(grounds.map(([id]) => id)).toEqual(["background", "card", "lifted"]);
  });

  it("is the same set the contrast ledger measures every text token against", () => {
    expect(GROUNDS.map((ground) => ground.token)).toEqual(
      grounds.map(([id]) => id),
    );
  });

  it("reaches the stylesheet, one declaration each", () => {
    for (const [id, neutral] of grounds) {
      expect(theme).toContain(`--color-${id}: ${neutral.hex};`);
    }
  });
});

describe("the deleted grounds", () => {
  it.each(["--color-accent", "--color-accent-foreground", "--color-muted"])(
    "%s is not in the theme",
    (token) => {
      expect(theme).not.toContain(`${token}:`);
    },
  );

  it("keeps the quiet ink, which was never one of them", () => {
    expect(theme).toContain(
      `--color-muted-foreground: ${NEUTRALS.mutedForeground.hex};`,
    );
  });
});
