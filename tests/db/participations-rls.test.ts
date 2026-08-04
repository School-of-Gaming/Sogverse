import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createTestProduct,
  deleteTestProducts,
  resetFamilySubs,
} from "./product-helpers";

/**
 * Cross-customer RLS coverage for the financial tables in the v2
 * participations system. We collapse several tables into one file so the
 * IDOR shape — "customer A must not see customer B's row" — is asserted
 * once per table without copying boilerplate setup per table.
 *
 * Tables under test:
 *   - participations          — direct customer_id ownership
 *   - payments                — direct customer_id ownership
 *   - family_subscriptions    — direct customer_id ownership
 *   - product_seat_counts     — public-readable rollup; assert anon CAN read
 *   - (writes against all tables) — confirm only admin role can mutate;
 *                                   customers must go through SECURITY DEFINER RPCs
 *
 * A `refunds` table used to sit here too, covering ownership inherited through
 * `payment_id`. It was a write-only ledger — one Stripe webhook handler wrote it
 * and nothing read it — so the table, the handler and these cases were all
 * dropped together; Stripe is the system of record for refunds.
 *
 * `family_subscriptions` was once excluded from this file, on the reasoning
 * that its rows held nothing a parent could harvest from another parent beyond
 * what the participations ownership chain already protected. That reasoning
 * expired when the billing portal began routing per subscription:
 * `stripe_customer_id` is no longer a bare reference, it is the capability the
 * portal route turns into a Stripe session carrying saved cards, the full
 * invoice history, and the ability to cancel. Reading one row of someone
 * else's is the whole leak. The server-side reads behind that route do filter
 * on `customer_id` themselves, so the cases below deliberately drop that
 * filter — what is being asserted is that the *policy* refuses the row even
 * when the application forgets to.
 *
 * product_subscription_prices still follows the same RLS shape and is covered
 * by the access-control catalog test in tests/db/access-control.test.ts, which
 * fails CI if any table loses RLS coverage.
 */

const PRODUCT_A = "00000000-0000-0000-0000-0000000005b6"; // CUSTOMER's product
const PRODUCT_B = "00000000-0000-0000-0000-0000000005b7"; // CUSTOMER_2's product
const ALL_PRODUCTS = [PRODUCT_A, PRODUCT_B];

