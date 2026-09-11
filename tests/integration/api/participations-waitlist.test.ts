import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The confirmation mail's My SOG link comes from getOrigin(), which falls back
// to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { DELETE, POST } from "@/app/api/participations/waitlist/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

// The spot is committed before the mail is even attempted, so the send is
// handed to the platform's post-response hook rather than awaited inside the
// answer — the parent's click never waits on Brevo. Capture the deferred work
// instead of letting the hook run it, so these tests can assert the route
// deferred and then settle the send deliberately.
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

/**
 * Let the eagerly-started deferred send settle. `after()` receives an
 * already-running promise, so anything it rejects with would otherwise surface
 * as an unhandled rejection after the test had already passed — and a send left
 * mid-flight would land its Brevo call in whichever test happens to be running
 * when it resolves, which is why every test drains this in `afterEach`.
 */
async function settleDeferred(): Promise<void> {
  await Promise.all(deferred);
}

// The route runs on the USER-bound client from `requireRole`, so the RPC mock
// hangs off the `supabase` handed back by that mock rather than off the admin
// client — which this route no longer touches at all. The confirmation mail
// reads through the very same client, deliberately: everything behind it is a
// read this parent may already make.
const mockRpc = vi.fn();
const mockFrom = vi.fn();

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

function createRequest(
  body: unknown,
  { rawBody }: { rawBody?: string } = {},
): Request {
  return new Request("http://localhost:3000/api/participations/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

/** The same collection, addressed with DELETE — giving up a spot. */
function createDeleteRequest(
  body: unknown,
  { rawBody }: { rawBody?: string } = {},
): Request {
  return new Request("http://localhost:3000/api/participations/waitlist", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden(role: string) {
  mockRequireRole.mockImplementation(
    (requiredRole: string, options?: { forbiddenMessage?: string }) => {
      if (role !== requiredRole) {
        return Promise.resolve(
          NextResponse.json(
            { error: options?.forbiddenMessage ?? "Forbidden" },
            { status: 403 },
          ),
        );
      }
      return Promise.resolve({
        user: { id: CUSTOMER_ID },
        profile: { role },
        supabase: { rpc: mockRpc, from: mockFrom },
      });
    },
  );
}

function mockAuthenticatedCustomer() {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: {
      id: CUSTOMER_ID,
      role: "customer",
      email: "parent@example.test",
      locale: "en",
    },
    supabase: { rpc: mockRpc, from: mockFrom },
  });
}

/**
 * The three reads behind the confirmation mail, on the caller's own client: the
 * product with its translations, both people in one query (on a self seat they
 * are the same row), and the schedule and location the mail's "Good to know"
 * facts are composed from.
 *
 * That third read runs on the waitlist path too, because the mail is the
 * confirmation page's twin and the page states those facts for a waitlisted
 * seat as well. Only the site's *details* are unreadable through a customer's
 * own client, and nothing built from them reaches a waitlist mail — a place in
 * a queue composes no calendar entry.
 */
function mockReadsForConfirmationEmail(
  {
    participantFirstName = "Aino",
    gamer = {},
  }: {
    participantFirstName?: string;
    /**
     * Overrides on the child's profile row. The default is the switch-only
     * sign-in every gamer is created with — no address of their own, so the
     * mail goes to the parent alone.
     */
    gamer?: Partial<{
      email: string | null;
      locale: string | null;
      gamer_profiles: { sign_in: string } | null;
    }>;
  } = {},
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "products") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    product_type: "consumer_club",
                    timezone: "Europe/Helsinki",
                    start_date: null,
                    end_date: null,
                    is_remote: true,
                    min_age: 8,
                    max_age: 12,
                    for_gamers: true,
                    for_parents: false,
                    spoken_language_code: "en",
                    product_translations: [{ locale: "en", name: "Test Club" }],
                  },
                  error: null,
                }),
            }),
            single: () =>
              Promise.resolve({
                data: { schedule_slots: [], locations: null },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                {
                  id: CUSTOMER_ID,
                  first_name: "Marja",
                  email: "parent@example.test",
                  locale: "en",
                  gamer_profiles: null,
                },
                {
                  id: GAMER_ID,
                  first_name: participantFirstName,
                  email: null,
                  locale: null,
                  gamer_profiles: { sign_in: "parent" },
                  ...gamer,
                },
              ],
              error: null,
            }),
        }),
      };
    }
    // A waitlist join states no price, so `product_prices` is never read.
    throw new Error(`Unexpected table in the caller's client mock: ${table}`);
  });
}

// --- Tests ---

