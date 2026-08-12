import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/products/route";

// --- Mocks ---

const { stripeMock } = await vi.hoisted(async () => ({
  stripeMock: (await import("../../mocks/stripe")).createStripeMock(),
}));

vi.mock("stripe", async () =>
  (await import("../../mocks/stripe")).stripeModuleMock(stripeMock),
);

const mockConstructEvent = stripeMock.webhooks.constructEvent;
const mockSubscriptionsRetrieve = stripeMock.subscriptions.retrieve;
const mockSubscriptionsCancel = stripeMock.subscriptions.cancel;

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
const FAM_SUB_ROW_ID = "66666666-6666-6666-6666-666666666666";
const PAYMENT_ROW_ID = "77777777-7777-7777-7777-777777777777";
const SUB_ID = "sub_live_1";

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
  /**
   * Stripe's own `mode` on the session — the axis the €0 gate turns on, and
   * therefore not derivable from our `purchaseShape` metadata for the purposes
   * of a test that is *about* that gate. Defaults to whichever mode the route
   * would really have created for the given shape.
   */
  mode: string;
  paymentStatus: string;
}> = {}) {
  const purchaseShape = overrides.purchaseShape ?? "single_payment";
  return {
    id: overrides.id ?? "evt_completed_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: SESSION_ID,
        mode:
          overrides.mode ??
          (purchaseShape.startsWith("subscription_")
            ? "subscription"
            : "payment"),
        payment_status: overrides.paymentStatus ?? "paid",
        amount_total: overrides.amountTotal ?? 10000,
        payment_intent: overrides.paymentIntent ?? "pi_test_1",
        subscription: overrides.subscription ?? null,
        invoice: overrides.invoice ?? null,
        customer: overrides.customer ?? "cus_test_1",
        metadata: {
          productId: PRODUCT_ID,
          participantId: GAMER_ID,
          customerId: CUSTOMER_ID,
          purchaseShape,
          currency: overrides.currency ?? "eur",
        },
      },
    },
  };
}

// Which payload shape a delivery arrives in is decided by the API version pinned
// on the webhook *endpoint*, not by the version our own client sends outbound. The
// placement below is named for **where the field sits** rather than for an era: at
// the version this codebase pins to (`2025-02-24.acacia`) an invoice arrives in the
// *earlier* of its two shapes, so an "old"/"new" axis would read backwards.

/**
 * Where an invoice carries its subscription id.
 *
 *   `top-level` — `subscription`, up to and including `2025-02-24.acacia`. **This
 *                 is what will actually arrive once the endpoint is pinned**, so
 *                 it is the live case, not a legacy one.
 *   `parent`    — `parent.subscription_details.subscription`, from
 *                 `2025-03-31.basil` on, where the top-level field is gone. Not
 *                 delivered at our pin; covered because replayed historical events
 *                 keep their creation-time shape forever and because the pin will
 *                 eventually move.
 */
type InvoiceSubscriptionPlacement = "top-level" | "parent";

/**
 * An `invoice.paid` renewal.
 *
 * Each fixture carries the subscription id in **exactly one** of the two places
 * Stripe has kept it, which is what makes the pair meaningful: a fixture with
 * both would pass even for a handler that reads only whichever field it happens
 * to prefer.
 */
function createInvoicePaidEvent(overrides: {
  placement: InvoiceSubscriptionPlacement;
  id?: string;
  subscription?: string;
  billingReason?: string;
  amountPaid?: number;
}) {
  const subscription = overrides.subscription ?? SUB_ID;
  return {
    id: overrides.id ?? "evt_invoice_1",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_renewal_1",
        amount_paid: overrides.amountPaid ?? 4900,
        currency: "eur",
        billing_reason: overrides.billingReason ?? "subscription_cycle",
        ...(overrides.placement === "top-level"
          ? { subscription }
          : { parent: { subscription_details: { subscription } } }),
      },
    },
  };
}

/**
 * A `customer.subscription.updated` event.
 *
 * `status` is deliberately a plain string: the point of several of these tests is
 * a status the route's mapping table does not know, which Stripe's own union type
 * would refuse to express. `current_period_end` sits at the top level (the older
 * placement) while the item carries none, which also exercises the route reading
 * whichever side has it.
 */
