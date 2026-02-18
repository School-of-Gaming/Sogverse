import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/subscription/cancel/route";
import { mockUnauthenticated, mockAuthenticatedSubscriptionProfile } from "../../mocks/stripe";

// --- Mocks ---

const { mockSubscriptionsUpdate } = vi.hoisted(() => ({
  mockSubscriptionsUpdate: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    subscriptions: { update: mockSubscriptionsUpdate },
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

// --- Tests ---

describe("POST /api/checkout/subscription/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated(mockGetUser);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-customer role", async () => {
    mockAuthenticatedSubscriptionProfile(mockGetUser, mockFromSelect, { role: "gamer" });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only customers can cancel subscriptions");
  });

  // -- Validation --

  it("should return 400 when customer has no subscription", async () => {
    mockAuthenticatedSubscriptionProfile(mockGetUser, mockFromSelect, { stripe_subscription_id: null });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No active subscription found");
  });

  // -- Happy path --

  it("should cancel subscription at period end", async () => {
    mockAuthenticatedSubscriptionProfile(mockGetUser, mockFromSelect);
    mockSubscriptionsUpdate.mockResolvedValue({
      current_period_end: 1700000000,
    });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.canceledAt).toBe(1700000000);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_active_123", {
      cancel_at_period_end: true,
    });
  });

  it("should return 500 when Stripe API fails", async () => {
    mockAuthenticatedSubscriptionProfile(mockGetUser, mockFromSelect);
    mockSubscriptionsUpdate.mockRejectedValue(new Error("Stripe error"));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
