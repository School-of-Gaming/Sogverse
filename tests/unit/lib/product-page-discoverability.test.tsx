import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, Suspense, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResolvedMetadata } from "next";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * **A product page as crawlers meet it** (`docs/architecture/site-quality.md`):
 * promoted while its product is on the shop's listing, `noindex` otherwise —
 * an unlisted product, an ended one, a municipality club and anything read
 * through the `/schools` tree — and reachable by its direct link either way.
 *
 * The reads run over the real products service on a real typed client whose
 * only transport is a fetch mock, so what is pinned includes what the page
 * asks the database: the listing question is the shop grid's own query,
 * narrowed to one id.
 */

// The real wrapped navigation, so addresses carry their locale and their
// translated segment.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const SITE = "https://test.sogverse.local";
vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  locale: { current: "en" },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => mocks.locale.current,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

// The visible page body is client-rendered and fetches for itself; what the
// route shell decides is only whether it renders it.
vi.mock("@/components/public/products/product-detail-page", () => ({
  ProductDetailPage: ({ productId }: { productId: string }) => (
    <main data-product={productId} />
  ),
}));

const {
  buildProductMetadata,
  isListedInShop,
} = await import("@/lib/products/product-metadata");
const { ListedProductJsonLd } = await import(
  "@/components/public/products/listed-product-json-ld"
);
const { default: ShopProductDetailPage } = await import(
  "@/app/[locale]/(public)/shop/[id]/page"
);
const { ProductDetailPage } = await import(
  "@/components/public/products/product-detail-page"
);

const ID = "3f8a2c1e-6b4d-4e9a-8c7f-2d1e0b9a8c76";

/** The product's text, written in English and Finnish. */
const TRANSLATIONS = [
  {
    locale: "en",
    name: "Minecraft club",
    short_description: "Build together every week.",
  },
  {
    locale: "fi",
    name: "Minecraft-kerho",
    short_description: "Rakennetaan yhdessä joka viikko.",
  },
];

/** The detail read's row: a weekly online club, paid monthly. */
const DETAIL_ROW = {
  id: ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  is_remote: true,
  for_gamers: true,
  for_parents: false,
  min_age: 8,
  max_age: 12,
  start_date: "2026-09-01",
  end_date: "2026-12-15",
  timezone: "Europe/Helsinki",
  image_path: null,
  spoken_language_code: "fi",
  product_translations: TRANSLATIONS,
  product_prices: [{ currency: "eur", price_cents: 4900 }],
  schedule_slots: [{ weekday: 2, start_time: "17:00:00", duration_minutes: 60 }],
  locations: null,
};

/** The shop listing's answer for this id: the row, or nothing. */
type Listing = "listed" | "absent" | "ended" | "failed";

let fetchMock: FetchMock;
let listing: Listing;
/** The product's picture as the card's read returns it: a catalogue key. */
const IMAGE_PATH =
  "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae.jpg";

function respond(input: Parameters<typeof fetch>[0]): Response {
  const select = requestedUrl(input).searchParams.get("select") ?? "";
  if (select.startsWith("id,start_date")) {
    switch (listing) {
      case "failed":
        return postgrestError("boom", 500);
      case "absent":
        return postgrestJson([]);
      case "ended":
        return postgrestJson([
          { ...DETAIL_ROW, end_date: "2026-06-01", product_translations: [] },
        ]);
      case "listed":
        return postgrestJson([
          { id: ID, start_date: "2026-09-01", end_date: "2026-12-15", timezone: "Europe/Helsinki", product_translations: [{ locale: "en" }, { locale: "fi" }] },
        ]);
    }
  }
  if (select.startsWith("image_path")) {
    return postgrestJson({
      image_path: IMAGE_PATH,
      product_translations: TRANSLATIONS,
    });
  }
  return postgrestJson(DETAIL_ROW);
}

/** Which reads have been asked for so far, by what they select. */
function requestedSelects(): string[] {
  return fetchMock.mock.calls.map((call) => {
    const select = requestedUrl(call[0]).searchParams.get("select") ?? "";
    if (select.startsWith("id,start_date")) return "listing";
    if (select.startsWith("image_path")) return "card";
    return "detail";
  });
}

