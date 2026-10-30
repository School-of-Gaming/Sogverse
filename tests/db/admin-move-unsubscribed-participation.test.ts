import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts, insertPaidBooking } from "./product-helpers";
import { adminMoveUnsubscribedParticipationRpcResult } from "@/services/participations/participations.contracts";

/**
 * `admin_move_unsubscribed_participation` — an admin moves a seat with nothing
 * to bill (a free or municipality seat, or a paid one-time camp or event) to
 * any product that is not subscription-shaped. No money moves, so the whole
 * move is this one call.
 *
 * The role gate is covered fixture-free by the spine's role × RPC matrix. What
 * needs fixtures is the write, the automatic placement on the target, the
 * target's required consents recorded on the family's behalf, and the
 * refusals that keep the function off a seat with a subscription and off a
 * product whose seats need one.
 *
 * Product UUIDs 6e0-6e4, groups 6e5-6e7 (see the product-helpers allocation
 * registry).
 */

/** Free club open to gamers AND parents, so either kind of seat can start here. */
const SOURCE = "00000000-0000-0000-0000-0000000006e0";
/** Free club, gamers and parents, ONE group, and two required consents. */
const FREE_TARGET = "00000000-0000-0000-0000-0000000006e1";
/** Paid one-time camp, gamers only, ONE group — which a paid product never auto-places into. */
const PAID_CAMP = "00000000-0000-0000-0000-0000000006e2";
/** Paid consumer club: subscription-shaped, the refused target. */
const SUBSCRIPTION_CLUB = "00000000-0000-0000-0000-0000000006e3";
/** Free camp open to parents only. */
const PARENTS_ONLY = "00000000-0000-0000-0000-0000000006e4";

const ALL_PRODUCTS = [
  SOURCE,
  FREE_TARGET,
  PAID_CAMP,
  SUBSCRIPTION_CLUB,
  PARENTS_ONLY,
];

const FREE_TARGET_GROUP = "00000000-0000-0000-0000-0000000006e5";
const PAID_CAMP_GROUP = "00000000-0000-0000-0000-0000000006e6";
const SOURCE_GROUP = "00000000-0000-0000-0000-0000000006e7";

const TERMS = "roblox-programme-terms";
const PRIVACY = "roblox-privacy-policy";

const CHECK_VIOLATION = "23514";

const CHECKOUT_SESSION_PREFIX = "cs_test_admin_move_unsubscribed_";
const SIGNED_UP_AT = "2026-01-02T03:04:05Z";

