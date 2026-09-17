import { describe, it, expect } from "vitest";

import {
  IN_SCOPE_SEAT_FILTER,
  readEffectiveStatuses,
  readInScopeSeats,
  readProgrammeProductIds,
} from "@/services/partner/partner-scope.server";
import { createFetchStubbedClient, requestedUrl } from "../../../mocks/postgrest-fetch";
import { postgrestTables } from "../../../mocks/partner-api";

const P1 = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const GAMER = "20000000-0000-4000-8000-000000000001";
const PARENT = "30000000-0000-4000-8000-000000000001";

function seat(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    product_id: P1,
    group_id: null,
    participant_id: GAMER,
    customer_id: PARENT,
    status: "active",
    signed_up_at: "2026-09-01T10:00:00+00:00",
    programme: { programme_terms: [{ document_slug: "roblox-programme-terms" }] },
    ...overrides,
  };
}

describe("readProgrammeProductIds", () => {
  it("reads the products that require the Programme's terms, in id order", async () => {
    const fetch = postgrestTables({
      product_required_consents: () => [{ product_id: P1 }, { product_id: P2 }],
    });
    const ids = await readProgrammeProductIds(createFetchStubbedClient(fetch));

    expect(ids).toEqual([P1, P2]);
    const url = requestedUrl(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("document_slug")).toBe("eq.roblox-programme-terms");
    expect(url.searchParams.get("order")).toBe("product_id.asc");
  });
});

describe("readInScopeSeats", () => {
  it("scopes to live seats on Programme products through the inner embed", async () => {
    const fetch = postgrestTables({
      participations: () => [seat("40000000-0000-4000-8000-000000000001")],
    });
    const seats = await readInScopeSeats(createFetchStubbedClient(fetch));

    expect(seats).toEqual([
      {
        id: "40000000-0000-4000-8000-000000000001",
        product_id: P1,
        group_id: null,
        participant_id: GAMER,
        customer_id: PARENT,
        status: "active",
        signed_up_at: "2026-09-01T10:00:00+00:00",
      },
    ]);
    const url = requestedUrl(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("select")).toContain(
      "programme:products!inner(programme_terms:product_required_consents!inner(document_slug))",
    );
    expect(url.searchParams.get(IN_SCOPE_SEAT_FILTER)).toBe("eq.roblox-programme-terms");
    expect(url.searchParams.get("status")).toBe("in.(active,waitlisted,completed)");
  });

  it("narrows by participant and by customer, returning a seat matching both once", async () => {
    const shared = seat("40000000-0000-4000-8000-000000000002");
    const other = seat("40000000-0000-4000-8000-000000000001", { participant_id: PARENT });
    const fetch = postgrestTables({
      participations: (url) =>
        url.searchParams.has("participant_id") ? [shared] : [other, shared],
    });
    const seats = await readInScopeSeats(createFetchStubbedClient(fetch), {
      participantIds: [GAMER],
      customerIds: [PARENT],
    });

    expect(seats.map((s) => s.id)).toEqual([other.id, shared.id]);
    const urls = fetch.mock.calls.map(([input]) => requestedUrl(input));
    expect(urls[0].searchParams.get("participant_id")).toBe(`in.(${GAMER})`);
    expect(urls[1].searchParams.get("customer_id")).toBe(`in.(${PARENT})`);
  });

  it("reads nothing for empty key lists", async () => {
    const fetch = postgrestTables({});
    expect(
      await readInScopeSeats(createFetchStubbedClient(fetch), { participantIds: [] }),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws on a seat the scope should never have returned", async () => {
    const fetch = postgrestTables({
      participations: () => [seat("40000000-0000-4000-8000-000000000001", { status: "reserving" })],
    });
    await expect(readInScopeSeats(createFetchStubbedClient(fetch))).rejects.toThrow(/reserving/);
  });
});

describe("readEffectiveStatuses", () => {
  it("derives each product's status from its dates and its active seat count", async () => {
    const fetch = postgrestTables({
      products: () => [
        // Started, threshold met by the count, end date passed → completed.
        { id: P1, start_date: "2026-06-01", end_date: "2026-08-31", signup_threshold: 2, timezone: "Europe/Paris" },
        // Threshold unmet (no count row reads as zero), end passed → expired.
        { id: P2, start_date: "2026-06-01", end_date: "2026-08-31", signup_threshold: 2, timezone: "Europe/Paris" },
      ],
      product_seat_counts: () => [{ product_id: P1, active_count: 3 }],
    });
    const statuses = await readEffectiveStatuses(
      createFetchStubbedClient(fetch),
      [P1, P2, P1],
      new Date("2026-09-17T12:00:00Z"),
    );
    expect(statuses).toEqual(
      new Map([
        [P1, "completed"],
        [P2, "expired"],
      ]),
    );
  });
});
