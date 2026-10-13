import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentsService } from "@/services/assignments/assignments.service";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// The REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the genuine query builder constructs
// each PostgREST request and the read path runs with no casts.

const ASSIGNMENTS_PATH = "/rest/v1/gedu_group_assignments";
const TRAINEES_PATH = "/rest/v1/gedu_group_trainees";

function product(id: string, name: string) {
  return {
    id,
    product_type: "consumer_club",
    product_translations: [{ locale: "en", name }],
  };
}

describe("AssignmentsService.getSeatsForGedu", () => {
  let fetchMock: FetchMock;
  let service: AssignmentsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new AssignmentsService(createFetchStubbedClient(fetchMock));
  });

  /** Answers each table's read with its own rows, or an error. */
  function mockTables(
    assignments: unknown[] | "error",
    trainees: unknown[] | "error",
  ) {
    fetchMock.mockImplementation((input) => {
      const path = requestedUrl(input).pathname;
      const rows = path === ASSIGNMENTS_PATH ? assignments : trainees;
      return Promise.resolve(
        rows === "error" ? postgrestError("boom") : postgrestJson(rows),
      );
    });
  }

  it("reads both seat tables by the gedu's id and merges them newest first", async () => {
    mockTables(
      [
        {
          role: "assistant",
          created_at: "2026-02-01T00:00:00+00:00",
          group: { id: "group-a", name: "Group A" },
          product: product("prod-a", "Club A"),
        },
        {
          role: "primary",
          created_at: "2026-04-01T00:00:00+00:00",
          group: { id: "group-c", name: "Group C" },
          product: product("prod-c", "Club C"),
        },
      ],
      [
        {
          created_at: "2026-03-01T00:00:00+00:00",
          group: { id: "group-b", name: "Group B" },
          product: product("prod-b", "Club B"),
        },
      ],
    );

    const seats = await service.getSeatsForGedu("gedu-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    expect(urls.map((url) => url.pathname).sort()).toEqual([
      ASSIGNMENTS_PATH,
      TRAINEES_PATH,
    ]);
    for (const url of urls) {
      expect(url.searchParams.get("gedu_id")).toBe("eq.gedu-1");
    }

    expect(seats.map((seat) => [seat.group.id, seat.role])).toEqual([
      ["group-c", "primary"],
      ["group-b", "trainee"],
      ["group-a", "assistant"],
    ]);
    expect(seats[1]).toEqual({
      role: "trainee",
      createdAt: "2026-03-01T00:00:00+00:00",
      group: { id: "group-b", name: "Group B" },
      product: product("prod-b", "Club B"),
    });
  });

  it("returns [] for a gedu holding no seats", async () => {
    mockTables([], []);
    await expect(service.getSeatsForGedu("gedu-1")).resolves.toEqual([]);
  });

  it("throws when the assignments read errors", async () => {
    mockTables("error", []);
    await expect(service.getSeatsForGedu("gedu-1")).rejects.toThrow();
  });

  it("throws when the trainee read errors", async () => {
    mockTables([], "error");
    await expect(service.getSeatsForGedu("gedu-1")).rejects.toThrow();
  });
});
