import { describe, it, expect, vi, beforeEach } from "vitest";
import { SITE_ORIGIN } from "../../mocks/site-origin";

// The confirmation mail's My SOG link comes from getOrigin(), which falls back
// to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host — which is
// what a Stripe delivery looks like here.
process.env.NEXT_PUBLIC_SITE_URL = SITE_ORIGIN;

import { POST } from "@/app/api/webhooks/stripe/products/route";

// --- Mocks ---

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

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
    // The confirmation mail's plan read is answered apart from the RPCs this
    // file is about, so their call counts stay theirs. The fixture product has
    // no slots, so its plan is empty.
    rpc: (name: string, args: unknown) =>
      name === "planned_session_dates"
        ? Promise.resolve({ data: [], error: null })
        : mockAdminRpc(name, args),
  })),
}));

// --- Fixtures ---

const PARTICIPATION_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "cs_test_session_1";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-4444-444444444444";
const FAM_SUB_ROW_ID = "66666666-6666-6666-6666-666666666666";
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

const BOOKING_ID = "88888888-8888-8888-8888-888888888888";

/**
 * A completed Session as the checkout route creates it: the booking id in
 * `client_reference_id`, and metadata naming the product for Slack and nobody.
 * Who bought what comes back from `confirm_booking`, so a test states it in the
 * RPC answer (`settled`, `duplicate` below), not here.
 */
function createCompletedEvent(overrides: Partial<{
  id: string;
  paymentIntent: string | null;
  subscription: string | null;
  invoice: string | null;
  amountTotal: number;
  customer: string;
  /** Stripe's own `mode` on the session — the axis the €0 gate turns on. */
  mode: string;
  paymentStatus: string;
}> = {}) {
  return {
    id: overrides.id ?? "evt_completed_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: SESSION_ID,
        client_reference_id: BOOKING_ID as string | null,
        mode: overrides.mode ?? "payment",
        payment_status: overrides.paymentStatus ?? "paid",
        amount_total: overrides.amountTotal ?? 10000,
        payment_intent: overrides.paymentIntent ?? "pi_test_1",
        subscription: overrides.subscription ?? null,
        invoice: overrides.invoice ?? null,
        customer: overrides.customer ?? "cus_test_1",
        metadata: { productId: PRODUCT_ID, productName: "Test Club" },
      },
    },
  };
}

/** The facts `confirm_booking` answers with, for a booking of this shape. */
function bookingFacts(purchaseShape: string) {
  return {
    booking_id: BOOKING_ID,
    customer_id: CUSTOMER_ID,
    participant_id: GAMER_ID,
    product_id: PRODUCT_ID,
    purchase_shape: purchaseShape,
    currency: "eur",
  };
}

/** `confirm_booking`'s answer for a seat this Session bought. */
function settled(
  purchaseShape = "single_payment",
  overrides: { idempotent?: boolean; participationId?: string | null } = {},
) {
  return {
    data: {
      kind: "settled",
      ...bookingFacts(purchaseShape),
      participation_id:
        overrides.participationId === undefined
          ? PARTICIPATION_ID
          : overrides.participationId,
      idempotent: overrides.idempotent ?? false,
    },
    error: null,
  };
}

/** `confirm_booking`'s answer for a payment refused because the seat was already held. */
function duplicate(
  purchaseShape = "single_payment",
  existingParticipationId: string | null = PARTICIPATION_ID,
) {
  return {
    data: {
      kind: "duplicate_payment",
      ...bookingFacts(purchaseShape),
      existing_participation_id: existingParticipationId,
      existing_status: existingParticipationId === null ? null : "active",
    },
    error: null,
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
  /** An update whose payload carries no subscription item at all. */
  withoutItems?: boolean;
  /** When Stripe built this payload, in unix seconds. */
  created?: number;
}) {
  return {
    id: overrides.id ?? "evt_sub_updated_1",
    type: "customer.subscription.updated",
    created: overrides.created,
    data: {
      object: {
        id: overrides.subscription ?? SUB_ID,
        status: overrides.status,
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        current_period_end: overrides.currentPeriodEnd ?? 1900000000,
        items: {
          data: overrides.withoutItems
            ? []
            : [{ id: "si_1", price: { id: "price_test_1" } }],
        },
      },
    },
  };
}

