import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";
import {
  confirmPaidParticipationRpcResult,
  createParticipationRpcResult,
} from "@/services/participations/participations.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createTestProduct,
  deleteTestProducts,
  insertPaidBooking,
} from "./product-helpers";

/**
 * The booking is the family's request, written before Checkout; confirm_booking
 * is the one way it becomes a seat. A pending booking holds nothing.
 */

const PAID_CLUB = "00000000-0000-0000-0000-0000000005ba";
const PAID_CAMP = "00000000-0000-0000-0000-0000000005bb";
const FREE_CLUB = "00000000-0000-0000-0000-0000000005bc";
const MUNI_CLUB = "00000000-0000-0000-0000-0000000005bd";
const WAITLIST_CLUB = "00000000-0000-0000-0000-0000000005be";
const ALL_PRODUCTS = [PAID_CLUB, PAID_CAMP, FREE_CLUB, MUNI_CLUB, WAITLIST_CLUB];

const pendingResult = z.object({ booking_id: z.string() });
const seatResult = z.object({ participation_id: z.string() });

describe("bookings", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    await createTestProduct(admin, { id: PAID_CLUB, seatCount: 5 });
    await createTestProduct(admin, {
      id: PAID_CAMP,
      seatCount: 5,
      productType: "camp",
      endDate: "2099-12-31",
    });
    await createTestProduct(admin, {
      id: FREE_CLUB,
      seatCount: 5,
      billingMode: "free",
    });
    await createTestProduct(admin, {
      id: MUNI_CLUB,
      seatCount: 5,
      billingMode: "external_contract",
      productType: "municipality_club",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: "2099-12-31",
    });
    await createTestProduct(admin, {
      id: WAITLIST_CLUB,
      seatCount: 1,
      waitlistEnabled: true,
    });
  });

  afterEach(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    // No role can delete a booking, so a case's rows go with the products
    // afterAll. Settling them keeps one case's open Session out of the next.
    await admin
      .from("bookings")
      .update({ status: "settled" })
      .in("product_id", ALL_PRODUCTS)
      .eq("status", "pending");
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  function book(
    productId: string,
    shape: string,
    answers: Partial<Database["public"]["Functions"]["create_booking"]["Args"]> = {},
  ) {
    return admin.rpc("create_booking", {
      p_product_id: productId,
      p_participant_id: TEST_IDS.GAMER,
      p_customer_id: TEST_IDS.CUSTOMER,
      p_purchase_shape: shape,
      p_currency: "eur",
      ...answers,
    });
  }

  async function pendingBooking(productId: string): Promise<string> {
    const { data, error } = await book(productId, "subscription_monthly");
    expect(error).toBeNull();
    expect(data).toMatchObject({ kind: "pending" });
    return pendingResult.parse(data).booking_id;
  }

  async function readBooking(id: string) {
    const { data, error } = await admin
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(`booking read failed: ${error.message}`);
    return data;
  }

  async function seatsOn(productId: string) {
    const { data, error } = await admin
      .from("participations")
      .select("id, status, booking_id")
      .eq("product_id", productId);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function paymentMarkers(productId: string) {
    const { data, error } = await adminUser.rpc(
      "get_product_groups_with_details",
      { p_product_id: productId },
    );
    expect(error).toBeNull();
    const snapshot = productGroupsSnapshot.parse(data);
    return [...snapshot.unassigned, ...snapshot.waitlist];
  }

  describe("create_booking", () => {
    it.each(["subscription_monthly", "single_payment"])(
      "writes a pending %s booking and no seat",
      async (shape) => {
        const { data, error } = await book(PAID_CLUB, shape, {
          p_utm_source: "lynx",
          p_school_of_gaming_marketing_opt_in: true,
        });
        expect(error).toBeNull();
        expect(data).toMatchObject({
          kind: "pending",
          open_checkout_sessions: [],
        });
        const bookingId = pendingResult.parse(data).booking_id;

        expect(await readBooking(bookingId)).toMatchObject({
          status: "pending",
          purchase_shape: shape,
          currency: "eur",
          utm_source: "lynx",
          school_of_gaming_marketing_opt_in: true,
          stripe_checkout_session_id: null,
          settled_at: null,
        });
        expect(await seatsOn(PAID_CLUB)).toEqual([]);
      },
    );

    it.each([
      [FREE_CLUB, "free", "free_active"],
      [MUNI_CLUB, "external", "external_active"],
    ])("settles a no-charge booking on the spot (%s)", async (productId, shape, kind) => {
      const { data, error } = await book(productId, shape, {
        p_utm_campaign: "autumn",
      });
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind });
      const seatId = seatResult.parse(data).participation_id;

      const [seat] = await seatsOn(productId);
      expect(seat).toMatchObject({ id: seatId, status: "active" });
      expect(await readBooking(seat.booking_id!)).toMatchObject({
        status: "settled",
        purchase_shape: shape,
        utm_campaign: "autumn",
        stripe_checkout_session_id: null,
      });
      expect((await readBooking(seat.booking_id!)).settled_at).not.toBeNull();
    });

    it("leaves the seat count where it was while a booking is pending", async () => {
      await admin.from("products").update({ seat_count: 1 }).eq("id", PAID_CAMP);

      await pendingBooking(PAID_CAMP);

      const { data: seats, error } = await admin.rpc("count_active_seats", {
        p_product_id: PAID_CAMP,
      });
      expect(error).toBeNull();
      expect(seats).toBe(0);

      // The second family is not refused, because a pending booking holds nothing.
      const second = await admin.rpc("create_booking", {
        p_product_id: PAID_CAMP,
        p_participant_id: TEST_IDS.GAMER_2,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "single_payment",
        p_currency: "eur",
      });
      expect(second.data).toMatchObject({ kind: "pending" });
      await admin.from("products").update({ seat_count: 5 }).eq("id", PAID_CAMP);
    });

    it("lists the other pending bookings' open Sessions, and only those", async () => {
      const open = await pendingBooking(PAID_CLUB);
      await admin
        .from("bookings")
        .update({
          stripe_checkout_session_id: "cs_booking_open",
          checkout_closes_at: new Date(Date.now() + 600_000).toISOString(),
        })
        .eq("id", open);

      const closed = await pendingBooking(PAID_CLUB);
      await admin
        .from("bookings")
        .update({
          stripe_checkout_session_id: "cs_booking_closed",
          checkout_closes_at: new Date(Date.now() - 1_000).toISOString(),
        })
        .eq("id", closed);

      // Same child on another product is another seat altogether.
      await insertPaidBooking(admin, {
        productId: PAID_CAMP,
        participantId: TEST_IDS.GAMER,
        customerId: TEST_IDS.CUSTOMER,
        checkoutSessionId: "cs_booking_other_product",
      });

      const { data } = await book(PAID_CLUB, "subscription_monthly");
      expect(data).toMatchObject({
        kind: "pending",
        open_checkout_sessions: ["cs_booking_open"],
      });
    });
  });

  describe("confirm_booking", () => {
    async function paidBooking(session: string, productId = PAID_CLUB) {
      return insertPaidBooking(admin, {
        productId,
        participantId: TEST_IDS.GAMER,
        customerId: TEST_IDS.CUSTOMER,
        checkoutSessionId: session,
      });
    }

    function confirm(bookingId: string, session: string) {
      return admin.rpc("confirm_booking", {
        p_booking_id: bookingId,
        p_checkout_session_id: session,
      });
    }

    it("seats the participant and returns the booking's facts", async () => {
      const bookingId = await paidBooking("cs_booking_confirm");
      const { data, error } = await confirm(bookingId, "cs_booking_confirm");
      expect(error).toBeNull();

      const [seat] = await seatsOn(PAID_CLUB);
      expect(seat).toMatchObject({ status: "active", booking_id: bookingId });
      expect(data).toEqual({
        kind: "settled",
        idempotent: false,
        participation_id: seat.id,
        booking_id: bookingId,
        customer_id: TEST_IDS.CUSTOMER,
        participant_id: TEST_IDS.GAMER,
        product_id: PAID_CLUB,
        purchase_shape: "subscription_monthly",
        currency: "eur",
      });
      expect((await readBooking(bookingId)).status).toBe("settled");
    });

    it("stores the session when the webhook beats the route to it", async () => {
      const bookingId = await pendingBooking(PAID_CLUB);
      await confirm(bookingId, "cs_booking_early_webhook");
      expect((await readBooking(bookingId)).stripe_checkout_session_id).toBe(
        "cs_booking_early_webhook",
      );
    });

    it("answers a redelivery with the same seat and writes nothing", async () => {
      const bookingId = await paidBooking("cs_booking_replay");
      const first = await confirm(bookingId, "cs_booking_replay");
      const second = await confirm(bookingId, "cs_booking_replay");

      expect(second.data).toMatchObject({
        kind: "settled",
        idempotent: true,
        participation_id: seatResult.parse(first.data).participation_id,
      });
      expect(await seatsOn(PAID_CLUB)).toHaveLength(1);
    });

    it("does not put a cancelled seat back on a redelivery", async () => {
      const bookingId = await paidBooking("cs_booking_cancelled");
      await confirm(bookingId, "cs_booking_cancelled");
      await admin.from("participations").delete().eq("product_id", PAID_CLUB);

      const { data, error } = await confirm(bookingId, "cs_booking_cancelled");
      expect(error).toBeNull();
      expect(data).toMatchObject({
        kind: "settled",
        idempotent: true,
        participation_id: null,
      });
      expect(await seatsOn(PAID_CLUB)).toEqual([]);
    });

    it("marks a second payment duplicate and leaves the first seat alone", async () => {
      const firstBooking = await paidBooking("cs_booking_first");
      await confirm(firstBooking, "cs_booking_first");
      const [seat] = await seatsOn(PAID_CLUB);

      const secondBooking = await paidBooking("cs_booking_second");
      const { data, error } = await confirm(secondBooking, "cs_booking_second");
      expect(error).toBeNull();
      expect(data).toMatchObject({
        kind: "duplicate_payment",
        existing_participation_id: seat.id,
        existing_status: "active",
        booking_id: secondBooking,
        customer_id: TEST_IDS.CUSTOMER,
        purchase_shape: "subscription_monthly",
      });
      expect((await readBooking(secondBooking)).status).toBe("duplicate");
      expect(await seatsOn(PAID_CLUB)).toHaveLength(1);

      // Redelivered once the first seat has gone: still a duplicate, no seat.
      await admin.from("participations").delete().eq("product_id", PAID_CLUB);
      const again = await confirm(secondBooking, "cs_booking_second");
      expect(again.data).toMatchObject({
        kind: "duplicate_payment",
        existing_participation_id: null,
      });
      expect(await seatsOn(PAID_CLUB)).toEqual([]);
    });

    it("refuses a session other than the booking's", async () => {
      const bookingId = await paidBooking("cs_booking_mine");
      const { error } = await confirm(bookingId, "cs_booking_someone_elses");
      expect(error?.code).toBe("23514");
      expect((await readBooking(bookingId)).status).toBe("pending");
      expect(await seatsOn(PAID_CLUB)).toEqual([]);
    });

    it("raises on a booking that does not exist", async () => {
      const { error } = await confirm(
        "00000000-0000-0000-0000-0000000005bf",
        "cs_booking_none",
      );
      expect(error?.code).toBe("P0002");
    });
  });

  // legacy-checkout-session: the old app's view of the new schema, which the
  // follow-up removes with the functions and the column.
  describe("legacy-checkout-session: the app from before bookings", () => {
    describe("create_participation", () => {
      function oldSignup(productId: string, shape: string) {
        return admin.rpc("create_participation", {
          p_product_id: productId,
          p_participant_id: TEST_IDS.GAMER,
          p_customer_id: TEST_IDS.CUSTOMER,
          p_purchase_shape: shape,
          p_currency: "eur",
        });
      }

      it.each(["subscription_monthly", "single_payment"])(
        "answers a paid %s signup with validated and no seat",
        async (shape) => {
          const { data, error } = await oldSignup(PAID_CLUB, shape);
          expect(error).toBeNull();
          expect(createParticipationRpcResult.parse(data)).toEqual({
            kind: "validated",
          });
          expect(data).toEqual({ kind: "validated" });
          expect(await seatsOn(PAID_CLUB)).toEqual([]);
        },
      );

      it.each([
        [FREE_CLUB, "free", "free_active"],
        [MUNI_CLUB, "external", "external_active"],
      ])("seats a no-charge signup on the spot (%s)", async (productId, shape, kind) => {
        const { data, error } = await oldSignup(productId, shape);
        expect(error).toBeNull();
        expect(createParticipationRpcResult.parse(data).kind).toBe(kind);

        const [seat] = await seatsOn(productId);
        expect(data).toEqual({ kind, participation_id: seat.id });
      });

      it("answers full on a product with no seat left", async () => {
        const { error: seatError } = await admin.from("participations").insert({
          product_id: WAITLIST_CLUB,
          participant_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        });
        expect(seatError).toBeNull();

        const { data, error } = await oldSignup(WAITLIST_CLUB, "single_payment");
        expect(error).toBeNull();
        expect(data).toEqual({ kind: "full" });
      });
    });

    describe("confirm_paid_participation", () => {
      const oldConfirm = (session: string, productId = PAID_CLUB) =>
        admin.rpc("confirm_paid_participation", {
          p_product_id: productId,
          p_participant_id: TEST_IDS.GAMER,
          p_customer_id: TEST_IDS.CUSTOMER,
          p_checkout_session_id: session,
          p_utm_source: "lynx",
        });

      it("confirms the seat and books it from the arguments and the product", async () => {
        const { data, error } = await oldConfirm("cs_booking_legacy");
        expect(error).toBeNull();

        const [seat] = await seatsOn(PAID_CLUB);
        expect(confirmPaidParticipationRpcResult.parse(data).kind).toBe("confirmed");
        expect(data).toEqual({
          kind: "confirmed",
          participation_id: seat.id,
          idempotent: false,
        });
        expect(await readBooking(seat.booking_id!)).toMatchObject({
          status: "settled",
          purchase_shape: "subscription_monthly",
          currency: "eur",
          utm_source: "lynx",
          stripe_checkout_session_id: "cs_booking_legacy",
        });
      });

      it("books anything but a consumer club as a single payment", async () => {
        await oldConfirm("cs_booking_legacy_camp", PAID_CAMP);
        const [seat] = await seatsOn(PAID_CAMP);
        expect(await readBooking(seat.booking_id!)).toMatchObject({
          purchase_shape: "single_payment",
          currency: "eur",
        });
      });

      it("answers a redelivery with the same seat and one booking", async () => {
        const first = await oldConfirm("cs_booking_legacy_replay");
        const { data } = await oldConfirm("cs_booking_legacy_replay");

        expect(confirmPaidParticipationRpcResult.parse(data)).toEqual({
          kind: "confirmed",
          participation_id: seatResult.parse(first.data).participation_id,
          idempotent: true,
        });
        expect(await seatsOn(PAID_CLUB)).toHaveLength(1);

        const { data: bookings } = await admin
          .from("bookings")
          .select("id")
          .eq("stripe_checkout_session_id", "cs_booking_legacy_replay");
        expect(bookings).toHaveLength(1);
      });

      it("reports a second payment as a duplicate of the first seat", async () => {
        await oldConfirm("cs_booking_legacy_first");
        const [seat] = await seatsOn(PAID_CLUB);

        const { data, error } = await oldConfirm("cs_booking_legacy_second");
        expect(error).toBeNull();
        expect(confirmPaidParticipationRpcResult.parse(data).kind).toBe(
          "duplicate_payment",
        );
        expect(data).toEqual({
          kind: "duplicate_payment",
          existing_participation_id: seat.id,
          existing_status: "active",
        });
      });

      it("refuses a redelivery after the seat was cancelled, and leaves it cancelled", async () => {
        await oldConfirm("cs_booking_legacy_cancelled");
        await admin.from("participations").delete().eq("product_id", PAID_CLUB);

        const { error } = await oldConfirm("cs_booking_legacy_cancelled");
        expect(error?.code).toBe("23514");
        expect(await seatsOn(PAID_CLUB)).toEqual([]);
      });

      it("leaves the seat findable by its session, as the old confirmation page looks", async () => {
        const first = await oldConfirm("cs_booking_legacy_lookup");
        const { data, error } = await admin
          .from("participations")
          .select("id")
          .eq("stripe_checkout_session_id", "cs_booking_legacy_lookup")
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.id).toBe(seatResult.parse(first.data).participation_id);
      });

      it("seats count as paid", async () => {
        await oldConfirm("cs_booking_legacy_marker");
        const [seat] = await seatsOn(PAID_CLUB);
        expect(await paymentMarkers(PAID_CLUB)).toMatchObject([
          { id: seat.id, has_payment_marker: true },
        ]);
      });

      it("raises for a product that does not exist", async () => {
        const { error } = await admin.rpc("confirm_paid_participation", {
          p_product_id: "00000000-0000-0000-0000-000000000fff",
          p_participant_id: TEST_IDS.GAMER,
          p_customer_id: TEST_IDS.CUSTOMER,
          p_checkout_session_id: "cs_no_product",
        });
        expect(error?.code).toBe("P0002");
      });
    });

    it("participations still has stripe_checkout_session_id", async () => {
      const { error } = await admin
        .from("participations")
        .select("stripe_checkout_session_id")
        .limit(1);
      expect(error).toBeNull();
    });
  });

  describe("a waitlist join", () => {
    function join(answers: { p_utm_source?: string; p_school_of_gaming_marketing_opt_in?: boolean } = {}) {
      return customer.rpc("join_product_waitlist", {
        p_product_id: WAITLIST_CLUB,
        p_participant_id: TEST_IDS.GAMER,
        ...answers,
      });
    }

    it("writes a settled booking with no shape or currency, and links the seat", async () => {
      const { error } = await join({
        p_utm_source: "lynx",
        p_school_of_gaming_marketing_opt_in: false,
      });
      expect(error).toBeNull();

      const [seat] = await seatsOn(WAITLIST_CLUB);
      expect(seat.status).toBe("waitlisted");
      expect(await readBooking(seat.booking_id!)).toMatchObject({
        status: "settled",
        purchase_shape: null,
        currency: null,
        utm_source: "lynx",
        school_of_gaming_marketing_opt_in: false,
      });
    });

    it("writes nothing on a replay", async () => {
      await join();
      const [seat] = await seatsOn(WAITLIST_CLUB);
      const before = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("product_id", WAITLIST_CLUB);

      const replay = await join({ p_utm_source: "lynx" });
      expect(replay.error).toBeNull();

      const after = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("product_id", WAITLIST_CLUB);
      expect(after.count).toBe(before.count);
      expect((await readBooking(seat.booking_id!)).utm_source).toBeNull();
    });

    it("keeps its booking through promotion and demotion", async () => {
      await join();
      const [seat] = await seatsOn(WAITLIST_CLUB);

      const promoted = await adminUser.rpc("promote_from_waitlist", {
        p_participation_id: seat.id,
      });
      expect(promoted.error).toBeNull();
      expect((await seatsOn(WAITLIST_CLUB))[0].booking_id).toBe(seat.booking_id);

      const demoted = await adminUser.rpc("demote_to_waitlist", {
        p_participation_id: seat.id,
      });
      expect(demoted.error).toBeNull();
      expect((await seatsOn(WAITLIST_CLUB))[0].booking_id).toBe(seat.booking_id);
    });

    it("a shape and a currency come together or not at all", async () => {
      const { error } = await admin.from("bookings").insert({
        product_id: WAITLIST_CLUB,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        currency: "eur",
      });
      expect(error?.code).toBe("23514");
    });
  });

  describe("the payment marker reads a paid shape, not a booking", () => {
    it("is absent on a waitlist join's booking, before and after promotion", async () => {
      await customer.rpc("join_product_waitlist", {
        p_product_id: WAITLIST_CLUB,
        p_participant_id: TEST_IDS.GAMER,
      });
      const [seat] = await seatsOn(WAITLIST_CLUB);
      expect(seat.booking_id).not.toBeNull();
      expect(await paymentMarkers(WAITLIST_CLUB)).toMatchObject([
        { id: seat.id, has_payment_marker: false },
      ]);

      await adminUser.rpc("promote_from_waitlist", {
        p_participation_id: seat.id,
      });
      expect(await paymentMarkers(WAITLIST_CLUB)).toMatchObject([
        { id: seat.id, has_payment_marker: false },
      ]);
    });

    it("stays on a paid seat demoted to the waitlist", async () => {
      const bookingId = await insertPaidBooking(admin, {
        productId: WAITLIST_CLUB,
        participantId: TEST_IDS.GAMER,
        customerId: TEST_IDS.CUSTOMER,
        checkoutSessionId: "cs_booking_marker",
      });
      await admin.rpc("confirm_booking", {
        p_booking_id: bookingId,
        p_checkout_session_id: "cs_booking_marker",
      });
      const [seat] = await seatsOn(WAITLIST_CLUB);
      expect(await paymentMarkers(WAITLIST_CLUB)).toMatchObject([
        { id: seat.id, has_payment_marker: true },
      ]);

      const demoted = await adminUser.rpc("demote_to_waitlist", {
        p_participation_id: seat.id,
      });
      expect(demoted.error).toBeNull();
      expect(await paymentMarkers(WAITLIST_CLUB)).toMatchObject([
        { id: seat.id, has_payment_marker: true },
      ]);
    });

    it("is absent on a free seat", async () => {
      await book(FREE_CLUB, "free");
      expect(await paymentMarkers(FREE_CLUB)).toMatchObject([
        { has_payment_marker: false },
      ]);
    });
  });

  describe("who reads a booking", () => {
    function ownBooking(): Promise<string> {
      return insertPaidBooking(admin, {
        productId: PAID_CAMP,
        participantId: TEST_IDS.GAMER,
        customerId: TEST_IDS.CUSTOMER,
        checkoutSessionId: `cs_booking_scope_${crypto.randomUUID()}`,
      });
    }

    it("the parent who booked reads the whole row", async () => {
      const id = await ownBooking();
      const { data, error } = await customer
        .from("bookings")
        .select("*")
        .eq("id", id);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0].customer_id).toBe(TEST_IDS.CUSTOMER);
    });

    it.each([
      ["another parent", () => customer2],
      ["the gamer the booking is for", () => gamer],
      ["an admin's own session", () => adminUser],
    ])("%s reads nothing", async (_who, client) => {
      const id = await ownBooking();
      const { data, error } = await client()
        .from("bookings")
        .select("id")
        .eq("id", id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("no signed-in user can write one", async () => {
      const id = await ownBooking();
      const { error } = await customer
        .from("bookings")
        .update({ status: "settled" })
        .eq("id", id);
      expect(error?.code).toBe("42501");
    });
  });

  describe("the seat", () => {
    it.each([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "school_of_gaming_marketing_opt_in",
    ])("no longer has a %s column", async (column) => {
      const { error } = await admin
        .from("participations")
        .select(column)
        .limit(1);
      expect(error?.code).toBe("42703");
    });
  });
});