function createSubscriptionUpdatedEvent(overrides: {
  status: string;
  id?: string;
  subscription?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number;
}) {
  return {
    id: overrides.id ?? "evt_sub_updated_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: overrides.subscription ?? SUB_ID,
        status: overrides.status,
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        current_period_end: overrides.currentPeriodEnd ?? 1900000000,
        items: { data: [{ id: "si_1", price: { id: "price_test_1" } }] },
      },
    },
  };
}

// --- Mock builder for the admin client ---

type AdminInserts = {
  payments: Record<string, unknown>[];
  family_subscriptions: Record<string, unknown>[];
  /**
   * Payloads passed to `family_subscriptions` UPDATE. Separate from the inserts
   * above because the subscription-updated handler only ever updates, and what it
   * writes into `status` is the thing under test.
   */
  familySubscriptionUpdates: Record<string, unknown>[];
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
  /**
   * Error returned from the `family_subscriptions` UPDATE. A rejected status is
   * exactly what this looks like in production (the column's CHECK refuses the
   * value), and it must reach the caller as a 500 rather than being dropped.
   */
  famSubUpdateError?: { code: string; message: string } | null;
};

function mockAdmin(opts: AdminMockOptions = {}) {
  const inserts: AdminInserts = {
    payments: [],
    family_subscriptions: [],
    familySubscriptionUpdates: [],
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "payments") {
      return {
        // Both handlers read this table for one reason only — the
        // `stripe_event_id` dedup guard — so one answer covers every SELECT.
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.existingPayment ?? null,
                error: null,
              }),
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
        update: (row: Record<string, unknown>) => ({
          eq: () => {
            if (opts.famSubUpdateError) {
              return Promise.resolve({ error: opts.famSubUpdateError });
            }
            inserts.familySubscriptionUpdates.push(row);
            return Promise.resolve({ error: null });
          },
        }),
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
        p_participant_id: GAMER_ID,
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
      // The ledger echo keeps the historical spelling on purpose — every
      // payments row ever written carries `gamerId`, and forking the stored
      // shape at the rename would buy nothing and cost every future reader.
      expect(inserts.payments[0].metadata).toMatchObject({
        gamerId: GAMER_ID,
        productId: PRODUCT_ID,
        participationId: PARTICIPATION_ID,
      });
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

  /**
   * The €0 completion, which is what deferred billing produces.
   *
   * A club bought before it starts sets a billing anchor and disables
   * prorations, so the Checkout Session totals zero and Stripe reports
   * `payment_status: "no_payment_required"`. The handler used to require
   * `"paid"` and returned 200 having created nothing — a silent failure that
   * would have made the whole feature produce no participations at all. The
   * widening is keyed on the session's **mode**, not on any deferral marker, so
   * it also covers a 100%-off promotion code on a club starting today.
   */
  describe("checkout.session.completed — a €0 subscription still buys a seat", () => {
    function zeroDueSubscription(mode: string, invoice: string | null = null) {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentStatus: "no_payment_required",
          mode,
          amountTotal: 0,
          paymentIntent: null,
          subscription: "sub_deferred_1",
          invoice,
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
        id: "sub_deferred_1",
        status: "active",
        items: {
          data: [
            {
              id: "si_1",
              price: { id: "price_test_1" },
              // The anchor: no invoice exists until this instant.
              current_period_end: 1900000000,
            },
          ],
        },
      });
    }

    it("creates the participation and the subscription row", async () => {
      zeroDueSubscription("subscription");
      const inserts = mockAdmin();

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_paid_participation", {
        p_product_id: PRODUCT_ID,
        p_participant_id: GAMER_ID,
        p_customer_id: CUSTOMER_ID,
        p_checkout_session_id: SESSION_ID,
      });
      expect(inserts.family_subscriptions).toHaveLength(1);
      expect(inserts.family_subscriptions[0]).toMatchObject({
        participation_id: PARTICIPATION_ID,
        stripe_subscription_id: "sub_deferred_1",
        // `active` from purchase, not `trialing`: an anchored subscription is
        // live, the seat is held, and the sessions show.
        status: "active",
      });
    });

    it("leaves the zero-amount payment row as the idempotency marker", async () => {
      // Amount 0 and the ordinary `subscription_invoice` purpose. That exact
      // shape is the accepted outcome: it is what stops a redelivery re-running
      // the handler, and the real charge lands later through invoice.paid.
      //
      // The session here *does* name an invoice, because whether Stripe raises a
      // €0 `subscription_create` invoice for an anchored subscription is not
      // something this route depends on either way — what it must do is record
      // whichever invoice the session names, so a marker row can be traced back.
      // (A session naming none simply leaves the column null.)
      zeroDueSubscription("subscription", "in_zero_1");
      const inserts = mockAdmin();

      await POST(createWebhookRequest());

      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        amount_cents: 0,
        purpose: "subscription_invoice",
        stripe_invoice_id: "in_zero_1",
      });
      expect(inserts.payments[0].metadata).toMatchObject({
        participationId: PARTICIPATION_ID,
      });
    });

    it("still ignores a payment-mode session that collected nothing", async () => {
      // A camp or event is bought outright: a one-off that took no money bought
      // nothing, so the widening deliberately stops at the mode boundary.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentStatus: "no_payment_required",
          mode: "payment",
          amountTotal: 0,
          purchaseShape: "single_payment",
        }),
      );
      const inserts = mockAdmin();

      const res = await POST(createWebhookRequest());

      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(inserts.payments).toEqual([]);
    });

    it("still ignores an unpaid session in either mode", async () => {
      for (const mode of ["subscription", "payment"]) {
        vi.clearAllMocks();
        mockConstructEvent.mockReturnValue(
          createCompletedEvent({ paymentStatus: "unpaid", mode }),
        );
        const inserts = mockAdmin();

        const res = await POST(createWebhookRequest());

        expect(res.status).toBe(200);
        expect(mockAdminRpc, mode).not.toHaveBeenCalled();
        expect(inserts.payments, mode).toEqual([]);
      }
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
        .metadata.participantId = undefined;
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
          participantId: GAMER_ID,
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
              participantId: GAMER_ID,
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

  describe("invoice.paid — renewals, from either field placement", () => {
    // The renewal hot loop: every live subscription fires this once a period, and
    // the row it writes is the only record that the money arrived. The two
    // placements are the same event as delivered by two webhook endpoint versions,
    // so a handler that reads one and not the other stops recording renewals the
    // moment the endpoint's version moves — silently, with a 200.
    const RENEWAL_FAM_SUB = {
      id: FAM_SUB_ROW_ID,
      customer_id: CUSTOMER_ID,
      currency: "eur",
    };

    it("records the renewal payment when the subscription id is top-level", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({
          placement: "top-level",
          id: "evt_invoice_top_level",
        }),
      );
      const inserts = mockAdmin({ famSubRow: RENEWAL_FAM_SUB });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        stripe_event_id: "evt_invoice_top_level",
        // Read from the family-sub row, never from invoice metadata — the row is
        // what ties this Stripe subscription to a customer of ours.
        customer_id: CUSTOMER_ID,
        amount_cents: 4900,
        currency: "eur",
        purpose: "subscription_invoice",
        stripe_invoice_id: "in_renewal_1",
        metadata: { stripeSubscriptionId: SUB_ID, billingReason: "subscription_cycle" },
      });
    });

    it("records the renewal payment when the subscription id is under parent.subscription_details", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({ placement: "parent", id: "evt_invoice_parent" }),
      );
      const inserts = mockAdmin({ famSubRow: RENEWAL_FAM_SUB });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        stripe_event_id: "evt_invoice_parent",
        customer_id: CUSTOMER_ID,
        purpose: "subscription_invoice",
        // The id has to have been found under `parent` — the fixture carries no
        // top-level `subscription` at all, so a handler reading only that location
        // would have bailed before writing anything.
        metadata: { stripeSubscriptionId: SUB_ID, billingReason: "subscription_cycle" },
      });
    });

    it("skips the first-period invoice, which checkout.session.completed already recorded", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({
          placement: "parent",
          billingReason: "subscription_create",
        }),
      );
      const inserts = mockAdmin({ famSubRow: RENEWAL_FAM_SUB });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
    });

    it("is a no-op for a subscription we have no row for", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({
          placement: "parent",
          subscription: "sub_foreign",
        }),
      );
      const inserts = mockAdmin({ famSubRow: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
    });

    it("ignores a one-off invoice, which carries no subscription in either placement", async () => {
      // One-off checkouts create invoices now — the thing that makes a credit
      // note (and therefore a VAT-reversing refund) possible — so `invoice.paid`
      // fires for purchases that have no subscription at all. That is a live
      // path rather than a defensive one, and every other fixture here supplies
      // a subscription id.
      //
      // The handler must return before it reads or writes anything: the sale
      // was already recorded by checkout.session.completed, and a second
      // payments row here would double-count it.
      mockConstructEvent.mockReturnValue({
        id: "evt_invoice_one_off",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_one_off_1",
            amount_paid: 15000,
            currency: "eur",
            billing_reason: "manual",
          },
        },
      });
      const inserts = mockAdmin({ famSubRow: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
      // Before any read — not merely before the write. The admin client is
      // never touched, so a one-off invoice costs no database round trip.
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });

    it("writes nothing on a replay, where the event id is already recorded", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({ placement: "top-level" }),
      );
      const inserts = mockAdmin({
        famSubRow: RENEWAL_FAM_SUB,
        existingPayment: { id: PAYMENT_ROW_ID },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
    });
  });

  describe("customer.subscription.updated — status mapping", () => {
    // `family_subscriptions.status` has a CHECK accepting only
    // active | past_due | cancelled | incomplete | canceling. Stripe's own status
    // set is wider and spells cancellation differently, so every value is
    // translated before it is written. Passing one through verbatim used to
    // produce a rejected write whose error was dropped: the row kept its old
    // status and the route answered 200.
    const OURS = { id: FAM_SUB_ROW_ID };

    it("maps trialing onto active", async () => {
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "trialing" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates).toHaveLength(1);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "active",
        current_period_end: new Date(1900000000 * 1000).toISOString(),
      });
    });

    it("maps unpaid onto cancelled", async () => {
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "unpaid" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "cancelled",
      });
    });

    it("maps Stripe's 'canceled' onto our 'cancelled'", async () => {
      // One l versus two. Verbatim, this alone violated the CHECK.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "canceled" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "cancelled",
      });
    });

    it("maps paused onto past_due", async () => {
      // A judgment call, and the one worth stating in a test: we never pause a
      // subscription ourselves, so this only arrives from a hand action in the
      // dashboard. `past_due` keeps the seat and raises the parent's
      // payment-problem surface, which is the visible outcome we want for a sub
      // that has quietly stopped billing.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "paused" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "past_due",
      });
    });

    it("maps incomplete_expired onto cancelled", async () => {
      // The first payment never completed and the subscription can no longer be
      // paid — dead, not merely incomplete.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "incomplete_expired" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "cancelled",
      });
    });

    it("keeps active + cancel_at_period_end as canceling", async () => {
      // The pre-existing special case: Stripe draws this distinction with a
      // boolean, we draw it with a status, and the parent's "ending soon" badge
      // keys on ours.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "active",
          cancelAtPeriodEnd: true,
        }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "canceling",
      });
    });

    it("keeps trialing + cancel_at_period_end as canceling, not active", async () => {
      // Stripe leaves a cancelling subscription at `trialing` for the rest of its
      // trial rather than moving it to `active`, so a special case that only
      // checks `active` misses it entirely — and with `trialing` mapping to
      // `active`, a parent who cancels mid-trial reads as plainly active: no
      // ending badge, no access-until cap. Migrated subscriptions carry real
      // trials, so this is reachable today, not hypothetically.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "trialing",
          cancelAtPeriodEnd: true,
        }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "canceling",
      });
    });

    it("leaves past_due + cancel_at_period_end as past_due", async () => {
      // Deliberately not folded into the canceling rule: the parent-facing badges
      // treat "ending soon" and "payment problem" as mutually exclusive, and a
      // failing card is the more urgent of the two.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "past_due",
          cancelAtPeriodEnd: true,
        }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "past_due",
      });
    });

    it("returns 500 for a status nothing maps to, rather than writing a rejected value", async () => {
      // A status Stripe adds that this route has never heard of. A 500 is the
      // right answer: Stripe retries it and it shows up in the logs, where the
      // alternative — pass it through, ignore the rejected write — left the row
      // stale and said nothing.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "hibernating" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      expect(inserts.familySubscriptionUpdates).toHaveLength(0);
      errorSpy.mockRestore();
    });

    it("propagates a failed update as a 500 instead of dropping it", async () => {
      // The second half of the same bug: the update's error was never read, so
      // any rejected write — a CHECK violation, a dropped connection — presented
      // as success.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "past_due" }),
      );
      mockAdmin({
        famSubRow: OURS,
        famSubUpdateError: { code: "23514", message: "check constraint violated" },
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      errorSpy.mockRestore();
    });

    it("ignores a subscription we have no row for", async () => {
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "unpaid",
          subscription: "sub_foreign",
        }),
      );
      const inserts = mockAdmin({ famSubRow: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates).toHaveLength(0);
    });
  });

  describe("checkout.session.completed — subscription status is mapped too", () => {
    function subscriptionCheckout(subId: string) {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentIntent: null,
          subscription: subId,
          invoice: "in_trial_1",
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
    }

    it("stores a trialing subscription as active", async () => {
      // The same translation is needed on the insert path: a club sold with a
      // trial arrives `trialing` from subscriptions.retrieve, and verbatim that
      // is a CHECK violation.
      subscriptionCheckout("sub_trial_1");
      const inserts = mockAdmin();
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: "sub_trial_1",
        status: "trialing",
        cancel_at_period_end: false,
        items: {
          data: [
            { id: "si_1", price: { id: "price_test_1" }, current_period_end: 1900000000 },
          ],
        },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.family_subscriptions).toHaveLength(1);
      expect(inserts.family_subscriptions[0]).toMatchObject({
        stripe_subscription_id: "sub_trial_1",
        status: "active",
      });
    });

    it("degrades an unmapped status to incomplete rather than throwing mid-sequence", async () => {
      // The asymmetry with the update path, and the reason for it. By this point
      // the Stripe subscription is live and charging, and the payment row — the
      // commit marker — has not been written. A throw here would 500, Stripe would
      // retry, the retry would read the same unmapped status and fail again
      // forever, and the subscription would be left with NO family_subscriptions
      // row: renewals drop in the invoice handler and a cancellation finds nothing
      // to tear the participation down with. That is exactly the state the
      // write-ordering in this handler exists to prevent, so an untranslated
      // status degrades instead: log it, store the safe corner of the vocabulary,
      // let the payment land, and leave a human a small correction rather than an
      // untracked live subscription.
      subscriptionCheckout("sub_unmapped_1");
      const inserts = mockAdmin();
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: "sub_unmapped_1",
        status: "hibernating",
        cancel_at_period_end: false,
        items: {
          data: [
            { id: "si_1", price: { id: "price_test_1" }, current_period_end: 1900000000 },
          ],
        },
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(inserts.family_subscriptions).toHaveLength(1);
      expect(inserts.family_subscriptions[0]).toMatchObject({
        stripe_subscription_id: "sub_unmapped_1",
        status: "incomplete",
      });
      // And the payment row still lands, so the retry does not re-run the handler.
      expect(inserts.payments).toHaveLength(1);

      // Loud enough to find, and it names both the sub and the status a human
      // needs in order to fix the row.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("unmapped Stripe subscription status"),
        expect.objectContaining({
          subscription: "sub_unmapped_1",
          stripeStatus: "hibernating",
        }),
      );
      errorSpy.mockRestore();
    });
  });
});
