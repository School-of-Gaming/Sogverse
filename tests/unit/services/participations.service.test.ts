import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParticipationsService } from "@/services/participations/participations.service";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// These tests run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts): the genuine query builder constructs the
// PostgREST request, the mock answers with canned wire responses, and the
// client parses them — so the full read path is exercised with no casts.

/** Canned getClaims() success for the spied auth client. */
function claimsFor(sub: string) {
  return {
    data: {
      claims: {
        iss: "http://localhost:54321/auth/v1",
        sub,
        aud: "authenticated",
        exp: 4102444800,
        iat: 1735689600,
        role: "authenticated",
        aal: "aal1" as const,
        session_id: "session-1",
      },
      header: { alg: "ES256" as const, kid: "test-key", typ: "JWT" },
      signature: new Uint8Array(),
    },
    error: null,
  };
}

describe("ParticipationsService.getParticipationsForGamers", () => {
  let fetchMock: FetchMock;
  let service: ParticipationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new ParticipationsService(createFetchStubbedClient(fetchMock));
  });

  it("returns [] for empty input without touching the database", async () => {
    const result = await service.getParticipationsForGamers([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries participations filtered by the given gamer ids", async () => {
    const rows = [
      {
        id: "part-1",
        gamer_id: "g1",
        status: "active",
        signed_up_at: "2026-01-01T00:00:00.000Z",
        product: {
          id: "prod-1",
          product_type: "camp",
          product_translations: [{ locale: "en", name: "Summer Camp" }],
        },
        group: { name: "Group A" },
      },
    ];
    fetchMock.mockResolvedValue(postgrestJson(rows));

    const result = await service.getParticipationsForGamers(["g1", "g2"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/participations");
    expect(url.searchParams.get("gamer_id")).toBe("in.(g1,g2)");
    expect(result).toEqual(rows);
  });

  it("throws when the query errors", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(
      service.getParticipationsForGamers(["g1"]),
    ).rejects.toThrow();
  });
});

describe("ParticipationsService.getMyUpcomingSessions", () => {
  const RPC_PATH = "/rest/v1/rpc/get_my_participation_subscription_states";

  let fetchMock: FetchMock;
  let service: ParticipationsService;

  /**
   * Routes the two concurrent backend calls the method makes: the
   * participations select and the subscription-state RPC.
   */
  function mockBackend(
    participations: unknown[],
    subscriptionStates: { rows: unknown[] } | { errorMessage: string },
  ) {
    fetchMock.mockImplementation((input) => {
      const url = requestedUrl(input);
      if (url.pathname === RPC_PATH) {
        return Promise.resolve(
          "rows" in subscriptionStates
            ? postgrestJson(subscriptionStates.rows)
            : postgrestError(subscriptionStates.errorMessage),
        );
      }
      if (url.pathname === "/rest/v1/participations") {
        return Promise.resolve(postgrestJson(participations));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url.pathname}`));
    });
  }

  function rawRow(id: string, gamerFirstName: string) {
    return {
      id,
      gamer_id: `gamer-${id}`,
      group_id: "group-1",
      product: {
        id: "prod-1",
        product_type: "consumer_club",
        timezone: "UTC",
        start_date: null,
        end_date: null,
        padlet_url: null,
        is_remote: true,
        product_translations: [],
        schedule_slots: [],
      },
      gamer: { first_name: gamerFirstName, username: null },
    };
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    const supabase = createFetchStubbedClient(fetchMock);
    // The method derives the user id from getClaims(); a signature-verified
    // session is out of scope here, so pin the claims on this test's client.
    vi.spyOn(supabase.auth, "getClaims").mockResolvedValue(
      claimsFor("user-1"),
    );
    service = new ParticipationsService(supabase);
  });

  it("derives the payment-problem flag from past_due rows of the subscription-state RPC", async () => {
    mockBackend([rawRow("p1", "Alex"), rawRow("p2", "Bobby")], {
      rows: [
        { participation_id: "p1", status: "past_due", current_period_end: null },
      ],
    });

    const result = await service.getMyUpcomingSessions("customer");

    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    expect(urls.some((u) => u.pathname === RPC_PATH)).toBe(true);
    // The 'customer' audience keys the select off customer_id = auth user.
    const participationsUrl = urls.find(
      (u) => u.pathname === "/rest/v1/participations",
    );
    expect(participationsUrl?.searchParams.get("customer_id")).toBe(
      "eq.user-1",
    );

    const alex = result.find((r) => r.gamer.firstName === "Alex");
    const bobby = result.find((r) => r.gamer.firstName === "Bobby");
    expect(alex?.paymentProblem).toBe(true);
    expect(alex?.subscriptionEndsAt).toBeNull();
    expect(bobby?.paymentProblem).toBe(false);
  });

  it("derives subscriptionEndsAt from canceling rows (and never flags them as a payment problem)", async () => {
    mockBackend([rawRow("p1", "Alex")], {
      rows: [
        {
          participation_id: "p1",
          status: "canceling",
          current_period_end: "2026-06-30T20:59:59.999Z",
        },
      ],
    });

    const result = await service.getMyUpcomingSessions("customer");

    expect(result[0].paymentProblem).toBe(false);
    expect(result[0].subscriptionEndsAt).toEqual(
      new Date("2026-06-30T20:59:59.999Z"),
    );
  });

  it("leaves subscriptionEndsAt null for a canceling row missing current_period_end", async () => {
    mockBackend([rawRow("p1", "Alex")], {
      rows: [
        { participation_id: "p1", status: "canceling", current_period_end: null },
      ],
    });

    const result = await service.getMyUpcomingSessions("customer");

    expect(result[0].subscriptionEndsAt).toBeNull();
  });

  it("degrades to no signals (and does not throw) when the RPC errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockBackend([rawRow("p1", "Alex")], { errorMessage: "boom" });

    const result = await service.getMyUpcomingSessions("customer");

    expect(result[0].paymentProblem).toBe(false);
    expect(result[0].subscriptionEndsAt).toBeNull();
    consoleError.mockRestore();
  });
});
