import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **The edit page tells a failed read from a missing article.**
 *
 * "There is no article with this id" is a claim about the database, so it is
 * made only when the read answered with no row. A read that failed — the
 * network dropped, the database refused — says nothing about whether the
 * article exists, and the page says the read failed instead.
 *
 * The service is stood in for; the page, its hook and React Query are real.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

const getAdminArticle = vi.fn<(id: string) => Promise<unknown>>();

vi.mock("@/services/library/library.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/library/library.service")>()),
  LibraryService: class {
    getAdminArticle(id: string) {
      return getAdminArticle(id);
    }
  },
}));

import { EditLibraryArticlePage } from "@/components/admin/library/edit-library-article-page";

const ARTICLE_ID = "c4a1e8f2-7b3d-4f59-8e06-2d9b5a7c1e43";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditLibraryArticlePage articleId={ARTICLE_ID} />
    </QueryClientProvider>,
  );
}

describe("the Library edit page", () => {
  it("says the article is missing when the read answers with none", async () => {
    getAdminArticle.mockResolvedValueOnce(null);
    renderPage();

    expect(await screen.findByText("notFound")).toBeTruthy();
    expect(screen.queryByText("loadError")).toBeNull();
  });

  it("says the read failed when it fails, and never that the article is missing", async () => {
    getAdminArticle.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "loadError",
    );
    expect(screen.queryByText("notFound")).toBeNull();
  });
});
