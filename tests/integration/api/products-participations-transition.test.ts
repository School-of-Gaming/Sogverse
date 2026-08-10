import { describe, it, expect, vi, beforeEach } from "vitest";
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
    vi.spyOn(console, "info").mockImplementation(() => undefined);
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
