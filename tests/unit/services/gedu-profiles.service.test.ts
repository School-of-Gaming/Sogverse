import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeduProfilesService } from "@/services/gedu/gedu-profiles.service";
import {
  createFetchStubbedClient,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// Runs the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts).
//
// This read carries a sharper consequence than most: the admin users list
// derives an "Unverified" badge from the *absence* of a row here, so a
// truncated read does not omit a badge — it prints a wrong one on every gedu
// past the cap. That is why it walks, and why the count and the total order are
// asserted here rather than assumed.

const PAGE_SIZE = 1000;

function geduRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `gedu-${offset + i}`,
    verified: true,
    verified_at: "2026-01-01T00:00:00.000Z",
    verified_by: "admin-1",
    verifier: { first_name: "Admin", last_name: "One" },
  }));
}

describe("GeduProfilesService.getAll", () => {
  let fetchMock: FetchMock;
  let service: GeduProfilesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new GeduProfilesService(createFetchStubbedClient(fetchMock));
  });

  it("orders by the primary key and asks for the count", async () => {
    fetchMock.mockResolvedValue(postgrestPage(geduRows(4), { from: 0, total: 4 }));

    await service.getAll();

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("order")).toBe("user_id.asc");

    const init = fetchMock.mock.calls[0][1];
    expect(String(new Headers(init?.headers).get("prefer"))).toContain(
      "count=exact",
    );
  });

  it("still embeds the verifier it is walked for", async () => {
    fetchMock.mockResolvedValue(postgrestPage(geduRows(1), { from: 0, total: 1 }));

    const [row] = await service.getAll();

    const select =
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ?? "";
    expect(select).toContain("verified_by");
    expect(row.verifier).toEqual({ first_name: "Admin", last_name: "One" });
  });

  it("walks past the first page and concatenates in order", async () => {
    const TOTAL = PAGE_SIZE + 5;
    fetchMock
      .mockResolvedValueOnce(
        postgrestPage(geduRows(PAGE_SIZE, 0), { from: 0, total: TOTAL }),
      )
      .mockResolvedValueOnce(
        postgrestPage(geduRows(5, PAGE_SIZE), { from: PAGE_SIZE, total: TOTAL }),
      );

    const result = await service.getAll();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(TOTAL);
    expect(result[0]?.user_id).toBe("gedu-0");
    expect(result.at(-1)?.user_id).toBe(`gedu-${TOTAL - 1}`);
  });
});
