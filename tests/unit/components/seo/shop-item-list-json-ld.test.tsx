import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The real wrapped navigation: an item's URL is the locale-prefixed,
// translated address the path builder produces, which the setup's stub
// flattens.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const SITE = "https://test.sogverse.local";
vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
afterAll(() => vi.unstubAllEnvs());
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
    start_date: "2026-01-12",
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
    spoken_language_code: "en",
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

  it("gives each item its page's canonical URL", () => {
    // The rows are exactly the shop's listing, and a listed product's page is
    // promoted (`docs/architecture/site-quality.md`, tier 1). Its canonical is
    // the address of the locale whose words it shows.
    const list = emitted(
      [
        row("a", [
          { locale: "en", name: "Minecraft club" },
          { locale: "fi", name: "Minecraft-kerho" },
        ]),
        row("b", [{ locale: "en", name: "Roblox camp" }]),
      ],
      "fi",
    );

    expect(list).toMatchObject({
      itemListElement: [
        { position: 1, name: "Minecraft-kerho", url: `${SITE}/fi/kauppa/a` },
        // Not written in Finnish: the Finnish shop shows its English words,
        // and its page canonicalises to the English address.
        { position: 2, name: "Roblox camp", url: `${SITE}/en/shop/b` },
      ],
    });
  });

  it("names an untranslated product by its first version in the one fixed language order", () => {
    // Written in French and Swedish, the rows arriving French first: a
    // Finnish reader is shown Swedish, which comes before French in
    // `SUPPORTED_LOCALES`, and the name and the URL agree on it.
    const list = emitted(
      [
        row("c", [
          { locale: "fr", name: "Club de construction" },
          { locale: "sv", name: "Byggklubb" },
        ]),
      ],
      "fi",
    );

    expect(list).toMatchObject({
      itemListElement: [
        { position: 1, name: "Byggklubb", url: `${SITE}/sv/butik/c` },
      ],
    });
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
