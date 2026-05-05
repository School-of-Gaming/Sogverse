import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createV2TestProduct, deleteV2TestProducts } from "./v2-helpers";

/**
 * Cross-customer RLS coverage for the financial tables in the v2
 * participations system. We collapse five tables into one file so the
 * IDOR shape — "customer A must not see customer B's row" — is asserted
 * once per table without copying boilerplate setup five times.
 *
 * Tables under test:
 *   - participations_v2          — direct customer_id ownership
 *   - payments_v2                — direct customer_id ownership
 *   - refunds_v2                 — ownership inherited via payment_id
 *   - product_seat_counts_v2     — public-readable rollup; assert anon CAN read
 *   - (writes against all tables) — confirm only admin role can mutate;
 *                                   customers must go through SECURITY DEFINER RPCs
 *
 * Other v2 tables (session_cancellations_v2, credit_deductions_v2,
 * family_subscriptions_v2, family_subscription_items_v2,
 * product_subscription_prices_v2) follow the same RLS shape; the
 * access-control catalog test in tests/db/access-control.test.ts will
 * fail CI if any of them lose RLS coverage. They're covered there, not
 * here — those rows hold no data a parent could harvest from another
 * parent that isn't already protected by the participations_v2 row's
 * ownership chain (FKs cascade on customer deletion).
 */

