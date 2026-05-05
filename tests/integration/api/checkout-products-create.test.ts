import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/products/create/route";
import { NextResponse } from "next/server";

// --- Stripe mock ---

// `new Stripe()` runs at module load (vi.mock hoisting fires before normal
// `const` declarations), so we shuttle the inner mocks through vi.hoisted.
const {
  mockStripeSessionCreate,
  mockStripeSubscriptionsUpdate,
  StripeCardErrorCtor,
} = vi.hoisted(() => {
  class StripeCardError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StripeCardError";
    }
  }
  return {
    mockStripeSessionCreate: vi.fn(),
    mockStripeSubscriptionsUpdate: vi.fn(),
    StripeCardErrorCtor: StripeCardError,
  };
});

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      checkout: { sessions: { create: mockStripeSessionCreate } },
      subscriptions: { update: mockStripeSubscriptionsUpdate },
    };
  }) as unknown as typeof import("stripe").default;
  (StripeMock as unknown as { errors: unknown }).errors = {
    StripeCardError: StripeCardErrorCtor,
  };
  return { default: StripeMock };
});

// --- Auth + Supabase admin mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

// --- participation-prices helpers ---
//
// Keep the pure utilities (bundleSizeFromShape, frequencyFromShape) real;
// stub the I/O ones so we can drive failure paths cleanly.

const mockGetOrCreateStripeCustomer = vi.fn();
const mockGetOrCreateSubscriptionPrice = vi.fn();
const mockComputeBundleAmount = vi.fn();
const mockComputeSinglePaymentAmount = vi.fn();

vi.mock("@/lib/stripe/participation-prices", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/stripe/participation-prices")>();
  return {
    ...actual,
    getOrCreateStripeCustomer: (...args: unknown[]) =>
      mockGetOrCreateStripeCustomer(...args),
    getOrCreateSubscriptionPrice: (...args: unknown[]) =>
      mockGetOrCreateSubscriptionPrice(...args),
    computeBundleAmount: (...args: unknown[]) => mockComputeBundleAmount(...args),
    computeSinglePaymentAmount: (...args: unknown[]) =>
      mockComputeSinglePaymentAmount(...args),
  };
});

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const RESERVATION_ID = "44444444-4444-4444-4444-444444444444";
const STRIPE_CUSTOMER_ID = "cus_test_customer";
const STRIPE_PRICE_ID = "price_test_monthly";
const FAMILY_SUB_ROW_ID = "55555555-5555-5555-5555-555555555555";

type ProductFixture = {
  id: string;
  product_type: "consumer_club" | "municipality_club" | "camp" | "event";
  billing_mode: "paid" | "free";
  seat_count: number | null;
  timezone: string;
  product_translations_v2: { locale: string; name: string }[];
};

const PAID_CLUB: ProductFixture = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  seat_count: 10,
  timezone: "Europe/Helsinki",
  product_translations_v2: [{ locale: "en", name: "Test Club" }],
};

const PAID_CAMP: ProductFixture = {
  ...PAID_CLUB,
  product_type: "camp",
};

const FREE_EVENT: ProductFixture = {
  ...PAID_CLUB,
  product_type: "event",
  billing_mode: "free",
};

// --- Mock builders ---

type FamSubRow = {
  id: string;
  stripe_subscription_id: string;
  status: "active" | "canceling" | "past_due" | "canceled";
};

type AdminMockOptions = {
  product?: ProductFixture | null;
  productErr?: { message: string } | null;
  existingFamSub?: FamSubRow | null;
};

type AdminInserts = {
  family_subscription_items_v2: Record<string, unknown>[];
};

function mockAdmin(opts: AdminMockOptions = {}): AdminInserts {
  const inserts: AdminInserts = { family_subscription_items_v2: [] };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "products_v2") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                opts.product
                  ? { data: opts.product, error: null }
                  : {
                      data: null,
                      error: opts.productErr ?? { message: "not found" },
                    },
              ),
          }),
        }),
      };
    }
    if (table === "family_subscriptions_v2") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: opts.existingFamSub ?? null,
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "family_subscription_items_v2") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.family_subscription_items_v2.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    throw new Error(`Unexpected table in admin mock: ${table}`);
  });

  return inserts;
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
        supabase: {},
      });
    },
  );
}

