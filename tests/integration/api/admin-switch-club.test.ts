import { describe, it, expect, vi, beforeEach } from "vitest";

// Both handlers write absolute staff links into the Stripe subscription's
// metadata through getOrigin(), which falls back to NEXT_PUBLIC_SITE_URL when
// the request carries no trusted Host. Set before the imports so nothing can
// capture an unset value.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { NextResponse } from "next/server";
import {
  GET,
  POST,
} from "@/app/api/admin/products/[id]/participations/[participationId]/switch/route";
import { switchClubCommitResponse } from "@/services/participations/switch-club.contracts";
import { asString } from "../../helpers/json";

/**
 * The admin club switch: one path, two handlers, and the one route on the
 * platform that moves money and a seat in the same request.
 *
 * What this file covers is the route's own job — the role gate, the refusal
 * set the check accumulates from plain reads, and the commit's ORDER: mint,
 * Stripe, then the database, with no compensating Stripe call when the last
 * step fails. The RPC's own rules are covered against a real database in
 * tests/db/; the reads here are stubbed, because what is under test is which
 * refusals the route derives from them and what it does next.
 */

// --- Auth ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// --- Stripe ---

const { stripeMock } = await vi.hoisted(async () => ({
  stripeMock: (await import("../../mocks/stripe")).createStripeMock(),
}));

vi.mock("stripe", async () =>
  (await import("../../mocks/stripe")).stripeModuleMock(stripeMock),
);

const mockSubscriptionRetrieve = stripeMock.subscriptions.retrieve;
const mockSubscriptionUpdate = stripeMock.subscriptions.update;

// --- The service-role client, and the one thing the route uses it for ---

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn(), rpc: vi.fn() })),
}));

// --- The confirmation mail ---

/**
 * The purchase confirmation, mocked at its own boundary rather than at Brevo's.
 * A switched seat gets the same mail a bought one gets; what this file is about
 * is *whether* the commit sends it, never what the sender composes — letting it
 * run would make every assertion here depend on a product row and an `.ics`
 * this route has no opinion about.
 */
const mockSendProductConfirmationEmail = vi.fn();
vi.mock("@/services/participations/product-confirmation-email.server", () => ({
  sendProductConfirmationEmail: (...args: unknown[]) =>
    mockSendProductConfirmationEmail(...args),
}));

const mockGetOrCreateSubscriptionPrice = vi.fn();
vi.mock("@/lib/stripe/participation-prices", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/stripe/participation-prices")>();
  return {
    ...actual,
    getOrCreateSubscriptionPrice: (...args: unknown[]) =>
      mockGetOrCreateSubscriptionPrice(...args),
  };
});

// --- Fixtures ---

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GAMER_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_PARTICIPATION_ID = "88888888-8888-4888-8888-888888888888";
/** A group of the target club, and one that belongs to some other product. */
const TARGET_GROUP_ID = "99999999-9999-4999-8999-999999999999";
const FOREIGN_GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUB_ID = "sub_test_switch";
const ITEM_ID = "si_test_switch";
const SOURCE_PRICE_ID = "price_source_club";
const TARGET_PRICE_ID = "price_target_club";
const REQUEST_ID = "dialog-request-0001";

const params = Promise.resolve({
  id: PRODUCT_ID,
  participationId: PARTICIPATION_ID,
});

/**
 * One PostgREST chain, answering the same stubbed result however it is
 * filtered. The route's reads differ only in their filters, so what a test
 * controls is the row a table hands back — never the chain shape.
 */
function chain(result: unknown) {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "order"]) {
    self[method] = () => self;
  }
  self.maybeSingle = () => Promise.resolve(result);
  self.single = () => Promise.resolve(result);
  // The profiles read the description rewrite makes awaits the filter itself
  // rather than a row accessor, so the chain has to be thenable too.
  self.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return self;
}

