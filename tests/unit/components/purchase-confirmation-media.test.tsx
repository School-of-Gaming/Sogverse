import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { ProductBrowseRow } from "@/types";

/**
 * The confirmation summary paints the product's picture in the **same 3:2 crop**
 * the browse card and the detail hero paint, because it is the same photograph a
 * parent clicked and then read a page of. These pin the two halves of that: the
 * frame an imaged product gets, and what an un-imaged one gets instead.
 *
 * The no-image half is the one worth a test rather than an eye: this page holds a
 * row straight out of the database, where "no picture" is representable twice
 * over — a NULL column and an empty string — and both have to land on the
 * wordmark banner rather than on a request for an image at the bucket's root.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

// The overview card inside the summary reads the viewer's clock and zone from
// the providers the real page mounts it under.
vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

// A complete row from the shared fixtures, with only the image varied — the
// scenario's own art is a root-relative preview-art path, which the resolver
// passes straight through, so the expected src is the stored value itself.
function productWithImage(imagePath: string | null): ProductBrowseRow {
  const { product } = buildScenarioFixture("consumer-club");
  return { ...product, image_path: imagePath };
}

function renderConfirmation(imagePath: string | null) {
  return render(
    <PurchaseConfirmationView
      product={productWithImage(imagePath)}
      participantName="Aino"
    />,
  );
}

describe("purchase confirmation product picture", () => {
  it("crops the picture to 3:2 rather than letterboxing it", () => {
    const { container } = renderConfirmation("/preview-art/card-terrain.svg");
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // The ratio lives on the wrapper rather than the image: the banner fills
    // its frame (`next/image`'s `fill`, which needs a positioned ancestor), so
    // the frame is the parent and the image is what covers it. Root-relative
    // fixture art is passed through untouched — the optimizer refuses SVG, so
    // the rendered src is still the stored value.
    expect(img?.getAttribute("src")).toBe("/preview-art/card-terrain.svg");
    expect(img?.className).toContain("object-cover");
    expect(img?.parentElement?.className).toContain("aspect-[3/2]");
  });

  it.each([
    ["a null column", null],
    ["an empty string", ""],
  ])("falls back to the banner wordmark on %s", (_label, imagePath) => {
    const { container } = renderConfirmation(imagePath);
    expect(container.querySelector("img")).toBeNull();
    // The banner viewBox, not the square one — an un-imaged product keeps the
    // row's shape instead of leaving a square hole in it.
    const svg = container.querySelector("svg[viewBox='0 0 150 100']");
    expect(svg).not.toBeNull();
  });
});
