import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/subscription/resume/route";
import { NextResponse } from "next/server";
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

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// --- Tests ---

describe("POST /api/checkout/subscription/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated(mockRequireRole);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-customer role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only customers can manage subscriptions" },
        { status: 403 }
      )
    );

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only customers can manage subscriptions");
  });

  it("should return 403 for admin role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  // -- Validation --

  it("should return 400 when customer has no subscription", async () => {
    mockAuthenticatedSubscriptionProfile(mockRequireRole, { stripe_subscription_id: null });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No active subscription found");
  });

  // -- Happy path --

  it("should resume subscription by setting cancel_at_period_end to false", async () => {
    mockAuthenticatedSubscriptionProfile(mockRequireRole);
    mockSubscriptionsUpdate.mockResolvedValue({ id: "sub_active_123" });

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.resumed).toBe(true);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_active_123", {
      cancel_at_period_end: false,
    });
  });

  it("should return 500 when Stripe API fails", async () => {
    mockAuthenticatedSubscriptionProfile(mockRequireRole);
    mockSubscriptionsUpdate.mockRejectedValue(new Error("Stripe error"));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
