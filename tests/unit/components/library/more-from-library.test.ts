import { describe, expect, it } from "vitest";
import type { LibraryCategory } from "@/components/library/categories";
import { selectMoreFromLibrary } from "@/components/library/more-from-library";

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
