import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";
import { z } from "zod";
import { getString, getNumber } from "../helpers/json";
import {
  confirmPaidParticipationRpcResult,
  createParticipationRpcResult,
  joinWaitlistRpcResult,
} from "@/services/participations/participations.contracts";

/**
 * Concurrency + idempotency tests for the participations lifecycle.
 *
 * The whole point of this file is to verify that the gate lock on
 * products (the SELECT … FOR UPDATE at the top of every RPC)
 * actually serializes seat math. None of these tests rely on wall-clock
 * timing — concurrency is exercised via Promise.all() and the DB-level
 * lock decides who wins.
 *
 * Test products live in a dedicated UUID range so this file's rows
 * never collide with the trigger / cron / RLS files when CI runs them
 * in parallel.
 */

const PRODUCT_RACE_1SEAT  = "00000000-0000-0000-0000-0000000005b1";
const PRODUCT_CONFIRM     = "00000000-0000-0000-0000-0000000005b3";
const PRODUCT_WAITLIST    = "00000000-0000-0000-0000-0000000005b4";
const PRODUCT_FREE_CAP    = "00000000-0000-0000-0000-0000000005b5";

const ALL_TEST_PRODUCTS = [
  PRODUCT_RACE_1SEAT,
  PRODUCT_CONFIRM,
  PRODUCT_WAITLIST,
  PRODUCT_FREE_CAP,
];

