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

/**
 * The signup confirmation, mocked at its own boundary rather than at Brevo's.
 *
 * A family who answers yes now gets the same mail a family who bought a seat
 * gets — the schedule, and the calendar invitation with it — and what this file
 * is about is *which outcome* sends it. The sender reads a product row of its
 * own and composes an `.ics`; letting it run here would make every assertion in
 * this file depend on a schedule it has no reason to hold an opinion about.
 */
const mockSendProductConfirmationEmail = vi.fn();
vi.mock("@/services/participations/product-confirmation-email.server", () => ({
  sendProductConfirmationEmail: (...args: unknown[]) =>
    mockSendProductConfirmationEmail(...args),
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

/**
 * The row the dead-end resolution reads when the compare-and-swap refuses.
 * `null` is a row that has gone; the shapes below are the ones that decide
 * between `used` and `expired`.
 */
const participationRow: {
  value: { status: string; seat_offer_sent_at: string | null } | null;
} = { value: null };

function adminTableStub(table: string) {
  if (table === "participations") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: participationRow.value, error: null }),
        }),
      }),
    };
  }
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
    participationRow.value = null;
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
  it("answers `expired` for a lapsed ACCEPT and sweeps the expiries", async () => {
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

  /**
   * The other half of the same token, and the whole of 00208 seen from the
   * route: the short-circuit above is scoped to `accept`, so a NO past the
   * deadline is not answered locally at all — it goes to the RPC, which
   * honours it and deletes the row.
   */
  it("sends a lapsed DECLINE to the compare-and-swap rather than refusing it", async () => {
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "declined",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
        within_window: false,
        already_notified: true,
      },
      error: null,
    });
    const sentAt = new Date(Date.now() - SEAT_OFFER_WINDOW_MS - 1000);
    const token = await createSeatOfferToken(PARTICIPATION_ID, sentAt);

    const response = await POST(request({ token, accept: false }));

    expect(await response.json()).toEqual({ outcome: "declined" });
    expect(mockAdminRpc).toHaveBeenCalledWith("respond_seat_offer", {
      p_participation_id: PARTICIPATION_ID,
      p_offer_sent_at: sentAt.toISOString(),
      p_accept: false,
    });
    // No sweep either: the row is gone, so there is no lapsed offer left to
    // report and nothing for a claim to find.
    expect(mockAdminRpc).not.toHaveBeenCalledWith(
      "claim_expired_seat_offer_notifications",
      expect.anything(),
    );
  });

  /**
   * And what decides whether the mail goes with it — asserted as a PAIR,
   * because either half passes on its own while the rule is half implemented.
   *
   * A late no is skipped only where the no-response mail demonstrably went.
   * Expiry is observed rather than swept on a timer, so if nobody opened a page
   * between the fifth day and this click, nobody was ever told — and the
   * decline has just deleted the row that was the last evidence of the offer.
   * Skipping on lateness alone would make staff learn less from an answer than
   * they would have learned from silence.
   */
  it.each([
    { already_notified: true, mails: 0, told: "staff already had the mail" },
    { already_notified: false, mails: 1, told: "nobody had heard yet" },
  ])(
    "mails $mails time(s) about a late decline when $told",
    async ({ already_notified, mails }) => {
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "declined",
          participation_id: PARTICIPATION_ID,
          product_id: PRODUCT_ID,
          customer_id: CUSTOMER_ID,
          participant_id: GAMER_ID,
          within_window: false,
          already_notified,
        },
        error: null,
      });

      const response = await POST(
        request({ token: await liveToken(), accept: false }),
      );

      // The family reads the same thank-you either way — the lateness and who
      // has been told are the route's business and never theirs.
      expect(await response.json()).toEqual({ outcome: "declined" });
      await settleDeferred();
      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(mails);
    },
  );

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

  /**
   * A yes is a seat, and a seat is owed the signup confirmation — the same mail
   * a family who bought one gets, with the schedule and the calendar invitation
   * in it. Staff are told nothing: the offer did what it was for.
   *
   * The price shape is the sentinel rather than a mode this arm invents: it has
   * no idea what the product costs, and the sender already reads the row that
   * decides it.
   */
  it("answers `accepted`, confirms the seat to the family, and tells staff nothing", async () => {
    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "accepted" });
    await settleDeferred();

    expect(mockSendProductConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendProductConfirmationEmail.mock.calls[0][0]).toMatchObject({
      customerId: CUSTOMER_ID,
      participantId: GAMER_ID,
      productId: PRODUCT_ID,
      participationId: PARTICIPATION_ID,
      mode: "honoured-offer",
    });
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
        within_window: true,
        already_notified: false,
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
    // No seat, so no signup confirmation — the mail follows the seat rather
    // than the answer.
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
  });


  // -- What a refused compare-and-swap is told --
  //
  // The signature verified, so the holder was sent this exact offer and may be
  // told it is over. Which of the ways it ended is deliberately never said —
  // all three shapes below answer `used`, and the row is read once to tell
  // "over" from "still open under a cancelled product".

  it("answers `used` when the family already accepted", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "stale" }, error: null });
    // Active, and the CHECK forbids an offer stamp on a row in that state.
    participationRow.value = { status: "active", seat_offer_sent_at: null };

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "used" });
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("answers `used` when a newer invitation has replaced this one", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "stale" }, error: null });
    // Still queued, still carrying an offer — a different one. Stored can only
    // ever be newer, because every token is minted from a stored stamp.
    participationRow.value = {
      status: "waitlisted",
      seat_offer_sent_at: new Date(Date.now() + 60_000).toISOString(),
    };

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "used" });
  });

  /**
   * The row is gone — declined, left, or cascaded away with its product. A
   * valid signature is proof we minted this link against a real offer, so a
   * missing row is that offer having been spent rather than an id that never
   * existed.
   */
  it("answers `used` when the row has gone", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "not_found" }, error: null });
    participationRow.value = null;

    const response = await POST(request({ token: await liveToken(), accept: true }));

    expect(await response.json()).toEqual({ outcome: "used" });
  });

  /**
   * The one refusal that must stay generic. The row still holds this exact
   * offer inside its window, so the CAS refused for the reason it will not
   * name: the product was cancelled or deleted. Answering `used` would be
   * false, and answering anything specific would let an unauthenticated caller
   * ask which products have been withdrawn.
   */
  it("answers `invalid` when the offer stands but the product does not", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "stale" }, error: null });
    const sentAt = new Date(Date.now() - 1000);
    participationRow.value = {
      status: "waitlisted",
      seat_offer_sent_at: sentAt.toISOString(),
    };
    const token = await createSeatOfferToken(PARTICIPATION_ID, sentAt);

    const response = await POST(request({ token, accept: true }));

    expect(await response.json()).toEqual({ outcome: "invalid" });
  });

  /**
   * The classification path that `expired` can be reached by from a DECLINE,
   * and the reason the panel must not treat the two the same.
   *
   * The window binds accept alone, so a late no goes to the RPC and is normally
   * honoured. Here it is refused — by the product guard, which answers the
   * generic `stale` because a distinguishable one would let an unauthenticated
   * caller ask which products have been cancelled. The dead-end read then finds
   * a row still holding this exact offer with the window behind it and calls
   * that `expired`, which is true of the offer and says nothing about the
   * product.
   *
   * So `expired` on a decline means "nothing was written", not "the seat is
   * gone" — the same word for two different facts, told apart only by which
   * button produced it. Pinned here because it is the route's half of the
   * component fix: the panel reads this answer and must not offer the same
   * button again.
   */
  it("answers `expired` to a lapsed DECLINE the product guard refused", async () => {
    mockAdminRpc.mockResolvedValue({ data: { kind: "stale" }, error: null });
    const sentAt = new Date(Date.now() - SEAT_OFFER_WINDOW_MS - 1000);
    // Still queued, still holding this exact offer — so nothing consumed it,
    // and the CAS can only have been refused by the guard.
    participationRow.value = {
      status: "waitlisted",
      seat_offer_sent_at: sentAt.toISOString(),
    };
    const token = await createSeatOfferToken(PARTICIPATION_ID, sentAt);

    const response = await POST(request({ token, accept: false }));

    expect(await response.json()).toEqual({ outcome: "expired" });
    // The decline reached the database and was refused there — this is not the
    // accept short-circuit, which never calls the RPC at all.
    expect(mockAdminRpc).toHaveBeenCalledWith("respond_seat_offer", {
      p_participation_id: PARTICIPATION_ID,
      p_offer_sent_at: sentAt.toISOString(),
      p_accept: false,
    });
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
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
    // No seat was granted, so there is nothing to confirm — a confirmation for
    // a seat a family did not get would be the worst mail on this path.
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
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
        within_window: true,
        already_notified: false,
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
