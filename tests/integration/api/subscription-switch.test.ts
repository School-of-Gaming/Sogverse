import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/subscription/switch/route";
import { NextResponse } from "next/server";
import {
  mockUnauthenticated as _mockUnauthenticated,
  mockAuthenticatedSubscriptionProfile,
} from "../../mocks/stripe";

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
const mockGetStripeProducts = vi.fn();
vi.mock("@/lib/stripe/products", () => ({
  getProductByPriceId: (...args: unknown[]) => mockGetProductByPriceId(...args),
  getStripeProducts: (...args: unknown[]) => mockGetStripeProducts(...args),
}));


// --- Helpers ---

function mockUnauthenticated() {
  _mockUnauthenticated(mockRequireRole);
}

function mockAuthenticatedCustomer(overrides: Record<string, unknown> = {}) {
  mockAuthenticatedSubscriptionProfile(mockRequireRole, overrides);
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
      currency: "usd",
      metadata: { userId: "user-123" },
    });
    mockGetStripeProducts.mockResolvedValue({
      subscriptionPackages: [
        {
          stripeProductId: "prod_premium",
          prices: {
            usd: { priceId: "price_premium_usd", unitAmount: 1500 },
            eur: { priceId: "price_premium_eur", unitAmount: 1400 },
            gbp: { priceId: "price_premium_gbp", unitAmount: 1200 },
          },
        },
      ],
    });
    mockSubscriptionsUpdate.mockResolvedValue({});

    const response = await POST(createRequest({ priceId: "price_premium_usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.switched).toBe(true);

    // Verify Stripe was called with the resolved price in the subscription's currency
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_active_123", {
      items: [{ id: "si_item_123", price: "price_premium_usd" }],
      proration_behavior: "none",
      metadata: {
        userId: "user-123",
        tokenAmount: "50",
        stripeProductId: "prod_premium",
      },
    });
  });

  it("should resolve the correct price when client currency differs from subscription currency", async () => {
    mockAuthenticatedCustomer({ subscription_tier: "prod_old" });
    // Client sends a USD price, but the subscription was created in EUR
    mockGetProductByPriceId.mockResolvedValue({
      stripeProductId: "prod_premium",
      tokenAmount: 50,
      type: "subscription",
      currency: "usd",
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ id: "si_item_123" }] },
      currency: "eur",
      metadata: { userId: "user-123" },
    });
    mockGetStripeProducts.mockResolvedValue({
      subscriptionPackages: [
        {
          stripeProductId: "prod_premium",
          prices: {
            usd: { priceId: "price_premium_usd", unitAmount: 1500 },
            eur: { priceId: "price_premium_eur", unitAmount: 1400 },
            gbp: { priceId: "price_premium_gbp", unitAmount: 1200 },
          },
        },
      ],
    });
    mockSubscriptionsUpdate.mockResolvedValue({});

    const response = await POST(createRequest({ priceId: "price_premium_usd" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.switched).toBe(true);

    // Should use the EUR price, not the USD price the client sent
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_active_123", {
      items: [{ id: "si_item_123", price: "price_premium_eur" }],
      proration_behavior: "none",
      metadata: {
        userId: "user-123",
        tokenAmount: "50",
        stripeProductId: "prod_premium",
      },
    });
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
    expect(data.error).toBe("Only customers can switch subscriptions");
  });
});