describe("POST /api/participations/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
    mockReadsForConfirmationEmail();
  });

  afterEach(settleDeferred);

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gamer role", async () => {
    mockForbidden("gamer");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only customers can join a waitlist");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gedu role", async () => {
    mockForbidden("gedu");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for admin role", async () => {
    mockForbidden("admin");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Validation --

  it("returns 400 when JSON is malformed", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest(null, { rawBody: "{not-json" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when productId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest({ participantId: GAMER_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|participantId): Required/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when participantId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest({ productId: PRODUCT_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|participantId): Required/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("returns the new waitlist position when join_waitlist succeeds", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
        idempotent: false,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
    });
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
    });
  });

  it("hands the ticked consent documents to the RPC, untouched", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
        idempotent: false,
      },
      error: null,
    });

    await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        consentedDocuments: ["roblox-programme-terms"],
      }),
    );

    // A queue place is held to the same enrolment conditions as a seat, by the
    // same function inside the database — nothing about them is checked here.
    const args = mockRpc.mock.calls[0][1];
    expect(args.p_consented_documents).toEqual(["roblox-programme-terms"]);
  });

  it("does not disclose the consent refusal, and answers with a code instead", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          "this product requires consent to roblox-privacy-policy before enrolling",
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    // Same one exception the signup door makes: this route discloses the RPC's
    // refusals, and this refusal names raw slugs about a page the reader is no
    // longer looking at.
    expect(res.status).toBe(400);
    expect(data.error).not.toContain("roblox-privacy-policy");
    expect(data.error).not.toContain("requires consent");
    expect(data.code).toBe("consent_documents_required");
  });

  it("is idempotent — returns the existing row's position when the gamer is already on the waitlist", async () => {
    mockAuthenticatedCustomer();
    // The RPC itself short-circuits on existing participation rows; the route
    // just relays whatever shape the RPC returns. This locks in that contract.
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 1,
        status: "waitlisted",
        idempotent: true,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.waitlistPosition).toBe(1);
  });

  // The flag is required, not optional: a shape that lost it must fail loudly
  // rather than fall through to "not idempotent" and mail a duplicate.
  it("returns 500 when the RPC answers without the idempotent flag", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 1,
        status: "waitlisted",
      },
      error: null,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(500);
    // Nothing was even deferred, so no mail can arrive later either.
    expect(deferred).toHaveLength(0);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // -- RPC error mapping --

  it("returns 400 when waitlist is not enabled for the product (RPC raises check_violation)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "waitlist is not enabled for this product",
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("waitlist is not enabled for this product");
  });

  it("returns 400 when the customer is not the parent of the gamer (IDOR guard)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: `customer ${CUSTOMER_ID} is not the parent of gamer ${GAMER_ID}`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("is not the parent of gamer");
  });

  it("returns 403 when the RPC guard refuses the caller (42501)", async () => {
    // Defense in depth made visible: even if this route's own role check were
    // bypassed, `join_product_waitlist` refuses a non-customer in the database.
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
  });

  // -- The participant may be the caller --
  //
  // A for-parents product lets a customer queue for a seat of their own, which
  // arrives as `participantId === user.id`. The route judges nothing about that
  // pair: it never sends a customer id at all — `join_product_waitlist` reads
  // the caller from `auth.uid()` — so who may sit in the seat is entirely the
  // database's decision, under the same audience gate the signup path uses.

  it("forwards a self waitlist join without naming a customer", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 2,
        status: "waitlisted",
        idempotent: false,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: CUSTOMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.waitlistPosition).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: CUSTOMER_ID,
    });
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty("p_customer_id");
  });

  it("relays the RPC's refusal for an adult who is not the caller", async () => {
    // Forwarded, then refused in the database — the shape a route-side check
    // would have hidden. The message is the RPC's own, because that is what the
    // signup panel renders.
    mockAuthenticatedCustomer();
    const otherAdult = "99999999-9999-9999-9999-999999999999";
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: `customer ${CUSTOMER_ID} is not the parent of participant ${otherAdult}`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: otherAdult }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("is not the parent of participant");
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: otherAdult,
    });
  });

  it("relays the RPC's audience refusal on a gamers-only product", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "this product is not open to parents" },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: CUSTOMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("this product is not open to parents");
  });

  it("returns 400 when the product does not exist", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0002",
        message: `product ${PRODUCT_ID} does not exist`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("does not exist");
  });

  // -- The confirmation mail --

  /** The only outcome that earns a mail: a row this call actually wrote. */
  function joinsWaitlist() {
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
        idempotent: false,
      },
      error: null,
    });
  }

  it("mails the customer when the spot is taken", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    // Handed to the post-response hook, not awaited inside the answer.
    expect(deferred).toHaveLength(1);
    await settleDeferred();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendTransactionalEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("parent@example.test");
    expect(sent.replyToEmail).toBe("help@sog.gg");
    expect(sent.subject).toContain("waitlist");
    expect(sent.subject).toContain("Aino");
  });

  /**
   * A child with a mailbox of their own gets a copy beside the parent's:
   * second person, no price, their own My SOG root. The gate is the sign-in
   * mode alone — the address below is unverified and the copy goes out anyway
   * — so the negative cases are the two modes that have no inbox behind them:
   * the switch-only default above, and the username sign-in below.
   */
  it("sends a child with their own address a copy, after the parent's", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();
    mockReadsForConfirmationEmail({
      gamer: {
        email: "aino@example.test",
        locale: "en",
        gamer_profiles: { sign_in: "email" },
      },
    });

    await POST(createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }));
    await settleDeferred();

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);
    const [parent, child] = mockSendTransactionalEmail.mock.calls.map(([options]) => options);
    expect(parent.toEmail).toBe("parent@example.test");
    expect(parent.htmlContent).toContain("https://test.sogverse.local/parent");

    expect(child.toEmail).toBe("aino@example.test");
    expect(child.subject).toBe("You are on the waitlist for Test Club");
    expect(child.htmlContent).toContain("https://test.sogverse.local/gamer");
    expect(child.htmlContent).not.toContain("/parent");
    expect(child.htmlContent).not.toContain("Price");
    expect(child.replyToEmail).toBe("help@sog.gg");
  });

  it("mails the parent alone for a child who signs in with a username", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();
    mockReadsForConfirmationEmail({
      gamer: {
        email: "aino@gamer.sogverse.internal",
        gamer_profiles: { sign_in: "username" },
      },
    });

    await POST(createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }));
    await settleDeferred();

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalEmail.mock.calls[0][0].toEmail).toBe("parent@example.test");
  });

  // The card in My SOG reads the position live; a number frozen into an inbox
  // goes stale the moment somebody ahead drops out, with no way for the reader
  // to tell.
  it("states no position and no price in the mail", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();

    await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    await settleDeferred();

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain(">Price</td>");
    // It points at the live answer instead of freezing one — the same sentence
    // the confirmation page's own waitlist list ends on.
    expect(htmlContent).toContain("keep track of your waitlist spot");
    // The request carries no trusted Host, so the link falls back to the
    // canonical site URL rather than to anything the request could name.
    expect(htmlContent).toContain("https://test.sogverse.local/parent");
  });

  // A stale tab resubmitting, or a browser retrying: the RPC hands back the row
  // that was already there, and the parent has already had this mail.
  it("sends nothing on a replay of a join that already happened", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
        idempotent: true,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
    });
    expect(deferred).toHaveLength(0);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // The second parent in a family, joining a gamer who already holds a seat.
  // The RPC answers `active` with position 0 — "you're on the waitlist" would
  // be untrue about a seat they already have.
  it("sends nothing when the participant already holds a seat", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 0,
        status: "active",
        idempotent: true,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("active");
    expect(deferred).toHaveLength(0);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // Same for a seat mid-purchase. Like every non-`waitlisted` shape the RPC has
  // today it comes back `idempotent: true`, so the flag is what excludes it; the
  // route's status check rides along as belt-and-braces against a future shape
  // that pairs `idempotent: false` with something other than `waitlisted`.
  it("sends nothing when the participant is mid-reservation", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 0,
        status: "reserving",
        idempotent: true,
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect(deferred).toHaveLength(0);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the join is refused", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "waitlist is not enabled for this product",
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(400);
    expect(deferred).toHaveLength(0);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("still joins the waitlist when the send throws", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
    });
    // The helper swallows its own failure, so the deferred work settles rather
    // than rejecting — which is what makes it safe to hand to `after()` at all.
    await expect(settleDeferred()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("DELETE /api/participations/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gamer role — a kid can't give up their own place in line", async () => {
    mockForbidden("gamer");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only customers can leave a waitlist");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gedu role", async () => {
    mockForbidden("gedu");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for admin role", async () => {
    mockForbidden("admin");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Validation --

  it("returns 400 when JSON is malformed", async () => {
    mockAuthenticatedCustomer();

    const res = await DELETE(
      createDeleteRequest(null, { rawBody: "{not-json" }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when participationId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await DELETE(createDeleteRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/participationId/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("relays the participation id to the RPC and returns the outcome kind", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        kind: "left",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    // Only the kind crosses the wire; the ids the RPC echoes back are ones the
    // caller already had, so the response schema drops them.
    expect(data).toEqual({ kind: "left" });
    expect(mockRpc).toHaveBeenCalledWith("leave_my_waitlist_spot", {
      p_participation_id: PARTICIPATION_ID,
    });
    // The caller's identity is never a parameter — the RPC reads auth.uid().
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty("p_customer_id");
  });

  it("returns 200 with kind 'noop' when the row was already promoted", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: { kind: "noop", status: "active" },
      error: null,
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ kind: "noop" });
  });

  it("returns 200 with kind 'not_found' rather than a 404 for someone else's row", async () => {
    // The RPC deliberately answers "not yours" and "not real" identically. A
    // 404 here would hand that distinction back to a prober via the status
    // code, so every outcome is a 200 carrying its kind.
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({ data: { kind: "not_found" }, error: null });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ kind: "not_found" });
  });

  // -- RPC error mapping --

  it("returns 403 when the RPC guard refuses the caller (42501)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
  });

  it("returns 500 without disclosing the message when the RPC shape is unexpected", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({ data: { kind: "teleported" }, error: null });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    // This route doesn't opt into disclosure — unlike the POST above, none of
    // its outcomes are written for a parent to read.
    expect(data.error).toBe("Internal server error");
  });
});
