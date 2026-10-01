import { describe, expect, it } from "vitest";
import type { LibraryCategory } from "@/components/library/categories";
import {
  publishedArticleCard,
  selectMoreFromLibrary,
} from "@/components/library/more-from-library";
import { ROUTES } from "@/lib/constants";
import type { PublishedLibraryArticleSummary } from "@/services/library/library.contracts";

function article(id: string, category: LibraryCategory, publishedAt: string) {
  return { id, category, publishedAt: `${publishedAt}T08:00:00Z` };
}

const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe("selectMoreFromLibrary", () => {
  it("takes the current article's category first, newest first, whatever order it was handed", () => {
    const articles = [
      article("old-safety", "online_safety", "2024-01-01"),
      article("new-learning", "learning", "2026-06-01"),
      article("new-safety", "online_safety", "2026-05-01"),
      article("mid-safety", "online_safety", "2025-01-01"),
      article("newest-safety", "online_safety", "2026-05-20"),
    ];
    const current = { id: "current", category: "online_safety" as const };
    expect(ids(selectMoreFromLibrary(articles, current))).toEqual([
      "newest-safety",
      "new-safety",
      "mid-safety",
    ]);
  });

  it("tops up from the other categories, newest first, when its own runs short", () => {
    const articles = [
      article("current", "for_schools", "2026-04-13"),
      article("schools", "for_schools", "2026-04-09"),
      article("older-other", "learning", "2025-01-01"),
      article("newer-other", "screen_time", "2026-06-12"),
      article("newest-other", "games_explained", "2026-07-01"),
    ];
    expect(
      ids(selectMoreFromLibrary(articles, { id: "current", category: "for_schools" })),
    ).toEqual(["schools", "newest-other", "newer-other"]);
  });

  it("never offers the current article, even as a top-up", () => {
    const articles = [
      article("current", "learning", "2026-06-12"),
      article("other", "online_safety", "2026-01-01"),
    ];
    expect(
      ids(selectMoreFromLibrary(articles, { id: "current", category: "learning" })),
    ).toEqual(["other"]);
  });

  it("keeps the handed order between articles published at the same instant", () => {
    const articles = [
      article("first", "learning", "2026-04-29"),
      article("second", "learning", "2026-04-29"),
      article("third", "learning", "2026-04-29"),
      article("fourth", "learning", "2026-04-29"),
    ];
    expect(
      ids(selectMoreFromLibrary(articles, { id: "x", category: "learning" })),
    ).toEqual(["first", "second", "third"]);
  });

  it("offers a draft with no category the newest, from every category", () => {
    const articles = [
      article("old", "learning", "2024-01-01"),
      article("newest", "screen_time", "2026-07-01"),
      article("newer", "online_safety", "2026-06-01"),
      article("new", "for_schools", "2026-05-01"),
    ];
    expect(
      ids(selectMoreFromLibrary(articles, { id: "draft", category: null })),
    ).toEqual(["newest", "newer", "new"]);
  });

  it("honours the count, and leaves the list it was handed as it was", () => {
    const articles = [
      article("a", "learning", "2026-01-01"),
      article("b", "learning", "2026-02-01"),
    ];
    const before = ids(articles);
    expect(
      ids(selectMoreFromLibrary(articles, { id: "x", category: "learning" }, 1)),
    ).toEqual(["b"]);
    expect(ids(articles)).toEqual(before);
  });
});

describe("publishedArticleCard", () => {
  const english: PublishedLibraryArticleSummary = {
    id: "482f0c6f-0fbc-4202-8790-a73a4520fb47",
    category: "screen_time",
    coverPath: null,
    firstPublishedAt: "2026-05-01T08:00:00Z",
    publishedAt: "2026-09-01T08:00:00Z",
    versions: [
      { locale: "en", title: "A family gaming agreement", summary: "Why." },
    ],
  };
  const swedish: PublishedLibraryArticleSummary = {
    ...english,
    id: "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90",
    versions: [
      ...english.versions,
      { locale: "sv", title: "Ett spelavtal", summary: "Varför." },
    ],
  };
  const published = [english, swedish];

  it("opens an article written in the page's locale at its slug there", () => {
    const card = publishedArticleCard(swedish, published, "sv");
    expect(card?.href).toEqual(ROUTES.libraryArticle("ett-spelavtal"));
    expect(card?.textLocale).toBe("sv");
  });

  it("keeps a card showing the fallback in the page's locale, at the id address", () => {
    // Like a shop card: the link names no locale, so it stays on the Swedish
    // page, which shows the same English fallback the card does.
    const card = publishedArticleCard(english, published, "sv");
    expect(card?.href).toEqual(ROUTES.libraryArticle(english.id));
    expect(card?.textLocale).toBe("en");
    expect(card?.title).toBe("A family gaming agreement");
  });
});
