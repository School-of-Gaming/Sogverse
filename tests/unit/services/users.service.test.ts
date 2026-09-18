import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UsersService } from "@/services/users/users.service";
import {
  userListEntry,
  USER_LIST_ENTRY_COLUMNS,
} from "@/services/users/users.contracts";
import { ADMIN_PEOPLE_LIST_PAGE_SIZE } from "@/lib/constants/admin-people-lists";
import type { Profile } from "@/types";
import {
  createFetchStubbedClient,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// These tests run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the assertions below are on the PostgREST
// request the genuine query builder produced.
//
// What they pin is the caller's half of two paging contracts, neither of which
// is visible at the call site. The keyset page needs its order and its cursor
// filter to agree — `created_at` alone ties across accounts written in the same
// transaction, so the `id` tiebreaker is what makes a page boundary safe — and
// the walked read needs an exact count and a total order or the walk stops
// early on a truncated page and says nothing.

const WALK_PAGE_SIZE = 1000;

function profileRows(count: number, offset = 0): Profile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${offset + i}`,
    email: `user${offset + i}@example.test`,
    email_verified_at: null,
    first_name: `User ${offset + i}`,
    last_name: "Test",
    role: "customer" as const,
    phone: null,
    currency: null,
    home_location_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    locale: "en",
    spoken_languages: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
}

/**
 * Rows shaped as the view emits them: a profile, the two gedu standing flags,
 * and the family's children as parsed JSON.
 *
 * `family_search_blob` is deliberately absent, because the select does not ask
 * for it — a fixture that carried it would let the column list quietly start
 * asking and nothing here would notice.
 */
function listRows(count: number, offset = 0) {
  return profileRows(count, offset).map((profile, i) => ({
    ...profile,
    // Distinct instants, so a cursor derived from the last row of a page is a
    // value no other row shares.
    created_at: `2026-01-0${(offset + i) % 9 + 1}T00:00:00.000Z`,
    certified: false,
    criminal_record_check_passed: false,
    linked_gamers: [],
  }));
}

/** One embedded child, as the view builds it. */
const CHILD = {
  id: "gamer-1",
  first_name: "Oona",
  last_name: "Virtanen",
  email: "oona@gamer.sogverse.internal",
  email_verified_at: null,
  role: "gamer" as const,
  created_at: "2026-01-01T00:00:00.000Z",
  sign_in: "parent" as const,
};

function firstUrl(fetchMock: FetchMock): URL {
  return requestedUrl(fetchMock.mock.calls[0][0]);
}

/** The count preference a query asked for, or "null" when it asked for none. */
function requestedCountPreference(fetchMock: FetchMock, call = 0): string {
  const init = fetchMock.mock.calls[call][1];
  return String(new Headers(init?.headers).get("prefer"));
}

/**
 * The blob filters one read sent, in order.
 *
 * Repeated params are the point — PostgREST ANDs them, which is how a
 * multi-word query narrows — so this reads them all rather than the first.
 */
function blobFilters(fetchMock: FetchMock): string[] {
  return firstUrl(fetchMock).searchParams.getAll("family_search_blob");
}

/** Filters with nothing typed and no pill chosen: the plain newest page. */
const NO_FILTERS = {
  search: "",
  role: null,
  spokenLanguage: null,
} as const;

describe("UsersService.getUserListPage", () => {
  let fetchMock: FetchMock;
  let service: UsersService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new UsersService(createFetchStubbedClient(fetchMock));
  });

  // The whole shape in one request: the view, the columns, the order, the page.
  it("reads one keyset page of the view, newest first with the id tiebreaker", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(3), { from: 0, total: 3 }));

    await service.getUserListPage(NO_FILTERS);

    const url = firstUrl(fetchMock);
    expect(url.pathname).toContain("user_list_entries");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(url.searchParams.get("limit")).toBe(String(ADMIN_PEOPLE_LIST_PAGE_SIZE));
  });

  // The blob is every searchable string of a whole family. The filter reads it
  // server-side; putting it on the wire would pay for all of it per row to
  // render none of it.
  it("selects the row's columns and never the search blob", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage(NO_FILTERS);

    const select = firstUrl(fetchMock).searchParams.get("select");
    expect(select).toBe(USER_LIST_ENTRY_COLUMNS);
    expect(select).not.toContain("family_search_blob");
  });

  it("asks for an exact count on the first page when the surface wants one", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(listRows(ADMIN_PEOPLE_LIST_PAGE_SIZE), { from: 0, total: 312 }),
    );

    const page = await service.getUserListPage(NO_FILTERS, { withTotal: true });

    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
    expect(page.total).toBe(312);
  });

  // Under a search the exact count is a second pass evaluating the family blob
  // for every row in the table, so a surface with no count line must not pay
  // for it. Only the gedu picker renders the number; the default is not to ask.
  it("asks for no count unless the surface wants one, and reports none", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson(listRows(ADMIN_PEOPLE_LIST_PAGE_SIZE)),
    );

    const page = await service.getUserListPage(NO_FILTERS);

    expect(requestedCountPreference(fetchMock)).not.toContain("count=exact");
    expect(page.total).toBeNull();
  });

  // The count is an aggregate over the whole match set, so it cannot change as
  // the reader scrolls — paying for it per page would buy a number the surface
  // already read. `null` afterwards says "not asked", never "none".
  it("asks for no count once a cursor is carried, and reports none", async () => {
    fetchMock.mockResolvedValue(postgrestJson(listRows(2, 25)));

    const page = await service.getUserListPage(NO_FILTERS, {
      withTotal: true,
      cursor: { createdAt: "2026-01-02T00:00:00.000Z", id: "user-24" },
    });

    expect(requestedCountPreference(fetchMock)).not.toContain("count=exact");
    expect(page.total).toBeNull();
  });

  // The cursor is the query's one top-level `or`, and it carries the previous
  // page's last row verbatim — re-serialising a timestamptz through a Date
  // truncates it and re-reads every row written inside that millisecond.
  it("resumes strictly after the cursor it was handed", async () => {
    fetchMock.mockResolvedValue(postgrestJson(listRows(1, 25)));

    await service.getUserListPage(NO_FILTERS, {
      cursor: { createdAt: "2026-09-18T08:43:12.123456+00:00", id: "user-24" },
    });

    const ors = firstUrl(fetchMock).searchParams.getAll("or");
    expect(ors).toEqual([
      '(created_at.lt."2026-09-18T08:43:12.123456+00:00",and(created_at.eq."2026-09-18T08:43:12.123456+00:00",id.gt."user-24"))',
    ]);
  });

  it("filters by role as an equality, leaving the cursor the only or", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, role: "gedu" });

    const url = firstUrl(fetchMock);
    expect(url.searchParams.get("role")).toBe("eq.gedu");
    expect(url.searchParams.getAll("or")).toEqual([]);
  });

  it("filters by spoken language as array containment", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({
      ...NO_FILTERS,
      role: "gedu",
      spokenLanguage: "sv",
    });

    expect(firstUrl(fetchMock).searchParams.get("spoken_languages")).toBe(
      "cs.{sv}",
    );
  });

  // Three filters, three parameters, ANDed by PostgREST — which is what lets
  // the list, the search and the pills be one query rather than three surfaces'
  // worth of code that agree by habit.
  it("composes a needle, a role and a language into one request", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({
      search: "Anna Virtanen",
      role: "gedu",
      spokenLanguage: "fi",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = firstUrl(fetchMock);
    expect(url.searchParams.get("role")).toBe("eq.gedu");
    expect(url.searchParams.get("spoken_languages")).toBe("cs.{fi}");
    expect(url.searchParams.getAll("family_search_blob")).toEqual([
      "ilike.%Anna%",
      "ilike.%Virtanen%",
    ]);
  });

  it("matches a single term against the blob", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: "smith" });

    expect(blobFilters(fetchMock)).toEqual(["ilike.%smith%"]);
  });

  // A comma is how a name gets typed surname-first.
  it("cuts terms on a comma as well as whitespace", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: "Smith, Jon" });

    expect(blobFilters(fetchMock)).toEqual(["ilike.%Smith%", "ilike.%Jon%"]);
  });

  // PostgREST reads `*` as a wildcard for ilike before the pattern reaches SQL,
  // so a stray one left in the needle matches everybody rather than nobody.
  it("does not let a wildcard through as a term", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: "Jon*" });

    expect(blobFilters(fetchMock)).toEqual(["ilike.%Jon%"]);
  });

  // SQL's own wildcards, which reach the pattern by a different route than `*`
  // and are neutralised by a different mechanism — escaping rather than
  // splitting. Unescaped, "100%" matches every row the caller can read instead
  // of none, and a wrong result set arrives with no error to notice.
  it.each([
    ["100%", "ilike.%100\\%%"],
    ["a_b", "ilike.%a\\_b%"],
  ])("escapes the SQL wildcard in %s", async (typed, expected) => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: typed });

    expect(blobFilters(fetchMock)).toEqual([expected]);
  });

  // A number is one value typed with spaces inside it. Tokenized as words it
  // would demand a family matching "040" and "123" and "4567" separately,
  // which is nobody — so it has to be recognised before the split.
  it.each([
    ["+358 40 123 4567", "international, spaced"],
    ["040 123 4567", "national, spaced"],
    ["0401234567", "national, run together"],
    ["358401234567", "exactly as stored"],
  ])("matches %s (%s) on its trailing digits", async (typed) => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: typed });

    // The stored value is `358401234567`; every form above shares this tail.
    expect(blobFilters(fetchMock)).toEqual(["ilike.%1234567%"]);
  });

  // The guard against treating any digits as a number: a game handle carrying
  // a couple of digits is a name, and must stay one word rather than being
  // reduced to its tail.
  it("treats a handle with digits in it as a word, not a number", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getUserListPage({ ...NO_FILTERS, search: "EnderDragon42" });

    expect(blobFilters(fetchMock)).toEqual(["ilike.%EnderDragon42%"]);
  });

  // The floor: one character is a scan matching nearly everybody, so "the
  // newest 25 of nearly everybody" would be the unfiltered page dressed up as
  // an answer. The read therefore ignores the needle and lists.
  it("ignores a needle shorter than the floor and lists instead", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(3), { from: 0, total: 3 }));

    await service.getUserListPage({ ...NO_FILTERS, search: "a" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(blobFilters(fetchMock)).toEqual([]);
  });

  // Above the floor, though, something was typed — and something typed that
  // cannot match anybody must not be answered with the newest page. The needle
  // is long enough to clear the floor and still yields no term at all, which is
  // the case the floor cannot cover.
  it("answers an unsearchable needle without asking the database", async () => {
    const page = await service.getUserListPage({ ...NO_FILTERS, search: " , ,, " });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(page).toEqual({ rows: [], total: 0 });
  });

  it("hands back the parsed rows with their families inside them", async () => {
    const [row] = listRows(1);
    fetchMock.mockResolvedValue(
      postgrestPage([{ ...row, certified: true, linked_gamers: [CHILD] }], {
        from: 0,
        total: 1,
      }),
    );

    const page = await service.getUserListPage(NO_FILTERS);

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].certified).toBe(true);
    expect(page.rows[0].linked_gamers[0]?.sign_in).toBe("parent");
  });

  // PostgreSQL cannot carry NOT NULL through a view, so the generated row type
  // is nullable on every column and the parse is the only thing putting the
  // guarantee back. A view that stopped matching must fail loudly here rather
  // than hand a half-null person to a list.
  it("refuses a row the view could not have produced", async () => {
    const [row] = listRows(1);
    fetchMock.mockResolvedValue(
      postgrestPage([{ ...row, email: null }], { from: 0, total: 1 }),
    );

    await expect(service.getUserListPage(NO_FILTERS)).rejects.toThrow();
  });

  // The jsonb half, where the compiler can say nothing at all: `Json` admits
  // any document, so only this parse stands between a changed view and a row
  // component reading a field that is not there.
  it("refuses a family whose children are the wrong shape", async () => {
    const [row] = listRows(1);
    fetchMock.mockResolvedValue(
      postgrestPage(
        [{ ...row, linked_gamers: [{ id: "gamer-1", first_name: "Oona" }] }],
        { from: 0, total: 1 },
      ),
    );

    await expect(service.getUserListPage(NO_FILTERS)).rejects.toThrow();
  });
});

describe("UsersService.getUsersByRole", () => {
  let fetchMock: FetchMock;
  let service: UsersService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new UsersService(createFetchStubbedClient(fetchMock));
  });

  it("filters to the role, orders totally, and asks for the count", async () => {
    fetchMock.mockResolvedValue(postgrestPage(profileRows(2), { from: 0, total: 2 }));

    await service.getUsersByRole("gedu");

    const url = firstUrl(fetchMock);
    expect(url.searchParams.get("role")).toBe("eq.gedu");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(requestedCountPreference(fetchMock)).toContain("count=exact");
  });

  // The reason it walks at all: past PostgREST's max_rows a plain select
  // returns a prefix and says nothing. A two-page walk is the smallest case
  // that would catch the walk being dropped back to a single request.
  it("walks past the first page and concatenates in order", async () => {
    const TOTAL = WALK_PAGE_SIZE + 12;
    fetchMock
      .mockResolvedValueOnce(
        postgrestPage(profileRows(WALK_PAGE_SIZE, 0), { from: 0, total: TOTAL }),
      )
      .mockResolvedValueOnce(
        postgrestPage(profileRows(12, WALK_PAGE_SIZE), {
          from: WALK_PAGE_SIZE,
          total: TOTAL,
        }),
      );

    const result = await service.getUsersByRole("gedu");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(TOTAL);
    expect(result[0]?.id).toBe("user-0");
    expect(result.at(-1)?.id).toBe(`user-${TOTAL - 1}`);
  });
});

/**
 * The one place the send route's 429 becomes something the settings card can
 * word for itself. Nothing else in the stack distinguishes "you asked too often"
 * from "it broke": the route answers both with `{ error }`, and the message is a
 * log line rather than copy, so the status is the whole of the signal.
 */
describe("UsersService.sendVerificationEmail", () => {
  let fetchMock: FetchMock;
  let service: UsersService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    service = new UsersService(createFetchStubbedClient(vi.fn<typeof fetch>()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the send route and reports a send", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await expect(service.sendVerificationEmail()).resolves.toBe("sent");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/verify-email/send");
    expect(init?.method).toBe("POST");
  });

  it("reports the hourly limit as an outcome rather than throwing", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many verification emails requested." }), {
        status: 429,
      }),
    );

    await expect(service.sendVerificationEmail()).resolves.toBe("rate_limited");
  });

  it("still throws on a genuine failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
      }),
    );

    await expect(service.sendVerificationEmail()).rejects.toThrow(
      "Internal server error",
    );
  });
});

// The literal select string is what the Supabase client infers the response
// shape from, so it cannot be derived from the schema — which leaves exactly
// one way for the two to drift apart, and this is it.
describe("the user-list column list", () => {
  it("names precisely the columns the schema parses, in order", () => {
    expect(USER_LIST_ENTRY_COLUMNS.split(",")).toEqual(
      Object.keys(userListEntry.shape),
    );
  });
});
