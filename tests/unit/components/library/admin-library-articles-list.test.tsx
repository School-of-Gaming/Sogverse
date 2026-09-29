import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * **The admin list of Library articles.** A row per article that opens its
 * editor, with its cover, its status and its category; an empty state only
 * once the read has answered; and a search over titles and category labels
 * with a "no matches" state of its own.
 *
 * Translations echo their key, so nothing here depends on wording — a
 * category's label is its message key.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

import { AdminLibraryArticlesPage } from "@/components/admin/library/admin-library-articles-page";
import type { AdminLibraryArticleListItem } from "@/services/library";

/**
 * Every status, a row with no cover, a draft with no category yet, and more
 * than one screen-time article — most recently saved first, as the read
 * delivers them.
 */
const LIBRARY_ADMIN_LIST: readonly AdminLibraryArticleListItem[] = [
  {
    id: "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13",
    title: "Is Fortnite safe for children? Five myths",
    summary: "What actually matters.",
    category: "games_explained",
    coverPath: "/covers/controller.jpg",
    updatedAt: "2026-09-18T12:40:00Z",
    isPublished: true,
    hasUnpublishedChanges: true,
  },
  {
    id: "bb744329-6849-4d79-be8e-da6b5bdec6fa",
    title: "Setting up a family gaming agreement",
    summary: "",
    category: "screen_time",
    coverPath: null,
    updatedAt: "2026-09-15T08:05:00Z",
    isPublished: false,
    hasUnpublishedChanges: false,
  },
  {
    id: "70f64c69-1681-4b3b-8ab6-420642e48598",
    title: "What to ask a club before your child joins",
    summary: "",
    category: null,
    coverPath: null,
    updatedAt: "2026-09-09T14:20:00Z",
    isPublished: false,
    hasUnpublishedChanges: false,
  },
  {
    id: "9d39dd23-2b00-43f4-a0f5-af63bd58ad67",
    title: "Screen time is not the enemy",
    summary: "It is what they do on screen that matters.",
    category: "screen_time",
    coverPath: "/covers/clock.jpg",
    updatedAt: "2026-06-02T10:00:00Z",
    isPublished: true,
    hasUnpublishedChanges: false,
  },
];

afterEach(() => {
  // The search mirrors itself into the query string; each case starts clean.
  window.history.replaceState(null, "", "/");
});

/** The row for one article: the link that opens its editor. */
function rowFor(id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(
    `a[href="/admin/library/${id}"]`,
  );
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

/** Every article row — the links into an article, not the "new" button. */
const articleRows = () =>
  [
    ...document.querySelectorAll<HTMLElement>('a[href^="/admin/library/"]'),
  ].filter((link) => link.getAttribute("href") !== "/admin/library/new");

const search = (value: string) =>
  fireEvent.change(screen.getByLabelText("search.label"), {
    target: { value },
  });

describe("the Library content list", () => {
  it("opens each article's editor from its row, with its status", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);

    expect(articleRows()).toHaveLength(LIBRARY_ADMIN_LIST.length);
    for (const article of LIBRARY_ADMIN_LIST) {
      const row = within(rowFor(article.id));
      expect(row.getByText(article.title)).toBeTruthy();
      const status = !article.isPublished
        ? "draft"
        : article.hasUnpublishedChanges
          ? "changed"
          : "published";
      expect(row.getByText(status)).toBeTruthy();
    }
  });

  it("shows each cover as a thumb, and NO IMAGE where there is none", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);

    for (const article of LIBRARY_ADMIN_LIST) {
      const row = rowFor(article.id);
      if (article.coverPath === null) {
        expect(within(row).getByText("NO IMAGE")).toBeTruthy();
        expect(row.querySelector("img")).toBeNull();
      } else {
        expect(row.querySelector("img")).not.toBeNull();
      }
    }
  });

  it("says when an article has no category yet", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);
    expect(screen.getAllByText("noCategory").length).toBe(
      LIBRARY_ADMIN_LIST.filter((a) => a.category === null).length,
    );
  });

  it("prints the empty state only once the read has answered", () => {
    const { rerender } = render(
      <AdminLibraryArticlesPage articles={[]} settled={false} />,
    );
    expect(screen.queryByText("empty")).toBeNull();

    rerender(<AdminLibraryArticlesPage articles={[]} settled />);
    expect(screen.getByText("empty")).toBeTruthy();
    // Nothing to search in an empty Library.
    expect(screen.queryByLabelText("search.label")).toBeNull();
  });
});

describe("searching the Library content list", () => {
  it("narrows to titles containing the search, whatever its case", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);
    const [target] = LIBRARY_ADMIN_LIST;

    search(`  ${target.title.slice(0, 12).toUpperCase()} `);

    const expected = LIBRARY_ADMIN_LIST.filter((article) =>
      article.title.toLowerCase().includes(target.title.slice(0, 12).toLowerCase()),
    );
    expect(articleRows()).toHaveLength(expected.length);
    expect(rowFor(target.id)).toBeTruthy();
  });

  it("narrows by the category label a row shows", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);

    // The echoed label of `screen_time`.
    search("screenTime");

    const expected = LIBRARY_ADMIN_LIST.filter(
      (article) => article.category === "screen_time",
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(articleRows()).toHaveLength(expected.length);
  });

  it("says nothing matches — not that there are no articles — and clears", () => {
    render(<AdminLibraryArticlesPage articles={LIBRARY_ADMIN_LIST} settled />);

    search("zzz no article is called this");
    expect(articleRows()).toHaveLength(0);
    expect(screen.getByText("search.noMatches")).toBeTruthy();
    expect(screen.queryByText("empty")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "search.clear" }));
    expect(articleRows()).toHaveLength(LIBRARY_ADMIN_LIST.length);
    expect(screen.getByLabelText("search.label")).toHaveProperty("value", "");
  });
});
