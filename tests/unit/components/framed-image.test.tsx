import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProductBanner } from "@/components/ui/product-banner";

/**
 * The catalogue frames and the one placeholder they share. What has to
 * hold is that each frame keeps its own shape whether or not there is a
 * picture — a card without one is the same height as a card with one — and
 * that the placeholder is drawn in that shape rather than letterboxed inside
 * another.
 */
describe("the catalogue frames", () => {
  it.each([
    ["a product", ProductBanner, "aspect-[3/2]", "0 0 150 100"],
  ])(
    "paints NO IMAGE for %s with no picture, in its own shape",
    (_what, Frame, aspect, viewBox) => {
      const { container } = render(<Frame src={null} className="rounded" />);
      const svg = container.querySelector("svg");

      expect(svg?.textContent).toBe("NO IMAGE");
      expect(svg?.getAttribute("viewBox")).toBe(viewBox);
      expect(svg?.getAttribute("class")).toContain(aspect);
      expect(svg?.getAttribute("class")).toContain("rounded");
    },
  );

  it.each([
    ["a product", ProductBanner, "aspect-[3/2]"],
  ])("frames %s's picture in its own shape", (_what, Frame, aspect) => {
    const { container } = render(<Frame src="/cover.jpg" />);

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.firstElementChild?.className).toContain(aspect);
    expect(container.querySelector("svg")).toBeNull();
  });
});
