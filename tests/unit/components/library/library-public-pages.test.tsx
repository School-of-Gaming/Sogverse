import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { TimezoneProvider } from "@/providers";
import {
  createFetchStubbedClient,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../../mocks/postgrest-fetch";
import { parseLibraryCategory } from "@/components/library/index-page/library-index-props";

/**
 * **The public Library pages: the index and an article, as the server renders
 * them.**
 *
 * The pages run over the real Library service on a real typed client whose
 * only transport is a fetch mock, so what is pinned is what the pages ask the
 * database for as well as what they draw: an unknown category reads as all, an
 * article that is not live is not-found, and the article page reads the
 * published copy and nothing else — never the working copy.
 */
const NOT_FOUND = "NEXT_NOT_FOUND";

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  locale: { current: "en" },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => mocks.locale.current,
  // The metadata's fallback card alt; `library-metadata.test.ts` pins the card.
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

import LibraryIndexPage from "@/app/[locale]/(public)/library/page";
import LibraryArticlePage, {
  generateMetadata as articleMetadata,
} from "@/app/[locale]/(public)/library/[idOrSlug]/page";

const ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";
const OTHER_ID = "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90";
const THIRD_ID = "70f64c69-1681-4b3b-8ab6-420642e48598";

function summaryRow(
  id: string,
  title: string,
  category: string,
  firstPublishedAt: string,
) {
  return {
    article_id: id,
    category,
    cover_path: null,
    published_at: firstPublishedAt,
    first_published_at: firstPublishedAt,
    versions: [{ locale: "en", title, summary: `${title}, in short.` }],
  };
}

const titleOf = (row: ReturnType<typeof summaryRow>) => row.versions[0].title;

/** What is live, newest first — the order the list read asks for. */
const LIVE = [
  summaryRow(THIRD_ID, "What children learn in a club", "learning", "2026-08-01T08:00:00Z"),
  summaryRow(ID, "Setting up a family gaming agreement", "screen_time", "2026-05-01T08:00:00Z"),
  summaryRow(OTHER_ID, "How much screen time is enough?", "screen_time", "2026-04-01T08:00:00Z"),
];

const TITLE = "Setting up a family gaming agreement";
const BODY = "A rule in one head is a rule to argue with.";

const ARTICLE_ROW = {
  ...summaryRow(ID, TITLE, "screen_time", "2026-05-01T08:00:00Z"),
  published_at: "2026-09-01T08:00:00Z",
  cover_image_id: null,
  versions: [
    { locale: "en", title: TITLE, summary: `${TITLE}, in short.`, body: BODY },
    { locale: "fi", title: "Pelisopimus perheelle", summary: "Lyhyesti.", body: "Sääntö yhden päässä." },
  ],
};

let fetchMock: FetchMock;

/**
 * A database holding `live` in the publications table. A list read gets the
 * summaries; a read of one article gets its row when it is live and nothing
 * otherwise. Every request is kept, so a test can say which tables were read.
 */
function database(
  live: ReturnType<typeof summaryRow>[],
  article: typeof ARTICLE_ROW | null,
) {
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = requestedUrl(input);
    if (url.searchParams.has("article_id")) {
      return postgrestJson(article === null ? null : article);
    }
    return postgrestPage(live, { from: 0, total: live.length });
  });
  mocks.client = createFetchStubbedClient(fetchMock);
}

function tablesRead(): string[] {
  return [
    ...new Set(
      fetchMock.mock.calls.map(([input]) =>
        requestedUrl(input).pathname.replace("/rest/v1/", ""),
      ),
    ),
  ];
}

function draw(page: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={mocks.locale.current} messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">{page}</TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

async function renderIndex(category?: string | string[]) {
  draw(
    await LibraryIndexPage({
      searchParams: Promise.resolve(category === undefined ? {} : { category }),
    }),
  );
}

async function renderArticle(id = ID) {
  draw(await LibraryArticlePage({ params: Promise.resolve({ idOrSlug: id }) }));
}

const cardTitles = () =>
  [...document.querySelectorAll("ul h2")].map((heading) => heading.textContent);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  mocks.locale.current = "en";
  database(LIVE, ARTICLE_ROW);
});

