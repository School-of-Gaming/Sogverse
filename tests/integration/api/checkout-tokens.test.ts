import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/tokens/route";
import { mockSupabaseSuccess } from "../../mocks/supabase";

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

const mockGetUser = vi.fn();
const mockFromSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockFromSelect,
    })),
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

function mockAuthenticatedCustomer(overrides: Record<string, unknown> = {}) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "customer-user-id" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({
          role: "customer",
          email: "customer@example.com",
          subscription_status: null,
          ...overrides,
        })
      ),
    }),
  });
}

function mockAuthenticatedWithRole(role: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "some-user-id" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({
          role,
          email: "user@example.com",
          subscription_status: null,
        })
      ),
    }),
  });
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

// --- Tests ---

describe("POST /api/checkout/tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for gamer role", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only customers can purchase tokens");
  });

  it("should return 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(403);
  });

  it("should return 403 for admin role", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 for invalid packageId", async () => {
    mockAuthenticatedCustomer();

    const response = await POST(createRequest({ packageId: "nonexistent" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid package ID");
  });

  it("should return 409 when customer with active subscription buys another subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "active" });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active subscription");
  });

  it("should return 409 when customer with past_due subscription buys another subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "past_due" });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
  });

  it("should allow one-time purchase even with active subscription", async () => {
    mockAuthenticatedCustomer({ subscription_status: "active" });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_123");
  });

  it("should allow subscription purchase when subscription_status is null (never subscribed)", async () => {
    mockAuthenticatedCustomer({ subscription_status: null });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_new_sub",
    });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_new_sub");
  });

  it("should allow subscription purchase when previous subscription is fully canceled", async () => {
    // Stripe "canceled" means the subscription has ended — the user should be
    // able to start a new one. This is a regression guard: the client-side
    // previously treated "canceled" as active, and the server must never do so.
    mockAuthenticatedCustomer({ subscription_status: "canceled" });
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_resub",
    });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_resub");
  });

  it("should block subscription purchase when active subscription is canceling at period end", async () => {
    // When a user cancels, Stripe keeps status "active" with
    // cancel_at_period_end=true. The DB subscription_status is still "active",
    // so the server must block a second subscription to prevent duplicates.
    mockAuthenticatedCustomer({ subscription_status: "active" });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("You already have an active subscription");
  });

  // -- One-time purchase --

  it("should create a payment session for one-time purchase", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_abc",
    });

    const response = await POST(createRequest({ packageId: "tokens_5" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_abc");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.customer_email).toBe("customer@example.com");
    expect(params.line_items[0].price_data.unit_amount).toBe(1500);
    expect(params.line_items[0].price_data.currency).toBe("usd");
    expect(params.line_items[0].price_data.recurring).toBeUndefined();
    expect(params.line_items[0].quantity).toBe(1);
    expect(params.metadata).toEqual({
      userId: "customer-user-id",
      packageId: "tokens_5",
      tokenAmount: "5",
      packageType: "one_time",
    });
    expect(params.subscription_data).toBeUndefined();
  });

  // -- Subscription purchase --

  it("should create a subscription session for subscription purchase", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session_sub",
    });

    const response = await POST(
      createRequest({ packageId: "tokens_sub_25" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_sub");

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0].price_data.unit_amount).toBe(5000);
    expect(params.line_items[0].price_data.recurring).toEqual({
      interval: "month",
    });
    expect(params.metadata).toEqual({
      userId: "customer-user-id",
      packageId: "tokens_sub_25",
      tokenAmount: "25",
      packageType: "subscription",
    });
    expect(params.subscription_data).toEqual({
      metadata: {
        userId: "customer-user-id",
        packageId: "tokens_sub_25",
        tokenAmount: "25",
      },
    });
  });

  // -- returnPath / redirect URLs --

  it("should use provided returnPath in success and cancel URLs", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(
      createRequest(
        { packageId: "tokens_5", returnPath: "/customer/sorg" },
        "https://myapp.vercel.app"
      )
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toBe(
      "https://myapp.vercel.app/customer/sorg?success=true"
    );
    expect(params.cancel_url).toBe(
      "https://myapp.vercel.app/customer/sorg?canceled=true"
    );
  });

  it("should default returnPath to /sorg when not provided", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ packageId: "tokens_5" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toContain("/sorg?success=true");
    expect(params.cancel_url).toContain("/sorg?canceled=true");
  });

  it("should fall back to /sorg for unrecognized returnPath values", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(
      createRequest({ packageId: "tokens_5", returnPath: "https://evil.com" })
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toContain("/sorg?success=true");
    expect(params.cancel_url).toContain("/sorg?canceled=true");
  });

  it("should fall back to /sorg for arbitrary path returnPath", async () => {
    mockAuthenticatedCustomer();
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(
      createRequest({ packageId: "tokens_5", returnPath: "/some/other/page" })
    );

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.success_url).toContain("/sorg?success=true");
    expect(params.cancel_url).toContain("/sorg?canceled=true");
  });

  // -- Customer identification --

  it("should use existing stripe_customer_id instead of customer_email for returning customers", async () => {
    mockAuthenticatedCustomer({ stripe_customer_id: "cus_existing123" });
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ packageId: "tokens_5" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing123");
    expect(params.customer_email).toBeUndefined();
  });

  it("should fall back to customer_email for first-time purchasers", async () => {
    mockAuthenticatedCustomer({ stripe_customer_id: null });
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ packageId: "tokens_5" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.customer).toBeUndefined();
    expect(params.customer_email).toBe("customer@example.com");
  });

  it("should omit customer_email when profile has no email", async () => {
    mockAuthenticatedCustomer({ email: null });
    mockStripeSessionCreate.mockResolvedValue({ url: "https://stripe.com/s" });

    await POST(createRequest({ packageId: "tokens_5" }));

    const params = mockStripeSessionCreate.mock.calls[0][0];
    expect(params.customer_email).toBeUndefined();
  });
});
