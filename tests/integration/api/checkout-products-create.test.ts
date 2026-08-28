import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fromZonedTime } from "date-fns-tz";

// The confirmation mail's My SOG link comes from getOrigin(), which falls back
// to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { POST } from "@/app/api/checkout/products/create/route";
import { NextResponse } from "next/server";

// The route builds every absolute URL it emits — the Stripe redirects, the
// metadata links a Stripe Workflow drops into Slack, and the confirmation
// mail's links — via getOrigin(), which falls back to NEXT_PUBLIC_SITE_URL
// for an untrusted Host. A fake value keeps the suite hermetic and gives the
// spoofed-Host test something to assert. The default `localhost:3000` Host
// these mock requests carry is trusted in a non-production build, so every
// other test still sees the localhost origin.
const TRUSTED_ORIGIN = "https://test.sogverse.local";
process.env.NEXT_PUBLIC_SITE_URL = TRUSTED_ORIGIN;

// --- Brevo mock ---
//
// The two no-charge outcomes confirm themselves by email; every paid one is
// confirmed from the Stripe webhook instead, once the money has actually
// arrived.

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

// --- The post-response hook ---
//
// The seat is committed before the mail is attempted, so the send is handed to
// the platform's post-response hook rather than awaited inside the answer — the
// parent's click never waits on Brevo. Capture the deferred work instead of
// letting the hook run it, so these tests can assert the route deferred and
// then settle the send deliberately.
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

// --- Stripe mock ---
//
// The route's only direct Stripe call is `checkout.sessions.create` — every
// paid signup (single-payment AND subscription) goes through hosted Checkout
// now. There is no `subscriptions.update` inline-add path anymore. The Stripe
// Product lookup the one-off branch now makes is stubbed at its own module
// boundary below, alongside the other I/O helpers.

const { stripeMock } = await vi.hoisted(async () => ({
  stripeMock: (await import("../../mocks/stripe")).createStripeMock(),
}));

vi.mock("stripe", async () =>
  (await import("../../mocks/stripe")).stripeModuleMock(stripeMock),
);

const mockStripeSessionCreate = stripeMock.checkout.sessions.create;

// --- Auth + Supabase admin mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
/** Records the arguments the products select's `.order()` was called with. */
const mockProductsOrder = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

// --- participation-prices helpers ---
//
// Stub the I/O helpers so we can drive failure paths cleanly.

const mockGetOrCreateStripeCustomer = vi.fn();
const mockGetOrCreateSubscriptionPrice = vi.fn();
const mockComputeSinglePaymentAmount = vi.fn();
const mockEnsureStripeProductForProduct = vi.fn();

