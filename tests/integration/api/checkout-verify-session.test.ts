import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/checkout/verify-session/route";

// --- Mocks ---

// Stripe mock must use vi.hoisted because `new Stripe()` runs at module load.
const { mockSessionRetrieve } = vi.hoisted(() => ({
  mockSessionRetrieve: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: { retrieve: mockSessionRetrieve },
    },
  })),
}));

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

// --- Helpers ---

function mockAuthenticated(userId = "customer-user-id") {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

function createStripeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_session_123",
    payment_status: "paid",
    metadata: {
      userId: "customer-user-id",
      packageId: "tokens_5",
      tokenAmount: "5",
      packageType: "one_time",
    },
    customer: "cus_123",
    subscription: null,
    ...overrides,
  };
}

function mockIdempotencyCheck(alreadyProcessed: boolean) {
  const limitFn = vi.fn().mockResolvedValue({
    data: alreadyProcessed ? [{ id: "existing-tx-id" }] : [],
    error: null,
  });
  const eqFn = vi.fn().mockReturnValue({ limit: limitFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  return { selectFn, eqFn, limitFn };
}

function mockAdminFromChain({
  idempotencyAlreadyProcessed = false,
}: { idempotencyAlreadyProcessed?: boolean } = {}) {
  let callCount = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    callCount++;

    if (table === "token_transactions") {
      const { selectFn } = mockIdempotencyCheck(idempotencyAlreadyProcessed);
      return { select: selectFn };
    }

    // profiles table — update calls
    return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/checkout/verify-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/checkout/verify-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminRpc.mockResolvedValue({ data: [{ new_balance: 5, transaction_id: "tx-id" }], error: null });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  // -- Validation --

  it("should return 400 when sessionId is missing", async () => {
    mockAuthenticated();

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing session ID");
  });

  it("should return 403 when session belongs to a different user", async () => {
    mockAuthenticated("different-user-id");
    mockSessionRetrieve.mockResolvedValue(createStripeSession());

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 when payment is not completed", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(
      createStripeSession({ payment_status: "unpaid" })
    );

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Payment not completed");
  });

  it("should return 400 when tokenAmount is missing from metadata", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(
      createStripeSession({
        metadata: {
          userId: "customer-user-id",
          packageId: "tokens_5",
          packageType: "one_time",
          // tokenAmount intentionally missing
        },
      })
    );

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid session metadata");
  });

  // -- Idempotency --

  it("should return already_processed without crediting when session was already fulfilled", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain({ idempotencyAlreadyProcessed: true });

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("already_processed");
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // -- Double-crediting protection (UNIQUE constraint) --

  it("should return already_processed when concurrent request triggers unique constraint violation", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain(); // idempotency SELECT returns empty (race: both see zero rows)
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "unique_stripe_session_id"', code: "23505" },
    });

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("already_processed");
  });

  // -- RPC failure --

  it("should return 500 when adjust_token_balance RPC fails", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain();
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "PGRST301" },
    });

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to credit tokens");
  });

  // -- One-time purchase fulfillment --

  it("should credit tokens and update profile for one-time purchase", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain();

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("fulfilled");

    // Verify RPC was called with correct params
    expect(mockAdminRpc).toHaveBeenCalledWith("adjust_token_balance", {
      p_user_id: "customer-user-id",
      p_amount: 5,
      p_type: "purchase",
      p_description: "Purchased 5 Sorgs",
      p_stripe_session_id: "cs_test_session_123",
      p_stripe_subscription_id: undefined,
    });
  });

  it("should store Stripe customer ID on profile", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain();

    await POST(createRequest({ sessionId: "cs_test_123" }));

    // Verify profiles table was updated with customer ID
    const profileCalls = mockAdminFrom.mock.calls.filter(
      ([table]: [string]) => table === "profiles"
    );
    expect(profileCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should not update customer ID when session has no customer", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(
      createStripeSession({ customer: null })
    );
    mockAdminFromChain();

    await POST(createRequest({ sessionId: "cs_test_123" }));

    // Only token_transactions call (idempotency check), no profiles update for customer ID
    const profileCalls = mockAdminFrom.mock.calls.filter(
      ([table]: [string]) => table === "profiles"
    );
    expect(profileCalls.length).toBe(0);
  });

  // -- Subscription first payment fulfillment --

  it("should credit tokens and set subscription metadata for subscription purchase", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(
      createStripeSession({
        metadata: {
          userId: "customer-user-id",
          packageId: "tokens_sub_25",
          tokenAmount: "25",
          packageType: "subscription",
        },
        customer: "cus_456",
        subscription: "sub_789",
      })
    );
    mockAdminFromChain();

    const response = await POST(createRequest({ sessionId: "cs_test_123" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("fulfilled");

    // Verify RPC called with subscription type
    expect(mockAdminRpc).toHaveBeenCalledWith("adjust_token_balance", {
      p_user_id: "customer-user-id",
      p_amount: 25,
      p_type: "subscription",
      p_description: "Purchased 25 Sorgs",
      p_stripe_session_id: "cs_test_session_123",
      p_stripe_subscription_id: "sub_789",
    });

    // Verify profiles was updated for both customer ID and subscription
    const profileCalls = mockAdminFrom.mock.calls.filter(
      ([table]: [string]) => table === "profiles"
    );
    expect(profileCalls.length).toBe(2); // customer ID + subscription
  });

  it("should not set subscription metadata for one-time purchase", async () => {
    mockAuthenticated();
    mockSessionRetrieve.mockResolvedValue(createStripeSession());
    mockAdminFromChain();

    await POST(createRequest({ sessionId: "cs_test_123" }));

    // Only 1 profiles call (customer ID), not 2
    const profileCalls = mockAdminFrom.mock.calls.filter(
      ([table]: [string]) => table === "profiles"
    );
    expect(profileCalls.length).toBe(1);
  });
});
