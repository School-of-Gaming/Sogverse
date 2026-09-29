import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { TimezoneProvider } from "@/providers";
import type {
  AdminLibraryArticle,
  PublishedLibraryArticleSummary,
} from "@/services/library";

/**
 * **The Library article preview page: an article's saved working copy as a
 * parent would meet it if it were published now, for admins alone.**
 *
 * The page is rendered as the server would render it, over a mocked session
 * and a mocked Library service. What is pinned: who is refused, what is
 * not-found, and that the page is the saved copy with the date, the eyebrow
 * and "More from the Library" it would have if it went live now.
 */
const NOT_FOUND = "NEXT_NOT_FOUND";

const mocks = vi.hoisted(() => ({
  getUserWithProfile: vi.fn(),
  getAdminArticle: vi.fn(),
  listPublishedArticles: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
  getUserWithProfile: mocks.getUserWithProfile,
}));

vi.mock("@/services/library/library.service", () => ({
  LibraryService: class {
    getAdminArticle = mocks.getAdminArticle;
    listPublishedArticles = mocks.listPublishedArticles;
  },
}));

import LibraryArticlePreviewPage, {
  metadata,
} from "@/app/[locale]/(public)/library/[id]/preview/page";

const ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";

const DRAFT: AdminLibraryArticle = {
  draft: {
    id: ID,
    title: "Setting up a family gaming agreement",
    summary: "Why a written agreement ends arguments.",
    body: "A rule in one head is a rule to argue with.",
    category: "screen_time",
    coverImageId: null,
    coverPath: null,
    createdAt: "2026-09-12T11:00:00Z",
    updatedAt: "2026-09-15T08:05:00Z",
  },
  publication: null,
  hasUnpublishedChanges: false,
};

function published(
  id: string,
  title: string,
  category: PublishedLibraryArticleSummary["category"],
  firstPublishedAt: string,
): PublishedLibraryArticleSummary {
  return {
    id,
    title,
    summary: "",
    category,
    coverPath: null,
    firstPublishedAt,
    publishedAt: firstPublishedAt,
  };
}

function asRole(role: string | null) {
  mocks.getUserWithProfile.mockResolvedValue(
    role === null ? null : { user: { id: "u" }, profile: { role } },
  );
}

async function renderPage(id = ID) {
  const page = await LibraryArticlePreviewPage({
    params: Promise.resolve({ id }),
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">{page}</TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminArticle.mockResolvedValue(DRAFT);
  mocks.listPublishedArticles.mockResolvedValue([]);
});

describe("the Library article preview page", () => {
  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each(["customer", "gedu", "gamer", null])(
    "answers not-found to %s, and reads nothing",
    async (role) => {
      asRole(role);
      await expect(renderPage()).rejects.toThrow(NOT_FOUND);
      expect(mocks.getAdminArticle).not.toHaveBeenCalled();
    },
  );

  it("answers not-found for an article that does not exist", async () => {
    asRole("admin");
    mocks.getAdminArticle.mockResolvedValue(null);
    await expect(renderPage("not-a-uuid")).rejects.toThrow(NOT_FOUND);
  });

  it("shows a draft as it would read if published today", async () => {
    asRole("admin");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    try {
      await renderPage();
    } finally {
      vi.useRealTimers();
    }

    expect(
      screen.getByRole("heading", { level: 1, name: DRAFT.draft.title }),
    ).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-29T10:00:00.000Z",
    );
    // Its links are live: the eyebrow opens its category, the call to action
    // the shop.
    expect(
      screen.getByRole("link", { name: "Screen time & family life" }).getAttribute("href"),
    ).toBe("/library?category=screen_time");
    expect(
      screen.getByRole("link", { name: "Get started" }).getAttribute("href"),
    ).toBe("/shop");
  });

  it("keeps the date the article first went live", async () => {
    asRole("admin");
    mocks.getAdminArticle.mockResolvedValue({
      ...DRAFT,
      publication: {
        id: ID,
        title: "An older title",
        summary: DRAFT.draft.summary,
        body: DRAFT.draft.body,
        category: "screen_time",
        coverPath: null,
        firstPublishedAt: "2026-05-01T08:00:00Z",
        publishedAt: "2026-09-01T08:00:00Z",
      },
      hasUnpublishedChanges: true,
    });
    await renderPage();

    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-05-01T08:00:00Z",
    );
    // The working copy, not the published one.
    expect(screen.queryByText("An older title")).toBeNull();
  });

  it("draws a draft with no category without its eyebrow", async () => {
    asRole("admin");
    mocks.getAdminArticle.mockResolvedValue({
      ...DRAFT,
      draft: { ...DRAFT.draft, category: null },
    });
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: DRAFT.draft.title }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Screen time & family life" })).toBeNull();
  });

  it("offers what is live now under More from the Library, never the article itself", async () => {
    asRole("admin");
    mocks.listPublishedArticles.mockResolvedValue([
      published(ID, "This article's live copy", "screen_time", "2026-05-01T08:00:00Z"),
      published("5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90", "Same category", "screen_time", "2026-04-01T08:00:00Z"),
      published("70f64c69-1681-4b3b-8ab6-420642e48598", "Newer, other category", "learning", "2026-08-01T08:00:00Z"),
    ]);
    await renderPage();

    const titles = [...document.querySelectorAll("#library-more-heading ~ ul h3")].map(
      (heading) => heading.textContent,
    );
    expect(titles).toEqual(["Same category", "Newer, other category"]);
    expect(
      screen.getByRole("link", { name: "Same category" }).getAttribute("href"),
    ).toBe("/library/5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90");
  });
});