// --- Mock builder for the admin client ---

type AdminInserts = {
  payments: Record<string, unknown>[];
  /** Events the route marked processed, in order. */
  processedEvents: Record<string, unknown>[];
  family_subscriptions: Record<string, unknown>[];
  /**
   * Payloads passed to `family_subscriptions` UPDATE. Separate from the inserts
   * above because the subscription-updated handler only ever updates, and what it
   * writes into `status` is the thing under test.
   */
  familySubscriptionUpdates: Record<string, unknown>[];
};

type AdminMockOptions = {
  /** Whether `stripe_processed_events` already holds the delivered event. */
  alreadyProcessed?: boolean;
  /**
   * Error returned from the `payments` INSERT. `23505` is the re-run of an
   * event whose payment already landed; the row is not captured when set.
   */
  paymentInsertError?: { code: string; message: string } | null;
  /**
   * Returned from a `family_subscriptions` SELECT lookup. The deleted/updated/
   * invoice handlers look the row up by stripe_subscription_id; the
   * checkout-completed handler doesn't (each sub is brand-new — it just inserts).
   */
  famSubRow?: Record<string, unknown> | null;
  /**
   * Error returned from that `family_subscriptions` lookup. A failed read must
   * reach the caller as a 500, never read as "not ours" and get marked processed.
   */
  famSubSelectError?: { code: string; message: string } | null;
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
  /**
   * The catalogue price row the confirmation mail states, or null for "this
   * product is not sold in that currency" — which the mail renders as no price
   * line at all rather than a blank one.
   */
  productPrice?: { price_cents: number } | null;
};

function mockAdmin(opts: AdminMockOptions = {}) {
  const inserts: AdminInserts = {
    payments: [],
    processedEvents: [],
    family_subscriptions: [],
    familySubscriptionUpdates: [],
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "stripe_processed_events") {
      return {
        select: () => ({
          eq: (_column: string, eventId: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.alreadyProcessed
                  ? { stripe_event_id: eventId }
                  : null,
                error: null,
              }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          inserts.processedEvents.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "payments") {
      // Written, never read: the payment row records money and nothing else.
      return {
        insert: (row: Record<string, unknown>) => {
          if (opts.paymentInsertError) {
            return Promise.resolve({ error: opts.paymentInsertError });
          }
          inserts.payments.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "family_subscriptions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                opts.famSubSelectError
                  ? { data: null, error: opts.famSubSelectError }
                  : { data: opts.famSubRow ?? null, error: null },
              ),
          }),
        }),
        // One per-participation row per subscription; the route inserts and
        // swallows 23505 on replay. On a forced insert error, don't capture the
        // row — mirrors a real failed write so tests can assert neither the
        // payment row nor the processed mark was reached.
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
    // The three the confirmation mail reads, and nothing else touches. They
    // answer the shapes the send helper asks for: the product with its
    // translations, both people in one `.in()` query, and the catalogue price.
    if (table === "products") {
      return {
        select: (columns: string) => ({
          eq: () => ({
            // Two reads end here: the product with its translations, and the
            // confirmation mail's second read — the schedule and the site its
            // calendar invitation would be composed from. No slots there on
            // purpose — what this file covers about that mail is which webhook
            // outcome sends it and to whom, and a fixture schedule would put a
            // calendar document nobody asserts on into every render.
            single: () =>
              Promise.resolve(
                !columns.includes("product_translations")
                  ? { data: { schedule_slots: [], locations: null }, error: null }
                  : {
                      data: {
                        product_type: "consumer_club",
                        billing_mode: "paid",
                        topic: "minecraft_java",
                        timezone: "Europe/Helsinki",
                        start_date: null,
                        end_date: null,
                        delivery_mode: "online",
                        // The "Good to know" facts the mail mirrors from the
                        // confirmation page.
                        min_age: 8,
                        max_age: 12,
                        for_gamers: true,
                        for_parents: false,
                        spoken_language_code: "en",
                        product_translations: [
                          { locale: "en", name: "Test Club", short_description: "" },
                        ],
                      },
                      error: null,
                    },
              ),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                {
                  id: CUSTOMER_ID,
                  first_name: "Marja",
                  email: "parent@example.test",
                  locale: "en",
                },
                {
                  id: GAMER_ID,
                  first_name: "Aino",
                  email: null,
                  locale: null,
                },
              ],
              error: null,
            }),
        }),
      };
    }
    if (table === "product_prices") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    opts.productPrice === undefined
                      ? { price_cents: 4000 }
                      : opts.productPrice,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    // `participations` deliberately has no entry: the handler reaches that
    // table only through the confirm RPCs, never with a direct write.
    // A table appearing here that shouldn't should fail loudly.
    throw new Error(`Unexpected table in admin mock: ${table}`);
  });

  return inserts;
}