describe("participations race + idempotency", () => {
  let admin: SupabaseClient<Database>;
  // The waitlist engine is not callable by service_role (migration 00126); the
  // waitlist block below goes through the guarded wrapper as CUSTOMER, who is
  // the parent of both seeded gamers.
  let customer: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    // Ensure no leftover rows from prior aborted runs — we hard-reset
    // before creating products so beforeAll is idempotent under the
    // shared local Supabase.
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterEach(async () => {
    // Wipe participations between tests but keep products around (cheaper
    // than recreating). CASCADE handles family_subscriptions etc.
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Concurrent paid confirmations
  // ---------------------------------------------------------------------------

  describe("confirm_paid_participation — concurrent payments on a 1-seat product", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_RACE_1SEAT,
        seatCount: 1,
      });
    });

    // 20 iterations is plenty to surface a missing FOR UPDATE lock — when
    // the lock is removed locally the test fails on the first or second
    // round. We don't need the plan's 30; CI time is real.
    it("two parallel confirmations for the same gamer: one seat, one duplicate_payment", async () => {
      // The race that matters now that the seat is created at payment time: a
      // parent completes two Stripe sessions for the same (product, gamer) at
      // once. Exactly one may become a seat; the other must come back as a
      // duplicate the webhook can refund, never as a second row and never as a
      // unique-violation the webhook would retry forever.
      const ITERATIONS = 20;
      for (let i = 0; i < ITERATIONS; i++) {
        const [a, b] = await Promise.all([
          admin.rpc("confirm_paid_participation", {
            p_product_id: PRODUCT_RACE_1SEAT,
            p_gamer_id: TEST_IDS.GAMER,
            p_customer_id: TEST_IDS.CUSTOMER,
            p_checkout_session_id: `cs_race_${i}_a`,
          }),
          admin.rpc("confirm_paid_participation", {
            p_product_id: PRODUCT_RACE_1SEAT,
            p_gamer_id: TEST_IDS.GAMER,
            p_customer_id: TEST_IDS.CUSTOMER,
            p_checkout_session_id: `cs_race_${i}_b`,
          }),
        ]);

        expect(a.error, `iteration ${i}: a.error`).toBeNull();
        expect(b.error, `iteration ${i}: b.error`).toBeNull();

        const kinds = [
          getString(a.data, "kind"),
          getString(b.data, "kind"),
        ].sort();
        expect(kinds, `iteration ${i}`).toEqual([
          "confirmed",
          "duplicate_payment",
        ]);

        const { data: rows } = await admin
          .from("participations")
          .select("id")
          .eq("product_id", PRODUCT_RACE_1SEAT);
        expect(rows?.length, `iteration ${i}: row count`).toBe(1);

        // Reset for the next iteration so we always start from a clean
        // 0/1 seat state.
        await admin
          .from("participations")
          .delete()
          .eq("product_id", PRODUCT_RACE_1SEAT);
      }
    }, 30_000);

    it("create_participation validates a paid signup without writing a row", async () => {
      // The seat cap is checked before Stripe, but nothing is stored: an
      // abandoned checkout has to leave the product exactly as it was.
      const validated = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_RACE_1SEAT,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      // Parsed through the contract schema the checkout route depends on
      // (createParticipationRpcResult), so this real RPC output is the CI guard
      // that participations.contracts.ts stays true to Postgres.
      const parsed = createParticipationRpcResult.parse(validated.data);
      expect(parsed.kind).toBe("validated");
      expect(parsed.participation_id).toBeUndefined();

      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_RACE_1SEAT);
      expect(rows ?? []).toEqual([]);
    });

    it("an active seat fills the product for everyone else", async () => {
      await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_RACE_1SEAT,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_fills_the_seat",
      });

      const second = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_RACE_1SEAT,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      // Covers the 'full' kind of the same contract schema (no id).
      expect(createParticipationRpcResult.parse(second.data).kind).toBe("full");
    });

    it.each(["active", "waitlisted", "completed"] as const)(
      "refuses a signup when the gamer already holds a %s row",
      async (status) => {
        // These three are exactly the statuses `confirm_paid_participation`
        // conflicts on, and the two lists have to stay identical: a status this
        // gate lets through but the confirmation refuses would take a parent's
        // money and then hand them nothing. `completed` is the one that was
        // missing — unreachable today, since nothing writes it, which is why it
        // needs a test rather than a bug report.
        const { error: seedErr } = await admin.from("participations").insert({
          product_id: PRODUCT_RACE_1SEAT,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status,
          waitlisted_at:
            status === "waitlisted" ? new Date().toISOString() : null,
        });
        expect(seedErr).toBeNull();

        const again = await admin.rpc("create_participation", {
          p_product_id: PRODUCT_RACE_1SEAT,
          p_gamer_id: TEST_IDS.GAMER,
          p_customer_id: TEST_IDS.CUSTOMER,
          p_purchase_shape: "subscription_monthly",
          p_currency: "eur",
        });
        // 23505 is what the checkout route maps to a 409.
        expect(again.error?.code).toBe("23505");
        expect(again.error?.message).toContain(status);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // confirm_paid_participation
  // ---------------------------------------------------------------------------

  describe("confirm_paid_participation", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_CONFIRM,
        seatCount: 5,
      });
    });

    it("creates an active row and records the session that bought it", async () => {
      const result = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_confirm_1",
      });
      const body = confirmPaidParticipationRpcResult.parse(result.data);
      expect(body.kind).toBe("confirmed");
      const participationId =
        body.kind === "confirmed" ? body.participation_id : "";

      const { data: row } = await admin
        .from("participations")
        .select("status, customer_id, stripe_checkout_session_id")
        .eq("id", participationId)
        .single();
      expect(row?.status).toBe("active");
      expect(row?.customer_id).toBe(TEST_IDS.CUSTOMER);
      expect(row?.stripe_checkout_session_id).toBe("cs_confirm_1");
    });

    it("is idempotent for a redelivery of the same Checkout Session", async () => {
      // The webhook writes its payment row last, so a failure after the seat is
      // created leaves no commit marker and Stripe re-runs the whole handler.
      // That re-run must get its own row back — not a duplicate verdict, which
      // would cancel a paying customer's live subscription.
      const first = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_replay_1",
      });
      const second = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_replay_1",
      });

      const a = confirmPaidParticipationRpcResult.parse(first.data);
      const b = confirmPaidParticipationRpcResult.parse(second.data);
      expect(a.kind).toBe("confirmed");
      expect(b.kind).toBe("confirmed");
      expect(b.kind === "confirmed" && b.participation_id).toBe(
        a.kind === "confirmed" && a.participation_id,
      );
      expect(
        z.object({ idempotent: z.boolean() }).parse(second.data).idempotent,
      ).toBe(true);

      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_CONFIRM)
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(rows?.length).toBe(1);
    });

    it("returns duplicate_payment when a different session already bought the seat", async () => {
      // Two Stripe sessions completed for one (product, gamer) — the parent
      // paid on the original tab and again on a retry tab. The second must not
      // raise on the partial UNIQUE; it must come back as a duplicate so the
      // webhook records the charge and cancels the second subscription instead
      // of looping on Stripe retries.
      const first = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_dup_first",
      });
      const firstBody = confirmPaidParticipationRpcResult.parse(first.data);

      const second = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_dup_second",
      });
      const secondBody = confirmPaidParticipationRpcResult.parse(second.data);

      expect(secondBody.kind).toBe("duplicate_payment");
      expect(
        secondBody.kind === "duplicate_payment" &&
          secondBody.existing_participation_id,
      ).toBe(firstBody.kind === "confirmed" && firstBody.participation_id);

      // Still exactly one seat.
      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_CONFIRM)
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(rows?.length).toBe(1);
    });

    it("returns duplicate_payment when the gamer is already on the waitlist", async () => {
      // Nothing stops a parent joining the waitlist while a checkout is in
      // flight — there is no row to block them any more. The payment then lands
      // on a gamer who already holds a spot on the product, which is the same
      // "two claims, one seat" situation and gets the same answer.
      const { data: waitlisted } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_CONFIRM,
          gamer_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "waitlisted",
          waitlisted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      const result = await admin.rpc("confirm_paid_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_waitlist_clash",
      });
      const body = confirmPaidParticipationRpcResult.parse(result.data);
      expect(body.kind).toBe("duplicate_payment");
      expect(
        body.kind === "duplicate_payment" && body.existing_participation_id,
      ).toBe(waitlisted!.id);
    });

    it("raises for a product that does not exist", async () => {
      const result = await admin.rpc("confirm_paid_participation", {
        p_product_id: "00000000-0000-0000-0000-000000000fff",
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_checkout_session_id: "cs_no_product",
      });
      expect(result.error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Waitlist concurrency + idempotency
  // ---------------------------------------------------------------------------

  // The engine (join_waitlist) is exercised through its guarded wrapper, which
  // is a thin assert_role + auth.uid() pass-through — the concurrency and
  // idempotency under test are the engine's own.
  describe("join_waitlist (via join_product_waitlist)", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_WAITLIST,
        seatCount: 1,
        waitlistEnabled: true,
      });
    });

    it("two parallel joins for distinct gamers yield positions 1 and 2", async () => {
      const [a, b] = await Promise.all([
        customer.rpc("join_product_waitlist", {
          p_product_id: PRODUCT_WAITLIST,
          p_gamer_id: TEST_IDS.GAMER,
        }),
        customer.rpc("join_product_waitlist", {
          p_product_id: PRODUCT_WAITLIST,
          p_gamer_id: TEST_IDS.GAMER_2,
        }),
      ]);

      expect(a.error).toBeNull();
      expect(b.error).toBeNull();

      // Parse both through the contract the waitlist route depends on
      // (joinWaitlistRpcResult) so real RPC output guards the schema in CI.
      const parsedA = joinWaitlistRpcResult.parse(a.data);
      const parsedB = joinWaitlistRpcResult.parse(b.data);

      const positions = [
        parsedA.waitlist_position,
        parsedB.waitlist_position,
      ].sort();
      expect(positions).toEqual([1, 2]);
    });

    it("repeat call for the same (product, gamer) returns the existing row", async () => {
      const first = await customer.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_WAITLIST,
        p_gamer_id: TEST_IDS.GAMER,
      });
      const firstId = getString(first.data, "participation_id");
      const firstPos = getNumber(first.data, "waitlist_position");

      const second = await customer.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_WAITLIST,
        p_gamer_id: TEST_IDS.GAMER,
      });
      expect(getString(second.data, "participation_id")).toBe(firstId);
      expect(getNumber(second.data, "waitlist_position")).toBe(firstPos);

      // And exactly one row exists.
      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_WAITLIST)
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(rows?.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Free products honor seat_count
  // ---------------------------------------------------------------------------
  //
  // The schema permits any product, free included, to carry an explicit
  // seat_count (seat_count is optional for every billing mode). Before 00043,
  // create_participation's free path INSERTed an active row before any
  // seat-count check, so a free product with seat_count=1 silently accepted
  // the second signup. The gate now sits above the free branch.

  describe("create_participation — free product with seat_count enforces cap", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_FREE_CAP,
        billingMode: "free",
        seatCount: 1,
      });
    });

    it("first free signup activates; second returns 'full'", async () => {
      const first = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_FREE_CAP,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
      expect(first.error).toBeNull();
      expect(getString(first.data, "kind")).toBe("free_active");

      const second = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_FREE_CAP,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
      expect(second.error).toBeNull();
      expect(getString(second.data, "kind")).toBe("full");

      // Sanity: only one row exists for the product.
      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_FREE_CAP);
      expect(rows?.length).toBe(1);
    });
  });
});
