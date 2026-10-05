import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeduBadgesService, GEDU_BADGES } from "@/services/gedu/gedu-badges.service";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// Runs the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so what is asserted is the PostgREST request
// the genuine query builder produced.

describe("GEDU_BADGES", () => {
  it("lists every badge in the enum's declared order", () => {
    expect(GEDU_BADGES).toEqual(["neuroinclusive", "flagship"]);
  });
});

describe("GeduBadgesService", () => {
  let fetchMock: FetchMock;
  let service: GeduBadgesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new GeduBadgesService(createFetchStubbedClient(fetchMock));
  });

  it("reads one gedu's held badges with the granting admin's name", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        {
          badge: "neuroinclusive",
          granted_at: "2026-01-01T00:00:00.000Z",
          granter: { first_name: "Admin", last_name: "One" },
        },
      ]),
    );

    const rows = await service.getForGedu("gedu-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/gedu_badges");
    expect(url.searchParams.get("gedu_id")).toBe("eq.gedu-1");
    expect(url.searchParams.get("select")).toContain("gedu_badges_granted_by_fkey");
    expect(rows).toEqual([
      {
        badge: "neuroinclusive",
        granted_at: "2026-01-01T00:00:00.000Z",
        granter: { first_name: "Admin", last_name: "One" },
      },
    ]);
  });

  it("calls set_gedu_badge with the gedu, the badge and whether it is held", async () => {
    fetchMock.mockResolvedValue(postgrestJson(null));

    await service.setBadge("gedu-1", "flagship", true);

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/set_gedu_badge");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_gedu_id: "gedu-1",
      p_badge: "flagship",
      p_held: true,
    });
  });
});