// --- Tests ---

describe("POST /api/webhooks/stripe/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
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
      mockAdminRpc.mockResolvedValue(settled());

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_booking", {
        p_booking_id: BOOKING_ID,
        p_checkout_session_id: SESSION_ID,
      });
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        stripe_event_id: "evt_completed_1",
        customer_id: CUSTOMER_ID,
        amount_cents: 10000,
        currency: "eur",
        purpose: "single_payment",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        stripe_payment_intent_id: "pi_test_1",
      });
      // Marked processed once the handler finished, and only then.
      expect(inserts.processedEvents).toEqual([
        {
          stripe_event_id: "evt_completed_1",
          event_type: "checkout.session.completed",
        },
      ]);
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
          mode: "subscription",
        }),
      );
      const inserts = mockAdmin();
      mockAdminRpc.mockResolvedValue(settled("subscription_monthly"));
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
        }),
      );
      mockAdminRpc.mockResolvedValue(settled("subscription_monthly"));
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

      expect(mockAdminRpc).toHaveBeenCalledWith("confirm_booking", {
        p_booking_id: BOOKING_ID,
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

    it("records no payment, and still marks the event processed", async () => {
      // Nothing was paid, so there is no payment: the first one is the renewal
      // that charges, through invoice.paid. The processed mark is what stops a
      // redelivery re-running the handler. The session names an invoice here to
      // show that even a €0 invoice it names is not recorded as money.
      zeroDueSubscription("subscription", "in_zero_1");
      const inserts = mockAdmin();

      const res = await POST(createWebhookRequest());

      expect(res.status).toBe(200);
      expect(inserts.payments).toEqual([]);
      expect(inserts.processedEvents).toHaveLength(1);
    });

    it("still ignores a payment-mode session that collected nothing", async () => {
      // A camp or event is bought outright: a one-off that took no money bought
      // nothing, so the widening deliberately stops at the mode boundary.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentStatus: "no_payment_required",
          mode: "payment",
          amountTotal: 0,
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

  describe("checkout.session.completed — a failed write leaves the event unmarked", () => {
    function subscriptionCompletion() {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          paymentIntent: null,
          subscription: "sub_new_1",
          invoice: "in_first_1",
          mode: "subscription",
        }),
      );
      mockAdminRpc.mockResolvedValue(settled("subscription_monthly"));
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

    it("does not mark the event processed when the sub insert fails (so Stripe's retry re-runs)", async () => {
      subscriptionCompletion();
      // Non-23505 sub insert error → handler throws → 500 so Stripe retries.
      const inserts = mockAdmin({
        famSubInsertError: { code: "23503", message: "fk violation" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);

      // Unmarked, so the retry re-runs the whole handler instead of
      // short-circuiting and orphaning a live recurring Stripe sub.
      expect(inserts.processedEvents).toHaveLength(0);
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
      // handler runs to completion, records the payment and marks the event.
      expect(inserts.family_subscriptions).toHaveLength(0);
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.processedEvents).toHaveLength(1);
    });

    it("finishes and marks a re-run whose payment had already landed", async () => {
      // The first delivery recorded the payment and died before its mark: the
      // UNIQUE on stripe_event_id refuses the second row, and that is success.
      subscriptionCompletion();
      const inserts = mockAdmin({
        paymentInsertError: { code: "23505", message: "duplicate key" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.processedEvents).toHaveLength(1);
    });
  });

  describe("checkout.session.completed — idempotency / dedup", () => {
    it("bails before calling the RPC if the event is already marked processed", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin({ alreadyProcessed: true });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(inserts.payments).toEqual([]);
      expect(inserts.processedEvents).toEqual([]);
    });

    it("skips a Session that names no booking", async () => {
      // The account also carries Sessions from other sources, and one without a
      // booking id is not ours to act on.
      const event = createCompletedEvent();
      event.data.object.client_reference_id = null;
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

    function duplicatePayment(purchaseShape = "single_payment") {
      mockAdminRpc.mockResolvedValue(
        duplicate(purchaseShape, EXISTING_PARTICIPATION_ID),
      );
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
        // It bought no seat; the one already held is in the metadata.
        participation_id: null,
        product_id: PRODUCT_ID,
      });
      expect(inserts.payments[0].metadata).toMatchObject({
        existingParticipationId: EXISTING_PARTICIPATION_ID,
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
          mode: "subscription",
        }),
      );
      const inserts = mockAdmin();
      duplicatePayment("subscription_monthly");
      mockSubscriptionsRetrieve.mockResolvedValueOnce({ status: "active" });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_duplicate_1");
      expect(inserts.processedEvents).toHaveLength(1);
      // The duplicate charge is still recorded for the manual refund, and no
      // subscription row is written — the sub is going away.
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.payments[0]).toMatchObject({
        purpose: "reservation_duplicate",
      });
      expect(inserts.family_subscriptions).toHaveLength(0);

      errorSpy.mockRestore();
    });

    it("records the duplicate charge and answers 500 when the cancel fails, so Stripe retries the cancel", async () => {
      // The event is left unmarked, so Stripe redelivers it and the cancel is
      // tried again. The charge is recorded first, so it lands either way.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          id: "evt_completed_dup_sub_fail",
          paymentIntent: null,
          subscription: "sub_duplicate_2",
          invoice: "in_dup_2",
          mode: "subscription",
        }),
      );
      const inserts = mockAdmin();
      duplicatePayment("subscription_monthly");
      mockSubscriptionsRetrieve.mockResolvedValueOnce({ status: "active" });
      mockSubscriptionsCancel.mockRejectedValueOnce(
        new Error("Stripe is unreachable"),
      );
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);

      expect(inserts.payments).toHaveLength(1);
      expect(inserts.processedEvents).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not cancel the duplicate subscription"),
        expect.objectContaining({ subscription: "sub_duplicate_2" }),
      );

      errorSpy.mockRestore();
    });

    it("finishes a re-run whose earlier cancel succeeded, without cancelling again", async () => {
      // The first delivery's cancel went through and only its answer was lost.
      // Stripe refuses to cancel an ended subscription, so cancelling again
      // would fail on every retry; an ended subscription is the cancel done.
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          id: "evt_completed_dup_sub_rerun",
          paymentIntent: null,
          subscription: "sub_duplicate_3",
          invoice: "in_dup_3",
          mode: "subscription",
        }),
      );
      const inserts = mockAdmin({
        paymentInsertError: { code: "23505", message: "duplicate key" },
      });
      duplicatePayment("subscription_monthly");
      mockSubscriptionsRetrieve.mockResolvedValueOnce({ status: "canceled" });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
      expect(inserts.processedEvents).toHaveLength(1);

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

    it("ends the seat via end_participation when we own the sub", async () => {
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_live_1"));
      mockAdmin({ famSubRow: { participation_id: PARTICIPATION_ID } });
      mockAdminRpc.mockResolvedValue({
        data: { kind: "cancelled" },
        error: null,
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      // Stripe already cancelled the sub — we only end the seat in our DB,
      // which keeps it and its family_subscriptions row.
      expect(mockAdminRpc).toHaveBeenCalledWith("end_participation", {
        p_participation_id: PARTICIPATION_ID,
        p_reason: "subscription_cancelled",
      });
    });

    it("answers a replayed deletion with a clean 200 once the seat has ended", async () => {
      // The ended seat's row is still there, so the replay reaches the RPC
      // again; end_participation answers noop for a seat already ended.
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_live_1"));
      mockAdmin({ famSubRow: { participation_id: PARTICIPATION_ID } });
      mockAdminRpc.mockResolvedValue({ data: { kind: "noop" }, error: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).toHaveBeenCalledTimes(1);
    });

    it("is a no-op for a sub we don't have a row for", async () => {
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_unknown"));
      mockAdmin({ famSubRow: null });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("answers 500 and marks nothing when the subscription lookup fails", async () => {
      // A failed read is not "not ours": marking it processed would leave the
      // seat held after Stripe stopped billing it.
      mockConstructEvent.mockReturnValue(createDeletedEvent("sub_live_1"));
      const inserts = mockAdmin({
        famSubSelectError: { code: "08006", message: "connection failure" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(inserts.processedEvents).toHaveLength(0);
    });
  });

  describe("invoice.paid — renewals, from either field placement", () => {
    // The renewal hot loop: every live subscription fires this once a period, and
    // the row it writes is the only record that the money arrived. The two
    // placements are the same event as delivered by two webhook endpoint versions,
    // so a handler that reads one and not the other stops recording renewals the
    // moment the endpoint's version moves — silently, with a 200.
    const RENEWAL_FAM_SUB = {
      customer_id: CUSTOMER_ID,
      participation_id: PARTICIPATION_ID,
      participations: { product_id: PRODUCT_ID },
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
        // The seat the family-sub row names, and that seat's product now.
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        stripe_invoice_id: "in_renewal_1",
        metadata: { stripeSubscriptionId: SUB_ID, billingReason: "subscription_cycle" },
      });
      expect(inserts.processedEvents).toEqual([
        { stripe_event_id: "evt_invoice_top_level", event_type: "invoice.paid" },
      ]);
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

    it("records no payment for an invoice settled at €0, and still marks the event processed", async () => {
      // A coupon or a credit balance can settle a renewal at €0. Nothing was
      // charged, so there is no payment; the processed mark is what stops a
      // redelivery from running the handler again.
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({
          placement: "parent",
          id: "evt_invoice_zero",
          amountPaid: 0,
        }),
      );
      const inserts = mockAdmin({ famSubRow: RENEWAL_FAM_SUB });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
      expect(inserts.processedEvents).toEqual([
        { stripe_event_id: "evt_invoice_zero", event_type: "invoice.paid" },
      ]);
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
      // Before any read of ours — not merely before the write. The only tables
      // touched are the route's own processed check and mark.
      expect(mockAdminFrom).not.toHaveBeenCalledWith("family_subscriptions");
      expect(mockAdminFrom).not.toHaveBeenCalledWith("payments");
    });

    it("writes nothing on a replay, where the event is already marked processed", async () => {
      mockConstructEvent.mockReturnValue(
        createInvoicePaidEvent({ placement: "top-level" }),
      );
      const inserts = mockAdmin({
        famSubRow: RENEWAL_FAM_SUB,
        alreadyProcessed: true,
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(0);
      expect(inserts.processedEvents).toHaveLength(0);
    });
  });

  describe("customer.subscription.updated — status mapping", () => {
    // `family_subscriptions.status` has a CHECK accepting only
    // active | past_due | cancelled | incomplete | canceling. Stripe's own status
    // set is wider and spells cancellation differently, so every value is
    // translated before it is written. Passing one through verbatim used to
    // produce a rejected write whose error was dropped: the row kept its old
    // status and the route answered 200.
    const OURS = { id: FAM_SUB_ROW_ID, ended_at: null };

    it("never writes a subscription that ended with its seat", async () => {
      // A late update must not revive an ended subscription: the row's trigger
      // would refuse the write, so the handler leaves it alone instead.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "active" }),
      );
      const inserts = mockAdmin({
        famSubRow: { ...OURS, ended_at: "2026-03-01T10:00:00Z" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates).toEqual([]);
    });

    it("answers 500 and marks nothing when the subscription lookup fails", async () => {
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "past_due" }),
      );
      const inserts = mockAdmin({
        famSubSelectError: { code: "08006", message: "connection failure" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(500);
      expect(inserts.familySubscriptionUpdates).toEqual([]);
      expect(inserts.processedEvents).toHaveLength(0);
    });

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

    it("writes the subscription's current item price id", async () => {
      // The admin club switch moves the Stripe item onto the target club's
      // price and fires this event; without this write the row would keep
      // naming the price of the club the family has left. The event payload
      // carries the items inline, so no extra retrieve is made.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({ status: "active" }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        stripe_price_id: "price_test_1",
      });
    });

    it("leaves the price id out of the write when the event is older than the row", async () => {
      // Stripe delivers and retries out of order, so an event describing the
      // subscription BEFORE a club switch can arrive after the switch has
      // already written the target's price. Writing its price would silently
      // put the row back on the club the family has left.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "active",
          created: Math.floor(Date.parse("2026-03-01T09:00:00Z") / 1000),
        }),
      );
      const inserts = mockAdmin({
        famSubRow: { ...OURS, updated_at: "2026-03-01T10:00:00Z" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      // Status and period still travel: those are properties of the
      // subscription's own lifecycle, and a late arrival there is corrected by
      // the next event rather than pointing the row at the wrong club.
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "active",
      });
      expect(inserts.familySubscriptionUpdates[0]).not.toHaveProperty(
        "stripe_price_id",
      );
    });

    it("writes the price id when the event is newer than the row", async () => {
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "active",
          created: Math.floor(Date.parse("2026-03-01T11:00:00Z") / 1000),
        }),
      );
      const inserts = mockAdmin({
        famSubRow: { ...OURS, updated_at: "2026-03-01T10:00:00Z" },
      });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        stripe_price_id: "price_test_1",
      });
    });

    it("leaves the price id out of the write when the payload carries no item", async () => {
      // An items-less update teaches this handler nothing about the price, and
      // "nothing" must not be written as null over a good stored id — the rest
      // of the app reads a null there as a seat that bills for nothing.
      mockConstructEvent.mockReturnValue(
        createSubscriptionUpdatedEvent({
          status: "active",
          withoutItems: true,
        }),
      );
      const inserts = mockAdmin({ famSubRow: OURS });

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);
      expect(inserts.familySubscriptionUpdates[0]).toMatchObject({
        status: "active",
      });
      expect(inserts.familySubscriptionUpdates[0]).not.toHaveProperty(
        "stripe_price_id",
      );
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
          mode: "subscription",
        }),
      );
      mockAdminRpc.mockResolvedValue(settled("subscription_monthly"));
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

  // -------------------------------------------------------------------------
  // The confirmation mail
  // -------------------------------------------------------------------------
  //
  // The ONE thing this handler does that is not naturally idempotent, on an
  // endpoint whose defining property is that deliveries repeat. Every case here
  // is really the same question asked from a different angle: did exactly one
  // mail leave per seat that came into existence?

  describe("checkout.session.completed — the confirmation mail", () => {
    /** A fresh confirm: the RPC INSERTed the row on this very call. */
    function confirmFresh(purchaseShape = "single_payment") {
      mockAdminRpc.mockResolvedValue(settled(purchaseShape));
    }

    it("mails the customer — never the participant — when the seat is created", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin();
      confirmFresh();

      const res = await POST(createWebhookRequest());
      expect(res.status).toBe(200);

      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
      expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          // The payer's inbox. The gamer's profile in the fixture carries no
          // address at all, which is the ordinary case for a child account.
          toEmail: "parent@example.test",
          fromEmail: "sogverse@sog.gg",
          fromName: "School of Gaming",
          replyToEmail: "help@sog.gg",
        }),
      );
    });

    it("speaks in the third person about a child's seat, and names the product", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin();
      confirmFresh();

      await POST(createWebhookRequest());

      const { subject, htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(subject).toContain("Aino");
      expect(subject).toContain("Test Club");
      expect(htmlContent).toContain(`${SITE_ORIGIN}/parent`);
    });

    it("prices a camp as a one-time payment", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent(),
      );
      mockAdmin();
      confirmFresh();

      await POST(createWebhookRequest());

      const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      // The summary's price row — a label cell and a value cell, as the page's
      // own summary states it.
      expect(htmlContent).toContain(">Price</td>");
      expect(htmlContent).toContain("€40.00 (one-time)");
      expect(htmlContent).not.toContain("/ month");
    });

    // The catalogue price, not `amount_total`: a club bought before it starts
    // completes Checkout at €0 and bills the real amount later, so the money
    // that moved today is not the price the parent is agreeing to.
    it("prices a club from the catalogue, per month", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          mode: "subscription",
          subscription: SUB_ID,
          amountTotal: 0,
          paymentStatus: "no_payment_required",
        }),
      );
      mockAdmin({ productPrice: { price_cents: 4000 } });
      confirmFresh("subscription_monthly");
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: SUB_ID,
        status: "active",
        cancel_at_period_end: false,
        items: { data: [{ id: "si_1", price: { id: "price_1" }, current_period_end: 1900000000 }] },
      });

      await POST(createWebhookRequest());

      const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(htmlContent).toContain("/ month");
      expect(htmlContent).toContain("40.00");
      // The same session is the deferred shape — €0 today, a period end still
      // ahead — so the mail owes the parent the real date, from the value this
      // handler already holds rather than from a second Stripe read.
      expect(htmlContent).toContain("Nothing was charged today.");
    });

    /**
     * The other half of that rule: money moved today, so nothing was deferred
     * and the mail must not promise a future first payment.
     */
    it("states no first-charge date when the club was billed at checkout", async () => {
      mockConstructEvent.mockReturnValue(
        createCompletedEvent({
          mode: "subscription",
          subscription: SUB_ID,
        }),
      );
      mockAdmin({ productPrice: { price_cents: 4000 } });
      confirmFresh("subscription_monthly");
      mockSubscriptionsRetrieve.mockResolvedValue({
        id: SUB_ID,
        status: "active",
        cancel_at_period_end: false,
        items: { data: [{ id: "si_1", price: { id: "price_1" }, current_period_end: 1900000000 }] },
      });

      await POST(createWebhookRequest());

      const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(htmlContent).not.toContain("Nothing was charged today.");
    });

    it("states no price when the product is not sold in the session's currency", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin({ productPrice: null });
      confirmFresh();

      await POST(createWebhookRequest());

      // A blank figure beside a product name reads as "free", so the whole
      // price line is omitted rather than left empty — and the mail still goes.
      const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
      expect(htmlContent).not.toContain(">Price</td>");
      expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    });

    // The guard that matters. A redelivery whose first attempt died before
    // writing the payment row gets past the dedup check at the top of the
    // handler and calls the RPC again — which answers `settled` with the same
    // participation id, distinguishable from the first answer only by this flag.
    it("sends nothing when the RPC reports it recognised its own earlier row", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin();
      mockAdminRpc.mockResolvedValue(settled("single_payment", { idempotent: true }));

      const res = await POST(createWebhookRequest());

      expect(res.status).toBe(200);
      // The rest of the handler still runs — the payment row is written — so
      // this is the mail alone being held back, not the delivery being skipped.
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("sends nothing on a delivery the processed check short-circuits", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin({ alreadyProcessed: true });
      confirmFresh();

      const res = await POST(createWebhookRequest());

      expect(res.status).toBe(200);
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("sends nothing when the payment was refused as a duplicate", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      mockAdmin();
      mockAdminRpc.mockResolvedValue(duplicate());
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(createWebhookRequest());

      // No seat came into existence, so there is nothing to confirm — and the
      // parent is owed a refund, not a congratulation.
      expect(res.status).toBe(200);
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("answers 200 when the send throws — Stripe must not retry over a mail", async () => {
      mockConstructEvent.mockReturnValue(createCompletedEvent());
      const inserts = mockAdmin();
      confirmFresh();
      mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const res = await POST(createWebhookRequest());

      // A 500 here would win a redelivery that re-ran a money path to fix an
      // email — and the RPC would answer it idempotent, so the redelivery would
      // send nothing anyway.
      expect(res.status).toBe(200);
      expect(inserts.payments).toHaveLength(1);
      expect(inserts.processedEvents).toHaveLength(1);
      spy.mockRestore();
    });
  });
});

