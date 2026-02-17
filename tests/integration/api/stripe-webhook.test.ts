import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";

// --- Mocks ---

// Stripe mock must use vi.hoisted because `new Stripe()` runs at module load.
const { mockConstructEvent, mockSubscriptionsRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
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

function createWebhookRequest(body = "raw-body", sig = "sig_test_123"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sig) headers["stripe-signature"] = sig;

  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

function createWebhookRequestWithoutSig(): Request {
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "raw-body",
  });
}

function createEvent(type: string, object: Record<string, unknown>) {
  return { type, data: { object } };
}

function mockAdminUpdate() {
  const eqFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  mockAdminFrom.mockReturnValue({ update: updateFn });
  return { updateFn, eqFn };
}

function mockIdempotencyAndRpc(alreadyProcessed: boolean) {
  let callCount = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "token_transactions") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: alreadyProcessed ? [{ id: "existing-tx" }] : [],
              error: null,
            }),
          }),
        }),
      };
    }
    // profiles
    return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
  });
}

// --- Tests ---

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminRpc.mockResolvedValue({ data: [{ new_balance: 25, transaction_id: "tx-id" }], error: null });
  });

  // -- Signature validation --

  it("should return 400 when stripe-signature header is missing", async () => {
    const response = await POST(createWebhookRequestWithoutSig());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing signature");
  });

  it("should return 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await POST(createWebhookRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid signature");
  });

  // -- checkout.session.completed --

  describe("checkout.session.completed", () => {
    it("should NOT credit tokens (verify-session handles fulfillment)", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "paid",
          metadata: {
            userId: "user-123",
            packageType: "one_time",
            tokenAmount: "5",
          },
          customer: "cus_abc",
          subscription: null,
        })
      );
      mockAdminUpdate();

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("should store Stripe customer ID on profile", async () => {
      const { updateFn, eqFn } = mockAdminUpdate();
      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "paid",
          metadata: { userId: "user-123", packageType: "one_time" },
          customer: "cus_abc",
          subscription: null,
        })
      );

      await POST(createWebhookRequest());

      expect(mockAdminFrom).toHaveBeenCalledWith("profiles");
      expect(updateFn).toHaveBeenCalledWith({ stripe_customer_id: "cus_abc" });
      expect(eqFn).toHaveBeenCalledWith("id", "user-123");
    });

    it("should store subscription metadata for subscription checkout", async () => {
      let callCount = 0;
      const updateCalls: Array<{ args: unknown[]; eqArgs: unknown[] }> = [];
      mockAdminFrom.mockImplementation(() => {
        return {
          update: vi.fn().mockImplementation((...args: unknown[]) => {
            const call = { args, eqArgs: [] as unknown[] };
            updateCalls.push(call);
            return {
              eq: vi.fn().mockImplementation((...eqArgs: unknown[]) => {
                call.eqArgs = eqArgs;
                return { data: null, error: null };
              }),
            };
          }),
        };
      });

      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "paid",
          metadata: { userId: "user-123", packageType: "subscription" },
          customer: "cus_abc",
          subscription: "sub_xyz",
        })
      );

      await POST(createWebhookRequest());

      // Should have 2 profile updates: customer ID + subscription
      expect(updateCalls.length).toBe(2);
      expect(updateCalls[0].args[0]).toEqual({ stripe_customer_id: "cus_abc" });
      expect(updateCalls[1].args[0]).toEqual({
        stripe_subscription_id: "sub_xyz",
        subscription_status: "active",
      });
    });

    it("should skip when payment_status is not paid", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "unpaid",
          metadata: { userId: "user-123" },
          customer: "cus_abc",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });

    it("should skip when userId is missing from metadata", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "paid",
          metadata: {},
          customer: "cus_abc",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });

    it("should not update customer ID when session has no customer", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("checkout.session.completed", {
          payment_status: "paid",
          metadata: { userId: "user-123", packageType: "one_time" },
          customer: null,
          subscription: null,
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });
  });

  // -- invoice.paid --

  describe("invoice.paid", () => {
    it("should credit tokens for subscription renewal", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_renewal_456",
          subscription: "sub_789",
          billing_reason: "subscription_cycle",
        })
      );
      mockSubscriptionsRetrieve.mockResolvedValue({
        metadata: { userId: "user-123", tokenAmount: "25" },
      });
      mockIdempotencyAndRpc(false);

      const response = await POST(createWebhookRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
      expect(mockAdminRpc).toHaveBeenCalledWith("adjust_token_balance", {
        p_user_id: "user-123",
        p_amount: 25,
        p_type: "subscription",
        p_description: "Monthly subscription — 25 Sorgs",
        p_stripe_session_id: "inv_renewal_456",
        p_stripe_subscription_id: "sub_789",
      });
    });

    it("should skip subscription_create invoices (first payment handled by verify-session)", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_first_123",
          subscription: "sub_789",
          billing_reason: "subscription_create",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("should skip invoices without a subscription", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_no_sub",
          subscription: null,
          billing_reason: "manual",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("should skip when subscription metadata is missing userId", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_no_meta",
          subscription: "sub_789",
          billing_reason: "subscription_cycle",
        })
      );
      mockSubscriptionsRetrieve.mockResolvedValue({
        metadata: { tokenAmount: "25" },
      });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("should skip when subscription metadata is missing tokenAmount", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_no_tokens",
          subscription: "sub_789",
          billing_reason: "subscription_cycle",
        })
      );
      mockSubscriptionsRetrieve.mockResolvedValue({
        metadata: { userId: "user-123" },
      });

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("should not double-credit already-processed invoices (idempotency)", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("invoice.paid", {
          id: "inv_dupe_789",
          subscription: "sub_789",
          billing_reason: "subscription_cycle",
        })
      );
      mockSubscriptionsRetrieve.mockResolvedValue({
        metadata: { userId: "user-123", tokenAmount: "25" },
      });
      mockIdempotencyAndRpc(true);

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });
  });

  // -- customer.subscription.updated --

  describe("customer.subscription.updated", () => {
    it("should update subscription status on profile", async () => {
      const { updateFn, eqFn } = mockAdminUpdate();
      mockConstructEvent.mockReturnValue(
        createEvent("customer.subscription.updated", {
          metadata: { userId: "user-123" },
          status: "past_due",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).toHaveBeenCalledWith("profiles");
      expect(updateFn).toHaveBeenCalledWith({ subscription_status: "past_due" });
      expect(eqFn).toHaveBeenCalledWith("id", "user-123");
    });

    it("should handle active status", async () => {
      const { updateFn } = mockAdminUpdate();
      mockConstructEvent.mockReturnValue(
        createEvent("customer.subscription.updated", {
          metadata: { userId: "user-123" },
          status: "active",
        })
      );

      await POST(createWebhookRequest());

      expect(updateFn).toHaveBeenCalledWith({ subscription_status: "active" });
    });

    it("should skip when userId is missing from metadata", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("customer.subscription.updated", {
          metadata: {},
          status: "active",
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });
  });

  // -- customer.subscription.deleted --

  describe("customer.subscription.deleted", () => {
    it("should clear subscription metadata on profile", async () => {
      const { updateFn, eqFn } = mockAdminUpdate();
      mockConstructEvent.mockReturnValue(
        createEvent("customer.subscription.deleted", {
          metadata: { userId: "user-123" },
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).toHaveBeenCalledWith("profiles");
      expect(updateFn).toHaveBeenCalledWith({
        stripe_subscription_id: null,
        subscription_status: null,
      });
      expect(eqFn).toHaveBeenCalledWith("id", "user-123");
    });

    it("should skip when userId is missing from metadata", async () => {
      mockConstructEvent.mockReturnValue(
        createEvent("customer.subscription.deleted", {
          metadata: {},
        })
      );

      const response = await POST(createWebhookRequest());

      expect(response.status).toBe(200);
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });
  });

  // -- Unhandled event types --

  it("should return 200 for unhandled event types", async () => {
    mockConstructEvent.mockReturnValue(
      createEvent("payment_intent.created", { id: "pi_123" })
    );

    const response = await POST(createWebhookRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
  });
});
