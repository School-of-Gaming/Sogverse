import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { useLiveRobloxRenders } from "@/services/roblox";

/**
 * The renders for a list whose membership moves while the page is open — a
 * voice room filling up.
 *
 * The property this file exists for is **incrementality**, and it is a cost
 * property rather than a rendering one: the thumbnails API is rate-limited per
 * IP across the whole serverless fleet, so a room that re-asked about everybody
 * on every join would spend 1+2+…+n calls to learn n answers. What is asserted
 * throughout is therefore the *request log* — how many went out and which ids
 * each one named — not just the map that comes back.
 *
 * The failure path is here for the same reason: a batch that fails settles its
 * ids rather than leaving them pending, and is never asked about again.
 */

const mockFetch = vi.fn();

function rendersResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The renders payload for a set of ids, all with the same stand-in URLs. */
function headshotsFor(...ids: number[]): Response {
  return rendersResponse({
    renders: Object.fromEntries(
      ids.map((id) => [String(id), { avatarUrl: null, headshotUrl: `h${id}` }]),
    ),
  });
}

/** The `userIds` each request named, in order — the whole subject of this file. */
function requestedIds(): string[] {
  return mockFetch.mock.calls.map(
    (call) =>
      new URL(String(call[0]), "https://sogverse.test").searchParams.get(
        "userIds",
      ) ?? "",
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLiveRobloxRenders", () => {
  it("asks once for the whole opening set, and answers by the id the response names", async () => {
    mockFetch.mockResolvedValue(headshotsFor(11, 22));

    const { result } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [22, 11] } },
    );

    await waitFor(() => expect(result.current["11"]).toBe("h11"));

    expect(result.current["22"]).toBe("h22");
    // One request, and it names the head — the figure the row draws. Reading a
    // figure that was never asked for would take its `null` for "no picture".
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain("figures=head");
  });

  it("issues no request when a membership change brings no new ids", async () => {
    mockFetch.mockResolvedValue(headshotsFor(11, 22));

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [11, 22] } },
    );
    await waitFor(() => expect(result.current["11"]).toBe("h11"));

    // Somebody left; somebody re-ordered; a parent handed over a fresh array of
    // the same people. None of that is a new question.
    rerender({ ids: [22] });
    rerender({ ids: [22, 11] });
    rerender({ ids: [11, 22] });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // The answer for a member who briefly left is still in hand: the map
    // accumulates for the session rather than tracking the current set.
    expect(result.current["22"]).toBe("h22");
  });

  it("asks only about the newcomer when one person joins", async () => {
    mockFetch
      .mockResolvedValueOnce(headshotsFor(11, 22))
      .mockResolvedValueOnce(headshotsFor(33));

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [11, 22] } },
    );
    await waitFor(() => expect(result.current["11"]).toBe("h11"));

    rerender({ ids: [11, 22, 33] });
    await waitFor(() => expect(result.current["33"]).toBe("h33"));

    // The second request names 33 and nobody else. Re-asking about the room
    // would make a filling ten-person room cost fifty-five upstream calls.
    expect(requestedIds()).toEqual(["11,22", "33"]);
    // And the first two answers survived the change rather than being discarded
    // with the cache entry the whole set used to key.
    expect(result.current["22"]).toBe("h22");
  });

  it("batches a change that brings several newcomers into one request", async () => {
    mockFetch
      .mockResolvedValueOnce(headshotsFor(11))
      .mockResolvedValueOnce(headshotsFor(22, 33));

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [11] } },
    );
    await waitFor(() => expect(result.current["11"]).toBe("h11"));

    rerender({ ids: [11, 22, 33] });
    await waitFor(() => expect(result.current["33"]).toBe("h33"));

    // One request per change-batch, never one per id — the upstream cost is per
    // request, so two joiners arriving together are one call.
    expect(requestedIds()).toEqual(["11", "22,33"]);
  });

  it("marks an id asked before the request goes out, so an in-flight join is not re-asked", async () => {
    // The first batch never settles: it stands in for a request still in flight
    // when the next person walks in.
    mockFetch
      .mockReturnValueOnce(new Promise<Response>(() => {}))
      .mockResolvedValueOnce(headshotsFor(22));

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [11] } },
    );

    rerender({ ids: [11, 22] });
    await waitFor(() => expect(result.current["22"]).toBe("h22"));

    // 11 is not in the second request even though no answer for it has landed:
    // "asked" is the ledger, not "answered".
    expect(requestedIds()).toEqual(["11", "22"]);
  });

  it("settles a failed batch as no picture, and never retries it", async () => {
    mockFetch.mockResolvedValue(
      rendersResponse({ error: "Too Many Requests" }, 429),
    );

    const { result, rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [11] } },
    );

    // `null`, not absent: the row draws the silhouette either way, but a
    // settled entry says the question was asked and answered.
    await waitFor(() => expect(result.current["11"]).toBeNull());

    rerender({ ids: [11] });
    rerender({ ids: [] });
    rerender({ ids: [11] });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it("reports no picture when the route answered but Roblox had none", async () => {
    // A pending or moderated avatar is a successful answer with nothing in it,
    // and it must not look like a failure — there is nothing to retry.
    mockFetch.mockResolvedValue(
      rendersResponse({
        renders: { "11": { avatarUrl: null, headshotUrl: null } },
      }),
    );

    const { result } = renderHook(() => useLiveRobloxRenders([11], "head"));

    await waitFor(() => expect(result.current["11"]).toBeNull());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("asks nothing for a room with no verified Roblox accounts", async () => {
    const { rerender } = renderHook(
      ({ ids }: { ids: number[] }) => useLiveRobloxRenders(ids, "head"),
      { initialProps: { ids: [] } },
    );

    // Every instant room, and every product whose topic is about no game
    // account, renders this list with an empty id set forever.
    rerender({ ids: [] });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("asks once under StrictMode's double invocation", async () => {
    mockFetch.mockResolvedValue(headshotsFor(11));

    const { result } = renderHook(() => useLiveRobloxRenders([11], "head"), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current["11"]).toBe("h11"));

    // Development re-runs an effect's cleanup and setup; marking the id asked
    // before the fetch is what keeps that from doubling every room's cost, and
    // the mounted flag being re-armed on setup is what keeps the answer.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
