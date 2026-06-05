import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/products/create/route";
import { NextResponse } from "next/server";

// --- Stripe mock ---
//
// The route's only Stripe call is `checkout.sessions.create` — every paid
// signup (single-payment AND subscription) goes through hosted Checkout now.
// There is no `subscriptions.update` inline-add path anymore.

const { mockStripeSessionCreate } = vi.hoisted(() => ({
  mockStripeSessionCreate: vi.fn(),
}));

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      checkout: { sessions: { create: mockStripeSessionCreate } },
    };
  }) as unknown as typeof import("stripe").default;
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
// Stub the I/O helpers so we can drive failure paths cleanly.

const mockGetOrCreateStripeCustomer = vi.fn();
const mockGetOrCreateSubscriptionPrice = vi.fn();
const mockComputeSinglePaymentAmount = vi.fn();

vi.mock("@/lib/stripe/participation-prices", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/stripe/participation-prices")>();
  return {
    ...actual,
    getOrCreateSubscriptionPrice: (...args: unknown[]) =>
      mockGetOrCreateSubscriptionPrice(...args),
    computeSinglePaymentAmount: (...args: unknown[]) =>
      mockComputeSinglePaymentAmount(...args),
  };
});

// getOrCreateStripeCustomer moved to its own module (customer concern, not a
// pricing one); it's the I/O boundary the checkout route hits, so stub it.
vi.mock("@/lib/stripe/customer", () => ({
  getOrCreateStripeCustomer: (...args: unknown[]) =>
    mockGetOrCreateStripeCustomer(...args),
}));

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const RESERVATION_ID = "44444444-4444-4444-4444-444444444444";
const STRIPE_CUSTOMER_ID = "cus_test_customer";
const STRIPE_PRICE_ID = "price_test_monthly";
const GAMER_FIRST_NAME = "Liam";

type ProductFixture = {
  id: string;
  product_type: "consumer_club" | "municipality_club" | "camp" | "event";
  billing_mode: "paid" | "free";
  seat_count: number | null;
  timezone: string;
  product_translations: { locale: string; name: string }[];
};

const PAID_CLUB: ProductFixture = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  seat_count: 10,
  timezone: "Europe/Helsinki",
  product_translations: [{ locale: "en", name: "Test Club" }],
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

type AdminMockOptions = {
  product?: ProductFixture | null;
  productErr?: { message: string } | null;
  /** Gamer profile returned for the subscription-description lookup. */
  gamer?: { first_name: string | null; username: string | null } | null;
};

