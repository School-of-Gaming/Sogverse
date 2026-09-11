import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The seat-offer mail signs its link with this secret and builds its origin
// from getOrigin(), which falls back to NEXT_PUBLIC_SITE_URL when the request
// carries no trusted Host. Both are read lazily, but set them before the
// imports so nothing can capture an unset value.
process.env.PIN_COOKIE_SECRET = "integration-test-pin-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { NextResponse } from "next/server";
import { PATCH } from "@/app/api/admin/products/[id]/participations/[participationId]/route";
import { asString } from "../../helpers/json";

// The admin waitlist promote/demote handler, driven by the groups-panel drag
// UI. Its sibling DELETE handler is covered next door; this file is the reason
// test linkage is per handler rather than per file — the two live in one route
// file and only one of them used to be exercised.
//
// The rules themselves live in the RPCs and are covered against a real database
// in tests/db/. What this file covers is the handler's own job: the role gate,
// the IDOR guard that ties the participation to THIS product, and the mapping
// from SQLSTATE to HTTP status.
//
// The refusal this route carries changed shape: it used to read the product's
// type and block every consumer club, which would have wrongly blocked free
// clubs the moment clubs became free-or-paid. It is now the DB's own
// per-participation answer — demotion is refused when the seat carries a live
// Stripe subscription — so the tests below drive it through the RPC's error
// rather than through the product row.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();
const mockParticipationRead = vi.fn();
const mockProductRead = vi.fn();

// `invite` is the one action here that goes through the service-role client,
// because `send_seat_offer` is granted to nobody else — its two siblings answer
// a family who has no session at all, and the three share one authorization
// model. The admin's identity is still established by the route's role gate.
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

// The stamp is committed before the mail is attempted, so the send is handed to
// the platform's post-response hook rather than awaited inside the answer.
// Capture the deferred work instead of letting the hook run it, so these tests
// can assert the route deferred and then settle the send deliberately.
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
 * after the test had passed — and a send left mid-flight would land its Brevo
 * call in whichever test happens to be running when it resolves.
 */
async function settleDeferred(): Promise<void> {
  await Promise.all(deferred);
}

/** The columns on the child's profile row that decide whether they get a copy. */
interface GamerContactOverrides {
  email?: string;
  locale?: string | null;
  gamer_profiles?: { sign_in: string } | null;
}

/**
 * Overrides on the child's profile row, applied by the stub below. Empty by
 * default — the switch-only sign-in every gamer is created with, under which
 * the child's profile address is a platform-internal handle and no copy goes
 * to them. A test that wants the child's own copy swaps in the real-email
 * sign-in; `beforeEach` clears it again.
 */
let gamerOverrides: GamerContactOverrides = {};

/**
 * The one shape that earns a child their own copy: the real-email sign-in.
 * Nothing here says whether the address has been verified, because the send no
 * longer asks — and the flip is deliberate, since the copy is most useful
 * before the child has clicked anything.
 */
const EMAIL_GAMER: GamerContactOverrides = {
  email: "aino@example.test",
  locale: "en",
  gamer_profiles: { sign_in: "email" },
};

/** The two reads the seat-offer mail makes through the service-role client. */
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
            gamer_profiles: null,
          },
          {
            id: GAMER_ID,
            first_name: "Aino",
            last_name: null,
            email: "aino@gamer.sogverse.internal",
            locale: null,
            gamer_profiles: { sign_in: "parent" },
            ...gamerOverrides,
          },
        ],
        error: null,
      }),
    }),
  };
}

/** `participations` and `products` are read through the same client stub. */
function tableStub(table: string) {
  const read = table === "participations" ? mockParticipationRead : mockProductRead;
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => read() }) }),
  };
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";
const GROUP_ID = "55555555-5555-5555-5555-555555555555";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GAMER_ID = "77777777-7777-4777-8777-777777777777";
const SENT_AT = "2026-08-26T10:00:00.123+00:00";

const params = Promise.resolve({
  id: PRODUCT_ID,
  participationId: PARTICIPATION_ID,
});

function patchRequest(body: unknown, rawBody?: string): Request {
  return new Request(
    `http://localhost/api/admin/products/x/participations/y`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    },
  );
}

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: { rpc: mockRpc, from: (table: string) => tableStub(table) },
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can change waitlist status" },
      { status: 403 },
    ),
  );
}

const promote = { action: "promote", groupId: GROUP_ID };
const demote = { action: "demote" };
const invite = { action: "invite" };

/** What `send_seat_offer` answers on the call that actually stamped the row. */
function freshOffer() {
  return {
    data: {
      kind: "offered",
      participation_id: PARTICIPATION_ID,
      product_id: PRODUCT_ID,
      customer_id: CUSTOMER_ID,
      participant_id: GAMER_ID,
      sent_at: SENT_AT,
      idempotent: false,
    },
    error: null,
  };
}