/**
 * Holds the listing check's answer until released, so a test can see which
 * other reads were already started while it was outstanding.
 */
function holdListing(): { release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetchMock.mockImplementation(async (input) => {
    if (requestedUrl(input).searchParams.get("select")?.startsWith("id,start_date")) {
      await gate;
    }
    return respond(input);
  });
  return { release };
}

// The layout's resolved metadata, which the card reads only for a product with
// no picture of its own. The product here has one, so this never settles —
// and a builder that started reading it would hang the test rather than pass.
const parent = new Promise<ResolvedMetadata>(() => {});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z"));
  listing = "listed";
  mocks.locale.current = "en";
  fetchMock = vi.fn<typeof fetch>(async (input) => respond(input));
  mocks.client = createFetchStubbedClient(fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isListedInShop", () => {
  it("asks the shop grid's own query, narrowed to the product", async () => {
    expect(await isListedInShop(ID)).toBe(true);

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/products");
    expect(url.searchParams.get("product_type")).toBe(
      "in.(consumer_club,camp,event)",
    );
    expect(url.searchParams.get("is_visible")).toBe("eq.true");
    expect(url.searchParams.get("id")).toBe(`eq.${ID}`);
  });

  it("answers no for a product the listing does not hold — unlisted, or a municipality club", async () => {
    listing = "absent";
    expect(await isListedInShop(ID)).toBe(false);
  });

  it("answers no for a listed product that has ended", async () => {
    listing = "ended";
    expect(await isListedInShop(ID)).toBe(false);
  });

  it("answers no when the read fails, rather than promoting a product nobody checked", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    listing = "failed";
    expect(await isListedInShop(ID)).toBe(false);
    quiet.mockRestore();
  });
});

describe("buildProductMetadata", () => {
  it("makes a promoted product indexable, with its written languages as alternates", async () => {
    const metadata = await buildProductMetadata(ID, parent, true);

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toEqual({
      canonical: `/en/shop/${ID}`,
      languages: {
        en: `/en/shop/${ID}`,
        fi: `/fi/kauppa/${ID}`,
        "x-default": `/en/shop/${ID}`,
      },
    });
    expect(metadata.openGraph).toMatchObject({
      url: `/en/shop/${ID}`,
      title: "Minecraft club",
    });
  });

  it("canonicalises a locale the product is not written in to the one it shows", async () => {
    mocks.locale.current = "sv";
    const metadata = await buildProductMetadata(ID, parent, true);

    expect(metadata.alternates?.canonical).toBe(`/en/shop/${ID}`);
  });

  it("names the language of the words on the card as og:locale, not the URL's", async () => {
    mocks.locale.current = "sv";
    expect((await buildProductMetadata(ID, parent, true)).openGraph).toMatchObject({
      locale: "en",
      title: "Minecraft club",
    });

    mocks.locale.current = "fi";
    expect((await buildProductMetadata(ID, parent, true)).openGraph).toMatchObject({
      locale: "fi",
      title: "Minecraft-kerho",
    });
  });

  it("unfurls into the picture's preview rendition, at its declared size", async () => {
    const metadata = await buildProductMetadata(ID, parent, true);

    // The picture route, never the stored object: a legacy product PNG can be
    // megabytes, past what WhatsApp shows.
    const images = [
      {
        url: `/opengraph-images/picture/product/${IMAGE_PATH}`,
        alt: "Minecraft club",
        width: 1200,
        height: 800,
      },
    ];
    expect(metadata.openGraph?.images).toEqual(images);
    expect(metadata.twitter?.images).toEqual(images);
  });

  it("keeps a product that is not promoted noindex, with no alternates and its own card", async () => {
    const metadata = await buildProductMetadata(ID, parent, false);

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({ title: "Minecraft club" });
  });
});