describe("admin_move_unsubscribed_participation", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let seatCounter = 0;
  const seatBookings = new Map<string, string>();

  async function clearRows() {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await admin
      .from("consent_acceptances")
      .delete()
      .in("product_id", ALL_PRODUCTS);
  }

  /**
   * Writes a seat directly, carrying a checkout session so the case can see
   * the payment marker travel with the row. A gamer's seat names the seeded
   * parent as its customer; a customer's own seat names the customer twice.
   */
  async function seat(
    productId: string,
    participantId: string = TEST_IDS.GAMER,
    status: Database["public"]["Enums"]["participation_status"] = "active",
  ): Promise<string> {
    seatCounter += 1;
    const bookingId = await insertPaidBooking(admin, {
      productId,
      participantId,
      customerId: TEST_IDS.CUSTOMER,
      checkoutSessionId: `${CHECKOUT_SESSION_PREFIX}${seatCounter}`,
    });
    const { data, error } = await admin
      .from("participations")
      .insert({
        product_id: productId,
        participant_id: participantId,
        customer_id: TEST_IDS.CUSTOMER,
        status,
        signed_up_at: SIGNED_UP_AT,
        booking_id: bookingId,
        waitlisted_at: status === "waitlisted" ? SIGNED_UP_AT : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seat failed: ${error.message}`);
    seatBookings.set(data.id, bookingId);
    return data.id;
  }

  async function readSeat(participationId: string) {
    const { data } = await admin
      .from("participations")
      .select(
        "product_id, group_id, group_joined_at, status, signed_up_at, booking_id",
      )
      .eq("id", participationId)
      .single();
    return data;
  }

  async function acceptancesOn(productId: string) {
    const { data, error } = await admin
      .from("consent_acceptances")
      .select("document_slug, customer_id, participant_id, accepted_by")
      .eq("product_id", productId)
      .order("document_slug");
    if (error) throw new Error(error.message);
    return data;
  }

  function move(
    participationId: string,
    targetProductId: string,
    options: { expectedSource?: string; groupId?: string } = {},
  ) {
    return adminAuth.rpc("admin_move_unsubscribed_participation", {
      p_participation_id: participationId,
      p_target_product_id: targetProductId,
      p_expected_source_product_id: options.expectedSource ?? SOURCE,
      p_group_id: options.groupId,
    });
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    // Uncapped: the seat cap is deliberately not enforced by this RPC.
    await createTestProduct(admin, {
      id: SOURCE,
      billingMode: "free",
      forParents: true,
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: FREE_TARGET,
      billingMode: "free",
      forParents: true,
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: PAID_CAMP,
      productType: "camp",
      billingMode: "paid",
      endDate: "2099-12-31",
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: SUBSCRIPTION_CLUB,
      productType: "consumer_club",
      billingMode: "paid",
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: PARENTS_ONLY,
      productType: "camp",
      billingMode: "free",
      forGamers: false,
      forParents: true,
      endDate: "2099-12-31",
      seatCount: null,
    });

    const { error: groupError } = await admin.from("product_groups").insert([
      { id: FREE_TARGET_GROUP, product_id: FREE_TARGET, name: "Target group" },
      { id: PAID_CAMP_GROUP, product_id: PAID_CAMP, name: "Camp group" },
      { id: SOURCE_GROUP, product_id: SOURCE, name: "Source group" },
    ]);
    if (groupError) throw new Error(`group fixtures failed: ${groupError.message}`);

    const { error: consentError } = await admin
      .from("product_required_consents")
      .insert([
        { product_id: FREE_TARGET, document_slug: TERMS },
        { product_id: FREE_TARGET, document_slug: PRIVACY },
      ]);
    if (consentError) {
      throw new Error(`consent fixtures failed: ${consentError.message}`);
    }
  });

  beforeEach(clearRows);
  afterAll(async () => {
    await clearRows();
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  it("moves an active free seat to another free product and returns its shape", async () => {
    const participationId = await seat(SOURCE);

    const { data, error } = await move(participationId, FREE_TARGET);

    expect(error).toBeNull();
    const parsed = adminMoveUnsubscribedParticipationRpcResult.parse(data);
    expect(parsed).toEqual({
      participation_id: participationId,
      source_product_id: SOURCE,
      target_product_id: FREE_TARGET,
      // The shared placement rule: a no-charge target with exactly one group.
      group_id: FREE_TARGET_GROUP,
      customer_id: TEST_IDS.CUSTOMER,
      participant_id: TEST_IDS.GAMER,
    });

    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(FREE_TARGET);
    expect(row?.group_id).toBe(FREE_TARGET_GROUP);
    expect(row?.status).toBe("active");
    // Never written by the function: the trigger stamps it from group_id.
    expect(row?.group_joined_at).not.toBeNull();
    // The purchase stamps travel with the row.
    expect(row?.booking_id).toBe(seatBookings.get(participationId));
    expect(new Date(row?.signed_up_at ?? 0).toISOString()).toBe(
      new Date(SIGNED_UP_AT).toISOString(),
    );
  });

  it("records the target's required consents on the family's behalf, stamped with the admin", async () => {
    const participationId = await seat(SOURCE);

    const { error } = await move(participationId, FREE_TARGET);

    expect(error).toBeNull();
    expect(await acceptancesOn(FREE_TARGET)).toEqual([
      {
        document_slug: PRIVACY,
        customer_id: TEST_IDS.CUSTOMER,
        participant_id: TEST_IDS.GAMER,
        accepted_by: TEST_IDS.ADMIN,
      },
      {
        document_slug: TERMS,
        customer_id: TEST_IDS.CUSTOMER,
        participant_id: TEST_IDS.GAMER,
        accepted_by: TEST_IDS.ADMIN,
      },
    ]);
  });

  it("moves a seat to a paid camp and leaves it in the unassigned inbox", async () => {
    // The camp has exactly one group, so NULL here is the money deciding it,
    // not an empty group list.
    const participationId = await seat(SOURCE);

    const { data, error } = await move(participationId, PAID_CAMP);

    expect(error).toBeNull();
    const parsed = adminMoveUnsubscribedParticipationRpcResult.parse(data);
    expect(parsed.target_product_id).toBe(PAID_CAMP);
    expect(parsed.group_id).toBeNull();
    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(PAID_CAMP);
    expect(row?.group_id).toBeNull();
    // A target requiring nothing writes no acceptance.
    expect(await acceptancesOn(PAID_CAMP)).toEqual([]);
  });

  it("places the seat in the group the admin names", async () => {
    const participationId = await seat(SOURCE);

    const { data, error } = await move(participationId, PAID_CAMP, {
      groupId: PAID_CAMP_GROUP,
    });

    expect(error).toBeNull();
    expect(
      adminMoveUnsubscribedParticipationRpcResult.parse(data).group_id,
    ).toBe(PAID_CAMP_GROUP);
    expect((await readSeat(participationId))?.group_id).toBe(PAID_CAMP_GROUP);
  });

  it("moves a paid camp seat onward to a free product — the source's billing is not asked", async () => {
    const participationId = await seat(PAID_CAMP);

    const { error } = await move(participationId, FREE_TARGET, {
      expectedSource: PAID_CAMP,
    });

    expect(error).toBeNull();
    expect((await readSeat(participationId))?.product_id).toBe(FREE_TARGET);
  });

  it("moves a parent's own seat to a product open to parents", async () => {
    const participationId = await seat(SOURCE, TEST_IDS.CUSTOMER);

    const { data, error } = await move(participationId, PARENTS_ONLY);

    expect(error).toBeNull();
    const parsed = adminMoveUnsubscribedParticipationRpcResult.parse(data);
    expect(parsed.participant_id).toBe(TEST_IDS.CUSTOMER);
    expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);
    expect((await readSeat(participationId))?.product_id).toBe(PARENTS_ONLY);
  });

  it("refuses a gamer's seat on a product not open to gamers", async () => {
    const participationId = await seat(SOURCE, TEST_IDS.GAMER);

    const { error } = await move(participationId, PARENTS_ONLY);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("not open to gamers");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });

  it("refuses a parent's own seat on a product not open to parents", async () => {
    const participationId = await seat(SOURCE, TEST_IDS.CUSTOMER);

    const { error } = await move(participationId, PAID_CAMP);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("not open to parents");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });

  it("refuses a target that is the source", async () => {
    const participationId = await seat(SOURCE);

    const { error } = await move(participationId, SOURCE);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("(same product)");
  });

  it("refuses a participation that is not active", async () => {
    const participationId = await seat(SOURCE, TEST_IDS.GAMER, "waitlisted");

    const { error } = await move(participationId, FREE_TARGET);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("not active");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });

  it("refuses a seat with a live subscription — it moves through the club switch", async () => {
    const participationId = await seat(SOURCE);
    const { error: subError } = await admin.from("family_subscriptions").insert({
      participation_id: participationId,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_admin_move_unsubscribed_live",
      stripe_customer_id: "cus_admin_move_unsubscribed_live",
      stripe_price_id: "price_admin_move_unsubscribed_live",
      currency: "eur",
      status: "active",
    });
    if (subError) throw new Error(subError.message);

    const { error } = await move(participationId, FREE_TARGET);

    expect(error?.code).toBe("55000");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });

  it("moves a seat whose subscription is cancelled — that is no live subscription", async () => {
    const participationId = await seat(SOURCE);
    const { error: subError } = await admin.from("family_subscriptions").insert({
      participation_id: participationId,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_admin_move_unsubscribed_cancelled",
      stripe_customer_id: "cus_admin_move_unsubscribed_cancelled",
      stripe_price_id: "price_admin_move_unsubscribed_cancelled",
      currency: "eur",
      status: "cancelled",
    });
    if (subError) throw new Error(subError.message);

    const { error } = await move(participationId, FREE_TARGET);

    expect(error).toBeNull();
    expect((await readSeat(participationId))?.product_id).toBe(FREE_TARGET);
  });

  it("refuses a subscription-shaped target", async () => {
    const participationId = await seat(SOURCE);

    const { error } = await move(participationId, SUBSCRIPTION_CLUB);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("is a subscription club");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });

  it("refuses a group of the source — the mistake a sheet opened there makes", async () => {
    const participationId = await seat(SOURCE);

    const { error } = await move(participationId, FREE_TARGET, {
      groupId: SOURCE_GROUP,
    });

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("is not a group of the target");
    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(SOURCE);
    // The statement rolled back whole: no acceptance outlives the refusal.
    expect(await acceptancesOn(FREE_TARGET)).toEqual([]);
  });

  it("refuses a seat that has moved off the product the sheet read it on", async () => {
    const participationId = await seat(SOURCE);
    const { error: moveError } = await admin
      .from("participations")
      .update({ product_id: PAID_CAMP })
      .eq("id", participationId);
    if (moveError) throw new Error(moveError.message);

    const { error } = await move(participationId, FREE_TARGET);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("the seat has moved");
    expect((await readSeat(participationId))?.product_id).toBe(PAID_CAMP);
  });

  it("fails on the unique index when the participant already holds a seat on the target", async () => {
    // The index covers `completed` too, so a child who once finished the
    // target collides. Not pre-checked: the index is the answer.
    const participationId = await seat(SOURCE);
    const completedOnTarget = await seat(
      FREE_TARGET,
      TEST_IDS.GAMER,
      "completed",
    );

    const { error } = await move(participationId, FREE_TARGET);

    expect(error?.code).toBe("23505");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
    expect((await readSeat(completedOnTarget))?.status).toBe("completed");
    expect(await acceptancesOn(FREE_TARGET)).toEqual([]);
  });

  it("refuses an unknown participation", async () => {
    const { error } = await move(
      "00000000-0000-0000-0000-00000000dead",
      FREE_TARGET,
    );

    expect(error?.code).toBe("P0002");
  });

  it("refuses an unknown target product", async () => {
    const participationId = await seat(SOURCE);

    const { error } = await move(
      participationId,
      "00000000-0000-0000-0000-00000000dead",
    );

    expect(error?.code).toBe("P0002");
    expect((await readSeat(participationId))?.product_id).toBe(SOURCE);
  });
});
