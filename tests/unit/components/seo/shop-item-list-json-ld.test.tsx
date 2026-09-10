import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopItemListJsonLd } from "@/components/public/products/shop-item-list-json-ld";
import type { ProductBrowseRow } from "@/types";

// Row factory — only the translations decide anything this block emits; every
// other ProductBrowseRow column carries an honest, fully-typed default so the
// fixture satisfies the row type with no cast.
function row(
  id: string,
  translations: { locale: string; name: string }[],
): ProductBrowseRow {
  return {
    id,
    billing_mode: "paid",
    start_date: null,
    end_date: null,
    image_path: null,
    is_remote: true,
    for_gamers: true,
    for_parents: false,
    min_age: 7,
    max_age: 17,
    tag: null,
    product_type: "consumer_club",
    registration_opens_at: "2026-01-01T00:00:00.000Z",
    seat_count: null,
    signup_threshold: null,
    spoken_language_code: "en",
    status: "running",
    timezone: "Europe/Helsinki",
    topic: "minecraft_java",
    waitlist_enabled: false,
    product_translations: translations.map(({ locale, name }) => ({
      locale,
      name,
      short_description: "",
    })),
    product_prices: [],
    schedule_slots: [],
    locations: null,
  };
}

/** The `ItemList` the component emits, parsed back out of the document. */
function emitted(products: ProductBrowseRow[], locale = "en"): unknown {
  const html = renderToStaticMarkup(
    ShopItemListJsonLd({ products, locale }) ?? <></>,
  );
  const json = html
    .replace(/^<script type="application\/ld\+json">/, "")
    .replace(/<\/script>$/, "");

  if (json === "") return null;

  const parsed: unknown = JSON.parse(json);
  return parsed;
}

/**
 * The shop's structured data. What it has to get right is small: the names on
 * the page, in the page's order, and nothing a crawler is told it may not use.
 */
describe("ShopItemListJsonLd", () => {
  it("names each product, in the order the grid renders them", () => {
    const list = emitted([
      row("a", [{ locale: "en", name: "Minecraft club" }]),
      row("b", [{ locale: "en", name: "Roblox camp" }]),
    ]);

    expect(list).toMatchObject({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Minecraft club" },
        { "@type": "ListItem", position: 2, name: "Roblox camp" },
      ],
    });
  });

  it("emits no url anywhere", () => {
    // Every product detail page is `noindex, nofollow` by posture, so a URL
    // here would advertise pages a crawler is told it may not use
    // (`docs/architecture/discoverability.md`, tier 2).
    const html = renderToStaticMarkup(
      ShopItemListJsonLd({
        products: [row("a", [{ locale: "en", name: "Minecraft club" }])],
        locale: "en",
      }) ?? <></>,
    );

    expect(html).not.toContain("url");
  });

  it("skips a row whose name resolves to nothing", () => {
    // A `ListItem` with an empty `name` is an invalid one — better absent than
    // present and nameless.
    const list = emitted([
      row("a", []),
      row("b", [{ locale: "en", name: "Roblox camp" }]),
    ]);

    expect(list).toMatchObject({
      itemListElement: [{ "@type": "ListItem", position: 1, name: "Roblox camp" }],
    });
  });

  it("renders nothing at all when there is no product to list", () => {
    // The shop page's prefetch catches its own failure and hands the grid `[]`
    // while the client refetches; an empty `ItemList` would assert "nothing is
    // on offer" over a grid showing dozens.
    expect(ShopItemListJsonLd({ products: [], locale: "en" })).toBeNull();
    expect(emitted([row("a", [])])).toBeNull();
  });
});
