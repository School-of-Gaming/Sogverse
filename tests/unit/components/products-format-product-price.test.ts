import { describe, it, expect } from "vitest";
import { formatProductPrice } from "@/components/public/products/format-product-price";
import type { ProductPrice } from "@/types";

// Sanity checks on the browse-card price formatter. The exact formatted
// string depends on Intl in the Node runtime; we assert structural shape
// and that the right currency symbol is present rather than the entire
// formatted string, which can vary across ICU versions.

function priceRow(
  over: Partial<ProductPrice> & { currency: string },
): ProductPrice {
  return {
    product_id: "p",
    currency: over.currency,
    price_per_session: over.price_per_session ?? 0,
    price_per_month: over.price_per_month ?? 0,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  } as ProductPrice;
}

describe("formatProductPrice", () => {
  it("returns kind=free for free events", () => {
    const line = formatProductPrice({
      prices: [],
      billingMode: "free",
      productType: "event",
      currency: "eur",
      locale: "en",
    });
    expect(line.kind).toBe("free");
  });

  it("returns kind=external for municipality clubs", () => {
    const line = formatProductPrice({
      prices: [],
      billingMode: "external_contract",
      productType: "municipality_club",
      currency: "eur",
      locale: "en",
    });
    expect(line.kind).toBe("external");
  });

  it("consumer_club renders a monthly subscription from price_per_month", () => {
    const line = formatProductPrice({
      prices: [
        priceRow({
          currency: "eur",
          price_per_session: 0,
          price_per_month: 4500,
        }),
      ],
      billingMode: "paid",
      productType: "consumer_club",
      currency: "eur",
      locale: "en",
    });
    expect(line.kind).toBe("subscription");
    if (line.kind === "subscription") {
      expect(line.perMonth).toMatch(/€|EUR/);
      expect(line.perMonth).toMatch(/45/);
    }
  });

  it("camp upfront_total falls into kind=upfront and uses price_per_session", () => {
    const line = formatProductPrice({
      prices: [
        priceRow({
          currency: "eur",
          price_per_session: 12000,
          price_per_month: 0,
        }),
      ],
      billingMode: "paid",
      productType: "camp",
      currency: "eur",
      locale: "en",
    });
    expect(line.kind).toBe("upfront");
    if (line.kind === "upfront") {
      expect(line.total).toMatch(/120/);
      expect(line.total).toMatch(/€|EUR/);
    }
  });

  it("event upfront_total works the same as camps", () => {
    const line = formatProductPrice({
      prices: [
        priceRow({
          currency: "gbp",
          price_per_session: 1500,
          price_per_month: 0,
        }),
      ],
      billingMode: "paid",
      productType: "event",
      currency: "gbp",
      locale: "en",
    });
    expect(line.kind).toBe("upfront");
    if (line.kind === "upfront") {
      expect(line.total).toMatch(/£|GBP/);
    }
  });

  it("returns kind=unavailable when the user's currency has no row", () => {
    const line = formatProductPrice({
      prices: [
        priceRow({
          currency: "eur",
          price_per_session: 2000,
          price_per_month: 4500,
        }),
      ],
      billingMode: "paid",
      productType: "consumer_club",
      currency: "usd",
      locale: "en",
    });
    expect(line.kind).toBe("unavailable");
    if (line.kind === "unavailable") {
      expect(line.currency).toBe("USD");
    }
  });
});
