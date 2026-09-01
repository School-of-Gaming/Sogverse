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
        participant_id: "g1",
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
    expect(url.searchParams.get("participant_id")).toBe("in.(g1,g2)");
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

  function rawRow(id: string, participantFirstName: string) {
    return {
      id,
      participant_id: `gamer-${id}`,
      group_id: "group-1",
      product: {
        id: "prod-1",
        product_type: "consumer_club",
        timezone: "UTC",
        start_date: null,
        end_date: null,
        is_remote: true,
        product_translations: [],
        schedule_slots: [],
        location: null,
      },
      participant: { first_name: participantFirstName },
    };
  }

  /** The same row on an in-person product, with the site the embed returns. */
  function inPersonRawRow(id: string, participantFirstName: string) {
    const row = rawRow(id, participantFirstName);
    return {
      ...row,
      product: {
        ...row.product,
        is_remote: false,
        location: { name: "Kirjasto Oodi", name_i18n: { fi: "Oodi" } },
      },
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

    const alex = result.find((r) => r.participant.firstName === "Alex");
    const bobby = result.find((r) => r.participant.firstName === "Bobby");
    expect(alex?.paymentProblem).toBe(true);
    expect(alex?.subscriptionEndsAt).toBeNull();
    expect(bobby?.paymentProblem).toBe(false);
    // The flagged row's participation id has to survive the mapping — it's
    // what lets the badge open the portal for the failing subscription's own
    // Stripe customer rather than the parent's default one.
    expect(alex?.participationId).toBe("p1");
    expect(bobby?.participationId).toBe("p2");
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

  it("carries the site on an in-person product, raw for the viewer's locale", async () => {
    mockBackend([inPersonRawRow("p1", "Alex")], { rows: [] });

    const result = await service.getMyUpcomingSessions("customer");

    // Unresolved on purpose: resolving here would put the viewer's locale in
    // the query cache key, so switching language would refetch a row whose only
    // locale-dependent part is a string lookup.
    expect(result[0].product.site).toEqual({
      name: "Kirjasto Oodi",
      name_i18n: { fi: "Oodi" },
    });
  });

  it("drops the site on a remote product even when a location row comes back", async () => {
    // The gate is `is_remote`, not "did the join find a row" — a remote
    // municipality club carries a `location_id` for the municipality that
    // commissioned it, which is an administrative fact and not a building
    // anybody travels to. Answering "where is this happening" with it, on a
    // card whose sessions are in a voice room, would be worse than saying
    // nothing.
    const remoteWithLocation = inPersonRawRow("p1", "Alex");
    remoteWithLocation.product.is_remote = true;

    mockBackend([remoteWithLocation], { rows: [] });

    const result = await service.getMyUpcomingSessions("customer");

    expect(result[0].product.site).toBeNull();
  });
});

