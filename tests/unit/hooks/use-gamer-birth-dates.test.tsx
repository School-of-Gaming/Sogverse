import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGamerBirthDates } from "@/services/gamers";

/**
 * **The read the enrolment picker's age band is built on, and the one thing it
 * must never do: go back to pending.**
 *
 * The detail page gates its whole skeleton on this hook, so "pending" there is
 * not a loading state — it is an unmount of the signup panel, taking with it
 * every box the parent has ticked and the child they had selected. And the
 * cache key is the roster's ids, which *grow while the panel is open*: adding a
 * child through the panel's own dialog invalidates the roster, the ids change,
 * and this query re-keys. `keepPreviousData` is what makes that re-key a
 * refresh rather than a fresh wait, and this file is what stops it being
 * removed as a tidy-up.
 *
 * The service is stubbed rather than the network, because what is under test is
 * the query's behaviour across a key change and nothing about how the rows are
 * fetched.
 */

const getGamerBirthDates = vi.fn();

vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

vi.mock("@/services/gamers/gamers.service", () => ({
  GamerService: class {
    getGamerBirthDates = (ids: readonly string[]) => getGamerBirthDates(ids);
  },
}));

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const AINO = "6aaac864-5ea7-451b-8d02-93f9ae6f25b5";
const VILLE = "decdae83-3f51-4209-bf1a-254e88f1c32f";

const DOB: Record<string, string> = {
  [AINO]: "2016-03-01",
  [VILLE]: "2018-11-01",
};

beforeEach(() => {
  getGamerBirthDates.mockReset();
  getGamerBirthDates.mockImplementation((ids: readonly string[]) =>
    Promise.resolve(
      ids
        .filter((id) => id in DOB)
        .map((id) => ({ user_id: id, date_of_birth: DOB[id] })),
    ),
  );
});

describe("useGamerBirthDates", () => {
  it("is pending exactly once, and never again when the roster grows", async () => {
    // Every value the hook reported, in order — the assertion is about the
    // whole sequence rather than about whatever happened to be true at the end.
    const pendings: boolean[] = [];
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) => {
        const read = useGamerBirthDates(ids);
        pendings.push(read.isPending);
        return read;
      },
      { wrapper: wrapper(), initialProps: { ids: [AINO] } },
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(pendings[0]).toBe(true);
    expect(result.current.map.get(AINO)).toBe("2016-03-01");

    // The parent adds a child in the panel's dialog: the roster read is
    // invalidated, the ids change, and this query re-keys under them.
    const before = pendings.length;
    rerender({ ids: [AINO, VILLE] });

    // The re-key does not reopen the wait, in the very frame it happens: the
    // previous map is still there, so the page never returns to its skeleton
    // and the panel is never unmounted.
    expect(result.current.isPending).toBe(false);
    expect(result.current.map.get(AINO)).toBe("2016-03-01");
    // The new child simply has no birth date yet — no age pill, blocked by
    // nothing — for the one round trip it takes to arrive.
    expect(result.current.map.has(VILLE)).toBe(false);

    await waitFor(() =>
      expect(result.current.map.get(VILLE)).toBe("2018-11-01"),
    );
    expect(pendings.slice(before)).not.toContain(true);
  });

  it("reports a failure on the first attempt, not on the last retry", async () => {
    // What lets the page stop waiting: a caller gating a skeleton on `isError`
    // would hold it for the whole retry window, so the count is what is
    // exposed and the count turns over immediately.
    getGamerBirthDates.mockRejectedValue(new Error("gamer_profiles is down"));

    const { result } = renderHook(() => useGamerBirthDates([AINO]), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.failureCount).toBeGreaterThan(0));
    // Nothing known, which the caller reads as no ages and nothing blocked.
    expect(result.current.map.size).toBe(0);
  });

  it("asks nothing, and waits for nothing, before the roster resolves", () => {
    const { result } = renderHook(() => useGamerBirthDates(undefined), {
      wrapper: wrapper(),
    });

    // Absent ids are "nothing to ask about yet", not "no children here" — a
    // disabled query would otherwise stay pending forever and hold the page.
    expect(result.current.isPending).toBe(false);
    expect(result.current.map.size).toBe(0);
    expect(getGamerBirthDates).not.toHaveBeenCalled();
  });
});
