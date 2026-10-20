import { describe, expect, it } from "vitest";

import { mergeClasses } from "../../../packages/sog-ui/src/tokens/class-merge";
import { typeSizes } from "../../../packages/sog-ui/src/tokens/typography";

/**
 * The class merger, taught the theme.
 *
 * Every failure guarded here is silent: the merger drops a class, the element
 * still renders, and the call site that lost it looks correct. So each case
 * states the two classes a caller writes together and what has to come out.
 *
 * The scale's cases iterate the sizes the theme declares rather than naming
 * them, so a step added to the scale is covered without editing this file —
 * and is caught if the merger was not derived from the same list.
 */

const utility = (cssName: string) => cssName.slice("--text-".length);

describe("the hover layer", () => {
  it("composes over a ground instead of replacing it", () => {
    expect(mergeClasses("bg-lifted", "bg-hover")).toBe("bg-lifted bg-hover");
    expect(mergeClasses("bg-card", "hover:bg-hover")).toBe(
      "bg-card hover:bg-hover",
    );
  });

  it("conflicts with another background image", () => {
    expect(mergeClasses("bg-hover", "bg-none")).toBe("bg-none");
  });
});

describe("the grounds", () => {
  it("let the last ground written win, glass and the scrim included", () => {
    expect(mergeClasses("bg-card", "glass")).toBe("glass");
    expect(mergeClasses("glass", "bg-card")).toBe("bg-card");
    expect(mergeClasses("bg-card", "bg-scrim")).toBe("bg-scrim");
  });

  it("keep a layer over glass", () => {
    expect(mergeClasses("glass", "hover:bg-hover")).toBe(
      "glass hover:bg-hover",
    );
  });
});

describe("the type scale", () => {
  const sizes = typeSizes().map(({ cssName }) => utility(cssName));

  it.each(sizes)("keeps text-%s beside a text colour", (size) => {
    expect(mergeClasses(`text-${size}`, "text-foreground")).toBe(
      `text-${size} text-foreground`,
    );
    expect(mergeClasses(`text-${size}`, "text-yty-wit")).toBe(
      `text-${size} text-yty-wit`,
    );
  });

  it.each(sizes)("lets text-%s and a stock size conflict, last wins", (size) => {
    expect(mergeClasses("text-2xl", `text-${size}`)).toBe(`text-${size}`);
    expect(mergeClasses(`text-${size}`, "text-sm")).toBe("text-sm");
  });

  it("lets two steps conflict, last wins", () => {
    expect(mergeClasses(...sizes.map((size) => `text-${size}`))).toBe(
      `text-${sizes[sizes.length - 1]}`,
    );
  });
});
