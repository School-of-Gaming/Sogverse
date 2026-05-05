import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/products/route";

// --- Mocks ---

const { mockConstructEvent, mockSubscriptionsRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
    };
  }) as unknown as typeof import("stripe").default;
  (StripeMock as unknown as { errors: unknown }).errors = {
    StripeCardError: class StripeCardError extends Error {},
  };
  return { default: StripeMock };
});

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

// --- Fixtures ---

const RESERVATION_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-4444-444444444444";

function createWebhookRequest(): Request {
  return new Request("http://localhost:3000/api/webhooks/stripe/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "sig_test_123",
    },
    body: "raw-body",
  });
}

function createCompletedEvent(overrides: Partial<{
  id: string;
  paymentIntent: string | null;
  subscription: string | null;
  invoice: string | null;
  amountTotal: number;
  purchaseShape: string;
  currency: string;
  customer: string;
}> = {}) {
  return {
    id: overrides.id ?? "evt_completed_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_session_1",
        payment_status: "paid",
        amount_total: overrides.amountTotal ?? 10000,
        payment_intent: overrides.paymentIntent ?? "pi_test_1",
        subscription: overrides.subscription ?? null,
        invoice: overrides.invoice ?? null,
        customer: overrides.customer ?? "cus_test_1",
        metadata: {
          reservationId: RESERVATION_ID,
          productId: PRODUCT_ID,
          gamerId: GAMER_ID,
          customerId: CUSTOMER_ID,
          purchaseShape: overrides.purchaseShape ?? "bundle_4",
          currency: overrides.currency ?? "eur",
        },
      },
    },
  };
}

// --- Mock builder for the admin client ---

type AdminInserts = {
  payments_v2: Record<string, unknown>[];
  refunds_v2: Record<string, unknown>[];
  family_subscriptions_v2: Record<string, unknown>[];
  family_subscription_items_v2: Record<string, unknown>[];
};

type AdminMockOptions = {
  /** Returned from the payments_v2 idempotency check (event-id dedup). */
  existingPayment?: { id: string } | null;
  /** Returned from the family_subscriptions_v2 lookup before insert. */
  existingFamSub?: { id: string } | null;
};

function mockAdmin(opts: AdminMockOptions = {}) {
  const inserts: AdminInserts = {
    payments_v2: [],
    refunds_v2: [],
    family_subscriptions_v2: [],
    family_subscription_items_v2: [],
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "payments_v2") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: opts.existingPayment ?? null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              const id = `payment_${inserts.payments_v2.length + 1}`;
              inserts.payments_v2.push({ id, ...row });
              return Promise.resolve({ data: { id }, error: null });
            },
          }),
        }),
      };
    }
    if (table === "refunds_v2") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.refunds_v2.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    if (table === "family_subscriptions_v2") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: opts.existingFamSub ?? null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              const id = `famsub_${inserts.family_subscriptions_v2.length + 1}`;
              inserts.family_subscriptions_v2.push({ id, ...row });
              return Promise.resolve({ data: { id }, error: null });
            },
          }),
        }),
      };
    }
    if (table === "family_subscription_items_v2") {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            maybeSingle: () => {
              inserts.family_subscription_items_v2.push(row);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      };
    }
    throw new Error(`Unexpected table in admin mock: ${table}`);
  });

  return inserts;
}

// --- Tests ---

