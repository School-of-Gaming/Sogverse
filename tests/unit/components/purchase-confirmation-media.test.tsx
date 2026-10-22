import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { ProductBrowseRow } from "@/types";

/**
 * The confirmation summary paints the product's picture — the photograph a
 * parent clicked — flush down the card's left edge, as tall as the text beside
 * it, so no dead card sits under a short thumb. These pin the two halves of
 * that: the frame an imaged product gets, and what an un-imaged one gets
 * instead.
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
  beforeEach(() => {
    // A real product's `image_path` resolves against the bucket URL, so the
    // resolver needs the env var the deployment always carries.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The half that actually changed: a bucket object is routed through the
  // optimizer rather than handed to the browser whole, and the thumb's own
  // width reaches the browser so it picks a 96px candidate instead of the
  // multi-megabyte master.
  it("serves a bucket picture through the optimizer at the column's width", () => {
    const { container } = renderConfirmation(
      "b7a1c0de-4f2b-4d1e-9c3a-5e6f70819a2b.png",
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^\/_next\/image/);
    expect(img?.getAttribute("sizes")).toBe("(min-width: 640px) 112px, 96px");
  });

  it("fills the card's height beside the text, cropping rather than letterboxing", () => {
    const { container } = renderConfirmation("/preview-art/card-terrain.svg");
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // The frame is the image's parent (`next/image`'s `fill` needs a positioned
    // ancestor), and on this card it carries no ratio: it stretches with the
    // text column, and the picture covers it. Root-relative fixture art is
    // passed through untouched — the optimizer refuses SVG.
    expect(img?.getAttribute("src")).toBe("/preview-art/card-terrain.svg");
    expect(img?.className).toContain("object-cover");
    const frame = img?.parentElement;
    expect(frame?.className).not.toContain("aspect-");
    expect(frame?.className).not.toContain("self-start");
    expect(frame?.className).toContain("w-24");
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