describe("ParticipationsService.getMyWaitlistEntries", () => {
  const RPC_PATH = "/rest/v1/rpc/get_my_waitlist_positions";

  let fetchMock: FetchMock;
  let service: ParticipationsService;

  /** Routes the two concurrent calls: the waitlisted select and the position RPC. */
  function mockBackend(
    participations: unknown[],
    positions: { rows: unknown[] } | { errorMessage: string },
  ) {
    fetchMock.mockImplementation((input) => {
      const url = requestedUrl(input);
      if (url.pathname === RPC_PATH) {
        return Promise.resolve(
          "rows" in positions
            ? postgrestJson(positions.rows)
            : postgrestError(positions.errorMessage),
        );
      }
      if (url.pathname === "/rest/v1/participations") {
        return Promise.resolve(postgrestJson(participations));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url.pathname}`));
    });
  }

  /**
   * The waitlist select's row, carrying the product shell the read grew once a
   * queue place became a card in the same list as every seat: the type eyebrow,
   * the slots and the zone they are wall-clock times in, and the date bounds a
   * dated run's schedule sentence needs. What is deliberately absent is
   * everything only a *seat* produces — no group, no subscription state, no
   * site.
   */
  function rawRow(id: string, participantFirstName: string) {
    return {
      id,
      participant_id: `gamer-${id}`,
      product: {
        product_type: "consumer_club",
        timezone: "Europe/Helsinki",
        start_date: "2026-01-12",
        end_date: null,
        is_remote: true,
        product_translations: [{ locale: "en", name: `Club ${id}` }],
        schedule_slots: [
          { weekday: 1, start_time: "17:00:00", duration_minutes: 90 },
        ],
      },
      participant: { first_name: participantFirstName },
    };
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    const supabase = createFetchStubbedClient(fetchMock);
    vi.spyOn(supabase.auth, "getClaims").mockResolvedValue(claimsFor("user-1"));
    service = new ParticipationsService(supabase);
  });

  it("joins each waitlisted row to its live position, keyed off the customer column", async () => {
    mockBackend([rawRow("p1", "Alex"), rawRow("p2", "Bobby")], {
      rows: [
        { participation_id: "p1", waitlist_position: 3 },
        { participation_id: "p2", waitlist_position: 1 },
      ],
    });

    const result = await service.getMyWaitlistEntries("customer");

    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    expect(urls.some((u) => u.pathname === RPC_PATH)).toBe(true);
    const selectUrl = urls.find(
      (u) => u.pathname === "/rest/v1/participations",
    );
    expect(selectUrl?.searchParams.get("customer_id")).toBe("eq.user-1");
    // The complement of the sessions read's status filter — between them the
    // two reads cover every row a family holds, with no overlap.
    expect(selectUrl?.searchParams.get("status")).toBe("eq.waitlisted");
    // Oldest wait first, so the band's order is stable across refetches.
    expect(selectUrl?.searchParams.get("order")).toBe(
      "waitlisted_at.asc,id.asc",
    );

    // Asserted whole, so a field quietly added to the read has to be declared
    // here — which is the check that keeps a waitlist card from being handed
    // something only a seat can honestly carry.
    const productShell = {
      type: "consumer_club",
      timezone: "Europe/Helsinki",
      startDate: "2026-01-12",
      endDate: null,
      isRemote: true,
    };
    const slots = [{ weekday: 1, startTime: "17:00:00", durationMinutes: 90 }];

    expect(result).toEqual([
      {
        participationId: "p1",
        participant: { id: "gamer-p1", firstName: "Alex" },
        product: {
          ...productShell,
          translations: [{ locale: "en", name: "Club p1" }],
        },
        slots,
        position: 3,
      },
      {
        participationId: "p2",
        participant: { id: "gamer-p2", firstName: "Bobby" },
        product: {
          ...productShell,
          translations: [{ locale: "en", name: "Club p2" }],
        },
        slots,
        position: 1,
      },
    ]);
  });

  it("keys the select off participant_id for the gamer audience", async () => {
    mockBackend([rawRow("p1", "Alex")], {
      rows: [{ participation_id: "p1", waitlist_position: 1 }],
    });

    await service.getMyWaitlistEntries("gamer");

    const selectUrl = fetchMock.mock.calls
      .map(([input]) => requestedUrl(input))
      .find((u) => u.pathname === "/rest/v1/participations");
    expect(selectUrl?.searchParams.get("participant_id")).toBe("eq.user-1");
    expect(selectUrl?.searchParams.get("customer_id")).toBeNull();
  });

  it("drops a row the position RPC no longer ranks (a promotion landing mid-read)", async () => {
    // The two calls run concurrently, so the select can still call a row
    // waitlisted after the RPC has stopped ranking it. That family now holds a
    // seat; a card at a fabricated position would be worse than no card.
    mockBackend([rawRow("p1", "Alex"), rawRow("p2", "Bobby")], {
      rows: [{ participation_id: "p2", waitlist_position: 1 }],
    });

    const result = await service.getMyWaitlistEntries("customer");

    expect(result.map((r) => r.participationId)).toEqual(["p2"]);
  });

  it("throws rather than degrading when the position RPC fails", async () => {
    // Unlike the sessions read's badge signals, the position IS the card —
    // there is no reduced-but-honest card to fall back to.
    mockBackend([rawRow("p1", "Alex")], { errorMessage: "boom" });

    await expect(service.getMyWaitlistEntries("customer")).rejects.toThrow();
  });

  it("falls back to a truncated gamer id when the first name is blank", async () => {
    mockBackend([{ ...rawRow("p1", ""), participant_id: "abcdefghijkl" }], {
      rows: [{ participation_id: "p1", waitlist_position: 2 }],
    });

    const result = await service.getMyWaitlistEntries("customer");

    // Same fallback the sessions adapter uses, so one gamer reads identically
    // on a waitlist card and a session card.
    expect(result[0].participant.firstName).toBe("abcdefgh");
  });

  it("returns [] without touching the database when there is no session", async () => {
    const supabase = createFetchStubbedClient(fetchMock);
    vi.spyOn(supabase.auth, "getClaims").mockResolvedValue({
      data: null,
      error: null,
    });
    const anonymous = new ParticipationsService(supabase);

    expect(await anonymous.getMyWaitlistEntries("customer")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
