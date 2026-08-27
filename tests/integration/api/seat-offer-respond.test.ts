import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The token helpers read PIN_COOKIE_SECRET lazily and the staff mail's admin
// link comes from getOrigin(); set both before the imports.
process.env.PIN_COOKIE_SECRET = "integration-test-pin-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { POST } from "@/app/api/seat-offer/respond/route";
import { createSeatOfferToken } from "@/lib/seat-offer-token";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";

/**
 * The public, token-authorized answer to a seat offer.
 *
 * The rules live in `respond_seat_offer` and are covered against a real
 * database in `tests/db/`. What this file covers is the handler's own job: that
 * the token is the only credential it will accept, that every unrecognised one
 * gets the same answer, and that the two mails fire on exactly the outcomes
 * they belong to and on no others.
 */

const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    from: (table: string) => adminTableStub(table),
  }),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

const deferred: unknown[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: unknown) => {
      deferred.push(work);
    },
  };
});

async function settleDeferred(): Promise<void> {
  await Promise.all(deferred);
}

const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GAMER_ID = "77777777-7777-4777-8777-777777777777";

function adminTableStub(table: string) {
  if (table === "products") {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            single: async () => ({
              data: {
                product_type: "municipality_club",
                timezone: "Europe/Helsinki",
                product_translations: [{ locale: "en", name: "Minecraft 101" }],
                schedule_slots: [{ weekday: 1, start_time: "16:00:00" }],
              },
              error: null,
            }),
          }),
        }),
      }),
    };
  }
  return {
    select: () => ({
      in: async () => ({
        data: [
          {
            id: CUSTOMER_ID,
            first_name: "Marja",
            last_name: "Virtanen",
            email: "marja@example.com",
            locale: "en",
          },
          {
            id: GAMER_ID,
            first_name: "Aino",
            last_name: null,
            email: "aino@gamer.sogverse.internal",
            locale: null,
          },
        ],
        error: null,
      }),
      // The staff mail's recipient list: every admin account, resolved at send
      // time off the role column rather than hardcoded to an inbox.
      eq: async () => ({
        data: [{ email: "ada@sog.gg" }, { email: "bo@sog.gg" }],
        error: null,
      }),
    }),
  };
}

function request(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost:3000/api/seat-offer/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

/** A token whose offer is still inside the window. */
function liveToken() {
  return createSeatOfferToken(PARTICIPATION_ID, new Date(Date.now() - 1000));
}

describe("POST /api/seat-offer/respond", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "m1" });
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "accepted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        group_id: "55555555-5555-4555-8555-555555555555",
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });
  });

  afterEach(async () => {
    await settleDeferred();
  });

  // -- Input --

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(request(null, "{not-json"));
    expect(response.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the answer is missing", async () => {
    const response = await POST(request({ token: await liveToken() }));
    expect(response.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // -- The token is the whole credential --

  /**
   * A forged token never reaches the database, and the answer names nothing.
   * The alternative is an unauthenticated endpoint that tells a prober which
   * participation ids exist and what state they are in.
   */
  it("answers `invalid` for a forged token, without touching the database", async () => {
    const response = await POST(
      request({ token: `${PARTICIPATION_ID}.${Date.now()}.${"0".repeat(64)}`, accept: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "invalid" });
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("answers `invalid` for a token that is not even the right shape", async () => {
    const response = await POST(request({ token: "nonsense", accept: false }));
    expect(await response.json()).toEqual({ outcome: "invalid" });
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  /**
   * Signature good, window closed. The click is itself an observation that the
   * offer lapsed, so it runs the sweep an admin opening a page would have run —
   * and it does so without asking the RPC first, because the answer is already
   * known.
   */
  it("answers `expired` for a lapsed token and sweeps the expiries", async () => {
    mockAdminRpc.mockResolvedValue({ data: [], error: null });
    const token = await createSeatOfferToken(
      PARTICIPATION_ID,
      new Date(Date.now() - SEAT_OFFER_WINDOW_MS - 1000),
    );

    const response = await POST(request({ token, accept: true }));

    expect(await response.json()).toEqual({ outcome: "expired" });
    await settleDeferred();
    // Scoped to the participation the TOKEN names, and nothing wider. The
    // signature never expires, so an unscoped claim behind this link would be a
    // permanent trigger for a platform-wide write.
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "claim_expired_seat_offer_notifications",
      { p_participation_id: PARTICIPATION_ID },
    );
    // Nothing was claimed, so nobody is mailed.
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // -- The answers --

  it("passes the token's exact instant into the compare-and-swap", async () => {
    const sentAt = new Date(Date.now() - 1000);
    const token = await createSeatOfferToken(PARTICIPATION_ID, sentAt);

    await POST(request({ token, accept: true }));

    expect(mockAdminRpc).toHaveBeenCalledWith("respond_seat_offer", {
      p_participation_id: PARTICIPATION_ID,
      p_offer_sent_at: sentAt.toISOString(),
      p_accept: true,
    });
  });

  it("answers `accepted` and mails nobody", async () => {
    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "accepted" });
    expect(deferred).toHaveLength(0);
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("answers `declined` and tells staff, after the answer has gone out", async () => {
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "declined",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });

    const response = await POST(request({ token: await liveToken(), accept: false }));

    expect(await response.json()).toEqual({ outcome: "declined" });
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();

    await settleDeferred();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendTransactionalEmail.mock.calls[0][0];
    // Every admin account, because the thing this mail asks for is done in the
    // admin UI — and a Reply-To on the support inbox, because nothing here is
    // waiting on the family: the offer is over and the next step is inviting
    // somebody else.
    expect(sent.toEmail).toEqual(["ada@sog.gg", "bo@sog.gg"]);
    expect(sent.replyToEmail).toBe("help@sog.gg");
    expect(sent.subject).toContain("declined");
  });

  it("answers `invalid` when the row no longer carries this offer", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "stale" }, error: null });

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "invalid" });
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  /** A stranger's id and one that never existed are answered identically. */
  it("answers `invalid` when there is no such participation", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "not_found" }, error: null });

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "invalid" });
  });

  /**
   * The token said live and the row says lapsed — the window ran out between
   * the page rendering and the button being pressed.
   */
  it("answers `expired` when the RPC says the window closed under it", async () => {
    mockAdminRpc.mockResolvedValueOnce({
      data: {
        kind: "expired",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: [], error: null });

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "expired" });
    await settleDeferred();
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "claim_expired_seat_offer_notifications",
      { p_participation_id: PARTICIPATION_ID },
    );
  });

  /**
   * The decline is committed by the time the mail is attempted, so a Brevo
   * outage must not turn a family's answer into an error page.
   */
  it("answers `declined` even when the staff mail throws", async () => {
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "declined",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });
    mockSendTransactionalEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({ token: await liveToken(), accept: false }));
    await settleDeferred();

    expect(await response.json()).toEqual({ outcome: "declined" });
    spy.mockRestore();
  });

  it("answers a generic 500 when the RPC returns an unexpected shape", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "who knows" }, error: null });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Internal server error");
    spy.mockRestore();
  });
});