describe("the index's ?category=", () => {
  it.each(["online_safety", "screen_time", "learning", "games_explained", "for_schools"])(
    "filters to %s",
    (category) => {
      expect(parseLibraryCategory(category)).toBe(category);
    },
  );

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["unknown", "news"],
    ["the chip's words rather than the value", "Online safety"],
    ["a different case", "ONLINE_SAFETY"],
    ["repeated", ["learning", "screen_time"]],
  ])("reads as all when %s", (_, term) => {
    expect(parseLibraryCategory(term)).toBeNull();
  });
});

describe("the Library index page", () => {
  it("lists everything live, newest first, with All selected", async () => {
    await renderIndex();
    expect(cardTitles()).toEqual(LIVE.map(titleOf));
    expect(
      screen.getByRole("link", { name: "All" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("lists one category's articles, in order, with its chip selected", async () => {
    await renderIndex("screen_time");
    expect(cardTitles()).toEqual([
      "Setting up a family gaming agreement",
      "How much screen time is enough?",
    ]);
    const chip = screen.getByRole("link", { name: "Screen time & family life" });
    expect(chip.getAttribute("aria-current")).toBe("page");
    expect(chip.getAttribute("href")).toBe("/library?category=screen_time");
    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe(
      "/library",
    );
  });

  it("treats an unknown category as all rather than not-found", async () => {
    await renderIndex("news");
    expect(cardTitles()).toEqual(LIVE.map(titleOf));
    expect(
      screen.getByRole("link", { name: "All" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("titles each card in the page's locale where it can, else in English", async () => {
    mocks.locale.current = "fi";
    database(
      [
        {
          ...LIVE[0],
          versions: [
            ...LIVE[0].versions,
            { locale: "fi", title: "Mitä lapset oppivat kerhossa", summary: "Lyhyesti." },
          ],
        },
        ...LIVE.slice(1),
      ],
      ARTICLE_ROW,
    );
    await renderIndex();
    expect(cardTitles()).toEqual([
      "Mitä lapset oppivat kerhossa",
      ...LIVE.slice(1).map(titleOf),
    ]);
  });

  it("says so when nothing is published", async () => {
    database([], null);
    await renderIndex();
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
  });

  it("opens each card on its article's slug address, in the page's locale", async () => {
    await renderIndex();
    const link = screen.getByRole("link", { name: "What children learn in a club" });
    expect(link.getAttribute("href")).toBe("/library/what-children-learn-in-a-club");
    // No locale of its own: the link stays in the page's.
    expect(link.hasAttribute("locale")).toBe(false);
    expect(link.closest("h2")?.hasAttribute("lang")).toBe(false);
  });

  it("keeps a card showing the English fallback in the page's locale, by its id, marked as English", async () => {
    mocks.locale.current = "sv";
    await renderIndex();
    const link = screen.getByRole("link", { name: "What children learn in a club" });
    // No Swedish version, so no Swedish slug: the id address, which the
    // Swedish page answers with the same English fallback the card shows.
    expect(link.getAttribute("href")).toBe(`/library/${THIRD_ID}`);
    expect(link.hasAttribute("locale")).toBe(false);
    expect(link.closest("h2")?.getAttribute("lang")).toBe("en");
    expect(
      screen.getByText("What children learn in a club, in short.").getAttribute("lang"),
    ).toBe("en");
  });

  it("reads the published summaries and nothing else, and never a body", async () => {
    await renderIndex();
    expect(tablesRead()).toEqual(["library_article_publications"]);
    for (const [input] of fetchMock.mock.calls) {
      expect(requestedUrl(input).searchParams.get("select")).not.toContain("body");
    }
  });
});

describe("the Library article page", () => {
  it("renders the published copy, dated the day it first went live", async () => {
    await renderArticle();
    expect(
      screen.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      ARTICLE_ROW.first_published_at,
    );
  });

  it("reads only the published copy, never the working copy", async () => {
    await renderArticle();
    await articleMetadata({ params: Promise.resolve({ idOrSlug: ID }) });
    expect(tablesRead()).toEqual(["library_article_publications"]);
  });

  it("offers what else is live under More from the Library, its own category first", async () => {
    await renderArticle();
    const titles = [...document.querySelectorAll("#library-more-heading ~ ul h3")].map(
      (heading) => heading.textContent,
    );
    expect(titles).toEqual([
      "How much screen time is enough?",
      "What children learn in a club",
    ]);
  });

  it("carries an Article block of structured data", async () => {
    await renderArticle();
    const block = document.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(block?.textContent ?? "null")).toMatchObject({
      "@type": "Article",
      headline: TITLE,
      datePublished: ARTICLE_ROW.first_published_at,
      dateModified: ARTICLE_ROW.published_at,
    });
  });

  it("renders the version for the page's locale", async () => {
    mocks.locale.current = "fi";
    await renderArticle();
    expect(
      screen.getByRole("heading", { level: 1, name: "Pelisopimus perheelle" }),
    ).toBeTruthy();
  });

  it("falls back to English where the page's locale has no version, marked as English", async () => {
    mocks.locale.current = "sv";
    await renderArticle();
    const heading = screen.getByRole("heading", { level: 1, name: TITLE });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByText(BODY).closest("[lang]")?.getAttribute("lang")).toBe("en");
  });

  it("marks no language on the text where the version is the page's own", async () => {
    await renderArticle();
    const heading = screen.getByRole("heading", { level: 1, name: TITLE });
    expect(heading.closest("[lang]")).toBeNull();
  });

  it("resolves its slug address in the slug's own locale", async () => {
    draw(
      await LibraryArticlePage({
        params: Promise.resolve({ idOrSlug: "setting-up-a-family-gaming-agreement" }),
      }),
    );
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeTruthy();
  });

  it("resolves a Finnish slug under Finnish, and not an English one", async () => {
    mocks.locale.current = "fi";
    database(
      LIVE.map((row) =>
        row.article_id === ID
          ? {
              ...row,
              versions: [
                ...row.versions,
                { locale: "fi", title: "Pelisopimus perheelle", summary: "Lyhyesti." },
              ],
            }
          : row,
      ),
      ARTICLE_ROW,
    );
    draw(
      await LibraryArticlePage({
        params: Promise.resolve({ idOrSlug: "pelisopimus-perheelle" }),
      }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Pelisopimus perheelle" }),
    ).toBeTruthy();
    await expect(
      LibraryArticlePage({
        params: Promise.resolve({ idOrSlug: "setting-up-a-family-gaming-agreement" }),
      }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("answers not-found for a slug no live title derives", async () => {
    await expect(renderArticle("no-such-article")).rejects.toThrow(NOT_FOUND);
  });

  it("shares its canonical address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.example");
    await renderArticle();
    const block = document.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(block?.textContent ?? "null").url).toBe(
      "https://sogverse.example/library/setting-up-a-family-gaming-agreement",
    );
  });

  it("answers not-found for an article that is not live", async () => {
    database(LIVE, null);
    await expect(renderArticle()).rejects.toThrow(NOT_FOUND);
    await expect(
      articleMetadata({ params: Promise.resolve({ idOrSlug: ID }) }),
    ).resolves.toEqual({});
  });

  it("answers not-found for an id that is not a UUID, without asking for it", async () => {
    await expect(renderArticle("not-an-article")).rejects.toThrow(NOT_FOUND);
    for (const [input] of fetchMock.mock.calls) {
      expect(requestedUrl(input).searchParams.has("article_id")).toBe(false);
    }
  });
});
