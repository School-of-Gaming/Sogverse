import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import productBrowse from "@/../messages/en/productBrowse.json";
import { ProductBrowseCardView } from "@/components/public/products/product-browse-card-view";
import type { ProductBrowseCardViewProps } from "@/components/public/products/browse-card-shell";

/**
 * **The browse card's title level.** The shop and every other surface title a
 * card as an H3 under their own heading; a landing products section with no
 * heading asks for H2s, so its cards do not skip a level after the page's H1.
 */
const props: ProductBrowseCardViewProps = {
  name: "Minecraft Builders",
  description: null,
  imageSrc: null,
  tag: null,
  topicLabel: null,
  scheduleLines: [],
  ageLine: null,
  audienceLabel: null,
  locationLine: { kind: "online", label: "Online" },
  spokenLanguageCode: "en",
  footerLeft: { kind: "price", price: { kind: "free" } },
  state: { kind: "ended" },
  detailHref: "/shop",
};

function renderCard(extra: Partial<ProductBrowseCardViewProps> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ productBrowse }}>
      <ProductBrowseCardView {...props} {...extra} />
    </NextIntlClientProvider>,
  );
}

describe("ProductBrowseCardView", () => {
  it("titles the card as an H3 by default", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Minecraft Builders" }).tagName).toBe("H3");
  });

  it("titles the card as an H2 when asked", () => {
    renderCard({ titleLevel: 2 });
    expect(screen.getByRole("heading", { name: "Minecraft Builders" }).tagName).toBe("H2");
  });
});