const PRODUCT_A = "00000000-0000-0000-0000-0000000005e1"; // CUSTOMER's product
const PRODUCT_B = "00000000-0000-0000-0000-0000000005e2"; // CUSTOMER_2's product
const ALL_PRODUCTS = [PRODUCT_A, PRODUCT_B];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("v2 participations / payments / refunds RLS", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;

  // Captured at setup so per-test queries can target known ids.
  let customerParticipationId: string;
  let customer2ParticipationId: string;
  let customerPaymentId: string;
  let customer2PaymentId: string;
  let customerRefundId: string;
  let customer2RefundId: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anonClient = createAnonClient();
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    // Reset any cross-run leftovers, then build distinct ownership chains.
    // CUSTOMER_2 has no parent_gamer link in seed.sql, so we use admin to
    // insert the participation row directly with arbitrary gamer — RLS
    // policies don't re-validate parent-gamer at the row level (the RPC
    // does that, and we're testing RLS reads here, not the RPC).
    await admin
      .from("refunds_v2")
      .delete()
      .in("stripe_event_id", ["evt_rls_a", "evt_rls_b"]);
    await admin
      .from("payments_v2")
      .delete()
      .in("stripe_event_id", ["evt_rls_pa", "evt_rls_pb"]);
    await deleteV2TestProducts(admin, ALL_PRODUCTS);

    await createV2TestProduct(admin, { id: PRODUCT_A, seatCount: 10 });
    await createV2TestProduct(admin, { id: PRODUCT_B, seatCount: 10 });

    // CUSTOMER's participation on PRODUCT_A.
    const partA = await admin
      .from("participations_v2")
      .insert({
        product_id: PRODUCT_A,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        credits_remaining: 0,
      })
      .select("id")
      .single();
    if (partA.error) throw partA.error;
    customerParticipationId = partA.data.id;

    // CUSTOMER_2's participation on PRODUCT_B (different product so the
    // partial unique index `(product_id, gamer_id) WHERE active` doesn't
    // conflict, even though both rows reference the same gamer).
    const partB = await admin
      .from("participations_v2")
      .insert({
        product_id: PRODUCT_B,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER_2,
        status: "active",
        credits_remaining: 0,
      })
      .select("id")
      .single();
    if (partB.error) throw partB.error;
    customer2ParticipationId = partB.data.id;

    // Payments — one each.
    const payA = await admin
      .from("payments_v2")
      .insert({
        customer_id: TEST_IDS.CUSTOMER,
        amount_cents: 1000,
        currency: "eur",
        purpose: "bundle",
        stripe_payment_intent_id: "pi_rls_a",
        stripe_event_id: "evt_rls_pa",
      })
      .select("id")
      .single();
    if (payA.error) throw payA.error;
    customerPaymentId = payA.data.id;

    const payB = await admin
      .from("payments_v2")
      .insert({
        customer_id: TEST_IDS.CUSTOMER_2,
        amount_cents: 2000,
        currency: "eur",
        purpose: "bundle",
        stripe_payment_intent_id: "pi_rls_b",
        stripe_event_id: "evt_rls_pb",
      })
      .select("id")
      .single();
    if (payB.error) throw payB.error;
    customer2PaymentId = payB.data.id;

    // Refunds linked to each payment.
    const refA = await admin
      .from("refunds_v2")
      .insert({
        payment_id: customerPaymentId,
        amount_cents: 1000,
        reason: "admin_refund",
        stripe_refund_id: "re_rls_a",
        stripe_event_id: "evt_rls_a",
      })
      .select("id")
      .single();
    if (refA.error) throw refA.error;
    customerRefundId = refA.data.id;

    const refB = await admin
      .from("refunds_v2")
      .insert({
        payment_id: customer2PaymentId,
        amount_cents: 2000,
        reason: "admin_refund",
        stripe_refund_id: "re_rls_b",
        stripe_event_id: "evt_rls_b",
      })
      .select("id")
      .single();
    if (refB.error) throw refB.error;
    customer2RefundId = refB.data.id;
  });

  afterAll(async () => {
    // refunds_v2 doesn't cascade from anything we own — delete first.
    await admin
      .from("refunds_v2")
      .delete()
      .in("stripe_event_id", ["evt_rls_a", "evt_rls_b"]);
    await admin
      .from("payments_v2")
      .delete()
      .in("stripe_event_id", ["evt_rls_pa", "evt_rls_pb"]);
    // Products cascade to participations.
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // participations_v2
  // ---------------------------------------------------------------------------

  describe("participations_v2", () => {
    it("customer can SELECT own participation", async () => {
      const { data, error } = await customerClient
        .from("participations_v2")
        .select("id, customer_id")
        .eq("id", customerParticipationId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.customer_id).toBe(TEST_IDS.CUSTOMER);
    });

    it("customer cannot SELECT another customer's participation", async () => {
      const { data, error } = await customerClient
        .from("participations_v2")
        .select("id")
        .eq("id", customer2ParticipationId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("customer's list query only returns their own rows", async () => {
      const { data, error } = await customerClient
        .from("participations_v2")
        .select("id, customer_id");
      expect(error).toBeNull();
      const owners = new Set((data ?? []).map((r) => r.customer_id));
      // Either zero rows (other tests can hide them) or strictly the
      // calling customer — never another's id.
      expect(owners.has(TEST_IDS.CUSTOMER_2)).toBe(false);
      if (owners.size > 0) {
        expect([...owners]).toEqual([TEST_IDS.CUSTOMER]);
      }
    });

    it("anon cannot SELECT participations", async () => {
      const { data, error } = await anonClient
        .from("participations_v2")
        .select("id");
      // No SELECT GRANT for anon → 42501.
      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    });

    it("customer cannot INSERT a participation directly", async () => {
      const { error } = await customerClient.from("participations_v2").insert({
        product_id: PRODUCT_A,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        credits_remaining: 0,
      });
      // No INSERT policy + no GRANT for the table → either 42501
      // (privilege denied) or RLS check failure (42501 / 42501-like).
      expect(error).not.toBeNull();
    });

    it("customer cannot UPDATE their participation directly", async () => {
      const { error } = await customerClient
        .from("participations_v2")
        .update({ credits_remaining: 999 })
        .eq("id", customerParticipationId);
      expect(error).not.toBeNull();
    });

    it("customer cannot DELETE their participation directly", async () => {
      const { error } = await customerClient
        .from("participations_v2")
        .delete()
        .eq("id", customerParticipationId);
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // payments_v2
  // ---------------------------------------------------------------------------

  describe("payments_v2", () => {
    it("customer can SELECT own payment", async () => {
      const { data, error } = await customerClient
        .from("payments_v2")
        .select("id, customer_id, amount_cents")
        .eq("id", customerPaymentId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.amount_cents).toBe(1000);
    });

    it("customer cannot SELECT another customer's payment", async () => {
      const { data, error } = await customerClient
        .from("payments_v2")
        .select("id")
        .eq("id", customer2PaymentId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("anon cannot SELECT payments", async () => {
      const { data, error } = await anonClient.from("payments_v2").select("id");
      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    });

    it("customer cannot INSERT a payment directly", async () => {
      const { error } = await customerClient.from("payments_v2").insert({
        customer_id: TEST_IDS.CUSTOMER,
        amount_cents: 99,
        currency: "eur",
        purpose: "bundle",
        stripe_event_id: "evt_rls_forge",
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // refunds_v2 (ownership inherited via payment_id)
  // ---------------------------------------------------------------------------

  describe("refunds_v2", () => {
    it("customer can SELECT a refund linked to their own payment", async () => {
      const { data, error } = await customerClient
        .from("refunds_v2")
        .select("id, amount_cents")
        .eq("id", customerRefundId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.amount_cents).toBe(1000);
    });

    it("customer cannot SELECT a refund linked to another customer's payment", async () => {
      const { data, error } = await customerClient
        .from("refunds_v2")
        .select("id")
        .eq("id", customer2RefundId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("the symmetric assertion holds for customer 2", async () => {
      // Verifies that customer 2's refund is selectable by customer 2 —
      // catches a regression where the policy USING clause is over-tight.
      const { data, error } = await customer2Client
        .from("refunds_v2")
        .select("id, amount_cents")
        .eq("id", customer2RefundId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.amount_cents).toBe(2000);
    });

    it("anon cannot SELECT refunds", async () => {
      const { data, error } = await anonClient.from("refunds_v2").select("id");
      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // product_seat_counts_v2 — public-readable rollup
  // ---------------------------------------------------------------------------

  describe("product_seat_counts_v2", () => {
    it("anon CAN SELECT the rollup (it's the live seat counter)", async () => {
      const { data, error } = await anonClient
        .from("product_seat_counts_v2")
        .select("active_count")
        .eq("product_id", PRODUCT_A)
        .maybeSingle();
      expect(error).toBeNull();
      // 1 active row was seeded for PRODUCT_A in beforeAll.
      expect(data?.active_count).toBe(1);
    });

    it("authenticated customer can SELECT the rollup for any product", async () => {
      const { data, error } = await customerClient
        .from("product_seat_counts_v2")
        .select("active_count")
        .eq("product_id", PRODUCT_B) // not their product
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.active_count).toBe(1);
    });

    it("no role can INSERT into the rollup directly", async () => {
      const { error: anonError } = await anonClient
        .from("product_seat_counts_v2")
        .insert({ product_id: PRODUCT_A, active_count: 999 });
      expect(anonError).not.toBeNull();

      const { error: custError } = await customerClient
        .from("product_seat_counts_v2")
        .insert({ product_id: PRODUCT_A, active_count: 999 });
      expect(custError).not.toBeNull();
    });

    it("customer cannot UPDATE the rollup", async () => {
      const { error } = await customerClient
        .from("product_seat_counts_v2")
        .update({ active_count: 999 })
        .eq("product_id", PRODUCT_A);
      expect(error).not.toBeNull();
    });
  });
});
