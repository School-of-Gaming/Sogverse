import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/tokens/route";
import { NextResponse } from "next/server";

// --- Mocks ---

// Stripe mock must use vi.hoisted because `new Stripe()` runs at module load
// (during vi.mock hoisting), before normal `const` declarations are initialized.
const { mockStripeSessionCreate } = vi.hoisted(() => ({
  mockStripeSessionCreate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: { create: mockStripeSessionCreate },
    },
  })),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// Mock Stripe products fetch — returns known test products
const mockGetProductByPriceId = vi.fn();
vi.mock("@/lib/stripe/products", () => ({
  getProductByPriceId: (...args: unknown[]) => mockGetProductByPriceId(...args),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedCustomer(overrides: Record<string, unknown> = {}) {
  const {
    role = "customer",
    email = "customer@example.com",
    stripe_customer_id = null,
    subscription_status = null,
    ...rest
  } = overrides;

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "customer_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { stripe_customer_id, subscription_status, ...rest },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { role, email },
            error: null,
          }),
        }),
      }),
    };
  });

  mockRequireRole.mockResolvedValue({
    user: { id: "customer-user-id" },
    profile: { role, email },
    supabase: { from: mockFrom },
  });
}

function mockAuthenticatedWithRole(role: string) {
  mockRequireRole.mockImplementation(
    (requiredRole: string, options?: { forbiddenMessage?: string }) => {
      if (role !== requiredRole) {
        return Promise.resolve(
          NextResponse.json(
            { error: options?.forbiddenMessage || "Forbidden" },
            { status: 403 }
          )
        );
      }
      // Role matches — should not happen in these tests, but return
      // a plausible auth result so a mistaken call is caught.
      return Promise.resolve({
        user: { id: "user-123" },
        profile: { role, email: "test@example.com" },
        supabase: { from: vi.fn() },
      });
    }
  );
}

function createRequest(
  body: Record<string, unknown>,
  origin = "http://localhost:3000"
): Request {
  return new Request("http://localhost:3000/api/checkout/tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

// --- Test product data ---

const ONE_TIME_PRODUCT = {
  stripeProductId: "prod_starter",
  tokenAmount: 5,
  type: "one_time" as const,
  currency: "usd",
};

const SUB_PRODUCT = {
  stripeProductId: "prod_basic",
  tokenAmount: 10,
  type: "subscription" as const,
  currency: "usd",
};

// --- Tests ---

describe("POST /api/checkout/tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProductByPriceId.mockResolvedValue(null); // default: invalid
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for gamer role", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only customers can purchase tokens");
  });

  it("should return 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(403);
  });

  it("should return 403 for admin role", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 for invalid priceId", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(null);

    const response = await POST(createRequest({ priceId: "price_nonexistent", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid price ID");
  });

  it("should return 409 when customer with active subscription buys another subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "active" });
    mockGetProductByPriceId.mockResolvedValue(SUB_PRODUCT);

    const response = await POST(
      createRequest({ priceId: "price_basic_usd", currency: "usd" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active subscription");
  });

  it("should return 409 when customer with past_due subscription buys another subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "past_due" });
    mockGetProductByPriceId.mockResolvedValue(SUB_PRODUCT);

    const response = await POST(
      createRequest({ priceId: "price_basic_usd", currency: "usd" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
  });

  it("should allow one-time purchase even with active subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "active" });
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_123");
  });

  it("should allow subscription purchase when subscription_status is null (never subscribed)", async () => {
    mockAuthenticatedCustomer({ subscription_status: null });
    mockGetProductByPriceId.mockResolvedValue(SUB_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_new_sub",
    });

    const response = await POST(
      createRequest({ priceId: "price_basic_usd", currency: "usd" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_new_sub");
  });

  it("should allow subscription purchase when previous subscription is fully canceled", async () => {
    mockAuthenticatedCustomer({ subscription_status: "canceled" });
    mockGetProductByPriceId.mockResolvedValue(SUB_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_resub",
    });

    const response = await POST(
      createRequest({ priceId: "price_basic_usd", currency: "usd" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_resub");
  });

  // -- One-time purchase --

  it("should create a payment session for one-time purchase", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_abc",
    });

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_abc");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.customer_email).toBe("customer@example.com");
    expect(params.line_items[0].price).toBe("price_starter_usd");
    expect(params.line_items[0].quantity).toBe(1);
    expect(params.metadata).toEqual({
      userId: "customer-user-id",
      tokenAmount: "5",
      stripeProductId: "prod_starter",
      packageType: "one_time",
      currency: "usd",
    });
    expect(params.subscription_data).toBeUndefined();
  });

  // -- Subscription purchase --

  it("should create a subscription session for subscription purchase", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(SUB_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_sub",
    });

    const response = await POST(
      createRequest({ priceId: "price_basic_usd", currency: "usd" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_sub");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0].price).toBe("price_basic_usd");
    expect(params.metadata).toEqual({
      userId: "customer-user-id",
      tokenAmount: "10",
      stripeProductId: "prod_basic",
      packageType: "subscription",
      currency: "usd",
    });
    expect(params.subscription_data).toEqual({
      metadata: {
        userId: "customer-user-id",
        tokenAmount: "10",
        stripeProductId: "prod_basic",
        currency: "usd",
      },
    });
  });

  // -- Currency handling --

  it("should default to EUR when currency is missing", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_default",
    });

    const response = await POST(createRequest({ priceId: "price_starter_usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.metadata.currency).toBe("eur");
  });

  it("should default to EUR when currency is invalid", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_invalid",
    });

    const response = await POST(createRequest({ priceId: "price_starter_usd", currency: "xyz" }));
    const data = await response.json();

    expect(response.status).toBe(200);

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.metadata.currency).toBe("eur");
  });

  // -- returnPath / redirect URLs --

  it("should use provided returnPath in success and cancel URLs", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(
      createRequest(
        { priceId: "price_starter_usd", currency: "usd", returnPath: "/parent/sorg" },
        "https://myapp.vercel.app"
      )
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toBe(
      "https://myapp.vercel.app/parent/sorg?success=true"
    );
    expect(params.cancel_url).toBe(
      "https://myapp.vercel.app/parent/sorg?canceled=true"
    );
  });

  it("should default returnPath to /sorg when not provided", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toContain("/sorg?success=true");
    expect(params.cancel_url).toContain("/sorg?canceled=true");
  });

  it("should fall back to /sorg for unrecognized returnPath values", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(
      createRequest({ priceId: "price_starter_usd", currency: "usd", returnPath: "https://evil.com" })
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toContain("/sorg?success=true");
    expect(params.cancel_url).toContain("/sorg?canceled=true");
  });

  // -- Customer identification --

  it("should use existing stripe_customer_id instead of customer_email for returning customers", async () => {
    mockAuthenticatedCustomer({ stripe_customer_id: "cus_existing123" });
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing123");
    expect(params.customer_email).toBeUndefined();
  });

  it("should fall back to customer_email for first-time purchasers", async () => {
    mockAuthenticatedCustomer({ stripe_customer_id: null });
    mockGetProductByPriceId.mockResolvedValue(ONE_TIME_PRODUCT);
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ priceId: "price_starter_usd", currency: "usd" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.customer).toBeUndefined();
    expect(params.customer_email).toBe("customer@example.com");
  });
});