vi.mock("@/lib/stripe/participation-prices", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/stripe/participation-prices")>();
  return {
    ...actual,
    getOrCreateSubscriptionPrice: (...args: unknown[]) =>
      mockGetOrCreateSubscriptionPrice(...args),
    computeSinglePaymentAmount: (...args: unknown[]) =>
      mockComputeSinglePaymentAmount(...args),
    ensureStripeProductForProduct: (...args: unknown[]) =>
      mockEnsureStripeProductForProduct(...args),
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
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";
const STRIPE_CUSTOMER_ID = "cus_test_customer";
const STRIPE_PRICE_ID = "price_test_monthly";
const STRIPE_PRODUCT_ID = "prod_test_product";
const GAMER_FIRST_NAME = "Liam";

type ProductFixture = {
  id: string;
  product_type: "consumer_club" | "municipality_club" | "camp" | "event";
  billing_mode: "paid" | "free" | "external_contract";
  seat_count: number | null;
  timezone: string;
  spoken_language_code: string;
  start_date: string | null;
  end_date: string | null;
  product_translations: { locale: string; name: string }[];
};

const PAID_CLUB: ProductFixture = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  seat_count: 10,
  timezone: "Europe/Helsinki",
  spoken_language_code: "en",
  // A club's end date is nullable (a check constraint forces one for every
  // other type), which is also the case that has to omit its metadata key.
  //
  // The start date is deliberately in the **past**, and deliberately a fixed
  // one: a consumer club whose start date is still ahead defers its first
  // charge (a billing anchor on the session), so a "future" fixture date would
  // quietly add two parameters to every subscription assertion below — and
  // would flip behaviour the day the wall clock passed it. The deferred cases
  // get their own fixtures and their own frozen clock further down.
  start_date: "2024-09-01",
  end_date: null,
  product_translations: [{ locale: "en", name: "Test Club" }],
};

const PAID_CAMP: ProductFixture = {
  ...PAID_CLUB,
  product_type: "camp",
  spoken_language_code: "fi",
  start_date: "2026-08-03",
  end_date: "2026-08-07",
};

const FREE_EVENT: ProductFixture = {
  ...PAID_CLUB,
  product_type: "event",
  billing_mode: "free",
};

const MUNI_CLUB: ProductFixture = {
  ...PAID_CLUB,
  product_type: "municipality_club",
  billing_mode: "external_contract",
};

// A consumer club that costs nothing. Billing is a per-product choice on every
// type now, so this combination is ordinary rather than exotic — and it is the
// one that has to be shown passing the route, because the route's two
// *type*-keyed guards both name `consumer_club`.
const FREE_CLUB: ProductFixture = {
  ...PAID_CLUB,
  product_type: "consumer_club",
  billing_mode: "free",
};

// --- Mock builders ---

type AdminMockOptions = {
  product?: ProductFixture | null;
  productErr?: { message: string } | null;
  /** Gamer profile returned for the subscription-description lookup. */
  gamer?: { first_name: string | null } | null;
};

function mockAdmin(opts: AdminMockOptions = {}): void {
  const gamer = opts.gamer ?? { first_name: GAMER_FIRST_NAME };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "products") {
      return {
        select: () => ({
          eq: () => ({
            // `.order("locale", { referencedTable: "product_translations" })`
            // sits between the filter and `.single()`: embedded translations
            // come back unordered otherwise, and the name a product without an
            // English translation resolves to would be arbitrary.
            order: (...args: unknown[]) => {
              mockProductsOrder(...args);
              return {
                single: () =>
                  Promise.resolve(
                    opts.product
                      ? { data: opts.product, error: null }
                      : {
                          data: null,
                          error: opts.productErr ?? { message: "not found" },
                        },
                  ),
              };
            },
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          // Subscription branch looks up the gamer's name for the Stripe sub
          // description (what the parent sees in the billing portal).
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: gamer, error: null }),
          }),
          // The confirmation mail reads the payer and the participant in one
          // query — on a self seat they are the same row.
          in: () =>
            Promise.resolve({
              data: [
                {
                  id: CUSTOMER_ID,
                  first_name: "Marja",
                  email: "parent@example.test",
                  locale: "en",
                },
                {
                  id: GAMER_ID,
                  first_name: gamer.first_name ?? GAMER_FIRST_NAME,
                  email: null,
                  locale: null,
                },
              ],
              error: null,
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

function mockAuthenticatedCustomer(locale: string | null = null) {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: { role: "customer", locale },
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
  participantId: GAMER_ID,
  purchaseShape: "subscription_monthly",
  currency: "eur",
};

// --- Tests ---

describe("POST /api/checkout/products/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockGetOrCreateStripeCustomer.mockResolvedValue(STRIPE_CUSTOMER_ID);
    mockEnsureStripeProductForProduct.mockResolvedValue(STRIPE_PRODUCT_ID);
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
  });

  afterEach(settleDeferred);

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
    expect(data.error).toBe("Invalid JSON body");
  });

  it.each([
    [
      "productId",
      {
        participantId: GAMER_ID,
        purchaseShape: "subscription_monthly",
        currency: "eur",
      },
    ],
    [
      "participantId",
      {
        productId: PRODUCT_ID,
        purchaseShape: "subscription_monthly",
        currency: "eur",
      },
    ],
    [
      "purchaseShape",
      { productId: PRODUCT_ID, participantId: GAMER_ID, currency: "eur" },
    ],
  ])("returns 400 when %s is missing", async (_field, body) => {
    mockAuthenticatedCustomer();
    const res = await POST(createRequest(body));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("Required");
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
    expect(data.error).toContain("purchaseShape");
  });

  it("returns 400 when currency is not supported", async () => {
    mockAuthenticatedCustomer();
    const res = await POST(createRequest({ ...VALID_BODY, currency: "jpy" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("currency");
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

  it("returns 400 when the 'external' shape is sent for a non-external product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "external" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe(
      "Only externally-contracted products accept the 'external' purchase shape",
    );
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when a paid shape is sent for an external (municipality) product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: MUNI_CLUB });
    const res = await POST(createRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Paid purchase shapes only apply to paid products");
  });

  it("returns 400 when the 'free' shape is sent for an external (municipality) product", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: MUNI_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "free" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe(
      "Only free products accept the 'free' purchase shape",
    );
  });

  it("returns 400 when single_payment is sent for a consumer_club", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe(
      "Consumer clubs use subscriptions, not single-payment",
    );
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
      data: { kind: "free_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "free_confirmed",
      participationId: PARTICIPATION_ID,
    });
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
      p_customer_id: CUSTOMER_ID,
      p_purchase_shape: "free",
      p_currency: "eur",
    });
  });

  it("hands the ticked consent documents to the RPC, untouched", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_EVENT });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
        consentedDocuments: ["roblox-programme-terms"],
      }),
    );

    // Passed straight through and never checked here: the RPC compares them
    // against the product's requirement set under the same product-gate lock
    // as every other signup rule, and refuses with a check violation naming
    // whatever is missing.
    const args = mockAdminRpc.mock.calls[0][1];
    expect(args.p_consented_documents).toEqual(["roblox-programme-terms"]);
  });

  it("omits the argument when the client sent no consents at all", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_EVENT });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );

    // An absent field and an empty array are the same claim, so the omission
    // reaches the RPC's DEFAULT NULL rather than being turned into a 400 that
    // says less than the database's own refusal would.
    const args = mockAdminRpc.mock.calls[0][1];
    expect(args.p_consented_documents).toBeUndefined();
  });

  // ── Free consumer club ────────────────────────────────────────────
  //
  // The route resolves the purchase shape's coherence with `billing_mode`
  // first, and only then branches on `product_type`. That ordering is what
  // makes a free club work without touching either type guard: `free` is
  // neither `single_payment` nor a `subscription_*` shape, so both guards are
  // structurally unreachable on this request. They are still correct for the
  // paid shapes — a *paid* club must be a subscription, and only a club may be
  // one — so they are keyed on type deliberately and must not be re-keyed to
  // billing. These two tests pin that reasoning rather than the outcome alone:
  // the first shows the free club reaching the RPC at all, the second shows the
  // guards' error strings never appearing on the way.

  it("lets a free consumer club through to the RPC and confirms it without Stripe", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "free_confirmed",
      participationId: PARTICIPATION_ID,
    });
    // A free signup activates in the RPC and never reaches Stripe — same path
    // a free event takes, because the whole enrollment flow branches on
    // billing_mode, not on product_type.
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
      p_customer_id: CUSTOMER_ID,
      p_purchase_shape: "free",
      p_currency: "eur",
    });
  });

  it("never reaches the consumer-club type guards on a free shape", async () => {
    // The inertness stated directly: whatever else could go wrong for a free
    // club, it cannot be either of the sentences those guards produce.
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "free_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    const body = JSON.stringify(await res.json());

    expect(body).not.toContain("Consumer clubs use subscriptions");
    expect(body).not.toContain("Only consumer clubs accept subscriptions");
    // And the guards are still live for the paid shapes on the same type —
    // asserted by the two tests above, which drive them from a paid club.
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
  });

  it("still refuses a paid shape on a free consumer club", async () => {
    // The coherence check that *does* fire here, and the reason the free branch
    // is safe: a club whose billing is free cannot be bought as a subscription.
    mockAuthenticatedCustomer();
    mockAdmin({ product: FREE_CLUB });

    const res = await POST(createRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Paid purchase shapes only apply to paid products");
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns status='external_confirmed' for a municipality club, with no Stripe call", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: MUNI_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "external_active", participation_id: PARTICIPATION_ID },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "external",
        currency: "eur",
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      status: "external_confirmed",
      participationId: PARTICIPATION_ID,
    });
    // Municipality clubs are invoiced off-platform — never touch Stripe.
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
      p_customer_id: CUSTOMER_ID,
      p_purchase_shape: "external",
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

  it("does not disclose the consent refusal, and answers with a code instead", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23514",
        message:
          "this product requires consent to roblox-privacy-policy before enrolling",
      },
    });

    const res = await POST(createRequest(VALID_BODY));
    const data = await res.json();

    // This route discloses the RPC's refusals verbatim, and this is the one it
    // must not: it names raw document slugs and describes a requirement the
    // parent's screen has not caught up with. The slug in particular must not
    // survive.
    expect(res.status).toBe(400);
    expect(data.error).not.toContain("roblox-privacy-policy");
    expect(data.error).not.toContain("requires consent");
    // The code is what the panel acts on — it refetches the product so the new
    // document appears and the retry is a different request.
    expect(data.code).toBe("consent_documents_required");
  });

  // ── Single-payment redirect path ──────────────────────────────────

  it("creates a Stripe Checkout session for a single_payment camp and returns the redirect URL", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
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
    // Checkout shows the "Add promotion code" field (codes live in the Stripe
    // dashboard).
    expect(params.allow_promotion_codes).toBe(true);
    // One-time payments offer to save the card for future purchases.
    expect(params.saved_payment_method_options).toEqual({
      payment_method_save: "enabled",
    });
    expect(params.line_items).toHaveLength(1);
    // The price stays inline (the amount varies by currency and discount) but
    // it now points at the real Stripe Product rather than carrying an inline
    // product name. That Product is what holds the tax code deciding the VAT
    // rate — without one, Stripe fell back to the account-wide default and
    // charged camps the standard 25.5% instead of the reduced 13.5%.
    expect(params.line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: 15000,
        product: STRIPE_PRODUCT_ID,
        tax_behavior: "inclusive",
      },
    });
    expect(params.line_items[0].price_data).not.toHaveProperty("product_data");
    expect(mockEnsureStripeProductForProduct).toHaveBeenCalledWith(PAID_CAMP);
    // The session metadata is the only link between this session and the
    // participation the webhook will create — there is no reservation id,
    // because there is no row yet. Its camelCase keys are read by the webhook
    // and the confirmation page, so the finance keys added below are a separate
    // set on separate objects rather than a rename of these.
    //
    // `productName`, `productType` and the three URLs are read by nothing of
    // ours: a Stripe Workflow builds the internal Slack notification from them.
    // The URLs arrive finished because a Workflow cannot map a product type onto
    // a URL shape — `/admin/camps/[id]` here, and the club case below asserts
    // the *other* shape off the same code, which is what pins the mapping to
    // `ROUTES.admin.product` rather than to a copy in the Dashboard.
    expect(params.metadata).toEqual({
      customerId: CUSTOMER_ID,
      participantId: GAMER_ID,
      productId: PRODUCT_ID,
      productName: "Test Club",
      productType: "camp",
      adminProductUrl: `http://localhost:3000/admin/camps/${PRODUCT_ID}`,
      adminUserUrl: `http://localhost:3000/admin/users/${CUSTOMER_ID}`,
      shopProductUrl: `http://localhost:3000/shop/${PRODUCT_ID}`,
      purchaseShape: "single_payment",
      currency: "eur",
    });
    // Stripe metadata does not propagate between objects, and a charge is the
    // one thing that inherits — from its payment intent. So the finance
    // snapshot goes on the intent and, separately, on the invoice.
    const purchaseMetadata = {
      product_id: PRODUCT_ID,
      participant_id: GAMER_ID,
      customer_id: CUSTOMER_ID,
      locale: "en",
      spoken_language_code: "fi",
      delivery_start: "2026-08-03",
      delivery_end: "2026-08-07",
    };
    expect(params.payment_intent_data).toEqual({ metadata: purchaseMetadata });
    // The invoice is the refund fix: a Stripe Refund carries no tax and no
    // discount fields, and a credit note — which carries both — needs an
    // invoice to exist.
    expect(params.invoice_creation).toEqual({
      enabled: true,
      invoice_data: { metadata: purchaseMetadata },
    });
    // Success lands on the confirmation page keyed by the Checkout Session.
    // `{CHECKOUT_SESSION_ID}` is Stripe's literal placeholder and has to reach
    // Stripe unencoded.
    expect(params.success_url).toBe(
      "http://localhost:3000/shop/confirmation?session_id={CHECKOUT_SESSION_ID}",
    );
    // Cancel bounces straight back to the product page so the parent can retry.
    expect(params.cancel_url).toBe(`http://localhost:3000/shop/${PRODUCT_ID}`);
    // `expires_at` no longer pins a reservation lifetime — nothing is held — but
    // it still bounds a stale tab, because the Session freezes the amount at
    // creation. Thirty minutes is Stripe's floor; assert the window rather than
    // an exact second, since the clock moves between the call and the assertion.
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(params.expires_at).toBeGreaterThan(nowSeconds + 29 * 60);
    expect(params.expires_at).toBeLessThanOrEqual(nowSeconds + 30 * 60);
    expect(mockComputeSinglePaymentAmount).toHaveBeenCalledWith(
      expect.anything(),
      PRODUCT_ID,
      "eur",
    );
  });

  it("returns 400 and writes nothing when the product has no price in the requested currency (single_payment)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
    mockComputeSinglePaymentAmount.mockResolvedValue(null);

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Product is not sold in eur");
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    // create_participation is the only RPC this route makes: validation wrote
    // nothing, so there is nothing to unwind.
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
  });

  it("reports a server fault plainly when anything in the checkout block throws", async () => {
    // There is nothing to reclaim on this path any more; what the block still
    // owes the parent is a deliberate status and a message that isn't raw
    // database text (this route discloses its error messages).
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
    // Once, not persistently: clearAllMocks() resets calls but keeps
    // implementations, so a lingering rejection would leak into later tests.
    mockComputeSinglePaymentAmount.mockRejectedValueOnce(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    );

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    // A server fault, reported as one — not the raw database text, and not the
    // misleading status a Postgres error code would otherwise be mapped to.
    expect(res.status).toBe(500);
    expect(data.error).not.toContain("statement timeout");
  });

  it("answers 500 without leaking Stripe's text when the session call fails", async () => {
    // The likeliest failure in the block: Stripe outage, rate limit or invalid
    // param.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockRejectedValueOnce(
      Object.assign(new Error("No such customer: cus_missing"), {
        code: "resource_missing",
      }),
    );

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).not.toContain("No such customer");
  });

  it("returns 502 when Stripe returns a session without a URL", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockStripeSessionCreate.mockResolvedValue({ url: null });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Stripe did not return a Checkout URL");
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
  });

  // ── Subscription path — always Stripe Checkout ────────────────────

  it("creates a subscription checkout session for a consumer club", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
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
    // The session and the subscription no longer share one metadata object.
    // The session keeps exactly its camelCase keys (the webhook and the
    // confirmation page read those), and the subscription carries them *plus*
    // the finance snapshot — because nothing propagates from a session to the
    // subscription it created. A per-sub description ("{Club} — {Child}") makes
    // each of a family's subs distinguishable in the hosted billing portal.
    //
    // The admin product URL is `/admin/consumer-clubs/[id]` here against the
    // camp case's `/admin/camps/[id]` — same code path, two shapes, which is the
    // assertion that the type→path mapping is still being read out of
    // `ROUTES.admin.product` and not assembled from a template.
    expect(params.metadata).toEqual({
      customerId: CUSTOMER_ID,
      participantId: GAMER_ID,
      productId: PRODUCT_ID,
      productName: "Test Club",
      productType: "consumer_club",
      adminProductUrl: `http://localhost:3000/admin/consumer-clubs/${PRODUCT_ID}`,
      adminUserUrl: `http://localhost:3000/admin/users/${CUSTOMER_ID}`,
      shopProductUrl: `http://localhost:3000/shop/${PRODUCT_ID}`,
      purchaseShape: "subscription_monthly",
      currency: "eur",
    });
    expect(params.subscription_data).toEqual({
      metadata: {
        customerId: CUSTOMER_ID,
        participantId: GAMER_ID,
        productId: PRODUCT_ID,
        productName: "Test Club",
        productType: "consumer_club",
        adminProductUrl: `http://localhost:3000/admin/consumer-clubs/${PRODUCT_ID}`,
        adminUserUrl: `http://localhost:3000/admin/users/${CUSTOMER_ID}`,
        shopProductUrl: `http://localhost:3000/shop/${PRODUCT_ID}`,
        purchaseShape: "subscription_monthly",
        currency: "eur",
        product_id: PRODUCT_ID,
        participant_id: GAMER_ID,
        customer_id: CUSTOMER_ID,
        locale: "en",
        spoken_language_code: "en",
        // A consumer club is the one type whose end date may be null, and a
        // null date omits its key rather than sending an empty one.
        delivery_start: "2024-09-01",
      },
      description: `Test Club — ${GAMER_FIRST_NAME}`,
    });
    expect(params.subscription_data.metadata).not.toHaveProperty(
      "delivery_end",
    );
    // An already-started club charges at checkout, exactly as before deferred
    // billing existed — no anchor, no proration override.
    expect(params.subscription_data).not.toHaveProperty("billing_cycle_anchor");
    expect(params.subscription_data).not.toHaveProperty("proration_behavior");
    // A subscription checkout resolves its Stripe Product through the price
    // cache, which returns early when the cached amount still matches — so the
    // route must not reach for one itself.
    expect(mockEnsureStripeProductForProduct).not.toHaveBeenCalled();
    // Nor does it enable invoice creation: subscriptions already invoice.
    expect(params.invoice_creation).toBeUndefined();
    expect(params.payment_intent_data).toBeUndefined();
    // No app locale on the profile → Stripe chrome falls back to 'auto'.
    expect(params.locale).toBe("auto");
    // Promotion-code entry is enabled on the subscription path too.
    expect(params.allow_promotion_codes).toBe(true);
  });

  it("localizes the Stripe chrome and description to the parent's locale", async () => {
    mockAuthenticatedCustomer("fi");
    mockAdmin({
      product: {
        ...PAID_CLUB,
        product_translations: [
          { locale: "en", name: "Test Club" },
          { locale: "fi", name: "Testikerho" },
        ],
      },
    });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_sub_fi",
    });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "subscription_monthly" }),
    );
    expect(res.status).toBe(200);

    const params = mockStripeSessionCreate.mock.calls[0][0];
    // Stripe's own chrome renders in Finnish…
    expect(params.locale).toBe("fi");
    // …and the description we control uses the Finnish product name.
    expect(params.subscription_data.description).toBe(
      `Testikerho — ${GAMER_FIRST_NAME}`,
    );
    // …while the session's `productName` stays the **default-locale** name, for
    // the same Finnish purchase. The two are resolved independently on purpose:
    // the description is read by the parent who bought the seat, the metadata
    // key by staff in one internal Slack channel, where the same product must
    // arrive under the same heading whoever bought it. Asserting the pair is
    // what proves they are independent — either value alone would still pass if
    // the two resolves were collapsed back into one.
    expect(params.metadata.productName).toBe("Test Club");
  });

  it("falls Stripe chrome back to 'auto' for a locale Stripe doesn't speak (Klingon)", async () => {
    mockAuthenticatedCustomer("tlh");
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_sub_tlh",
    });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "subscription_monthly" }),
    );
    expect(res.status).toBe(200);
    expect(mockStripeSessionCreate.mock.calls[0][0].locale).toBe("auto");
  });

  it("passes French through to the Stripe chrome", async () => {
    mockAuthenticatedCustomer("fr");
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
      error: null,
    });
    mockGetOrCreateSubscriptionPrice.mockResolvedValue({
      product_id: PRODUCT_ID,
      currency: "eur",
      stripe_price_id: STRIPE_PRICE_ID,
      unit_amount_cents: 5000,
    });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/test_sub_fr",
    });

    const res = await POST(
      createRequest({ ...VALID_BODY, purchaseShape: "subscription_monthly" }),
    );
    expect(res.status).toBe(200);
    expect(mockStripeSessionCreate.mock.calls[0][0].locale).toBe("fr");
  });

  it("returns 400 when the product is not sold in the requested currency (sub branch)", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc
      .mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
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
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
  });

  // ── Deferred billing on a club that has not started ───────────────
  //
  // A consumer club can now be listed before it opens, and a subscription
  // created through Checkout would otherwise start billing at once — three
  // weeks of paying for nothing. The route defers the first charge with
  // `billing_cycle_anchor` + `proration_behavior: "none"`, which makes the
  // session complete at €0.
  //
  // The clock is frozen for the whole block: the anchor is derived from "now"
  // against the product's start date, so a live clock would make both the
  // deferral and the clamp drift with the calendar and eventually invert.

  describe("deferred first charge", () => {
    // A Wednesday, mid-morning UTC — nowhere near a Helsinki midnight, so no
    // assertion here sits on a day boundary.
    const FROZEN_NOW = new Date("2027-02-03T09:00:00Z");

    /** Product-local midnight in Helsinki, in unix seconds. */
    function helsinkiMidnightSeconds(date: string): number {
      return Math.floor(fromZonedTime(`${date}T00:00:00`, "Europe/Helsinki").getTime() / 1000);
    }

    function subscriptionCheckout(product: ProductFixture) {
      mockAuthenticatedCustomer();
      mockAdmin({ product });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
      mockGetOrCreateSubscriptionPrice.mockResolvedValue({
        product_id: PRODUCT_ID,
        currency: "eur",
        stripe_price_id: STRIPE_PRICE_ID,
        unit_amount_cents: 4500,
      });
      mockStripeSessionCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/c/test_deferred",
      });
    }

    beforeEach(() => {
      vi.useFakeTimers({ now: FROZEN_NOW });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("anchors the first invoice at the club's own start date", async () => {
      // Three weeks out — inside Stripe's ceiling, so the anchor is the start
      // date itself and the parent is charged the day the club begins.
      const startDate = "2027-02-24";
      subscriptionCheckout({ ...PAID_CLUB, start_date: startDate });

      const res = await POST(createRequest(VALID_BODY));
      expect(res.status).toBe(200);

      const params = mockStripeSessionCreate.mock.calls[0][0];
      expect(params.subscription_data.billing_cycle_anchor).toBe(
        helsinkiMidnightSeconds(startDate),
      );
      // Without this the parent would be billed a part-month today; with it the
      // session totals €0 and the first full invoice fires at the anchor.
      expect(params.subscription_data.proration_behavior).toBe("none");
      // No trial anywhere: the anchor is mutually exclusive with one, and a club
      // that starts later is not a free trial.
      expect(params.subscription_data).not.toHaveProperty("trial_end");
      expect(params.subscription_data).not.toHaveProperty("trial_period_days");
    });

    it("clamps a club starting further out than Stripe will accept", async () => {
      // Eight weeks ahead. Stripe rejects an anchor past the next natural
      // billing date, so the charge lands ~four weeks from purchase — before
      // the club starts. Accepted product decision; the shop states the clamped
      // date rather than the start date.
      const startDate = "2027-04-01";
      subscriptionCheckout({ ...PAID_CLUB, start_date: startDate });

      const res = await POST(createRequest(VALID_BODY));
      expect(res.status).toBe(200);

      const params = mockStripeSessionCreate.mock.calls[0][0];
      const expected = Math.floor(
        (FROZEN_NOW.getTime() + 28 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000) /
          1000,
      );
      expect(params.subscription_data.billing_cycle_anchor).toBe(expected);
      expect(params.subscription_data.billing_cycle_anchor).toBeLessThan(
        helsinkiMidnightSeconds(startDate),
      );
      expect(params.subscription_data.proration_behavior).toBe("none");
    });

    it("charges immediately for a club that has already started", async () => {
      subscriptionCheckout({ ...PAID_CLUB, start_date: "2027-01-05" });

      const res = await POST(createRequest(VALID_BODY));
      expect(res.status).toBe(200);

      const params = mockStripeSessionCreate.mock.calls[0][0];
      expect(params.subscription_data).not.toHaveProperty(
        "billing_cycle_anchor",
      );
      expect(params.subscription_data).not.toHaveProperty("proration_behavior");
    });

    it("charges immediately for a club with no start date at all", async () => {
      subscriptionCheckout({ ...PAID_CLUB, start_date: null });

      const res = await POST(createRequest(VALID_BODY));
      expect(res.status).toBe(200);

      const params = mockStripeSessionCreate.mock.calls[0][0];
      expect(params.subscription_data).not.toHaveProperty(
        "billing_cycle_anchor",
      );
      expect(params.subscription_data).not.toHaveProperty("proration_behavior");
      // And no delivery_start key either, which is the pre-existing rule for a
      // null date and is worth keeping visible beside the new one.
      expect(params.subscription_data.metadata).not.toHaveProperty(
        "delivery_start",
      );
    });

    it("never anchors a single-payment session, however far off the camp is", async () => {
      // The anchor is a subscription parameter. A camp is bought outright, so a
      // future start date changes nothing about when the money moves.
      mockAuthenticatedCustomer();
      mockAdmin({ product: { ...PAID_CAMP, start_date: "2027-08-03" } });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
      mockComputeSinglePaymentAmount.mockResolvedValue(25000);
      mockStripeSessionCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/c/test_camp_future",
      });

      const res = await POST(
        createRequest({ ...VALID_BODY, purchaseShape: "single_payment" }),
      );
      expect(res.status).toBe(200);

      const params = mockStripeSessionCreate.mock.calls[0][0];
      expect(params.mode).toBe("payment");
      expect(params.subscription_data).toBeUndefined();
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
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      }),
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC returns external_active without a participation_id", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: MUNI_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "external_active" },
      error: null,
    });

    const res = await POST(
      createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "external",
        currency: "eur",
      }),
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 when the RPC returns a kind the contract doesn't know", async () => {
    // `reserving` was the paid outcome before the seat moved to payment time.
    // A database still answering with it would be out of step with this route,
    // and the contract parse is what catches that rather than the route quietly
    // sending the parent to Stripe on a stale understanding.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "reserving" },
      error: null,
    });

    const res = await POST(createRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect(mockStripeSessionCreate).not.toHaveBeenCalled();
  });

  // ── redirect URLs ─────────────────────────────────────────────────

  it("derives the cancel URL from the product, ignoring any caller-supplied path", async () => {
    // Cancel is no longer caller-influenced: it's always the product page,
    // built server-side from productId. A stray `returnPath` in the body is
    // ignored, so there's no open-redirect surface to sanitize.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
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
    expect(params.success_url).toBe(
      "http://localhost:3000/shop/confirmation?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe(`http://localhost:3000/shop/${PRODUCT_ID}`);
  });

  // Regression: every absolute URL this route emits — the two Stripe redirects
  // and the three metadata links a Stripe Workflow puts in an internal Slack
  // message — must be built off the trusted origin and never off the
  // attacker-controllable Host. The exact-shape metadata assertions above cannot
  // see this: they run with `host: localhost:3000` on a `localhost:3000` request
  // URL, where `getOrigin(request)` and `new URL(request.url).origin` agree, so
  // a regression to either raw read would pass them unchanged. The stakes are
  // highest on the Slack links, because staff click those in the channel they
  // trust most.
  it("builds the metadata URLs off the trusted origin, ignoring a spoofed Host", async () => {
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CAMP });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
      error: null,
    });
    mockComputeSinglePaymentAmount.mockResolvedValue(15000);
    mockEnsureStripeProductForProduct.mockResolvedValue(STRIPE_PRODUCT_ID);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/spoofed_host",
    });

    // Both the request URL and the Host header carry the attacker value, as a
    // genuinely spoofed request would — `createRequest` can't express that,
    // since it pins the URL to localhost.
    const spoofed = new Request(
      "https://evil.com/api/checkout/products/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "evil.com" },
        body: JSON.stringify({
          ...VALID_BODY,
          purchaseShape: "single_payment",
        }),
      },
    );
    const res = await POST(spoofed);
    expect(res.status).toBe(200);

    const params = mockStripeSessionCreate.mock.calls[0][0];
    // The canonical origin from NEXT_PUBLIC_SITE_URL, not "evil.com".
    expect(params.metadata.adminProductUrl).toBe(
      `${TRUSTED_ORIGIN}/admin/camps/${PRODUCT_ID}`,
    );
    expect(params.metadata.adminUserUrl).toBe(
      `${TRUSTED_ORIGIN}/admin/users/${CUSTOMER_ID}`,
    );
    expect(params.metadata.shopProductUrl).toBe(
      `${TRUSTED_ORIGIN}/shop/${PRODUCT_ID}`,
    );
    expect(params.success_url).toBe(
      `${TRUSTED_ORIGIN}/shop/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(params.cancel_url).toBe(`${TRUSTED_ORIGIN}/shop/${PRODUCT_ID}`);
  });

  // ── The participant may be the payer ──────────────────────────────
  //
  // A for-parents product lets a customer buy a seat for themselves, which
  // arrives here as `participantId === user.id`. **The route deliberately does
  // not judge that pair**: audience is a property of the product, and the
  // gate lives in `create_participation` where it can be read under the same
  // lock as the capacity check. What the route does keep is the pinning —
  // `p_customer_id` is always the session user, never anything the body says —
  // so the pair the database is asked about is one the caller could not forge.
  describe("participant identity", () => {
    it("forwards a self seat to the RPC with the customer still pinned", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({
        product: FREE_EVENT,
        gamer: { first_name: "Marja" },
      });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          participantId: CUSTOMER_ID,
          purchaseShape: "free",
          currency: "eur",
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        status: "free_confirmed",
        participationId: PARTICIPATION_ID,
      });
      expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
        p_product_id: PRODUCT_ID,
        p_participant_id: CUSTOMER_ID,
        p_customer_id: CUSTOMER_ID,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
      // Stripe is never reached on a no-charge shape, self seat or not.
      expect(mockStripeSessionCreate).not.toHaveBeenCalled();
    });

    it("still forwards a child seat unchanged", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          participantId: GAMER_ID,
          purchaseShape: "free",
          currency: "eur",
        }),
      );

      expect(res.status).toBe(200);
      expect(mockAdminRpc).toHaveBeenCalledWith("create_participation", {
        p_product_id: PRODUCT_ID,
        p_participant_id: GAMER_ID,
        p_customer_id: CUSTOMER_ID,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
    });

    it("relays the RPC's refusal when the participant is somebody else's adult", async () => {
      // The route forwards the pair and the database refuses it — an unlinked
      // adult is neither the caller nor one of their children. This is the
      // shape a route-side audience check would have hidden: the refusal has to
      // arrive as the RPC's own message, because that message is what the shop
      // renders beside the signup button.
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      const otherAdult = "99999999-9999-9999-9999-999999999999";
      mockAdminRpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: "23514",
          message: `customer ${CUSTOMER_ID} is not the parent of participant ${otherAdult}`,
        },
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          participantId: otherAdult,
          purchaseShape: "free",
          currency: "eur",
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("is not the parent of participant");
      // The route asked about the pair rather than pre-judging it.
      expect(mockAdminRpc).toHaveBeenCalledWith(
        "create_participation",
        expect.objectContaining({
          p_participant_id: otherAdult,
          p_customer_id: CUSTOMER_ID,
        }),
      );
    });

    it("relays the RPC's audience refusal on a gamers-only product", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: "23514",
          message: "this product is not open to parents",
        },
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          participantId: CUSTOMER_ID,
          purchaseShape: "free",
          currency: "eur",
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("this product is not open to parents");
    });

    it("names the payer in the Stripe subscription description on a self seat", async () => {
      // The description is what the parent reads in the hosted portal when
      // deciding which sub to cancel, so a seat they hold themselves has to
      // carry their own name there like any child's does.
      mockAuthenticatedCustomer();
      mockAdmin({ product: PAID_CLUB, gamer: { first_name: "Marja" } });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "validated" },
        error: null,
      });
      mockGetOrCreateSubscriptionPrice.mockResolvedValue({
        product_id: PRODUCT_ID,
        currency: "eur",
        stripe_price_id: STRIPE_PRICE_ID,
        unit_amount_cents: 3900,
      });
      mockStripeSessionCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/c/test_self",
      });

      await POST(createRequest({ ...VALID_BODY, participantId: CUSTOMER_ID }));

      const params = mockStripeSessionCreate.mock.calls[0][0];
      expect(params.subscription_data.description).toBe("Test Club — Marja");
    });

    it("falls back to an audience-aware label when the profile has no name", async () => {
      // The fallback lives outside `messages/` — it lands in Stripe receipts —
      // so no locale sweep would ever catch it saying "your child" on a seat
      // the payer holds. A self seat says "you"; a child's still says "your
      // child".
      const cases: [participantId: string, expected: string][] = [
        [CUSTOMER_ID, "Test Club — you"],
        [GAMER_ID, "Test Club — your child"],
      ];
      for (const [participantId, expected] of cases) {
        vi.clearAllMocks();
        mockGetOrCreateStripeCustomer.mockResolvedValue(STRIPE_CUSTOMER_ID);
        mockAuthenticatedCustomer();
        mockAdmin({ product: PAID_CLUB, gamer: { first_name: "" } });
        mockAdminRpc.mockResolvedValueOnce({
          data: { kind: "validated" },
          error: null,
        });
        mockGetOrCreateSubscriptionPrice.mockResolvedValue({
          product_id: PRODUCT_ID,
          currency: "eur",
          stripe_price_id: STRIPE_PRICE_ID,
          unit_amount_cents: 3900,
        });
        mockStripeSessionCreate.mockResolvedValue({
          url: "https://checkout.stripe.com/c/test_fallback",
        });

        await POST(createRequest({ ...VALID_BODY, participantId }));

        const params = mockStripeSessionCreate.mock.calls[0][0];
        expect(params.subscription_data.description).toBe(expected);
      }
    });
  });

  // ── The product read both branches are built from ─────────────────

  it("orders the embedded translations so the resolved name is deterministic", async () => {
    // Embedded resources come back unordered, so a product with no English
    // translation resolved its name from an arbitrary row. Harmless while the
    // name was only a display string; load-bearing now — a flapping name makes
    // the Stripe Product reconcile on every purchase, and makes two concurrent
    // creates differ under one idempotency key. Ordering an *embedded* resource
    // needs its table named: a bare `.order("locale")` would try to order
    // `products` by a column it does not have, and fail loudly.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });

    await POST(createRequest({ ...VALID_BODY, purchaseShape: "free" }));

    expect(mockProductsOrder).toHaveBeenCalledWith("locale", {
      referencedTable: "product_translations",
    });
  });

  it("hands the subscription price helper the row it already read", async () => {
    // One read is the single source for everything Stripe is told: the Stripe
    // Product's name, tax code and metadata, and the purchase snapshot on the
    // subscription. Two reads could disagree.
    mockAuthenticatedCustomer();
    mockAdmin({ product: PAID_CLUB });
    mockAdminRpc.mockResolvedValueOnce({
      data: { kind: "validated" },
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

    await POST(createRequest(VALID_BODY));

    expect(mockGetOrCreateSubscriptionPrice).toHaveBeenCalledWith(
      expect.anything(),
      PAID_CLUB,
      "eur",
    );
  });

  // ── The confirmation mail ─────────────────────────────────────────
  //
  // Only the two outcomes that activate a seat *here* send from this route. A
  // paid signup writes nothing yet — the participation is created from the
  // Stripe webhook once the money lands — so its confirmation is that webhook's
  // to send, and a mail from here would be confirming a purchase that has not
  // happened.

  describe("no-charge signups confirm themselves by email", () => {
    function freeSignupRequest() {
      return createRequest({
        productId: PRODUCT_ID,
        participantId: GAMER_ID,
        purchaseShape: "free",
        currency: "eur",
      });
    }

    it("mails the customer when a free signup activates", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      const res = await POST(freeSignupRequest());

      expect(res.status).toBe(200);
      // Handed to the post-response hook, not awaited inside the answer.
      expect(deferred).toHaveLength(1);
      await settleDeferred();
      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
      const sent = mockSendTransactionalEmail.mock.calls[0][0];
      // The payer's inbox, not the child's — a gamer account's address is the
      // synthetic one nobody reads.
      expect(sent.toEmail).toBe("parent@example.test");
      expect(sent.replyToEmail).toBe("help@sog.gg");
      expect(sent.subject).toContain(GAMER_FIRST_NAME);
      expect(sent.htmlContent).toContain("Price: Free");
      // The trusted origin — here the localhost the request really came from,
      // which `getOrigin` accepts outside production.
      expect(sent.htmlContent).toContain("http://localhost:3000/parent");
    });

    it("builds the My SOG link off the trusted origin, ignoring a spoofed Host", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      await POST(
        createRequest(
          {
            productId: PRODUCT_ID,
            participantId: GAMER_ID,
            purchaseShape: "free",
            currency: "eur",
          },
          { host: "evil.com", origin: "https://evil.com" },
        ),
      );
      await settleDeferred();

      const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(htmlContent).toContain("https://test.sogverse.local/parent");
      expect(htmlContent).not.toContain("evil.com");
    });

    // Owner decision: a municipality registration is invoiced to the school
    // off-platform, so from the family's side it is the free case exactly, and
    // it sends the free-mode mail rather than one of its own.
    it("mails the same free-mode confirmation for a municipality registration", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: MUNI_CLUB });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "external_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          participantId: GAMER_ID,
          purchaseShape: "external",
          currency: "eur",
        }),
      );

      expect(res.status).toBe(200);
      expect(deferred).toHaveLength(1);
      await settleDeferred();
      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
      const sent = mockSendTransactionalEmail.mock.calls[0][0];
      expect(sent.toEmail).toBe("parent@example.test");
      expect(sent.htmlContent).toContain("Price: Free");
    });

    it("speaks in the second person when the parent took the seat themselves", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });

      const res = await POST(
        createRequest({
          productId: PRODUCT_ID,
          // The seat is the payer's own — the same test the confirmation page
          // makes on the row, made here from the ids.
          participantId: CUSTOMER_ID,
          purchaseShape: "free",
          currency: "eur",
        }),
      );

      expect(res.status).toBe(200);
      await settleDeferred();
      const { subject } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(subject).toContain("You are");
      expect(subject).not.toContain(GAMER_FIRST_NAME);
    });

    it("sends nothing when the product is full", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "full" },
        error: null,
      });

      const res = await POST(freeSignupRequest());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "full" });
      // Nothing was even deferred, so no mail can arrive later either.
      expect(deferred).toHaveLength(0);
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("sends nothing on a paid signup — the webhook confirms that one", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: PAID_CLUB });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "validated" },
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

      const res = await POST(createRequest(VALID_BODY));

      expect(res.status).toBe(200);
      expect(deferred).toHaveLength(0);
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("still confirms the signup when the send throws", async () => {
      mockAuthenticatedCustomer();
      mockAdmin({ product: FREE_EVENT });
      mockAdminRpc.mockResolvedValueOnce({
        data: { kind: "free_active", participation_id: PARTICIPATION_ID },
        error: null,
      });
      mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(freeSignupRequest());

      // The seat is the outcome the parent asked for and the RPC already
      // committed it; a Brevo outage must not present as a failed signup.
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "free_confirmed",
        participationId: PARTICIPATION_ID,
      });
      // The helper swallows its own failure, so the deferred work settles rather
      // than rejecting — which is what makes it safe to hand to `after()` at all.
      await expect(settleDeferred()).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });
});
