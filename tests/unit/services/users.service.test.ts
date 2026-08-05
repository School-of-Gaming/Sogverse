import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersService } from "@/services/users/users.service";
import type { Profile } from "@/types";
import {
  createFetchStubbedClient,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// These tests run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the assertions below are on the PostgREST
// request the genuine query builder produced.
//
// What they pin is the caller's half of the paging contract: the walk primitive
// guarantees nothing unless each query asks for an exact count and imposes a
// total order, and both are invisible at the call site. `created_at` alone ties
// across accounts written in the same transaction, so the `id` tiebreaker is
// what makes a page boundary safe — and nothing but a test notices if it is
// dropped.

const PAGE_SIZE = 1000;

function profileRows(count: number, offset = 0): Profile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${offset + i}`,
    email: `user${offset + i}@example.test`,
    first_name: `User ${offset + i}`,
    last_name: "Test",
    role: "customer" as const,
    phone: null,
    currency: null,
    home_location_id: null,
    locale: "en",
    spoken_languages: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
}

function firstUrl(fetchMock: FetchMock): URL {
  return requestedUrl(fetchMock.mock.calls[0][0]);
}

/** Every walked read asks for the count via the same header preference. */
function requestedCountPreference(fetchMock: FetchMock, call = 0): string {
  const init = fetchMock.mock.calls[call][1];
  return String(new Headers(init?.headers).get("prefer"));
}

describe("UsersService walked reads", () => {
  let fetchMock: FetchMock;
  let service: UsersService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new UsersService(createFetchStubbedClient(fetchMock));
  });

  it("getAllUsers orders newest-first with an id tiebreaker and asks for the count", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(3), { from: 0, total: 3 }));

    await service.getAllUsers();

    expect(firstUrl(fetchMock).searchParams.get("order")).toBe(
      "created_at.desc,id.asc",
    );
    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
  });

  it("getUsersByRole filters to the role and keeps the same total order", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(2), { from: 0, total: 2 }));

    await service.getUsersByRole("gedu");

    const url = firstUrl(fetchMock);
    expect(url.searchParams.get("role")).toBe("eq.gedu");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
  });

  // `parent_gamer` has no column a surface wants to sort by — but a walk still
  // needs a total order, and the surrogate primary key is the only column here
  // that is unique on its own.
  it("getAllParentGamerLinks orders by the primary key and asks for the count", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage([{ id: "link-1", parent_id: "p", gamer_id: "g" }], {
        from: 0,
        total: 1,
      }),
    );

    await service.getAllParentGamerLinks();

    expect(firstUrl(fetchMock).searchParams.get("order")).toBe("id.asc");
    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
  });

  // The reason all three walk at all: past PostgREST's max_rows a plain select
  // returns a prefix and says nothing. A two-page walk is the smallest case
  // that would catch the walk being dropped back to a single request.
  it("getAllUsers walks past the first page and concatenates in order", async () => {
    const TOTAL = PAGE_SIZE + 12;
    fetchMock
      .mockResolvedValueOnce(
        postgrestPage(profileRows(PAGE_SIZE, 0), { from: 0, total: TOTAL }),
      )
      .mockResolvedValueOnce(
        postgrestPage(profileRows(12, PAGE_SIZE), { from: PAGE_SIZE, total: TOTAL }),
      );

    const result = await service.getAllUsers();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(TOTAL);
    expect(result[0]?.id).toBe("user-0");
    expect(result.at(-1)?.id).toBe(`user-${TOTAL - 1}`);
  });
});

describe("UsersService.searchUsers", () => {
  let fetchMock: FetchMock;
  let service: UsersService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new UsersService(createFetchStubbedClient(fetchMock));
  });

  // Capped rather than walked on purpose — it runs on every keystroke — so the
  // cap and the true total are what the surface needs to tell a complete answer
  // from a clipped one.
  it("caps the page, orders newest-first with a tiebreaker, and asks for the count", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(20), { from: 0, total: 47 }));

    await service.searchUsers("ada");

    const url = firstUrl(fetchMock);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
  });

  it("returns the capped rows alongside the true match total", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(20), { from: 0, total: 47 }));

    const result = await service.searchUsers("ada");

    expect(result.results).toHaveLength(20);
    expect(result.total).toBe(47);
  });

  it("reports a complete answer when the matches fit under the cap", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(3), { from: 0, total: 3 }));

    const result = await service.searchUsers("ada");

    expect(result.results).toHaveLength(3);
    expect(result.total).toBe(3);
  });
});