interface TableReads {
  /**
   * `participations` is read twice per check — the seat itself, then whether
   * the participant already holds a row on the target — so it takes a queue.
   * Every other table answers the same way however often it is asked.
   */
  participations: unknown[];
  products: unknown;
  family_subscriptions: unknown;
  product_prices: unknown;
  /**
   * The placement pre-flight's one read, filtered on group id AND target
   * product — so "not the target's" and "no such group" reach it as the same
   * empty answer, which is how the RPC answers them too.
   */
  product_groups: unknown;
  profiles: unknown;
}

let reads: TableReads;
const mockRpc = vi.fn();

function userClient() {
  // Snapshotted per client, so a test that rewrites `reads.participations` has
  // to do it BEFORE it mocks the gate — which is also how the route sees it.
  const participations = [...reads.participations];
  return {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      switch (table) {
        case "participations":
          return chain(
            participations.length > 1 ? participations.shift() : participations[0],
          );
        case "products":
          return chain(reads.products);
        case "family_subscriptions":
          return chain(reads.family_subscriptions);
        case "product_prices":
          return chain(reads.product_prices);
        case "product_groups":
          return chain(reads.product_groups);
        default:
          return chain(reads.profiles);
      }
    },
  };
}

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: userClient(),
  });
}

function mockNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can switch a gamer's club" },
      { status: 403 },
    ),
  );
}

function activeSeat(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: PARTICIPATION_ID,
      product_id: PRODUCT_ID,
      participant_id: GAMER_ID,
      customer_id: CUSTOMER_ID,
      status: "active",
      ...overrides,
    },
    error: null,
  };
}

function paidClub(id: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id,
      product_type: "consumer_club",
      billing_mode: "paid",
      spoken_language_code: "en",
      start_date: "2026-09-01",
      end_date: null,
      product_translations: [{ locale: "en", name: "Minecraft Advanced" }],
      ...overrides,
    },
    error: null,
  };
}

/** A live subscription, and the shape the Stripe read answers with. */
function liveSubscription() {
  return {
    data: { stripe_subscription_id: SUB_ID, currency: "eur" },
    error: null,
  };
}

function stripeSubscription(
  overrides: {
    items?: { id: string; price: { id: string; unit_amount: number | null } }[];
    invoiceStatus?: string;
    amountPaid?: number;
  } = {},
) {
  return {
    id: SUB_ID,
    items: {
      data: overrides.items ?? [
        { id: ITEM_ID, price: { id: SOURCE_PRICE_ID, unit_amount: 4900 } },
      ],
    },
    latest_invoice: {
      id: "in_test_1",
      status: overrides.invoiceStatus ?? "paid",
      amount_paid: overrides.amountPaid ?? 4900,
    },
  };
}

function checkRequest(target: string = TARGET_PRODUCT_ID): Request {
  return new Request(
    `http://localhost/api/admin/products/${PRODUCT_ID}/participations/${PARTICIPATION_ID}/switch?target=${target}`,
  );
}

function commitRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/admin/products/${PRODUCT_ID}/participations/${PARTICIPATION_ID}/switch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const commitBody = {
  targetProductId: TARGET_PRODUCT_ID,
  // The dialog's default placement: leave the seat in the target's unassigned
  // inbox, which is exactly where the shared rule would have put it.
  groupId: null,
  requestId: REQUEST_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  reads = {
    participations: [activeSeat(), { data: null, error: null }],
    products: paidClub(TARGET_PRODUCT_ID),
    family_subscriptions: liveSubscription(),
    product_prices: { data: { price_cents: 5900 }, error: null },
    product_groups: { data: { id: TARGET_GROUP_ID }, error: null },
    profiles: {
      data: [
        { id: GAMER_ID, first_name: "Aino", locale: null },
        { id: CUSTOMER_ID, first_name: "Marja", locale: "fi" },
      ],
      error: null,
    },
  };
  mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription());
  mockSubscriptionUpdate.mockResolvedValue({ id: SUB_ID });
  mockGetOrCreateSubscriptionPrice.mockResolvedValue({
    product_id: TARGET_PRODUCT_ID,
    currency: "eur",
    stripe_price_id: TARGET_PRICE_ID,
    unit_amount_cents: 5900,
  });
  mockRpc.mockResolvedValue({
    data: {
      participation_id: PARTICIPATION_ID,
      source_product_id: PRODUCT_ID,
      target_product_id: TARGET_PRODUCT_ID,
      group_id: null,
      stripe_subscription_id: SUB_ID,
    },
    error: null,
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET …/participations/[participationId]/switch — the check", () => {
  it("refuses a non-admin before reading anything", async () => {
    mockNonAdmin();

    const response = await GET(checkRequest(), { params });

    expect(response.status).toBe(403);
    expect(mockSubscriptionRetrieve).not.toHaveBeenCalled();
  });

  it("answers both amounts and no refusals for a switchable seat", async () => {
    mockAuthenticatedAdmin();

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      currency: "eur",
      // The item's own amount, not the source club's authored price: a
      // subscriber keeps what they signed up at.
      currentAmountCents: 4900,
      targetAmountCents: 5900,
      refusals: [],
    });
    // One Stripe read, with the invoice expanded — the check mints nothing.
    expect(mockSubscriptionRetrieve).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith(SUB_ID, {
      expand: ["latest_invoice"],
    });
    expect(mockGetOrCreateSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("refuses a subscription whose latest invoice is not paid", async () => {
    mockAuthenticatedAdmin();
    mockSubscriptionRetrieve.mockResolvedValue(
      stripeSubscription({ invoiceStatus: "open", amountPaid: 0 }),
    );

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refusals).toEqual(["latest_invoice_not_paid"]);
  });

  it("refuses a subscription carrying more than one item", async () => {
    mockAuthenticatedAdmin();
    mockSubscriptionRetrieve.mockResolvedValue(
      stripeSubscription({
        items: [
          { id: ITEM_ID, price: { id: SOURCE_PRICE_ID, unit_amount: 4900 } },
          { id: "si_second", price: { id: "price_other", unit_amount: 100 } },
        ],
      }),
    );

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(body.refusals).toEqual(["subscription_not_single_item"]);
    // No single item, so no amount to state.
    expect(body.currentAmountCents).toBeNull();
  });

  it("refuses a target with no authored price in the subscription's currency", async () => {
    mockAuthenticatedAdmin();
    reads.product_prices = { data: null, error: null };

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(body.refusals).toEqual(["no_target_price_in_currency"]);
    expect(body.targetAmountCents).toBeNull();
  });

  it("refuses a participant who already completed the target club", async () => {
    reads.participations = [
      activeSeat(),
      { data: { id: OTHER_PARTICIPATION_ID }, error: null },
    ];
    mockAuthenticatedAdmin();

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(body.refusals).toEqual(["already_on_target"]);
  });

  it("refuses a free club as a target", async () => {
    mockAuthenticatedAdmin();
    reads.products = paidClub(TARGET_PRODUCT_ID, { billing_mode: "free" });

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(body.refusals).toEqual(["target_not_paid_subscription_club"]);
  });

  it("refuses a seat with no live subscription without calling Stripe at all", async () => {
    mockAuthenticatedAdmin();
    reads.family_subscriptions = { data: null, error: null };

    const response = await GET(checkRequest(), { params });
    const body = await response.json();

    expect(body.refusals).toEqual(["no_live_subscription"]);
    expect(mockSubscriptionRetrieve).not.toHaveBeenCalled();
  });

  it("404s a participation that is not on this product", async () => {
    reads.participations = [
      activeSeat({ product_id: TARGET_PRODUCT_ID }),
      { data: null, error: null },
    ];
    mockAuthenticatedAdmin();

    const response = await GET(checkRequest(), { params });

    expect(response.status).toBe(404);
  });
});