describe("PATCH /api/admin/products/[id]/participations/[participationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParticipationRead.mockResolvedValue({
      data: { id: PARTICIPATION_ID, product_id: PRODUCT_ID },
      error: null,
    });
    // The product is read only so a URL naming a missing product 404s; nothing
    // branches on its columns any more.
    mockProductRead.mockResolvedValue({
      data: { id: PRODUCT_ID },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: {
        kind: "promoted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        group_id: GROUP_ID,
      },
      error: null,
    });
    mockAdminRpc.mockResolvedValue(freshOffer());
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "m1" });
    deferred.length = 0;
    gamerOverrides = {};
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await settleDeferred();
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockNonAdmin();

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for malformed JSON", async () => {
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest(null, "{not-json"), { params });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for an action outside the promote/demote pair", async () => {
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest({ action: "delete" }), { params });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when promote omits its drop target", async () => {
    // `groupId: null` means the unassigned inbox and is valid; omitting the key
    // entirely is not, because the drag UI always knows where it dropped.
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest({ action: "promote" }), { params });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed participation id in the path", async () => {
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest(promote), {
      params: Promise.resolve({ id: PRODUCT_ID, participationId: "nope" }),
    });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- IDOR guard --

  it("returns 404 when the participation belongs to a different product", async () => {
    // Without this, a participationId from another product could be transitioned
    // through this URL — the whole reason the guard exists.
    mockAuthenticatedAdmin();
    mockParticipationRead.mockResolvedValue({
      data: {
        id: PARTICIPATION_ID,
        product_id: "99999999-9999-4999-8999-999999999999",
      },
      error: null,
    });

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the participation does not exist", async () => {
    mockAuthenticatedAdmin();
    mockParticipationRead.mockResolvedValue({ data: null, error: null });

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the product does not exist", async () => {
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({ data: null, error: null });

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- The live-subscription demote refusal --

  it("refuses a demote that would strand a live Stripe subscription", async () => {
    // The refusal that replaced the consumer-club gate, and it is keyed to the
    // participation rather than the type: a waitlisted row can be deleted by
    // the parent, CASCADEing family_subscriptions and orphaning a sub that
    // keeps billing. The copy has to say what to do next, so it is the
    // handler's, not the shared table's generic 400.
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "55000",
        message: "participation still has live Stripe subscription sub_123",
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(demote), { params });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("live Stripe subscription");
    spy.mockRestore();
  });

  it("promotes on a consumer club, which the old type gate refused outright", async () => {
    // A consumer club is exactly the row the removed gate blocked, and a *free*
    // one has no billing to break. The product read is deliberately fed the
    // type here so a reintroduced `product_type === "consumer_club"` branch
    // fails this test rather than passing it by absence.
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({
      data: { id: PRODUCT_ID, product_type: "consumer_club" },
      error: null,
    });

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("promote_from_waitlist", {
      p_participation_id: PARTICIPATION_ID,
      p_group_id: GROUP_ID,
    });
  });

  // -- Happy paths --

  it("promotes into the named group", async () => {
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("promote_from_waitlist", {
      p_participation_id: PARTICIPATION_ID,
      p_group_id: GROUP_ID,
    });
  });

  it("promotes into the unassigned inbox when groupId is null", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: {
        kind: "promoted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        group_id: null,
      },
      error: null,
    });

    const response = await PATCH(
      patchRequest({ action: "promote", groupId: null }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("promote_from_waitlist", {
      p_participation_id: PARTICIPATION_ID,
      p_group_id: undefined,
    });
  });

  it("demotes an active gamer to the back of the waitlist", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: {
        kind: "demoted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });

    const response = await PATCH(patchRequest(demote), { params });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("demote_to_waitlist", {
      p_participation_id: PARTICIPATION_ID,
    });
  });

  it("treats the RPC's noop as success, letting the panel refetch reconcile", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: { kind: "noop", status: "active" },
      error: null,
    });

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(200);
  });

  // -- The seat offer --

  it("offers the seat and mails the family, after the answer has gone out", async () => {
    mockAuthenticatedAdmin();

    const response = await PATCH(patchRequest(invite), { params });

    expect(response.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith("send_seat_offer", {
      p_participation_id: PARTICIPATION_ID,
    });
    // Deferred, not awaited: the stamp is committed and the admin's click must
    // not wait on Brevo.
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    await settleDeferred();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendTransactionalEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("marja@example.com");
    expect(sent.subject).toContain("Aino");
    // The link carries the token and points at the public landing page, on the
    // trusted origin rather than the request's Host.
    expect(sent.htmlContent).toContain(
      "https://test.sogverse.local/seat-offer?token=",
    );
  });

  /**
   * A child with a mailbox of their own gets a copy of the offer beside the
   * parent's — and the copy is the whole reason the child's mail is a separate
   * template: only the parent may answer, so the token stays in the parent's
   * mail alone. The address here is unverified, which changes nothing.
   */
  it("sends a child with their own address a copy, with no token in it", async () => {
    mockAuthenticatedAdmin();
    gamerOverrides = EMAIL_GAMER;

    await PATCH(patchRequest(invite), { params });
    await settleDeferred();

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);
    const [parent, child] = mockSendTransactionalEmail.mock.calls.map(([options]) => options);

    // The parent's first, unchanged, token and all.
    expect(parent.toEmail).toBe("marja@example.com");
    expect(parent.htmlContent).toContain("/seat-offer?token=");

    // The child's: their own address, their own root, and nothing that answers.
    expect(child.toEmail).toBe("aino@example.test");
    expect(child.subject).toContain("Minecraft 101");
    expect(child.htmlContent).toContain("https://test.sogverse.local/gamer");
    expect(child.htmlContent).not.toContain("token=");
    expect(child.htmlContent).not.toContain("/seat-offer");
    expect(child.htmlContent).not.toContain("/parent");
    expect(child.replyToEmail).toBe("help@sog.gg");
  });

  it("mails the parent alone for a child who signs in with a username", async () => {
    mockAuthenticatedAdmin();
    gamerOverrides = {
      ...EMAIL_GAMER,
      email: "aino@gamer.sogverse.internal",
      gamer_profiles: { sign_in: "username" },
    };

    await PATCH(patchRequest(invite), { params });
    await settleDeferred();

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalEmail.mock.calls[0][0].toEmail).toBe("marja@example.com");
  });

  /**
   * The double-click, and the only thing that tells it apart from a first send.
   * A replay reports the ORIGINAL sent_at, so re-mailing would put a second
   * copy of one question — with an unchanged deadline — in a family's inbox.
   */
  it("sends nothing when the RPC reports a live offer was already standing", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({
      data: { ...freshOffer().data, idempotent: true },
      error: null,
    });

    const response = await PATCH(patchRequest(invite), { params });

    expect(response.status).toBe(200);
    expect(deferred).toHaveLength(0);
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the row has already moved on", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({
      data: { kind: "noop", status: "active" },
      error: null,
    });

    const response = await PATCH(patchRequest(invite), { params });

    expect(response.status).toBe(200);
    expect(deferred).toHaveLength(0);
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  /**
   * The stamp is committed by the time the send runs, so a Brevo outage is
   * never a reason to answer the admin with a failure. The offer stands with no
   * mail behind it, which the admin can fix by inviting again once the window
   * lapses.
   */
  it("answers 200 even when the send throws", async () => {
    mockAuthenticatedAdmin();
    mockSendTransactionalEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(invite), { params });
    await settleDeferred();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    spy.mockRestore();
  });

  /**
   * Both refusals the RPC raises — a paid product, and a product without
   * exactly one group — are check violations, which the shared table already
   * answers 400 for. The admin UI does not offer the button in either case;
   * this pins what happens if it is reached anyway.
   */
  it("maps the RPC's refusals to 400 and sends nothing", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "seat offers are only made on no-charge products",
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(invite), { params });

    expect(response.status).toBe(400);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still applies the IDOR guard to an invite", async () => {
    mockAuthenticatedAdmin();
    mockParticipationRead.mockResolvedValue({
      data: {
        id: PARTICIPATION_ID,
        product_id: "99999999-9999-4999-8999-999999999999",
      },
      error: null,
    });

    const response = await PATCH(patchRequest(invite), { params });

    expect(response.status).toBe(404);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("writes an audit line naming the admin, the product and the action", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: {
        kind: "demoted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });

    await PATCH(patchRequest(demote), { params });

    const line = asString(vi.mocked(console.info).mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "admin_waitlist_transition",
      action: "demote",
      admin_id: "admin-user-id",
      product_id: PRODUCT_ID,
      participation_id: PARTICIPATION_ID,
    });
  });

  // -- Error mapping --

  it("maps the RPC's no_data_found to 404", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "Participation not found" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Not found");
    spy.mockRestore();
  });

  it("maps a check violation to 400 through the shared error table", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "only an active participation can be moved" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(demote), { params });

    expect(response.status).toBe(400);
    spy.mockRestore();
  });

  it("maps an unrecognized code to a logged, generic 500", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Internal server error");
    spy.mockRestore();
  });

  it("answers 500 without echoing database text when the IDOR read fails", async () => {
    mockAuthenticatedAdmin();
    mockParticipationRead.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "permission denied for table participations" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(promote), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("permission denied");
    expect(mockRpc).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 500 when the RPC result does not match its contract", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({ data: { kind: "who-knows" }, error: null });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest(promote), { params });

    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