describe("the shop product route", () => {
  it("promotes a listed product", async () => {
    const { generateMetadata } = await import(
      "@/app/[locale]/(public)/shop/[id]/page"
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: ID }) }, parent);
    expect(metadata.robots).toBeUndefined();
  });

  it("starts the listing check and the card's read together", async () => {
    const held = holdListing();
    const { generateMetadata } = await import(
      "@/app/[locale]/(public)/shop/[id]/page"
    );
    const pending = generateMetadata({ params: Promise.resolve({ id: ID }) }, parent);

    await vi.waitFor(() => expect(requestedSelects()).toContain("card"));
    expect(requestedSelects()).toContain("listing");
    held.release();
    expect((await pending).robots).toBeUndefined();
  });

  it("keeps an unlisted product noindex", async () => {
    listing = "absent";
    const { generateMetadata } = await import(
      "@/app/[locale]/(public)/shop/[id]/page"
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: ID }) }, parent);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("still renders an unlisted product's page for whoever holds the link", async () => {
    listing = "absent";
    const page = await ShopProductDetailPage({
      params: Promise.resolve({ id: ID }),
    });

    // The body is rendered whatever the listing says: nothing gates the page.
    const children = Children.toArray(page.props.children);
    expect(
      children.some(
        (child) => isValidElement(child) && child.type === ProductDetailPage,
      ),
    ).toBe(true);
  });

  it("puts the structured data behind its own Suspense boundary, so the shell does not wait on it", async () => {
    const page = await ShopProductDetailPage({
      params: Promise.resolve({ id: ID }),
    });

    const boundary = Children.toArray(page.props.children).find(
      (child) => isValidElement(child) && child.type === Suspense,
    );
    if (!isValidElement<{ children: unknown }>(boundary)) {
      throw new Error("no Suspense boundary");
    }
    const inner = boundary.props.children;
    expect(isValidElement(inner) && inner.type === ListedProductJsonLd).toBe(true);
  });
});

describe("the schools product route", () => {
  it("is noindex whatever the product, without asking the listing", async () => {
    const { generateMetadata } = await import(
      "@/app/[locale]/(public)/schools/[municipalityName]/[id]/page"
    );
    const metadata = await generateMetadata(
      { params: Promise.resolve({ municipalityName: "espoo", id: ID }) },
      parent,
    );

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    const selects = fetchMock.mock.calls.map((call) =>
      requestedUrl(call[0]).searchParams.get("select"),
    );
    expect(selects.some((select) => select?.startsWith("id,start_date"))).toBe(false);
  });
});

/** The JSON-LD the component emits, parsed back out, or null for none. */
async function emittedJsonLd(): Promise<unknown> {
  const element = await ListedProductJsonLd({ productId: ID });
  if (element === null) return null;
  const html = renderToStaticMarkup(element);
  const parsed: unknown = JSON.parse(
    html
      .replace(/^<script type="application\/ld\+json">/, "")
      .replace(/<\/script>$/, ""),
  );
  return parsed;
}

describe("ListedProductJsonLd", () => {
  it("describes a listed club as a Course at its canonical address", async () => {
    expect(await emittedJsonLd()).toMatchObject({
      "@type": "Course",
      name: "Minecraft club",
      url: `${SITE}/en/shop/${ID}`,
      provider: { "@id": `${SITE}/#organization` },
    });
  });

  it("emits nothing for an unlisted, ended or school product", async () => {
    for (const state of ["absent", "ended"] as const) {
      listing = state;
      expect(await emittedJsonLd()).toBeNull();
    }
  });

  it("emits nothing when the listing check fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    listing = "failed";
    expect(await emittedJsonLd()).toBeNull();
    quiet.mockRestore();
  });

  it("starts the product read alongside the listing check", async () => {
    const held = holdListing();
    const pending = emittedJsonLd();

    await vi.waitFor(() => expect(requestedSelects()).toContain("detail"));
    expect(requestedSelects()).toContain("listing");
    held.release();
    expect(await pending).toMatchObject({ "@type": "Course" });
  });

  it("emits nothing when the product read fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation(async (input) =>
      requestedUrl(input).searchParams.get("select")?.startsWith("id,start_date")
        ? respond(input)
        : postgrestError("boom", 500),
    );
    expect(await emittedJsonLd()).toBeNull();
    quiet.mockRestore();
  });
});
