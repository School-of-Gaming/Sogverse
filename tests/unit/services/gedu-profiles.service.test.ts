import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeduProfilesService } from "@/services/gedu/gedu-profiles.service";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// Runs the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so what is asserted is the PostgREST request
// the genuine query builder produced.
//
// There is one read of this table left and it is keyed to one educator. The
// walked every-gedu read this file used to cover is gone: the two flags a list
// renders are columns of the admin people-list view now, so they arrive with
// the row they are about — which also retires the failure that read carried,
// where a truncated page printed a wrong standing mark on every educator past
// the cap.

describe("GeduProfilesService.getOne", () => {
  let fetchMock: FetchMock;
  let service: GeduProfilesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new GeduProfilesService(createFetchStubbedClient(fetchMock));
  });

  /**
   * **The recorder embed belongs to this read and to no other**, which is what
   * keeps the admin who looked at a criminal record extract off every
   * gedu-facing surface by construction rather than by review: it reaches into
   * another admin's `profiles` row, which admin RLS permits and an educator's
   * own session does not. A second select that named it would be a column list
   * an educator could be handed.
   */
  it("reads one educator's row and names both acting admins", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson({
        user_id: "gedu-1",
        certified: true,
        certified_at: "2026-01-01T00:00:00.000Z",
        certified_by: "admin-1",
        criminal_record_check_passed: true,
        criminal_record_check_at: "2026-02-01T00:00:00.000Z",
        criminal_record_check_by: "admin-2",
        certifier: { first_name: "Admin", last_name: "One" },
        recorder: { first_name: "Admin", last_name: "Two" },
      }),
    );

    const row = await service.getOne("gedu-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("user_id")).toBe("eq.gedu-1");
    const select = url.searchParams.get("select") ?? "";
    expect(select).toContain("certified_by");
    expect(select).toContain("criminal_record_check_by");
    expect(row?.certifier).toEqual({ first_name: "Admin", last_name: "One" });
    expect(row?.recorder).toEqual({ first_name: "Admin", last_name: "Two" });
  });

  // A gedu with no extension row is a real answer rather than an error, and the
  // certification card renders it as "not yet certified".
  it("answers null for an educator with no row", async () => {
    fetchMock.mockResolvedValue(postgrestJson(null));

    await expect(service.getOne("gedu-nobody")).resolves.toBeNull();
  });
});