function mockAuthenticatedCustomer() {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(
  body: unknown,
  {
    rawBody,
    origin = "http://localhost:3000",
    host = "localhost:3000",
  }: { rawBody?: string; origin?: string; host?: string } = {},
): Request {
  return new Request("http://localhost:3000/api/checkout/products/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, host },
    body: rawBody ?? JSON.stringify(body),
  });
}

const VALID_BUNDLE_BODY = {
  productId: PRODUCT_ID,
  gamerId: GAMER_ID,
  purchaseShape: "bundle_4",
  currency: "eur",
};

// --- Tests ---

describe("POST /api/checkout/products/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateStripeCustomer.mockResolvedValue(STRIPE_CUSTOMER_ID);
  });

  // ── Auth ──────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();
    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    expect(res.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-customer roles", async () => {
    for (const role of ["gamer", "gedu", "admin"]) {
      mockForbidden(role);
      const res = await POST(createRequest(VALID_BUNDLE_BODY));
      expect(res.status).toBe(403);
    }
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────

  it("returns 400 on malformed JSON", async () => {
    mockAuthenticatedCustomer();
    const res = await POST(createRequest(null, { rawBody: "{not-json" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON");
  });

  it.each([
    ["productId", { gamerId: GAMER_ID, purchaseShape: "bundle_4", currency: "eur" }],
    ["gamerId", { productId: PRODUCT_ID, purchaseShape: "bundle_4", currency: "eur" }],
    ["purchaseShape", { productId: PRODUCT_ID, gamerId: GAMER_ID, currency: "eur" }],
  ])("returns 400 when %s is missing", async (_field, body) => {
    mockAuthenticatedCustomer();
    const res = await POST(createRequest(body));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("productId, gamerId and purchaseShape are required");
  });

  it("returns 400 when purchaseShape is not in the allowed set", async () => {
    mockAuthenticatedCustomer();
    const res = await POST(
      createRequest({ ...VALID_BUNDLE_BODY, purchaseShape: "bundle_999" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Unsupported purchaseShape");
  });

  it("returns 400 when currency is not supported", async () => {
    mockAuthenticatedCustomer();
    const res = await POST(
      createRequest({ ...VALID_BUNDLE_BODY, currency: "jpy" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Unsupported currency");
  });

  // ── Product lookup / shape × billing_mode × product_type guards ───

  it("returns 404 when the product is not found", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: null });
    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    expect(res.status).toBe(404);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when 'free' shape is sent for a paid product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BUNDLE_BODY, purchaseShape: "free" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe(
      "Only free products accept the 'free' purchase shape",
    );
  });

  it("returns 400 when a paid shape is sent for a free product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_EVENT });
    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Paid purchase shapes only apply to paid products");
  });

  it("returns 400 when single_payment is sent for a consumer_club", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BUNDLE_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Consumer clubs use bundles or subscriptions");
  });

  it("returns 400 when a bundle is sent for a non-club product type", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Only consumer clubs accept bundles or subscriptions");
  });

  // ── RPC outcomes that short-circuit Stripe ────────────────────────

  it("returns status='full' when create_participation_v2 reports the seat is gone", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({ data: { kind: "full" }, error: null });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ status: "full" });
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
  });

  it("returns status='free_confirmed' when the RPC returns free_active for a free product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_EVENT });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active", participation_id: RESERVATION_ID },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        gamerId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "free_confirmed",
      participationId: RESERVATION_ID,
    });
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith("create_participation_v2", {
      p_product_id: PRODUCT_ID,
      p_gamer_id: GAMER_ID,
      p_customer_id: CUSTOMER_ID,
      p_purchase_shape: "free",
      p_currency: "eur",
    });
  });

  it("returns 409 when the RPC raises a unique-violation (23505)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate active participation" },
    });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("duplicate active participation");
  });

  it("returns 400 when the RPC errors with another code", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "check_violation: not parent of gamer" },
    });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    expect(res.status).toBe(400);
  });

  // ── Bundle redirect path ──────────────────────────────────────────

  it("creates a Stripe Checkout session for a bundle and returns the redirect URL", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeBundleAmount.mockResolvedValue(3800);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_bundle",
    });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "redirect",
      checkoutUrl: "https://checkout.stripe.com/c/test_bundle",
    });

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.customer).toBe(STRIPE_CUSTOMER_ID);
    expect(params.adaptive_pricing).toEqual({ enabled: false });
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: 3800,
        product_data: { name: "Test Club — 4-session bundle" },
      },
    });
    expect(params.metadata).toEqual({
      reservationId: RESERVATION_ID,
      customerId: CUSTOMER_ID,
      gamerId: GAMER_ID,
      productId: PRODUCT_ID,
      purchaseShape: "bundle_4",
      currency: "eur",
    });
    expect(params.success_url).toBe(
      `http://localhost:3000/clubs/${PRODUCT_ID}?signup=success`,
    );
    expect(params.cancel_url).toBe(
      `http://localhost:3000/clubs/${PRODUCT_ID}?signup=canceled`,
    );
    // expires_at sits ~30 minutes in the future (Stripe enforces a 30-min floor).
    expect(params.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(mockComputeBundleAmount).toHaveBeenCalledWith(
      expect.anything(),
      PRODUCT_ID,
      4,
      "eur",
    );
  });

  it("rolls the reservation back when the product has no price in the requested currency (bundle)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockComputeBundleAmount.mockResolvedValue(null);

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Product is not sold in eur");
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  it("rolls the reservation back when Stripe returns a session without a URL", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockComputeBundleAmount.mockResolvedValue(3800);
    mockStripeSessionCreate.mockResolvedValue({ url: null });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Stripe did not return a Checkout URL");
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  // ── Single-payment redirect path ──────────────────────────────────

  it("creates a single_payment checkout session for a camp", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_camp",
    });

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "single_payment",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("redirect");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data).toMatchObject({
      currency: "eur",
      unit_amount: 15000,
      product_data: { name: "Test Club" },
    });
    // Camps land on /camps/[id], not /clubs/[id].
    expect(params.success_url).toContain(`/camps/${PRODUCT_ID}?signup=success`);
  });

  // ── Subscription paths ───────────────────────────────────────────

  it("creates a subscription checkout session when no live family sub exists", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB, existingFamSub: null });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      frequency: "monthly",
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_sub",
    });

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("redirect");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0]).toEqual({
      quantity: 1,
      price: STRIPE_PRICE_ID,
    });
    // Sub metadata is mirrored onto subscription_data so the webhook can find
    // the reservation when invoice.paid fires before checkout.session.completed.
    expect(params.subscription_data).toEqual({ metadata: params.metadata });
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("treats a 'canceled' family sub as no live sub and falls through to Checkout", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({
      product: PAID_CLUB,
      existingFamSub: {
        id: FAMILY_SUB_ROW_ID,
        stripe_subscription_id: "sub_dead",
        status: "canceled",
      },
    });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      frequency: "monthly",
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_resub",
    });

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockStripeSessionCreate).toHaveBeenCalled();
  });

  it("inline-adds to a live family sub and confirms the reservation synchronously", async () => {
    mockAuthenticatedCustomer();
    const inserts = mockAdmin({
      product: PAID_CLUB,
      existingFamSub: {
        id: FAMILY_SUB_ROW_ID,
        stripe_subscription_id: "sub_live_1",
        status: "active",
      },
    });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { kind: "confirmed" },
        error: null,
      });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      frequency: "monthly",
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSubscriptionsUpdate.mockResolvedValue({
      id: "sub_live_1",
      items: {
        data: [
          { id: "si_existing", price: { id: "price_other" } },
          { id: "si_new", price: { id: STRIPE_PRICE_ID } },
        ],
      },
    });

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "subscribed",
      participationId: RESERVATION_ID,
    });
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();

    // Stripe sub update was called with always_invoice + error_if_incomplete
    // so a card decline aborts the call (instead of leaving the new item dangling).
    const updateArgs = mockStripeSubscriptionsUpdate.mock.calls[0];
    expect(updateArgs[0]).toBe("sub_live_1");
    expect(updateArgs[1]).toMatchObject({
      items: [{ price: STRIPE_PRICE_ID }],
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
    expect(updateArgs[1].metadata).toMatchObject({
      reservationId: RESERVATION_ID,
      customerId: CUSTOMER_ID,
      gamerId: GAMER_ID,
      productId: PRODUCT_ID,
    });

    // confirm_reservation_v2 was called with credits_to_grant=0 — the webhook
    // has no work to do for the inline-add path; the family sub link row is
    // written here in the route.
    expect(mockAdminRpc).toHaveBeenNthCalledWith(2, "confirm_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
      p_credits_to_grant: 0,
    });

    expect(inserts.family_subscription_items_v2).toHaveLength(1);
    expect(inserts.family_subscription_items_v2[0]).toMatchObject({
      family_subscription_id: FAMILY_SUB_ROW_ID,
      participation_id: RESERVATION_ID,
      stripe_subscription_item_id: "si_new",
      stripe_price_id: STRIPE_PRICE_ID,
    });
  });

  it("returns 402 and rolls back when the inline-add card declines", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({
      product: PAID_CLUB,
      existingFamSub: {
        id: FAMILY_SUB_ROW_ID,
        stripe_subscription_id: "sub_live_1",
        status: "active",
      },
    });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      frequency: "monthly",
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSubscriptionsUpdate.mockRejectedValue(
      new StripeCardErrorCtor("Your card was declined."),
    );

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(402);
    expect(data.error).toBe("Your card was declined.");
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  it("returns 502 and rolls back when the inline-add hits a non-card error", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({
      product: PAID_CLUB,
      existingFamSub: {
        id: FAMILY_SUB_ROW_ID,
        stripe_subscription_id: "sub_live_1",
        status: "past_due",
      },
    });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      frequency: "monthly",
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSubscriptionsUpdate.mockRejectedValue(
      new Error("stripe API down"),
    );

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    // Generic error message — we don't leak internal details.
    expect(data.error).toBe("Could not add to your subscription. Please try again.");
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  it("rolls back and returns 400 when the product is not sold in the requested currency (sub branch)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB, existingFamSub: null });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue(null);

    const res = await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        purchaseShape: "subscription_monthly",
        currency: "gbp",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Product is not sold in gbp");
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation_v2", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  // ── Defensive: unexpected RPC return shapes ───────────────────────

  it("returns 500 when RPC returns free_active without a participation_id", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_EVENT });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active" },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        gamerId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC returns reserving without a participation_id", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving" },
      error: null,
    });

    const res = await POST(createRequest(VALID_BUNDLE_BODY));
    expect(res.status).toBe(500);
  });

  // ── returnPath sanitization ───────────────────────────────────────

  it("uses the provided returnPath for the cancel URL when it starts with /", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeBundleAmount.mockResolvedValue(3800);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/x",
    });

    await POST(
      createRequest({ ...VALID_BUNDLE_BODY, returnPath: "/clubs/listing" }),
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.cancel_url).toBe(
      "http://localhost:3000/clubs/listing?signup=canceled",
    );
  });

  it("falls back to /clubs/[id] when returnPath does not start with /", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeBundleAmount.mockResolvedValue(3800);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/x",
    });

    await POST(
      createRequest({
        ...VALID_BUNDLE_BODY,
        returnPath: "https://evil.example.com",
      }),
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.cancel_url).toBe(
      `http://localhost:3000/clubs/${PRODUCT_ID}?signup=canceled`,
    );
  });
});
