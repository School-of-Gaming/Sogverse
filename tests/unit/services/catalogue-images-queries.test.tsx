import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **What a catalogue mutation refetches, and what it must leave alone.**
 *
 * A replace or a remove made from inside the Library editor moves the working
 * copy's cover in the database. The article's admin detail has to be marked
 * stale with it, or the editor compares the form's followed cover id against a
 * cached old one and holds Publish over a change nobody made. The product's
 * admin detail is the opposite: the product form seeds from it, so a refetch
 * mid-edit would throw a half-filled form away. A landing page's admin detail
 * follows the Library's rule: a replace or a remove moves the pictures in its
 * working structure.
 *
 * The service is stood in for; what is under test is the invalidation the
 * mutation hooks run on success.
 */
vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

vi.mock("@/services/catalogue-images/catalogue-images.service", () => ({
  CatalogueImagesService: class {
    replaceImage() {
      return Promise.resolve({ image: { id: "new" } });
    }
    deleteImage() {
      return Promise.resolve({});
    }
  },
}));

import {
  useDeleteCatalogueImage,
  useReplaceCatalogueImage,
} from "@/services/catalogue-images/catalogue-images.queries";
import { landingPageKeys } from "@/services/landing-pages/landing-pages.queries";
import { libraryKeys } from "@/services/library/library.queries";
import { productKeys } from "@/services/products/products.queries";

const ARTICLE = "7c1f6a0e-5d0b-4c8e-9a51-2f7e3b6d9c10";
const PRODUCT = "e2b9c4d1-8a3f-4f6e-b0d2-9c5a1e7f3b28";
const PAGE = "4b8e2f6a-1c3d-4e5f-8a7b-9c0d1e2f3a4b";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(libraryKeys.adminDetail(ARTICLE), { cover: "old" });
  client.setQueryData(libraryKeys.adminList(), []);
  client.setQueryData(landingPageKeys.adminDetail(PAGE), { sections: [] });
  client.setQueryData(productKeys.adminDetail(PRODUCT), { image: "old" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
  return { client, wrapper, stale };
}

describe("catalogue mutation invalidation", () => {
  it("marks the Library's and landing pages' admin details stale on a replace, and never the product's", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useReplaceCatalogueImage(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ id: "old", file: new File(["x"], "a.jpg") }),
    );

    expect(stale(libraryKeys.adminDetail(ARTICLE))).toBe(true);
    expect(stale(libraryKeys.adminList())).toBe(true);
    expect(stale(landingPageKeys.adminDetail(PAGE))).toBe(true);
    expect(stale(productKeys.adminDetail(PRODUCT))).toBe(false);
  });

  it("marks the Library's and landing pages' admin details stale on a remove, and never the product's", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useDeleteCatalogueImage(), { wrapper });

    await act(() => result.current.mutateAsync("old"));

    expect(stale(libraryKeys.adminDetail(ARTICLE))).toBe(true);
    expect(stale(landingPageKeys.adminDetail(PAGE))).toBe(true);
    expect(stale(productKeys.adminDetail(PRODUCT))).toBe(false);
  });
});
