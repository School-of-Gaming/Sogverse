import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersService } from "@/services/users/users.service";
import {
  searchedProfile,
  SEARCHED_PROFILE_COLUMNS,
} from "@/services/users/users.contracts";
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
    referral_code: null,
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

/**
 * The blob filters one search sent, in order.
 *
 * Repeated params are the point — PostgREST ANDs them, which is how a
 * multi-word query narrows — so this reads them all rather than the first.
 */
function searchBlobFilters(fetchMock: FetchMock): string[] {
  return firstUrl(fetchMock).searchParams.getAll("search_blob");
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

  // The view is what puts a phone number and a game handle in reach at all; a
  // search that quietly went back to `profiles` would still pass every
  // name-and-email case below while silently losing both.
  it("searches the view, and does not put the blob on the wire", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("ada");

    const url = firstUrl(fetchMock);
    expect(url.pathname).toContain("user_search_index");
    expect(url.searchParams.get("select")).toBe(SEARCHED_PROFILE_COLUMNS);
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

  it("matches a single term against the blob", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("smith");

    expect(searchBlobFilters(fetchMock)).toEqual(["ilike.%smith%"]);
  });

  // The bug this started as: a full name is a first name and a surname, so
  // matching the whole typed string as one value finds nobody — even though
  // either word alone finds them. One filter per word, ANDed by PostgREST.
  it("requires every word of a full name to match", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("Jon Smith");

    expect(searchBlobFilters(fetchMock)).toEqual([
      "ilike.%Jon%",
      "ilike.%Smith%",
    ]);
  });

  // A comma is how a name gets typed surname-first. It no longer breaks the
  // request (one filter, not an `or=(…)` whose branches it would split), but it
  // still has to separate the two words rather than ride along inside one.
  it("cuts terms on a comma as well as whitespace", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("Smith, Jon");

    expect(searchBlobFilters(fetchMock)).toEqual([
      "ilike.%Smith%",
      "ilike.%Jon%",
    ]);
  });

  // PostgREST reads `*` as a wildcard for ilike before the pattern reaches SQL,
  // so a stray one left in the needle matches everybody rather than nobody.
  it("does not let a wildcard through as a term", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("Jon*");

    expect(searchBlobFilters(fetchMock)).toEqual(["ilike.%Jon%"]);
  });

  // SQL's own wildcards, which reach the pattern by a different route than `*`
  // and are neutralised by a different mechanism — escaping rather than
  // splitting. Unescaped, "100%" matches every profile the caller can read
  // instead of none, and a wrong result set arrives with no error to notice.
  it.each([
    ["100%", "ilike.%100\\%%"],
    ["a_b", "ilike.%a\\_b%"],
  ])("escapes the SQL wildcard in %s", async (typed, expected) => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers(typed);

    expect(searchBlobFilters(fetchMock)).toEqual([expected]);
  });

  // A number is one value typed with spaces inside it. Tokenized as words it
  // would demand a profile matching "040" and "123" and "4567" separately,
  // which is nobody — so it has to be recognised before the split.
  it.each([
    ["+358 40 123 4567", "international, spaced"],
    ["040 123 4567", "national, spaced"],
    ["0401234567", "national, run together"],
    ["358401234567", "exactly as stored"],
  ])("matches %s (%s) on its trailing digits", async (typed) => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers(typed);

    // The stored value is `358401234567`; every form above shares this tail.
    expect(searchBlobFilters(fetchMock)).toEqual(["ilike.%1234567%"]);
  });

  // The guard against treating any digits as a number: a game handle carrying
  // a couple of digits is a name, and must stay one word rather than being
  // reduced to its tail.
  it("treats a handle with digits in it as a word, not a number", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("EnderDragon42");

    expect(searchBlobFilters(fetchMock)).toEqual(["ilike.%EnderDragon42%"]);
  });

  // The digit floor, which the case above does not reach — that one is excluded
  // by having letters in it, so a regression dropping PHONE_MIN_DIGITS to zero
  // would leave it passing. An all-digit needle under the floor is a house
  // number or a fragment, and must stay the literal term the user typed rather
  // than being silently re-read as the tail of a phone number.
  it("does not treat a short run of digits as a phone number", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(1), { from: 0, total: 1 }));

    await service.searchUsers("42");

    expect(searchBlobFilters(fetchMock)).toEqual(["ilike.%42%"]);
  });

  // Without the guard this reads the view with no filter at all and the twenty
  // newest accounts come back looking like matches.
  it("answers a query with no searchable term without asking the database", async () => {
    const result = await service.searchUsers(" , ");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ results: [], total: 0 });
  });

  // PostgreSQL cannot carry NOT NULL through a view, so the generated row type
  // is nullable on every column and the parse is the only thing putting the
  // guarantee back. A view that stopped matching must fail loudly here rather
  // than hand a half-null profile to the page.
  it("refuses a row the view could not have produced", async () => {
    const [row] = profileRows(1);
    fetchMock.mockResolvedValue(
      postgrestPage([{ ...row, email: null }], { from: 0, total: 1 }),
    );

    await expect(service.searchUsers("ada")).rejects.toThrow();
  });
});

// The literal select string is what the Supabase client infers the response
// shape from, so it cannot be derived from the schema — which leaves exactly
// one way for the two to drift apart, and this is it.
describe("the searched-profile column list", () => {
  it("names precisely the columns the schema parses", () => {
    expect(SEARCHED_PROFILE_COLUMNS.split(",")).toEqual(
      Object.keys(searchedProfile.shape),
    );
  });
});
