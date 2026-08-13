import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { ProductDetailRow } from "@/services/products";

/**
 * **A product with no long description has to render as a product with no long
 * description — not as a hole where one would go.**
 *
 * This is load-bearing beyond the ordinary optional-field case. The migration
 * that turned the column to markdown cleared it, and the copy is restored by
 * hand afterwards, so for the length of a release *every* product is in this
 * state. The whole argument for clearing the column is that the empty state was
 * already correct; that argument is only as good as this test.
 *
 * Two claims, and the second is the one worth the file: the card is absent, and
 * so is the space it would have occupied.
 */

function renderBody(longDescription: string | null) {
  const { product } = buildScenarioFixture("consumer-club");
  const withCopy: ProductDetailRow = {
    ...product,
    product_translations: product.product_translations.map((t) => ({
      ...t,
      long_description: longDescription,
    })),
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* The real providers, seeded rather than mocked: the facts card beside
          the blurb reads the viewer's zone and a stable `now` out of them. */}
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={new Date("2026-08-13T09:00:00Z")}>
          <ProductDetailPageBody
            product={withCopy}
            signupPanel={<div data-testid="panel" />}
            signupActionable
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

describe("the long description card on the product detail page", () => {
  it("renders the stored markdown as headings and prose", () => {
    const { container } = renderBody(
      "# What happens\n\nWe build **redstone** together.",
    );
    // A level-1 heading is painted an h2 — one step under the product's name.
    const heading = [...container.querySelectorAll("h2")].find(
      (h) => h.textContent === "What happens",
    );
    expect(heading).toBeDefined();
    expect(container.textContent).toContain("We build redstone together.");
    expect(container.querySelector("strong")?.textContent).toBe("redstone");
  });

  it("renders nothing at all when the field is null or blank", () => {
    const withCopy = renderBody("# What happens\n\nCopy.");
    const cardCount = withCopy.container.querySelectorAll("h2").length;

    for (const empty of [null, "", "   \n  "]) {
      const { container } = renderBody(empty);
      // The page still renders — the panel and the product's own name are
      // there — and the blurb's headings are simply not.
      expect(container.querySelector("[data-testid='panel']")).not.toBeNull();
      expect(container.textContent).toContain("Minecraft Redstone Club");
      expect(
        container.querySelectorAll("h2").length,
        JSON.stringify(empty),
      ).toBeLessThan(cardCount);
      expect(container.textContent, JSON.stringify(empty)).not.toContain(
        "What happens",
      );
      // And no empty spacer left standing where the card was.
      expect(
        container.querySelector("div.mt-8"),
        JSON.stringify(empty),
      ).toBeNull();
    }
  });
});