describe("POST /api/webhooks/stripe/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signature validation", () => {
    it("returns 400 when stripe-signature is missing", async () => {
      const req = new Request("http://localhost/api/webhooks/stripe/products", {
        method: "POST",
        body: "raw",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("bad sig");
      });
      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(400);
    });
  });

  describe("checkout.session.completed — happy path", () => {
    it("flips reserving → active and writes a payments_v2 row for a bundle", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "confirmed",
          participation_id: RESERVATION_ID,
          idempotent: false,
        },
        error: null,
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_reservation_v2", {
        p_reservation_id: RESERVATION_ID,
        p_credits_to_grant: 4,
      });
      expect(inserts.payments_v2).toHaveLength(1);
      expect(inserts.payments_v2[0]).toMatchObject({
        stripe_event_id: "evt_completed_1",
        customer_id: CUSTOMER_ID,
        amount_cents: 10000,
        currency: "eur",
        purpose: "bundle",
        stripe_payment_intent_id: "pi_test_1",
      });
      expect(inserts.refunds_v2).toHaveLength(0);
    });

    it("creates a family_subscriptions_v2 row on first subscription completion", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentIntent: null,
          subscription: "sub_new_1",
          invoice: "in_first_1",
          purchaseShape: "subscription_monthly",
        }),
      );
      const inserts = mockAdmin({ existingFamSub: null });
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "confirmed",
          participation_id: RESERVATION_ID,
          idempotent: false,
        },
        error: null,
      });
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: "sub_new_1",
        status: "active",
        items: {
          data: [
            {
              id: "si_1",
              price: { id: "price_test_1" },
              current_period_end: 1900000000,
            },
          ],
        },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.family_subscriptions_v2).toHaveLength(1);
      expect(inserts.family_subscriptions_v2[0]).toMatchObject({
        customer_id: CUSTOMER_ID,
        stripe_subscription_id: "sub_new_1",
        frequency: "monthly",
        currency: "eur",
        status: "active",
      });
      expect(inserts.family_subscription_items_v2).toHaveLength(1);
      expect(inserts.family_subscription_items_v2[0]).toMatchObject({
        family_subscription_id: "famsub_1",
        participation_id: RESERVATION_ID,
        stripe_subscription_item_id: "si_1",
        stripe_price_id: "price_test_1",
      });
    });
  });

  describe("checkout.session.completed — idempotency / dedup", () => {
    it("bails before calling the RPC if the event id is already recorded", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin({ existingPayment: { id: "payment_existing" } });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("skips when required metadata is missing", async () => {
      const event = createCompletedEvent();
      // Force an incomplete metadata payload.
      (event.data.object as { metadata: Record<string, string | undefined> })
        .metadata.reservationId = undefined;
      mockConstructEvent.mockReturnValue(event);
      mockAdmin();

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });
  });

  describe("checkout.session.completed — orphan", () => {
    it("logs and writes nothing when confirm_reservation_v2 returns orphan", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: { kind: "orphan" },
        error: null,
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments_v2).toHaveLength(0);
      expect(inserts.refunds_v2).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("orphan confirmation"),
        expect.objectContaining({ reservationId: RESERVATION_ID }),
      );
      errorSpy.mockRestore();
    });
  });

  describe("checkout.session.completed — pay-twice (unique constraint)", () => {
    it("logs and bails when confirm RPC raises 23505 (second active row blocked)", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({ id: "evt_completed_2", paymentIntent: "pi_dup_1" }),
      );
      const inserts = mockAdmin();
      // Postgres unique_violation surfaces through PostgREST as code "23505".
      mockAdminRpc.mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments_v2).toHaveLength(0);
      expect(inserts.refunds_v2).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("pay-twice detected"),
        expect.objectContaining({
          reservationId: RESERVATION_ID,
          eventId: "evt_completed_2",
          paymentIntent: "pi_dup_1",
        }),
      );
      errorSpy.mockRestore();
    });

    it("rethrows non-23505 RPC errors so Stripe retries", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent({ id: "evt_completed_3" }));
      mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      errorSpy.mockRestore();
    });
  });

  describe("checkout.session.expired", () => {
    it("calls expire_reservation_v2 with the metadata reservation id", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_expired_1",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_expired_1",
            metadata: { reservationId: RESERVATION_ID },
          },
        },
      });
      mockAdminRpc.mockResolvedValue({ data: { kind: "expired" }, error: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).toHaveBeenCalledWith("expire_reservation_v2", {
        p_reservation_id: RESERVATION_ID,
      });
    });

    it("is a no-op when the metadata reservation id is missing", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_expired_2",
        type: "checkout.session.expired",
        data: { object: { id: "cs_expired_2", metadata: {} } },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });
  });
});
