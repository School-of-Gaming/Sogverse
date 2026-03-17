import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/subscription/switch/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const { mockSubscriptionsRetrieve, mockSubscriptionsUpdate } = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  })),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

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
    stripe_subscription_id = "sub_active_123",
    subscription_tier = "prod_old",
    ...rest
  } = overrides;

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "customer_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { stripe_subscription_id, subscription_tier, ...rest },
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });

  mockRequireRole.mockResolvedValue({
    user: { id: "user-123" },
    profile: { role: "customer" },
    supabase: { from: mockFrom },
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/checkout/subscription/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/checkout/subscription/switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ priceId: "price_new_usd" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 when priceId is missing", async () => {
    mockAuthenticatedCustomer();

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("priceId is required");
  });

  it("should return 400 when priceId is not a subscription product", async () => {
    mockAuthenticatedCustomer();
    mockGetProductByPriceId.mockResolvedValue({
      stripeProductId: "prod_oneoff",
      tokenAmount: 5,
      type: "one_time",
      currency: "usd",
    });

    const response = await POST(createRequest({ priceId: "price_oneoff_usd" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid subscription price");
  });

  it("should return 400 when customer has no active subscription", async () => {
    mockAuthenticatedCustomer({ stripe_subscription_id: null });
    mockGetProductByPriceId.mockResolvedValue({
      stripeProductId: "prod_premium",
      tokenAmount: 50,
      type: "subscription",
      currency: "usd",
    });

    const response = await POST(createRequest({ priceId: "price_premium_usd" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No active subscription to switch");
  });

  it("should return 409 when switching to the same tier", async () => {
    mockAuthenticatedCustomer({ subscription_tier: "prod_basic" });
    mockGetProductByPriceId.mockResolvedValue({
      stripeProductId: "prod_basic",
      tokenAmount: 10,
      type: "subscription",
      currency: "usd",
    });

    const response = await POST(createRequest({ priceId: "price_basic_usd" }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already on this tier");
  });

  it("should successfully switch tier", async () => {
    mockAuthenticatedCustomer({ subscription_tier: "prod_old" });
    mockGetProductByPriceId.mockResolvedValue({
      stripeProductId: "prod_premium",
      tokenAmount: 50,
      type: "subscription",
      currency: "usd",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_item_123" }] },
      metadata: { userId: "user-123" },
    });
    mockSubscriptionsUpdate.mockResolvedValue({});

    const response = await POST(createRequest({ priceId: "price_premium_usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.switched).toBe(true);

    // Verify Stripe was called correctly
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_active_123", {
      items: [{ id: "si_item_123", price: "price_premium_usd" }],
      proration_behavior: "none",
      metadata: {
        userId: "user-123",
        tokenAmount: "50",
        stripeProductId: "prod_premium",
      },
    });

    // DB update is handled by the customer.subscription.updated webhook
  });

  it("should return 403 for non-customer roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only customers can switch subscriptions" },
        { status: 403 }
      )
    );

    const response = await POST(createRequest({ priceId: "price_premium_usd" }));
    const data = await response.json();

    expect(response.status).toBe(403);
  });
});
