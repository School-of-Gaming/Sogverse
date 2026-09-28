import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { useUserList } from "@/services/users";
import {
  createFetchStubbedClient,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * **What the people-list hook puts on the wire, keystroke by keystroke.**
 *
 * The hook's cache key and the read behind it have to agree about what question
 * is being asked, and these cases are the two places they once did not. Both are
 * asserted as *requests* over a fake fetch transport, with the real hook and the
 * real service, because the defect in each was a request nobody needed.
 */

// Filled per test; the hoisted module factory reads it at call time.
let fetchMock: FetchMock;
let client: SupabaseClient<Database>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => client,
  getClient: () => client,
}));

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/** An empty first page: what is asked matters here, not what comes back. */
function emptyPage() {
  return postgrestPage([], { from: 0, total: 0 });
}

function listRequests(): URL[] {
  return fetchMock.mock.calls
    .map((call) => requestedUrl(call[0]))
    .filter((url) => url.pathname.includes("user_list_entries"));
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(() => Promise.resolve(emptyPage()));
  client = createFetchStubbedClient(fetchMock);
});

afterEach(() => {
  cleanup();
});

describe("useUserList", () => {
  // A needle below the search floor is ignored by the read, which answers with
  // the plain newest page. Keyed on its own it would be a second request for a
  // page already in the cache — on the first keystroke of every search.
  it("sends nothing for a first keystroke, which asks the question already answered", async () => {
    const { result, rerender } = renderHook(
      ({ search }: { search: string }) =>
        useUserList({ search, role: null, spokenLanguage: null }),
      { wrapper: wrapper(), initialProps: { search: "" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listRequests()).toHaveLength(1);

    rerender({ search: "a" });

    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(listRequests()).toHaveLength(1);

    // The second character is a real search, and is asked.
    rerender({ search: "ai" });
    await waitFor(() => expect(listRequests()).toHaveLength(2));
    expect(listRequests()[1].searchParams.get("family_search_blob")).toBe(
      "ilike.%ai%",
    );
  });

  // The exact count of a search is a second pass over the whole table, so it
  // is asked only by a surface that renders it — and the two kinds of page must
  // not share a cache entry, or whichever surface asked first decides whether
  // the other sees a number.
  it("keeps a counted list and an uncounted one apart", async () => {
    const shared = wrapper();
    const filters = { search: "", role: "gedu", spokenLanguage: null } as const;

    const plain = renderHook(() => useUserList(filters), { wrapper: shared });
    await waitFor(() => expect(plain.result.current.isSuccess).toBe(true));

    const counted = renderHook(
      () => useUserList(filters, { withTotal: true }),
      { wrapper: shared },
    );
    await waitFor(() => expect(counted.result.current.isSuccess).toBe(true));

    expect(listRequests()).toHaveLength(2);
    expect(plain.result.current.data?.pages[0].total).toBeNull();
    expect(counted.result.current.data?.pages[0].total).toBe(0);
  });
});