// The two families' Stripe customers. Distinct on purpose: the billing-portal
// route turns one of these strings into a portal session, so "can customer A
// read customer B's stripe_customer_id" is the question the policy answers.
const CUSTOMER_STRIPE_ID = "cus_rls_a";
const CUSTOMER_2_STRIPE_ID = "cus_rls_b";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("v2 participations / payments / family subscriptions RLS", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;

  // Captured at setup so per-test queries can target known ids.
  let customerParticipationId: string;
  let customer2ParticipationId: string;
  let customerPaymentId: string;
  let customer2PaymentId: string;
  let customerSubRowId: string;
  let customer2SubRowId: string;

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
      .from("payments")
      .delete()
      .in("stripe_event_id", ["evt_rls_pa", "evt_rls_pb"]);
    // Before the products go, so an aborted run can't leave `sub_rls_a`
    // stranded on some other participation — stripe_subscription_id is UNIQUE
    // account-wide, and the collision would fail setup rather than a test.
    await resetFamilySubs(admin);
    await deleteTestProducts(admin, ALL_PRODUCTS);

    await createTestProduct(admin, { id: PRODUCT_A, seatCount: 10 });
    await createTestProduct(admin, { id: PRODUCT_B, seatCount: 10 });

    // CUSTOMER's participation on PRODUCT_A.
    const partA = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_A,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();
    if (partA.error) throw partA.error;
    customerParticipationId = partA.data.id;

    // CUSTOMER_2's participation on PRODUCT_B (different product so the
    // partial unique index `(product_id, gamer_id) WHERE active` doesn't
    // conflict, even though both rows reference the same gamer).
    const partB = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_B,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER_2,
        status: "active",
      })
      .select("id")
      .single();
    if (partB.error) throw partB.error;
    customer2ParticipationId = partB.data.id;

    // Payments — one each.
    const payA = await admin
      .from("payments")
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
      .from("payments")
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

    // family_subscriptions — one per participation. The Stripe customer ids
    // are distinct per family, which is what the cross-customer cases below
    // key off: reading the other family's row hands over their portal.
    const subA = await admin
      .from("family_subscriptions")
      .insert({
        customer_id: TEST_IDS.CUSTOMER,
        participation_id: customerParticipationId,
        stripe_subscription_id: "sub_rls_a",
        stripe_customer_id: CUSTOMER_STRIPE_ID,
        currency: "eur",
        status: "active",
      })
      .select("id")
      .single();
    if (subA.error) throw subA.error;
    customerSubRowId = subA.data.id;

    const subB = await admin
      .from("family_subscriptions")
      .insert({
        customer_id: TEST_IDS.CUSTOMER_2,
        participation_id: customer2ParticipationId,
        stripe_subscription_id: "sub_rls_b",
        stripe_customer_id: CUSTOMER_2_STRIPE_ID,
        currency: "eur",
        status: "active",
      })
      .select("id")
      .single();
    if (subB.error) throw subB.error;
    customer2SubRowId = subB.data.id;
  });

  afterAll(async () => {
    await admin
      .from("payments")
      .delete()
      .in("stripe_event_id", ["evt_rls_pa", "evt_rls_pb"]);
    await resetFamilySubs(admin);
    // Products cascade to participations.
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // participations
  // ---------------------------------------------------------------------------

  describe("participations", () => {
    it("customer can SELECT own participation", async () => {
      const { data, error } = await customerClient
        .from("participations")
        .select("id, customer_id")
        .eq("id", customerParticipationId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.customer_id).toBe(TEST_IDS.CUSTOMER);
    });

    it("customer cannot SELECT another customer's participation", async () => {
      const { data, error } = await customerClient
        .from("participations")
        .select("id")
        .eq("id", customer2ParticipationId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("customer's list query only returns their own rows", async () => {
      const { data, error } = await customerClient
        .from("participations")
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

    it("anon SELECT returns no rows (RLS, not GRANT, blocks anon)", async () => {
      // Supabase grants SELECT to anon on every public-schema table by default.
      // RLS is the gate — and there's no policy that lets anon see rows. So
      // the query succeeds silently with an empty result set.
      const { data, error } = await anonClient
        .from("participations")
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("customer cannot INSERT a participation directly", async () => {
      const { error } = await customerClient.from("participations").insert({
        product_id: PRODUCT_A,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      });
      // No INSERT policy + no GRANT for the table → either 42501
      // (privilege denied) or RLS check failure (42501 / 42501-like).
      expect(error).not.toBeNull();
    });

    it("customer cannot UPDATE their participation directly", async () => {
      const { error } = await customerClient
        .from("participations")
        .update({ status: "completed" })
        .eq("id", customerParticipationId);
      expect(error).not.toBeNull();
    });

    it("customer cannot DELETE their participation directly", async () => {
      const { error } = await customerClient
        .from("participations")
        .delete()
        .eq("id", customerParticipationId);
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // payments
  // ---------------------------------------------------------------------------

  describe("payments", () => {
    it("customer can SELECT own payment", async () => {
      const { data, error } = await customerClient
        .from("payments")
        .select("id, customer_id, amount_cents")
        .eq("id", customerPaymentId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.amount_cents).toBe(1000);
    });

    it("customer cannot SELECT another customer's payment", async () => {
      const { data, error } = await customerClient
        .from("payments")
        .select("id")
        .eq("id", customer2PaymentId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("anon SELECT returns no rows (RLS blocks)", async () => {
      const { data, error } = await anonClient.from("payments").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("customer cannot INSERT a payment directly", async () => {
      const { error } = await customerClient.from("payments").insert({
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
  // family_subscriptions — direct customer_id ownership, and the row the
  // billing-portal route reads to decide which Stripe customer to open
  // ---------------------------------------------------------------------------

  describe("family_subscriptions", () => {
    it("customer can SELECT their own subscription row", async () => {
      const { data, error } = await customerClient
        .from("family_subscriptions")
        .select("id, stripe_customer_id")
        .eq("id", customerSubRowId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.stripe_customer_id).toBe(CUSTOMER_STRIPE_ID);
    });

    it("customer cannot SELECT another customer's subscription row", async () => {
      const { data, error } = await customerClient
        .from("family_subscriptions")
        .select("id")
        .eq("id", customer2SubRowId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("a participation_id lookup cannot reach another customer's row", async () => {
      // The shape the portal route uses to answer "which Stripe customer bills
      // this club?", with its own `customer_id` filter deliberately removed.
      // The policy has to refuse on its own — if it didn't, a parent who
      // guessed or scraped a participation id would get a portal session for
      // the family that owns it.
      const { data, error } = await customerClient
        .from("family_subscriptions")
        .select("stripe_customer_id")
        .eq("participation_id", customer2ParticipationId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("a stripe_customer_id lookup cannot confirm another customer's id", async () => {
      // The shape behind the "is this Stripe customer mine?" check, again
      // without the app's `customer_id` filter. A hit here would let a tampered
      // request open another family's saved cards and invoice history.
      const { data, error } = await customerClient
        .from("family_subscriptions")
        .select("id")
        .eq("stripe_customer_id", CUSTOMER_2_STRIPE_ID);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("the symmetric assertion holds for customer 2", async () => {
      // Catches an over-tight USING clause that refuses everyone equally.
      const { data, error } = await customer2Client
        .from("family_subscriptions")
        .select("stripe_customer_id")
        .eq("id", customer2SubRowId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.stripe_customer_id).toBe(CUSTOMER_2_STRIPE_ID);
    });

    it("gamer SELECT returns no rows (billing is the parent's alone)", async () => {
      // The gamer dashboard renders the same session cards, payment-problem
      // badge included — it must read subscription state through the
      // self-scoping RPC, never off this table.
      const gamerClient = await createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      );
      const { data, error } = await gamerClient
        .from("family_subscriptions")
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("anon SELECT returns no rows (RLS blocks)", async () => {
      const { data, error } = await anonClient
        .from("family_subscriptions")
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("customer cannot UPDATE the Stripe customer on their own row", async () => {
      // Writable `stripe_customer_id` would be self-service IDOR: point your
      // own row at another family's customer, then ask for its portal.
      const { error } = await customerClient
        .from("family_subscriptions")
        .update({ stripe_customer_id: CUSTOMER_2_STRIPE_ID })
        .eq("id", customerSubRowId);
      // `authenticated` holds SELECT and nothing else, so the refusal is a
      // privilege error. Pinning the code (not just "some error") keeps a
      // later write grant from passing this on an unrelated failure.
      expect(error?.code).toBe("42501");

      const { data } = await admin
        .from("family_subscriptions")
        .select("stripe_customer_id")
        .eq("id", customerSubRowId)
        .maybeSingle();
      expect(data?.stripe_customer_id).toBe(CUSTOMER_STRIPE_ID);
    });

    it("customer cannot INSERT a subscription row directly", async () => {
      const { error } = await customerClient
        .from("family_subscriptions")
        .insert({
          customer_id: TEST_IDS.CUSTOMER,
          participation_id: customerParticipationId,
          stripe_subscription_id: "sub_rls_forge",
          stripe_customer_id: CUSTOMER_2_STRIPE_ID,
          currency: "eur",
          status: "active",
        });
      expect(error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // product_seat_counts — public-readable rollup
  // ---------------------------------------------------------------------------

  describe("product_seat_counts", () => {
    it("anon CAN SELECT the rollup (it's the live seat counter)", async () => {
      const { data, error } = await anonClient
        .from("product_seat_counts")
        .select("active_count")
        .eq("product_id", PRODUCT_A)
        .maybeSingle();
      expect(error).toBeNull();
      // 1 active row was seeded for PRODUCT_A in beforeAll.
      expect(data?.active_count).toBe(1);
    });

    it("authenticated customer can SELECT the rollup for any product", async () => {
      const { data, error } = await customerClient
        .from("product_seat_counts")
        .select("active_count")
        .eq("product_id", PRODUCT_B) // not their product
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.active_count).toBe(1);
    });

    it("no role can INSERT into the rollup directly", async () => {
      const { error: anonError } = await anonClient
        .from("product_seat_counts")
        .insert({ product_id: PRODUCT_A, active_count: 999 });
      expect(anonError).not.toBeNull();

      const { error: custError } = await customerClient
        .from("product_seat_counts")
        .insert({ product_id: PRODUCT_A, active_count: 999 });
      expect(custError).not.toBeNull();
    });

    it("customer cannot UPDATE the rollup", async () => {
      const { error } = await customerClient
        .from("product_seat_counts")
        .update({ active_count: 999 })
        .eq("product_id", PRODUCT_A);
      expect(error).not.toBeNull();
    });
  });
});
