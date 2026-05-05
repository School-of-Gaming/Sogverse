import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/family-subscriptions/me/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const { mockSubscriptionsRetrieve } = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
    };
  }) as unknown as typeof import("stripe").default;
  return { default: StripeMock };
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const SUB_ID = "22222222-2222-2222-2222-222222222222";
const ITEM_ID = "33333333-3333-3333-3333-333333333333";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

interface SubRow {
  id: string;
  status: string;
  frequency: string;
  currency: string;
  current_period_end: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  created_at: string;
  family_subscription_items_v2: {
    id: string;
    participation_id: string;
    stripe_subscription_item_id: string;
    stripe_price_id: string;
  }[];
}

function mockAuthenticatedCustomerWithSubs(subs: SubRow[]) {
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: subs, error: null })),
        })),
      })),
    })),
  };
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: { role: "customer" },
    supabase,
  });
  return supabase;
}

// --- Tests ---

describe("GET /api/family-subscriptions/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns subs with Stripe-derived per-item pricing and total", async () => {
    mockAuthenticatedCustomerWithSubs([
      {
        id: SUB_ID,
        status: "active",
        frequency: "month",
        currency: "eur",
        current_period_end: "2026-06-15T00:00:00Z",
        stripe_subscription_id: "sub_stripe_1",
        stripe_customer_id: "cus_stripe_1",
        created_at: "2026-04-15T00:00:00Z",
        family_subscription_items_v2: [
          {
            id: ITEM_ID,
            participation_id: PARTICIPATION_ID,
            stripe_subscription_item_id: "si_1",
            stripe_price_id: "price_1",
          },
        ],
      },
    ]);

    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            id: "si_1",
            price: {
              unit_amount: 4200,
              currency: "eur",
              recurring: { interval: "month" },
            },
          },
        ],
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<
      SubRow & {
        total_cents: number | null;
        family_subscription_items_v2: Array<{
          unit_amount_cents: number | null;
          stripe_price_currency: string | null;
          recurring_interval: string | null;
        }>;
      }
    >;

    expect(body).toHaveLength(1);
    expect(body[0].total_cents).toBe(4200);
    expect(body[0].family_subscription_items_v2[0]).toMatchObject({
      unit_amount_cents: 4200,
      stripe_price_currency: "eur",
      recurring_interval: "month",
    });

    // Stripe was called with the subscription's id + price expansion.
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith(
      "sub_stripe_1",
      expect.objectContaining({ expand: ["items.data.price"] }),
    );
  });

  it("sums pricing across multiple items into total_cents", async () => {
    mockAuthenticatedCustomerWithSubs([
      {
        id: SUB_ID,
        status: "active",
        frequency: "month",
        currency: "eur",
        current_period_end: "2026-06-15T00:00:00Z",
        stripe_subscription_id: "sub_stripe_1",
        stripe_customer_id: "cus_1",
        created_at: "2026-04-15T00:00:00Z",
        family_subscription_items_v2: [
          {
            id: "item_1",
            participation_id: "p_1",
            stripe_subscription_item_id: "si_1",
            stripe_price_id: "price_1",
          },
          {
            id: "item_2",
            participation_id: "p_2",
            stripe_subscription_item_id: "si_2",
            stripe_price_id: "price_2",
          },
        ],
      },
    ]);

    mockSubscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            id: "si_1",
            price: {
              unit_amount: 4200,
              currency: "eur",
              recurring: { interval: "month" },
            },
          },
          {
            id: "si_2",
            price: {
              unit_amount: 1800,
              currency: "eur",
              recurring: { interval: "month" },
            },
          },
        ],
      },
    });

    const res = await GET();
    const body = (await res.json()) as Array<{ total_cents: number | null }>;
    expect(body[0].total_cents).toBe(6000);
  });

  it("degrades gracefully when Stripe retrieve throws", async () => {
    // The DB row exists but the Stripe sub was deleted. Don't 500 the
    // whole response; return the sub with null pricing so the placeholder
    // can still surface drift.
    mockAuthenticatedCustomerWithSubs([
      {
        id: SUB_ID,
        status: "active",
        frequency: "month",
        currency: "eur",
        current_period_end: null,
        stripe_subscription_id: "sub_stripe_missing",
        stripe_customer_id: "cus_1",
        created_at: "2026-04-15T00:00:00Z",
        family_subscription_items_v2: [
          {
            id: ITEM_ID,
            participation_id: PARTICIPATION_ID,
            stripe_subscription_item_id: "si_1",
            stripe_price_id: "price_1",
          },
        ],
      },
    ]);

    mockSubscriptionsRetrieve.mockRejectedValue(
      new Error("No such subscription: sub_stripe_missing"),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<{
      total_cents: number | null;
      family_subscription_items_v2: Array<{
        unit_amount_cents: number | null;
      }>;
    }>;
    expect(body).toHaveLength(1);
    expect(body[0].total_cents).toBeNull();
    expect(body[0].family_subscription_items_v2[0].unit_amount_cents).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Stripe retrieve failed"),
      expect.objectContaining({
        stripeSubscriptionId: "sub_stripe_missing",
      }),
    );
    errorSpy.mockRestore();
  });

  it("returns an empty array when the customer has no subs", async () => {
    mockAuthenticatedCustomerWithSubs([]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 500 when the supabase query errors", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { message: "RLS denied" },
              }),
            ),
          })),
        })),
      })),
    };
    mockRequireRole.mockResolvedValue({
      user: { id: CUSTOMER_ID },
      profile: { role: "customer" },
      supabase,
    });

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "RLS denied" });
  });
});
