import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A deliberately public route: the educator registration page asks an applicant
 * where they can work before any account exists, so search cannot require a
 * session. There is no wrong-role case to test, because there is no role.
 *
 * What *is* worth testing is everything that makes a public, keystroke-driven
 * endpoint safe to leave open: the needle-length floor and the page cap applied
 * before the database is touched, a stable URL so the shared cache has one entry
 * per distinct question, and cache headers that let it be answered without a
 * round trip at all. Plus the property those headers depend on — the route reads
 * no session, so its answer cannot vary by caller.
 */

const mockRpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

import { GET } from "@/app/api/locations/search/route";

const HIT = {
  id: "lille",
  name: "Lille",
  name_i18n: null,
  type: "municipality",
  parent_id: "nord",
  country_code: "FR",
  external_code: "59350",
  ancestors: [{ id: "nord", name: "Nord", name_i18n: null, type: "district" }],
};

function searchRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/locations/search${query}`);
}

describe("GET /api/locations/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({
      data: { total: 47, results: [HIT] },
      error: null,
    });
  });

  // -- Public posture --

  it("answers with no session and never consults the role gate", async () => {
    const response = await GET(searchRequest("?q=lille"));

    expect(response.status).toBe(200);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("never builds a cookie-reading client, so the answer cannot vary by caller", async () => {
    // The property the public cache rests on. A session-aware client here would
    // make one visitor's response servable to another.
    await GET(searchRequest("?q=lille"));

    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  // -- Bounds, applied before the database --

  it("refuses a needle under the minimum length without querying", async () => {
    const response = await GET(searchRequest("?q=a"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a missing needle without querying", async () => {
    const response = await GET(searchRequest(""));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses an absurdly long needle without querying", async () => {
    const response = await GET(searchRequest(`?q=${"a".repeat(500)}`));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a page size above the cap rather than clamping silently", async () => {
    const response = await GET(searchRequest("?q=lille&limit=5000"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a level that is not a location type", async () => {
    const response = await GET(searchRequest("?q=lille&types=planet"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a country code that is not the canonical two-letter form", async () => {
    // Pinned rather than normalized: the route is cached by URL, so accepting
    // `fi` alongside `FI` would spend two cache entries on one question.
    expect((await GET(searchRequest("?q=lille&country=fi"))).status).toBe(400);
    expect((await GET(searchRequest("?q=lille&country=FIN"))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Query shape --

  it("passes the needle through and defaults the page size", async () => {
    await GET(searchRequest("?q=lille"));

    expect(mockRpc).toHaveBeenCalledWith("search_locations", {
      p_query: "lille",
      p_types: undefined,
      p_limit: 20,
      p_country: undefined,
    });
  });

  it("splits the comma-separated level filter into an array", async () => {
    // One parameter rather than repeated ones, so the same question is always
    // the same URL and therefore the same cache entry.
    await GET(searchRequest("?q=lille&types=municipality,district&limit=5"));

    expect(mockRpc).toHaveBeenCalledWith("search_locations", {
      p_query: "lille",
      p_types: ["municipality", "district"],
      p_limit: 5,
      p_country: undefined,
    });
  });

  it("passes a country restriction down to the database", async () => {
    // Restricting downstream of the RPC cannot work: the ranking and the cap
    // are applied first, so a needle with many matches elsewhere would crowd
    // the wanted country off the page and report a total counting rows the
    // caller will never be offered.
    await GET(searchRequest("?q=helsinki&country=FI"));

    expect(mockRpc).toHaveBeenCalledWith("search_locations", {
      p_query: "helsinki",
      p_types: undefined,
      p_limit: 20,
      p_country: "FI",
    });
  });

  // -- Response --

  it("returns the ranked answer with its total and chains intact", async () => {
    const response = await GET(searchRequest("?q=lille"));

    expect(await response.json()).toEqual({ total: 47, results: [HIT] });
  });

  it("marks the answer cacheable by a shared cache", async () => {
    const response = await GET(searchRequest("?q=lille"));
    const cacheControl = response.headers.get("cache-control") ?? "";

    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=");
    expect(cacheControl).toContain("stale-while-revalidate=");
  });

  it("fails loudly rather than serving a shape the client cannot read", async () => {
    // The route's own console.error is silenced, not asserted: the point here
    // is the status, and letting the failure print would make a passing run
    // look like a broken one.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: { total: "many" }, error: null });

    const response = await GET(searchRequest("?q=lille"));

    expect(response.status).toBe(500);
    logged.mockRestore();
  });

  it("surfaces a database failure as a server error, not an empty result", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(searchRequest("?q=lille"));

    expect(response.status).toBe(500);
    logged.mockRestore();
  });
});
