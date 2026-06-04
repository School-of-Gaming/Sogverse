import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import {
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

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
const PRODUCT_EXPIRED_RES = "00000000-0000-0000-0000-0000000005b2";
const PRODUCT_CONFIRM     = "00000000-0000-0000-0000-0000000005b3";
const PRODUCT_WAITLIST    = "00000000-0000-0000-0000-0000000005b4";
const PRODUCT_FREE_CAP    = "00000000-0000-0000-0000-0000000005b5";

const ALL_TEST_PRODUCTS = [
  PRODUCT_RACE_1SEAT,
  PRODUCT_EXPIRED_RES,
  PRODUCT_CONFIRM,
  PRODUCT_WAITLIST,
  PRODUCT_FREE_CAP,
];

describe("participations race + idempotency", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
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
    // than recreating). CASCADE handles family_subscription_items etc.
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Concurrent reservations
  // ---------------------------------------------------------------------------

  describe("create_participation — concurrent reservations on a 1-seat product", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_RACE_1SEAT,
        seatCount: 1,
      });
    });

    // 20 iterations is plenty to surface a missing FOR UPDATE lock — when
    // the lock is removed locally the test fails on the first or second
    // round. We don't need the plan's 30; CI time is real.
    it("two parallel calls with distinct gamers: one reserves, one is full", async () => {
      const ITERATIONS = 20;
      for (let i = 0; i < ITERATIONS; i++) {
        const [a, b] = await Promise.all([
          admin.rpc("create_participation", {
            p_product_id: PRODUCT_RACE_1SEAT,
            p_gamer_id: TEST_IDS.GAMER,
            p_customer_id: TEST_IDS.CUSTOMER,
            p_purchase_shape: "subscription_monthly",
            p_currency: "eur",
          }),
          admin.rpc("create_participation", {
            p_product_id: PRODUCT_RACE_1SEAT,
            p_gamer_id: TEST_IDS.GAMER_2,
            p_customer_id: TEST_IDS.CUSTOMER,
            p_purchase_shape: "subscription_monthly",
            p_currency: "eur",
          }),
        ]);

        expect(a.error, `iteration ${i}: a.error`).toBeNull();
        expect(b.error, `iteration ${i}: b.error`).toBeNull();

        const kinds = [
          (a.data as { kind: string }).kind,
          (b.data as { kind: string }).kind,
        ].sort();

        expect(kinds, `iteration ${i}`).toEqual(["full", "reserving"]);

        // Reset for the next iteration so we always start from a clean
        // 0/1 seat state.
        await admin
          .from("participations")
          .delete()
          .eq("product_id", PRODUCT_RACE_1SEAT);
      }
    }, 30_000);

    it("a held reserving row counts toward seat capacity", async () => {
      // Take the seat with one gamer, then verify a second attempt with
      // a different gamer returns 'full' even though the first row is
      // 'reserving' (not 'active').
      const first = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_RACE_1SEAT,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      expect((first.data as { kind: string }).kind).toBe("reserving");

      const second = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_RACE_1SEAT,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      expect((second.data as { kind: string }).kind).toBe("full");
    });
  });

  // ---------------------------------------------------------------------------
  // Reservation expiry
  // ---------------------------------------------------------------------------

  describe("expire_reservation", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_EXPIRED_RES,
        seatCount: 1,
      });
    });

    it("deletes a reserving row and frees the seat", async () => {
      const created = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_EXPIRED_RES,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      const reservationId = (created.data as { participation_id: string })
        .participation_id;

      const expired = await admin.rpc("expire_reservation", {
        p_reservation_id: reservationId,
      });
      expect((expired.data as { kind: string }).kind).toBe("expired");

      // Row is gone.
      const { data: row } = await admin
        .from("participations")
        .select("id")
        .eq("id", reservationId)
        .maybeSingle();
      expect(row).toBeNull();

      // Seat is free — a new reservation succeeds.
      const next = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_EXPIRED_RES,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      expect((next.data as { kind: string }).kind).toBe("reserving");
    });

    it("is a no-op on an already-confirmed (active) row", async () => {
      // Insert an active row directly — no reserving lifecycle.
      const { data: inserted, error } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_EXPIRED_RES,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      const result = await admin.rpc("expire_reservation", {
        p_reservation_id: inserted!.id,
      });
      expect((result.data as { kind: string }).kind).toBe("noop");

      // Active row is still there.
      const { data: row } = await admin
        .from("participations")
        .select("status")
        .eq("id", inserted!.id)
        .single();
      expect(row?.status).toBe("active");
    });
  });

  // ---------------------------------------------------------------------------
  // confirm_reservation
  // ---------------------------------------------------------------------------

  describe("confirm_reservation", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_CONFIRM,
        seatCount: 5,
      });
    });

    it("flips reserving → active", async () => {
      const created = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_CONFIRM,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "subscription_monthly",
        p_currency: "eur",
      });
      const reservationId = (created.data as { participation_id: string })
        .participation_id;

      const confirmed = await admin.rpc("confirm_reservation", {
        p_reservation_id: reservationId,
      });
      const body = confirmed.data as { kind: string; idempotent?: boolean };
      expect(body.kind).toBe("confirmed");
      expect(body.idempotent).toBe(false);

      const { data: row } = await admin
        .from("participations")
        .select("status, reserved_until")
        .eq("id", reservationId)
        .single();
      expect(row?.status).toBe("active");
      expect(row?.reserved_until).toBeNull();
    });

    it("returns idempotent confirmed when the row is already active", async () => {
      // Insert directly as active (skip reserving).
      const { data: inserted } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_CONFIRM,
          gamer_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        })
        .select("id")
        .single();

      const result = await admin.rpc("confirm_reservation", {
        p_reservation_id: inserted!.id,
      });
      const body = result.data as { kind: string; idempotent?: boolean };
      expect(body.kind).toBe("confirmed");
      expect(body.idempotent).toBe(true);
    });

    it("returns orphan when the reservation row does not exist", async () => {
      const result = await admin.rpc("confirm_reservation", {
        p_reservation_id: "00000000-0000-0000-0000-000000000fff",
      });
      expect((result.data as { kind: string }).kind).toBe("orphan");
    });

    it("returns orphan for a row in waitlisted state", async () => {
      const { data: inserted } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_CONFIRM,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "waitlisted",
          waitlist_position: 1,
        })
        .select("id")
        .single();

      const result = await admin.rpc("confirm_reservation", {
        p_reservation_id: inserted!.id,
      });
      expect((result.data as { kind: string }).kind).toBe("orphan");
    });

    it("returns duplicate_payment when another active row exists for the same (product, gamer)", async () => {
      // The "already signed up" guard in create_participation only blocks
      // active/waitlisted — a parent who clicks-abandons-clicks-again can
      // legitimately have two reserving rows. If both Stripe sessions
      // complete, the second confirm must NOT raise on the partial UNIQUE;
      // it must return duplicate_payment so the webhook can record the
      // duplicate charge instead of looping on Stripe retries.
      const { data: active } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_CONFIRM,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        })
        .select("id")
        .single();

      const { data: reserving } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_CONFIRM,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "reserving",
          reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
        })
        .select("id")
        .single();

      const result = await admin.rpc("confirm_reservation", {
        p_reservation_id: reserving!.id,
      });
      const body = result.data as {
        kind: string;
        existing_participation_id?: string;
      };
      expect(body.kind).toBe("duplicate_payment");
      expect(body.existing_participation_id).toBe(active!.id);

      // Reserving row left untouched — webhook is responsible for deleting it.
      const { data: row } = await admin
        .from("participations")
        .select("status")
        .eq("id", reserving!.id)
        .single();
      expect(row?.status).toBe("reserving");
    });
  });

  // ---------------------------------------------------------------------------
  // Waitlist concurrency + idempotency
  // ---------------------------------------------------------------------------

  describe("join_waitlist", () => {
    beforeAll(async () => {
      await createTestProduct(admin, {
        id: PRODUCT_WAITLIST,
        seatCount: 1,
        waitlistEnabled: true,
      });
    });

    it("two parallel joins for distinct gamers yield positions 1 and 2", async () => {
      const [a, b] = await Promise.all([
        admin.rpc("join_waitlist", {
          p_product_id: PRODUCT_WAITLIST,
          p_gamer_id: TEST_IDS.GAMER,
          p_customer_id: TEST_IDS.CUSTOMER,
        }),
        admin.rpc("join_waitlist", {
          p_product_id: PRODUCT_WAITLIST,
          p_gamer_id: TEST_IDS.GAMER_2,
          p_customer_id: TEST_IDS.CUSTOMER,
        }),
      ]);

      expect(a.error).toBeNull();
      expect(b.error).toBeNull();

      const positions = [
        (a.data as { waitlist_position: number }).waitlist_position,
        (b.data as { waitlist_position: number }).waitlist_position,
      ].sort();
      expect(positions).toEqual([1, 2]);
    });

    it("repeat call for the same (product, gamer) returns the existing row", async () => {
      const first = await admin.rpc("join_waitlist", {
        p_product_id: PRODUCT_WAITLIST,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
      });
      const firstId = (first.data as { participation_id: string })
        .participation_id;
      const firstPos = (first.data as { waitlist_position: number })
        .waitlist_position;

      const second = await admin.rpc("join_waitlist", {
        p_product_id: PRODUCT_WAITLIST,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
      });
      expect((second.data as { participation_id: string }).participation_id).toBe(
        firstId,
      );
      expect((second.data as { waitlist_position: number }).waitlist_position).toBe(
        firstPos,
      );

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
      expect((first.data as { kind: string }).kind).toBe("free_active");

      const second = await admin.rpc("create_participation", {
        p_product_id: PRODUCT_FREE_CAP,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
      });
      expect(second.error).toBeNull();
      expect((second.data as { kind: string }).kind).toBe("full");

      // Sanity: only one row exists for the product.
      const { data: rows } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_FREE_CAP);
      expect(rows?.length).toBe(1);
    });
  });
});