describe("POST …/participations/[participationId]/switch — the commit", () => {
  it("refuses a non-admin", async () => {
    mockNonAdmin();

    const response = await POST(commitRequest(commitBody), { params });

    expect(response.status).toBe(403);
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 400 with the refusals and touches neither system", async () => {
    mockAuthenticatedAdmin();
    mockSubscriptionRetrieve.mockResolvedValue(
      stripeSubscription({ invoiceStatus: "open", amountPaid: 0 }),
    );

    const response = await POST(commitRequest(commitBody), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.refusals).toEqual(["latest_invoice_not_paid"]);
    expect(mockGetOrCreateSubscriptionPrice).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    // Nothing moved, so there is nothing to confirm to the family.
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
  });

  it("moves Stripe onto the minted price, then the row, and logs the switch", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(commitRequest(commitBody), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(switchClubCommitResponse.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      participationId: PARTICIPATION_ID,
      sourceProductId: PRODUCT_ID,
      targetProductId: TARGET_PRODUCT_ID,
      groupId: null,
      stripeSubscriptionId: SUB_ID,
      stripePriceId: TARGET_PRICE_ID,
    });

    expect(mockSubscriptionUpdate).toHaveBeenCalledTimes(1);
    const [subId, updateParams, options] = mockSubscriptionUpdate.mock.calls[0];
    expect(subId).toBe(SUB_ID);
    expect(updateParams).toMatchObject({
      items: [{ id: ITEM_ID, price: TARGET_PRICE_ID }],
      proration_behavior: "create_prorations",
    });
    // The keys that name a product, and only those.
    expect(updateParams.metadata).toMatchObject({
      productId: TARGET_PRODUCT_ID,
      product_id: TARGET_PRODUCT_ID,
      productName: "Minecraft Advanced",
      productType: "consumer_club",
      spoken_language_code: "en",
      delivery_start: "2026-09-01",
      // Stripe spells "remove this key" as an empty string, and the target has
      // no end date — without this it would inherit the source club's.
      delivery_end: "",
    });
    expect(asString(updateParams.metadata.adminProductUrl)).toContain(
      TARGET_PRODUCT_ID,
    );
    expect(updateParams.description).toBe("Minecraft Advanced — Aino");
    expect(options).toEqual({
      idempotencyKey: `club-switch:${PARTICIPATION_ID}:${TARGET_PRODUCT_ID}:${REQUEST_ID}`,
    });

    // The database step runs after the money has moved, with the same price id.
    expect(mockRpc).toHaveBeenCalledWith("admin_move_participation", {
      p_participation_id: PARTICIPATION_ID,
      p_target_product_id: TARGET_PRODUCT_ID,
      p_stripe_price_id: TARGET_PRICE_ID,
      p_group_id: undefined,
    });
    // `null` placement reaches the RPC as an OMITTED argument, never a named
    // group: the SQL DEFAULT is what falls back to the shared placement rule,
    // and only an absent argument takes it. Asserted through the serialization
    // PostgREST itself does — which drops an undefined value — because the
    // matcher above cannot tell an undefined property from an absent one.
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toContain(
      "p_group_id",
    );

    const audit = vi
      .mocked(console.info)
      .mock.calls.map((call) => asString(call[0]))
      .find((line) => line.includes("admin_switch_club"));
    expect(audit).toBeDefined();
    expect(JSON.parse(audit ?? "{}")).toMatchObject({
      event: "admin_switch_club",
      admin_id: "admin-user-id",
      participation_id: PARTICIPATION_ID,
      source_product_id: PRODUCT_ID,
      target_product_id: TARGET_PRODUCT_ID,
      stripe_subscription_id: SUB_ID,
      stripe_price_id: TARGET_PRICE_ID,
      request_id: REQUEST_ID,
    });

    // The family is told, with the purchase confirmation for the TARGET club —
    // same copy, same calendar invitation, on the unchanged participation id so
    // the invitation updates the entry they already hold.
    expect(mockSendProductConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendProductConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: TARGET_PRODUCT_ID,
        participationId: PARTICIPATION_ID,
        customerId: CUSTOMER_ID,
        participantId: GAMER_ID,
        mode: "subscription",
        currency: "eur",
      }),
    );
    // Only a seat that actually moved is announced, so the send follows the RPC
    // rather than racing it.
    expect(
      mockSendProductConfirmationEmail.mock.invocationCallOrder[0],
    ).toBeGreaterThan(mockRpc.mock.invocationCallOrder[0]);
  });

  it("passes the admin's chosen group through to the RPC", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      commitRequest({ ...commitBody, groupId: TARGET_GROUP_ID }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("admin_move_participation", {
      p_participation_id: PARTICIPATION_ID,
      p_target_product_id: TARGET_PRODUCT_ID,
      p_stripe_price_id: TARGET_PRICE_ID,
      p_group_id: TARGET_GROUP_ID,
    });
  });

  it("answers 400 for a group that is not the target's, before touching Stripe", async () => {
    mockAuthenticatedAdmin();
    // The pre-flight read is filtered on the target too, so a group of another
    // product comes back empty exactly as an unknown id would.
    reads.product_groups = { data: null, error: null };

    const response = await POST(
      commitRequest({ ...commitBody, groupId: FOREIGN_GROUP_ID }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    // A malformed request from the dialog, not something an admin is told about
    // this seat — so a plain error and no refusal to word.
    expect(body.refusals).toBeUndefined();
    expect(body.stripeUpdated).toBeUndefined();
    expect(mockGetOrCreateSubscriptionPrice).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
  });

  it("answers 500 with stripeUpdated when the database step fails, and never calls Stripe again", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to timeout" },
    });

    const response = await POST(commitRequest(commitBody), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.stripeUpdated).toBe(true);
    // No refusal: an outage is the one failure a second press can fix, and the
    // absent `refusals` is what leaves the dialog's confirm live.
    expect(body.refusals).toBeUndefined();
    expect(asString(body.error)).toContain("press Switch again");
    // The rejected alternative, asserted: no compensating second call.
    expect(mockSubscriptionUpdate).toHaveBeenCalledTimes(1);
    // The seat did not move, so the family is not told that it did — whatever
    // Stripe is now billing.
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
  });

  it("answers 400 with stripeUpdated when the group stopped being the target's under the write", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          "group … is not a group of the target product … — a switched seat can only land in a group of the club it moves to",
      },
    });

    const response = await POST(
      commitRequest({ ...commitBody, groupId: TARGET_GROUP_ID }),
      { params },
    );
    const body = await response.json();

    // A 400 rather than the outage's 500, and refusal-free rather than named:
    // the pair is what tells the sheet this is permanent even though nothing
    // in the refusal vocabulary words it. The money moved, so the admin is
    // told so whatever else is true.
    expect(response.status).toBe(400);
    expect(body.stripeUpdated).toBe(true);
    expect(body.refusals).toBeUndefined();
    expect(asString(body.error)).toContain("not a group of the target club");
    // The rejected alternative, asserted: no compensating second call.
    expect(mockSubscriptionUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendProductConfirmationEmail).not.toHaveBeenCalled();
  });

  it("answers 409 when the seat collided on the target under the write", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    });

    const response = await POST(commitRequest(commitBody), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    // Both, and they answer different questions: the money moved (so the admin
    // has to know), AND the collision is permanent (so the dialog words the
    // reason and kills the confirm instead of inviting a retry forever).
    expect(body.stripeUpdated).toBe(true);
    expect(body.refusals).toEqual(["already_on_target"]);
  });

  it("sends the same idempotency key when the same request id is pressed again", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to timeout" },
    });
    await POST(commitRequest(commitBody), { params });

    // A second press from the same dialog: fresh client stubs, same body.
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        source_product_id: PRODUCT_ID,
        target_product_id: TARGET_PRODUCT_ID,
        group_id: null,
        stripe_subscription_id: SUB_ID,
      },
      error: null,
    });
    const second = await POST(commitRequest(commitBody), { params });

    expect(second.status).toBe(200);
    expect(mockSubscriptionUpdate).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockSubscriptionUpdate.mock.calls;
    expect(firstCall[2]).toEqual(secondCall[2]);
    // Byte-identical is what Stripe dedupes on, so the payload has to match too.
    expect(firstCall[1]).toEqual(secondCall[1]);
  });

  it("rejects a body without a request id", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      commitRequest({ targetProductId: TARGET_PRODUCT_ID, groupId: null }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
  });
});
