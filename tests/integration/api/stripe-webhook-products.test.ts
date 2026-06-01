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
  payments: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  family_subscriptions: Record<string, unknown>[];
  family_subscription_items: Record<string, unknown>[];
  participations_deletes: { id: string; status: string }[];
};

type AdminMockOptions = {
  /** Returned from the payments idempotency check (event-id dedup). */
  existingPayment?: { id: string } | null;
  /** Returned from the family_subscriptions lookup before insert. */
  existingFamSub?: { id: string } | null;
};

function mockAdmin(opts: AdminMockOptions = {}) {
  const inserts: AdminInserts = {
    payments: [],
    refunds: [],
    family_subscriptions: [],
    family_subscription_items: [],
    participations_deletes: [],
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "payments") {
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
              const id = `payment_${inserts.payments.length + 1}`;
              inserts.payments.push({ id, ...row });
              return Promise.resolve({ data: { id }, error: null });
            },
          }),
        }),
      };
    }
    if (table === "refunds") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.refunds.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    if (table === "family_subscriptions") {
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
              const id = `famsub_${inserts.family_subscriptions.length + 1}`;
              inserts.family_subscriptions.push({ id, ...row });
              return Promise.resolve({ data: { id }, error: null });
            },
          }),
        }),
      };
    }
    if (table === "family_subscription_items") {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            maybeSingle: () => {
              inserts.family_subscription_items.push(row);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      };
    }
    if (table === "participations") {
      // Only the duplicate_payment branch deletes from this table; capture
      // the (id, status) filter so tests can assert what was released.
      return {
        delete: () => ({
          eq: (col: string, val: string) => {
            const filter: { id: string; status: string } = { id: "", status: "" };
            if (col === "id") filter.id = val;
            else if (col === "status") filter.status = val;
            return {
              eq: (col2: string, val2: string) => {
                if (col2 === "id") filter.id = val2;
                else if (col2 === "status") filter.status = val2;
                inserts.participations_deletes.push(filter);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
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
    it("flips reserving → active and writes a payments row for a bundle", async () => {
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

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_reservation", {
        p_reservation_id: RESERVATION_ID,
        p_credits_to_grant: 4,
      });
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        stripe_event_id: "evt_completed_1",
        customer_id: CUSTOMER_ID,
        amount_cents: 10000,
        currency: "eur",
        purpose: "bundle",
        stripe_payment_intent_id: "pi_test_1",
      });
      expect(inserts.refunds).toHaveLength(0);
    });

    it("creates a family_subscriptions row on first subscription completion", async () => {
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

      expect(inserts.family_subscriptions).toHaveLength(1);
      expect(inserts.family_subscriptions[0]).toMatchObject({
        customer_id: CUSTOMER_ID,
        stripe_subscription_id: "sub_new_1",
        frequency: "monthly",
        currency: "eur",
        status: "active",
      });
      expect(inserts.family_subscription_items).toHaveLength(1);
      expect(inserts.family_subscription_items[0]).toMatchObject({
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
    it("logs and writes nothing when confirm_reservation returns orphan", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: { kind: "orphan" },
        error: null,
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments).toHaveLength(0);
      expect(inserts.refunds).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("orphan confirmation"),
        expect.objectContaining({ reservationId: RESERVATION_ID }),
      );
      errorSpy.mockRestore();
    });
  });

  describe("checkout.session.completed — duplicate_payment", () => {
    it("logs, records the duplicate payment, and releases the orphan reserving row", async () => {
      const EXISTING_PARTICIPATION_ID = "55555555-5555-5555-5555-555555555555";
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({ id: "evt_completed_2", paymentIntent: "pi_dup_1" }),
      );
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "duplicate_payment",
          reservation_id: RESERVATION_ID,
          existing_participation_id: EXISTING_PARTICIPATION_ID,
          product_id: PRODUCT_ID,
          gamer_id: GAMER_ID,
          customer_id: CUSTOMER_ID,
        },
        error: null,
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      // Structured log with all the fields admin needs to triage the refund.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("duplicate payment detected"),
        expect.objectContaining({
          reservationId: RESERVATION_ID,
          existingParticipationId: EXISTING_PARTICIPATION_ID,
          eventId: "evt_completed_2",
          customerId: CUSTOMER_ID,
          gamerId: GAMER_ID,
          productId: PRODUCT_ID,
          paymentIntent: "pi_dup_1",
        }),
      );

      // Payments row recorded under the new purpose so admin can filter.
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        purpose: "reservation_duplicate",
        stripe_event_id: "evt_completed_2",
        stripe_payment_intent_id: "pi_dup_1",
        customer_id: CUSTOMER_ID,
      });

      // Orphan reserving row released so it doesn't permanently hold a seat.
      expect(inserts.participations_deletes).toHaveLength(1);
      expect(inserts.participations_deletes[0]).toEqual({
        id: RESERVATION_ID,
        status: "reserving",
      });

      errorSpy.mockRestore();
    });

    it("rethrows generic RPC errors so Stripe retries", async () => {
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
    it("calls expire_reservation with the metadata reservation id", async () => {
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
      expect(mockAdminRpc).toHaveBeenCalledWith("expire_reservation", {
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