function mockAdmin(opts: AdminMockOptions = {}): void {
  const gamer =
    opts.gamer ?? { first_name: GAMER_FIRST_NAME, username: null };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "products") {
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
    if (table === "profiles") {
      // Subscription branch looks up the gamer's name for the Stripe sub
      // description (what the parent sees in the billing portal).
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: gamer, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table in admin mock: ${table}`);
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

// Default body is a subscription on the consumer club — most direct-use
// tests mock PAID_CLUB, and subscription_monthly is the valid paid shape
// there. Single-payment tests override purchaseShape + product to a camp.
const VALID_BODY = {
  productId: PRODUCT_ID,
  gamerId: GAMER_ID,
  purchaseShape: "subscription_monthly",
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
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-customer roles", async () => {
    for (const role of ["gamer", "gedu", "admin"]) {
      mockForbidden(role);
      const res = await POST(createRequest(VALID_BODY));
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
    ["productId", { gamerId: GAMER_ID, purchaseShape: "subscription_monthly", currency: "eur" }],
    ["gamerId", { productId: PRODUCT_ID, purchaseShape: "subscription_monthly", currency: "eur" }],
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
    // bundle_4 used to be a valid shape; bundles are gone, so the route now
    // rejects it as an unsupported shape.
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "bundle_4" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Unsupported purchaseShape");
  });

  it("returns 400 when currency is not supported", async () => {
    mockAuthenticatedCustomer();
    const res = await POST(
      createRequest({ ...VALID_BODY, currency: "jpy" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Unsupported currency");
  });

  // ── Product lookup / shape × billing_mode × product_type guards ───

  it("returns 404 when the product is not found", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: null });
    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when 'free' shape is sent for a paid product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "free" }),
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
    const res = await POST(createRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Paid purchase shapes only apply to paid products");
  });

  it("returns 400 when single_payment is sent for a consumer_club", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Consumer clubs use subscriptions, not single-payment");
  });

  it("returns 400 when a subscription is sent for a non-club product type", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    const res = await POST(createRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Only consumer clubs accept subscriptions");
  });

  // ── RPC outcomes that short-circuit Stripe ────────────────────────

  it("returns status='full' when create_participation reports the seat is gone", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({ data: { kind: "full" }, error: null });

    const res = await POST(createRequest(VALID_BODY));
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
    expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
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

    const res = await POST(createRequest(VALID_BODY));
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

    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  // ── Single-payment redirect path ──────────────────────────────────

  it("creates a Stripe Checkout session for a single_payment camp and returns the redirect URL", async () => {
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
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "redirect",
      checkoutUrl: "https://checkout.stripe.com/c/test_camp",
    });

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.customer).toBe(STRIPE_CUSTOMER_ID);
    // Adaptive Pricing presents the customer's local currency; we settle EUR.
    expect(params.adaptive_pricing).toEqual({ enabled: true });
    // One-time payments offer to save the card for future purchases.
    expect(params.saved_payment_method_options).toEqual({
      payment_method_save: "enabled",
    });
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: 15000,
        product_data: { name: "Test Club" },
      },
    });
    expect(params.metadata).toEqual({
      reservationId: RESERVATION_ID,
      customerId: CUSTOMER_ID,
      gamerId: GAMER_ID,
      productId: PRODUCT_ID,
      purchaseShape: "single_payment",
      currency: "eur",
    });
    // Every product type lands on the unified /shop/[id] detail route.
    expect(params.success_url).toBe(
      `http://localhost:3000/shop/${PRODUCT_ID}?signup=success`,
    );
    // No returnPath in the body → cancel_url falls back to homepage.
    // (Real frontend always sends window.location.pathname, so happy-path
    // browser flows use that and never hit this fallback.)
    expect(params.cancel_url).toBe(
      "http://localhost:3000/?signup=canceled",
    );
    // expires_at sits ~30 minutes in the future (Stripe enforces a 30-min floor).
    expect(params.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(mockComputeSinglePaymentAmount).toHaveBeenCalledWith(
      expect.anything(),
      PRODUCT_ID,
      "eur",
    );
  });

  it("rolls the reservation back when the product has no price in the requested currency (single_payment)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockComputeSinglePaymentAmount.mockResolvedValue(null);

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Product is not sold in eur");
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  it("rolls the reservation back when Stripe returns a session without a URL", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({ url: null });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Stripe did not return a Checkout URL");
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation", {
      p_reservation_id: RESERVATION_ID,
    });
  });

  // ── Subscription path — always Stripe Checkout ────────────────────

  it("creates a subscription checkout session for a consumer club", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_sub",
    });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "subscription_monthly" }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    // Even with a card on file the parent always lands on hosted Checkout.
    expect(data.status).toBe("redirect");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0]).toEqual({
      quantity: 1,
      price: STRIPE_PRICE_ID,
    });
    // Sub metadata is mirrored onto subscription_data so the webhook can find
    // the reservation, and a per-sub description ("{Club} — {Child}") makes each
    // of a family's subs distinguishable in the hosted billing portal.
    expect(params.subscription_data).toEqual({
      metadata: params.metadata,
      description: `Test Club — ${GAMER_FIRST_NAME}`,
    });
  });

  it("rolls back and returns 400 when the product is not sold in the requested currency (sub branch)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "reserving", participation_id: RESERVATION_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { kind: "expired" }, error: null });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue(null);

    const res = await POST(
      createRequest({
        ...VALID_BODY,
        purchaseShape: "subscription_monthly",
        currency: "eur",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Product is not sold in eur");
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenLastCalledWith("expire_reservation", {
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

    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  // ── returnPath sanitization ───────────────────────────────────────

  it("uses the provided returnPath for the cancel URL when it starts with /", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/x",
    });

    await POST(
      createRequest({
        ...VALID_BODY,
        purchaseShape: "single_payment",
        returnPath: "/clubs/listing",
      }),
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.cancel_url).toBe(
      "http://localhost:3000/clubs/listing?signup=canceled",
    );
  });

  it("falls back to homepage when returnPath does not start with /", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/x",
    });

    await POST(
      createRequest({
        ...VALID_BODY,
        purchaseShape: "single_payment",
        returnPath: "https://evil.example.com",
      }),
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.cancel_url).toBe(
      "http://localhost:3000/?signup=canceled",
    );
  });

  it("rejects protocol-relative returnPath like //evil.com/path and falls back to homepage", async () => {
    // `//evil.com/path` passes a naïve startsWith("/") check but produces
    // `https://localhost:3000//evil.com/path` which most browsers parse as
    // an absolute URL to evil.com — open redirect after Stripe's redirect.
    // The abnormal path always lands on the homepage, never on a guessed
    // product page; the user is somewhere safe and familiar.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving", participation_id: RESERVATION_ID },
      error: null,
    });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/x",
    });

    await POST(
      createRequest({
        ...VALID_BODY,
        purchaseShape: "single_payment",
        returnPath: "//evil.com/path",
      }),
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.cancel_url).toBe(
      "http://localhost:3000/?signup=canceled",
    );
  });
});
