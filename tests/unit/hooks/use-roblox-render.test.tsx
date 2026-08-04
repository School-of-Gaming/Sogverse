import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRobloxRender } from "@/services/roblox";

/**
 * The hook that draws a stored Roblox account's picture on page load.
 *
 * Three behaviours are worth protecting, and none of them is "it returns a URL":
 *
 *  - an **unverified** row resolves nothing, because it has no account id and
 *    looking its *name* up instead could draw whichever stranger owns it;
 *  - a **failure degrades to no picture** and is never retried, because a
 *    thumbnail is decoration and retrying spends the per-IP budget the by-id
 *    path exists to conserve;
 *  - the id is what the cache is keyed on, so two rows showing the same account
 *    cost one request between them.
 */

function wrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // Errors are the subject of half this file; let them be values.
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const mockFetch = vi.fn();

function rendersResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRobloxRender", () => {
  it("resolves nothing for an unverified row — there is no id to ask about", async () => {
    const { result } = renderHook(() => useRobloxRender(null), {
      wrapper: wrapper(),
    });

    // Disabled, not merely empty: nothing is in flight and nothing ever will be,
    // so the row settles on its silhouette instead of waiting.
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("asks the by-id route and hands back that id's renders", async () => {
    mockFetch.mockResolvedValue(
      rendersResponse({
        renders: {
          "156": { avatarUrl: "bust", headshotUrl: "head" },
        },
      }),
    );

    const { result } = renderHook(() => useRobloxRender(156), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      avatarUrl: "bust",
      headshotUrl: "head",
    });
    // The id goes to the avatars route, not to the username-based verify one.
    expect(String(mockFetch.mock.calls[0][0])).toBe(
      "/api/roblox/avatars?userIds=156",
    );
  });

  it("degrades to no picture, and does not retry", async () => {
    mockFetch.mockResolvedValue(
      rendersResponse({ error: "Too Many Requests" }, 429),
    );

    const { result } = renderHook(() => useRobloxRender(156), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // `data` stays undefined, which the call sites read as `?? null` — the
    // silhouette. The count is the real assertion: React Query's default would
    // have made this four requests against a bucket of sixty a minute that the
    // whole fleet shares.
    expect(result.current.data).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("reports no picture when the route answered but Roblox had none", async () => {
    // A pending or moderated avatar is a successful answer with nothing in it,
    // and it must not look like a failure — there is nothing to retry.
    mockFetch.mockResolvedValue(
      rendersResponse({
        renders: { "156": { avatarUrl: null, headshotUrl: null } },
      }),
    );

    const { result } = renderHook(() => useRobloxRender(156), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      avatarUrl: null,
      headshotUrl: null,
    });
  });

  it("keys the cache on the id, so two rows on one account cost one request", async () => {
    mockFetch.mockResolvedValue(
      rendersResponse({
        renders: { "156": { avatarUrl: "bust", headshotUrl: "head" } },
      }),
    );

    const sharedWrapper = wrapper();
    const first = renderHook(() => useRobloxRender(156), {
      wrapper: sharedWrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = renderHook(() => useRobloxRender(156), {
      wrapper: sharedWrapper,
    });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(second.result.current.data).toEqual({
      avatarUrl: "bust",
      headshotUrl: "head",
    });
    // Resolved once per id per session — the render URL only changes when
    // somebody redesigns their avatar, which a mounted page need not notice.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
