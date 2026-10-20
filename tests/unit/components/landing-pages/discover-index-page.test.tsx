import { afterAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enConsent from "@/../messages/en/consent.json";
import enDiscover from "@/../messages/en/discover.json";
import enFooter from "@/../messages/en/footer.json";
import {
  createFetchStubbedClient,
  postgrestPage,
  requestedUrl,
} from "../../../mocks/postgrest-fetch";

/**
 * **The landing pages' index, as the server renders it**, over the real
 * landing page service on a typed client whose only transport is a fetch
 * mock — so what is pinned is what the page asks the database for (the
 * published copy, never the working one) as well as what it draws. And the
 * footer, which is how every page links here.
 */
const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

// A card's picture is a public catalogue URL, built on the project's address.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
afterAll(() => vi.unstubAllEnvs());

import DiscoverIndexPage from "@/app/[locale]/(public)/discover/page";
import { Footer } from "@/components/layout/footer";

const ESPOO = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const ESBO = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";
const HERO = "11111111-1111-4111-8111-111111111111";
const PICTURE = "88888888-8888-4888-8888-888888888888";

const LIVE = [
  {
    page_id: ESPOO,
    sections: [{ id: HERO, type: "hero", imageId: PICTURE }],
    image_paths: { [PICTURE]: "pictures/espoo.jpg" },
    published_at: "2026-10-01T08:00:00Z",
    first_published_at: "2026-09-02T08:00:00Z",
    versions: [
      { locale: "en", title: "Clubs in Espoo", summary: "For Espoo families.", slug: "clubs-espoo" },
    ],
  },
  {
    page_id: ESBO,
    sections: [{ id: HERO, type: "hero" }],
    image_paths: {},
    published_at: "2026-09-01T08:00:00Z",
    first_published_at: "2026-09-01T08:00:00Z",
    versions: [
      { locale: "sv", title: "Klubbar i Esbo", summary: "För familjer i Esbo.", slug: "klubbar-esbo" },
    ],
  },
];

function database(live: typeof LIVE) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    postgrestPage(live, { from: 0, total: live.length }),
  );
  mocks.client = createFetchStubbedClient(fetchMock);
  return fetchMock;
}

function draw(page: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ consent: enConsent, discover: enDiscover, footer: enFooter }}>
      {page}
    </NextIntlClientProvider>,
  );
}

describe("the landing pages' index", () => {
  it("lists every live page, reading the published copy alone", async () => {
    const fetchMock = database(LIVE);
    draw(await DiscoverIndexPage());

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Clubs in Espoo", "Klubbar i Esbo"]);
    expect(
      new Set(fetchMock.mock.calls.map(([input]) => requestedUrl(input).pathname)),
    ).toEqual(new Set(["/rest/v1/landing_page_publications"]));
  });

  it("opens each card in the index's locale, marking text in another language", async () => {
    database(LIVE);
    draw(await DiscoverIndexPage());

    const espoo = screen.getByRole("link", { name: "Clubs in Espoo" });
    expect(espoo.getAttribute("href")).toBe("/discover/clubs-espoo");
    const esbo = screen.getByRole("link", { name: "Klubbar i Esbo" });
    // Not live in English, so its id address, whose page shows the same fallback.
    expect(esbo.getAttribute("href")).toBe(`/discover/${ESBO}`);
    expect(esbo.closest("[lang]")?.getAttribute("lang")).toBe("sv");
  });

  it("emits its structured data listing the same pages", async () => {
    database(LIVE);
    const { container } = draw(await DiscoverIndexPage());

    const block = container.querySelector('script[type="application/ld+json"]');
    const data: unknown = JSON.parse(block?.textContent ?? "null");
    expect(data).toMatchObject({
      "@type": "CollectionPage",
      mainEntity: {
        itemListElement: [{ name: "Clubs in Espoo" }, { name: "Klubbar i Esbo" }],
      },
    });
  });

  it("says so, and stays a page, when nothing is live", async () => {
    database([]);
    const { container } = draw(await DiscoverIndexPage());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Discover School of Gaming",
    );
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    const block = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(block?.textContent ?? "null")).not.toHaveProperty("mainEntity");
  });
});

describe("the footer", () => {
  it("links the landing pages' index by the name the page calls itself", () => {
    draw(<Footer />);

    expect(screen.getByRole("link", { name: "Discover" }).getAttribute("href")).toBe(
      "/discover",
    );
  });
});