describe("POST /api/webhooks/stripe/products — a Session with a booking", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue(undefined);
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: SUB_ID,
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1900000000,
      items: { data: [{ price: { id: "price_test_1" } }] },
    });
    mockConstructEvent.mockReturnValue(
      createCompletedEvent({ mode: "subscription", subscription: SUB_ID }),
    );
  });

  it("confirms the booking the Session names", async () => {
    mockAdmin();
    mockAdminRpc.mockResolvedValueOnce(settled("subscription_monthly"));

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenNthCalledWith(1, "confirm_booking", {
      p_booking_id: BOOKING_ID,
      p_checkout_session_id: SESSION_ID,
    });
  });

  it("takes every later write's facts from the result, the session's metadata naming nobody", async () => {
    const inserts = mockAdmin();
    mockAdminRpc.mockResolvedValueOnce(settled("subscription_monthly"));

    await POST(createWebhookRequest());

    expect(inserts.family_subscriptions).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        participation_id: PARTICIPATION_ID,
        stripe_subscription_id: SUB_ID,
        currency: "eur",
      }),
    ]);
    expect(inserts.payments).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        currency: "eur",
        purpose: "subscription_invoice",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        metadata: {
          gamerId: GAMER_ID,
          productId: PRODUCT_ID,
          purchaseShape: "subscription_monthly",
          participationId: PARTICIPATION_ID,
        },
      }),
    ]);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("sends no mail on a redelivery, and still repairs what the first attempt left", async () => {
    const inserts = mockAdmin();
    mockAdminRpc.mockResolvedValueOnce(
      settled("subscription_monthly", { idempotent: true }),
    );

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(200);
    expect(inserts.family_subscriptions).toHaveLength(1);
    expect(inserts.payments).toHaveLength(1);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("cancels and records a duplicate, with the facts from the result", async () => {
    const inserts = mockAdmin();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAdminRpc.mockResolvedValueOnce(duplicate("subscription_monthly"));
    mockSubscriptionsRetrieve.mockResolvedValueOnce({ status: "active" });

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(200);
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith(SUB_ID);
    expect(inserts.family_subscriptions).toEqual([]);
    expect(inserts.payments).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        purpose: "reservation_duplicate",
        metadata: expect.objectContaining({
          existingParticipationId: PARTICIPATION_ID,
        }),
      }),
    ]);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("records a repeated duplicate whose seat has gone", async () => {
    const inserts = mockAdmin();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAdminRpc.mockResolvedValueOnce(duplicate("subscription_monthly", null));

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(200);
    expect(inserts.payments).toHaveLength(1);
    consoleError.mockRestore();
  });

  it("makes no seat-dependent write when the seat has since ended", async () => {
    const inserts = mockAdmin();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAdminRpc.mockResolvedValueOnce(
      settled("subscription_monthly", { participationId: null, idempotent: true }),
    );

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(200);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(inserts.family_subscriptions).toEqual([]);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    // The money still moved, so the charge is recorded and the event is done.
    expect(inserts.payments).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        participation_id: null,
        product_id: PRODUCT_ID,
        metadata: expect.objectContaining({ participationId: null }),
      }),
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("since ended"),
      expect.objectContaining({ subscription: SUB_ID }),
    );
    consoleError.mockRestore();
  });

  it.each([
    ["an RPC error", { data: null, error: { message: "session mismatch" } }],
    ["an unknown shape", { data: { kind: "confirmed" }, error: null }],
  ])("answers 500 so Stripe retries on %s", async (_name, answer) => {
    const inserts = mockAdmin();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAdminRpc.mockResolvedValueOnce(answer);

    const res = await POST(createWebhookRequest());
    expect(res.status).toBe(500);
    expect(inserts.payments).toEqual([]);
    expect(inserts.processedEvents).toEqual([]);
    consoleError.mockRestore();
  });
});
