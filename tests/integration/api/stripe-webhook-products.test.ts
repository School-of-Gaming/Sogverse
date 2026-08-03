import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/products/route";

// --- Mocks ---

const {
  mockConstructEvent,
  mockSubscriptionsRetrieve,
  mockSubscriptionsCancel,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsCancel: vi.fn(),
}));

vi.mock("stripe", () => {
  // Object.assign produces the intersection type, so `errors` rides along
  // without any cast. The route only ever does `new Stripe(...)` and uses
  // the two nested methods.
  const StripeMock = Object.assign(
    vi.fn(function () {
      return {
        webhooks: { constructEvent: mockConstructEvent },
        subscriptions: {
          retrieve: mockSubscriptionsRetrieve,
          cancel: mockSubscriptionsCancel,
        },
      };
    }),
    {
      errors: {
        StripeCardError: class StripeCardError extends Error {},
      },
    },
  );
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

const PARTICIPATION_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "cs_test_session_1";
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
        id: SESSION_ID,
        payment_status: "paid",
        amount_total: overrides.amountTotal ?? 10000,
        payment_intent: overrides.paymentIntent ?? "pi_test_1",
        subscription: overrides.subscription ?? null,
        invoice: overrides.invoice ?? null,
        customer: overrides.customer ?? "cus_test_1",
        metadata: {
          productId: PRODUCT_ID,
          gamerId: GAMER_ID,
          customerId: CUSTOMER_ID,
          purchaseShape: overrides.purchaseShape ?? "single_payment",
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
};

type AdminMockOptions = {
  /** Returned from the payments idempotency check (event-id dedup). */
  existingPayment?: { id: string } | null;
  /**
   * Returned from a `family_subscriptions` SELECT lookup. The deleted/updated/
   * invoice handlers look the row up by stripe_subscription_id; the
   * checkout-completed handler doesn't (each sub is brand-new — it just inserts).
   */
  famSubRow?: Record<string, unknown> | null;
  /**
   * Error returned from the `family_subscriptions` INSERT. `23505` is the
   * swallowed duplicate (replay); anything else bubbles to a 500 so Stripe
   * retries. When set, the row is not captured in `inserts`.
   */
  famSubInsertError?: { code: string; message: string } | null;
};

function mockAdmin(opts: AdminMockOptions = {}) {
  const inserts: AdminInserts = {
    payments: [],
    refunds: [],
    family_subscriptions: [],
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
              Promise.resolve({ data: opts.famSubRow ?? null, error: null }),
          }),
        }),
        // One per-participation row per subscription; the route inserts and
        // swallows 23505 on replay. On a forced insert error, don't capture the
        // row — mirrors a real failed write so tests can assert the payment row
        // (the commit marker) wasn't reached.
        insert: (row: Record<string, unknown>) => {
          if (opts.famSubInsertError) {
            return Promise.resolve({ error: opts.famSubInsertError });
          }
          inserts.family_subscriptions.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    // `participations` deliberately has no entry: the handler reaches that
    // table only through confirm_paid_participation, never with a direct write.
    // A table appearing here that shouldn't should fail loudly.
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
    it("creates the participation and writes a payments row for a single_payment", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "confirmed",
          participation_id: PARTICIPATION_ID,
          idempotent: false,
        },
        error: null,
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_paid_participation", {
        p_product_id: PRODUCT_ID,
        p_gamer_id: GAMER_ID,
        p_customer_id: CUSTOMER_ID,
        p_checkout_session_id: SESSION_ID,
      });
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        stripe_event_id: "evt_completed_1",
        customer_id: CUSTOMER_ID,
        amount_cents: 10000,
        currency: "eur",
        purpose: "single_payment",
        stripe_payment_intent_id: "pi_test_1",
      });
      expect(inserts.refunds).toHaveLength(0);
    });

    it("writes a per-participation family_subscriptions row on subscription completion", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentIntent: null,
          subscription: "sub_new_1",
          invoice: "in_first_1",
          purchaseShape: "subscription_monthly",
        }),
      );
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "confirmed",
          participation_id: PARTICIPATION_ID,
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

      // One sub row, keyed to the participation, with the Price snapshot. There
      // is no separate item join row anymore — the sub IS the (gamer, club) link.
      expect(inserts.family_subscriptions).toHaveLength(1);
      expect(inserts.family_subscriptions[0]).toMatchObject({
        customer_id: CUSTOMER_ID,
        participation_id: PARTICIPATION_ID,
        stripe_subscription_id: "sub_new_1",
        stripe_price_id: "price_test_1",
        currency: "eur",
        status: "active",
      });
    });
  });

  describe("checkout.session.completed — sub row gates the payment commit marker", () => {
    function subscriptionCompletion() {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentIntent: null,
          subscription: "sub_new_1",
          invoice: "in_first_1",
          purchaseShape: "subscription_monthly",
        }),
      );
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "confirmed",
          participation_id: PARTICIPATION_ID,
          idempotent: false,
        },
        error: null,
      });
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: "sub_new_1",
        status: "active",
        items: {
          data: [
            { id: "si_1", price: { id: "price_test_1" }, current_period_end: 1900000000 },
          ],
        },
      });
    }

    it("does not write the payment row when the sub insert fails (so Stripe's retry re-runs)", async () => {
      subscriptionCompletion();
      // Non-23505 sub insert error → handler throws → 500 so Stripe retries.
      const inserts = mockAdmin({
        famSubInsertError: { code: "23503", message: "fk violation" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);

      // The payment row is the commit marker the top-of-handler idempotency
      // guard keys on. Because the sub row is written first, a failed sub insert
      // leaves no payment behind — so the retry re-runs the whole handler instead
      // of short-circuiting and orphaning a live recurring Stripe sub. (Under the
      // old order — payment first — this row would already be written and the
      // retry would skip the sub forever.)
      expect(inserts.payments).toHaveLength(0);
    });

    it("swallows a duplicate (23505) sub insert on replay and still records the payment", async () => {
      subscriptionCompletion();
      const inserts = mockAdmin({
        famSubInsertError: { code: "23505", message: "duplicate key" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      // Sub row already existed (replay) → swallowed, not re-captured — but the
      // handler runs to completion and the payment commit marker still lands.
      expect(inserts.family_subscriptions).toHaveLength(0);
      expect(inserts.payments).toHaveLength(1);
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
      // Force an incomplete metadata payload. The metadata is now the only
      // thing naming who the seat is for, so a missing field has to stop the
      // handler rather than have it guess.
      (event.data.object as { metadata: Record<string, string | undefined> })
        .metadata.gamerId = undefined;
      mockConstructEvent.mockReturnValue(event);
      mockAdmin();

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });
  });

  describe("checkout.session.completed — unexpected RPC shape", () => {
    it("returns 500 so Stripe retries when the RPC answers with an unknown kind", async () => {
      // There is no 'orphan' outcome any more — nothing exists before payment
      // to go missing. A kind this handler doesn't know is a real mismatch
      // between route and database, so it must not be swallowed as a 200.
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue({
        data: { kind: "orphan" },
        error: null,
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      expect(inserts.payments).toHaveLength(0);
      errorSpy.mockRestore();
    });
  });

  describe("checkout.session.completed — duplicate_payment", () => {
    const EXISTING_PARTICIPATION_ID = "55555555-5555-5555-5555-555555555555";

    function duplicatePayment() {
      mockAdminRpc.mockResolvedValue({
        data: {
          kind: "duplicate_payment",
          existing_participation_id: EXISTING_PARTICIPATION_ID,
          existing_status: "active",
        },
        error: null,
      });
    }

    it("logs and records the duplicate payment for a single payment, with no Stripe cancel", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({ id: "evt_completed_2", paymentIntent: "pi_dup_1" }),
      );
      const inserts = mockAdmin();
      duplicatePayment();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      // Structured log with all the fields admin needs to triage the refund.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("duplicate payment detected"),
        expect.objectContaining({
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

      // One-off charge: nothing recurring to stop, so no Stripe call. The
      // refund stays a manual admin action.
      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("cancels the duplicate Stripe subscription so it stops recurring", async () => {
      // By the time this event fires the second subscription is live and will
      // bill again next month. No family_subscriptions row is written for it,
      // so nothing else in the system would ever stop it: renewals drop in the
      // invoice handler and a cancellation finds no row to tear down. Refunding
      // one invoice does not stop the next one — the sub has to be cancelled.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          id: "evt_completed_dup_sub",
          paymentIntent: null,
          subscription: "sub_duplicate_1",
          invoice: "in_dup_1",
          purchaseShape: "subscription_monthly",
        }),
      );
      const inserts = mockAdmin();
      duplicatePayment();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_duplicate_1");
      // The duplicate charge is still recorded for the manual refund, and no
      // subscription row is written — the sub is going away.
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        purpose: "reservation_duplicate",
      });
      expect(inserts.family_subscriptions).toHaveLength(0);

      errorSpy.mockRestore();
    });

    it("still records the duplicate charge, loudly, when the cancel fails", async () => {
      // A cancel is not safely repeatable, so this branch must not throw for a
      // free Stripe retry: it would loop, and nothing would ever be recorded.
      // The charge lands either way and the failure joins the log the admin is
      // already reading.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          id: "evt_completed_dup_sub_fail",
          paymentIntent: null,
          subscription: "sub_duplicate_2",
          invoice: "in_dup_2",
          purchaseShape: "subscription_monthly",
        }),
      );
      const inserts = mockAdmin();
      duplicatePayment();
      mockSubscriptionsCancel.mockRejectedValueOnce(
        new Error("Stripe is unreachable"),
      );
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not cancel the duplicate subscription"),
        expect.objectContaining({ subscription: "sub_duplicate_2" }),
      );

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
    it("is an unhandled event — an abandoned session leaves nothing behind", async () => {
      // Nothing is written before payment, so an expiring session has no seat
      // to reclaim. The event falls through to the default arm and is answered
      // 200 without touching the database.
      mockConstructEvent.mockReturnValue({
        id: "evt_expired_1",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_expired_1",
            metadata: {
              productId: PRODUCT_ID,
              gamerId: GAMER_ID,
              customerId: CUSTOMER_ID,
            },
          },
        },
      });
      mockAdmin();

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.deleted — portal-only cancel teardown", () => {
    function createDeletedEvent(subId: string) {
      return {
        id: "evt_deleted_1",
        type: "customer.subscription.deleted",
        data: { object: { id: subId } },
      };
    }

    it("tears the participation down via cancel_participation when we own the sub", async () => {
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_live_1"));
      mockAdmin({ famSubRow: { participation_id: PARTICIPATION_ID } });
      mockAdminRpc.mockResolvedValue({
        data: { kind: "cancelled" },
        error: null,
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      // Stripe already cancelled the sub — we only tear down our DB. Deleting
      // the participation CASCADEs the family_subscriptions row away.
      expect(mockAdminRpc).toHaveBeenCalledWith("cancel_participation", {
        p_participation_id: PARTICIPATION_ID,
        p_reason: "subscription_cancelled",
      });
    });

    it("is a no-op for a sub we don't have a row for (e.g. a replayed deletion)", async () => {
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_unknown"));
      mockAdmin({ famSubRow: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });
  });
});
