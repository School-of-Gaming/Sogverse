import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **A Library write refetches the image catalogue's usage map.**
 *
 * The map is read partly from the articles' working and published covers, so a
 * save or a publish can move an article onto a cover. Left cached, the
 * catalogue would show that cover as unused and offer to remove it without a
 * word about the article now showing it.
 *
 * The service is stood in for; what is under test is the invalidation the
 * mutation hooks run on success.
 */
vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

vi.mock("@/services/library/library.service", () => ({
  LibraryService: class {
    createArticle() {
      return Promise.resolve({ id: "new" });
    }
    saveArticle() {
      return Promise.resolve({});
    }
    publishArticle() {
      return Promise.resolve({});
    }
    unpublishArticle() {
      return Promise.resolve({});
    }
  },
}));

import { catalogueImageUsageKey } from "@/services/catalogue-images/catalogue-images.keys";
import {
  libraryKeys,
  useCreateLibraryArticle,
  usePublishLibraryArticle,
  useSaveLibraryArticle,
  useUnpublishLibraryArticle,
} from "@/services/library/library.queries";
import type { LibraryArticleInput } from "@/services/library/library.contracts";

const ARTICLE = "3f8e2a71-6c4b-4d19-a0e5-8b27c9d1f604";
const INPUT: LibraryArticleInput = {
  versions: [{ locale: "en", title: "T", summary: "", body: "" }],
  category: null,
  coverImageId: null,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(catalogueImageUsageKey, {});
  client.setQueryData(libraryKeys.adminList(), []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
  return { wrapper, stale };
}

describe("Library mutation invalidation", () => {
  it("marks the usage map stale on a save", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useSaveLibraryArticle(), { wrapper });

    await act(() => result.current.mutateAsync({ id: ARTICLE, input: INPUT }));

    expect(stale(catalogueImageUsageKey)).toBe(true);
    expect(stale(libraryKeys.adminList())).toBe(true);
  });

  it("marks the usage map stale on a publish", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => usePublishLibraryArticle(), { wrapper });

    await act(() => result.current.mutateAsync(ARTICLE));

    expect(stale(catalogueImageUsageKey)).toBe(true);
  });

  it("marks the usage map stale on a create and an unpublish", async () => {
    const created = setup();
    const create = renderHook(() => useCreateLibraryArticle(), {
      wrapper: created.wrapper,
    });
    await act(() => create.result.current.mutateAsync(INPUT));
    expect(created.stale(catalogueImageUsageKey)).toBe(true);

    const unpublished = setup();
    const unpublish = renderHook(() => useUnpublishLibraryArticle(), {
      wrapper: unpublished.wrapper,
    });
    await act(() => unpublish.result.current.mutateAsync(ARTICLE));
    expect(unpublished.stale(catalogueImageUsageKey)).toBe(true);
  });
});
