import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GeduQualificationsService,
  GEDU_QUALIFICATIONS,
} from "@/services/gedu/gedu-qualifications.service";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// Runs the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so what is asserted is the PostgREST request
// the genuine query builder produced.

describe("GEDU_QUALIFICATIONS", () => {
  it("lists every qualification in the enum's declared order", () => {
    expect(GEDU_QUALIFICATIONS).toEqual(["neuroinclusive", "consumer_products"]);
  });
});

describe("GeduQualificationsService", () => {
  let fetchMock: FetchMock;
  let service: GeduQualificationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new GeduQualificationsService(createFetchStubbedClient(fetchMock));
  });

  it("reads one gedu's held qualifications with the granting admin's name", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        {
          qualification: "neuroinclusive",
          granted_at: "2026-01-01T00:00:00.000Z",
          granter: { first_name: "Admin", last_name: "One" },
        },
      ]),
    );

    const rows = await service.getForGedu("gedu-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/gedu_qualifications");
    expect(url.searchParams.get("gedu_id")).toBe("eq.gedu-1");
    expect(url.searchParams.get("select")).toContain(
      "gedu_qualifications_granted_by_fkey",
    );
    expect(rows).toEqual([
      {
        qualification: "neuroinclusive",
        granted_at: "2026-01-01T00:00:00.000Z",
        granter: { first_name: "Admin", last_name: "One" },
      },
    ]);
  });

  it("calls set_gedu_qualification with the gedu, the qualification and whether it is held", async () => {
    fetchMock.mockResolvedValue(postgrestJson(null));

    await service.setQualification("gedu-1", "consumer_products", true);

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestedUrl(input).pathname).toBe("/rest/v1/rpc/set_gedu_qualification");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_gedu_id: "gedu-1",
      p_qualification: "consumer_products",
      p_held: true,
    });
  });
});
