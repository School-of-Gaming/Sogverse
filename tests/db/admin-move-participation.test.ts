import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { adminMoveParticipationRpcResult } from "@/services/participations/participations.contracts";

/**
 * `admin_move_participation` (00245) — the database half of the admin club
 * switch: an active, subscribed seat is repointed at another paid consumer club
 * and its subscription row is stamped with the price the route has already moved
 * the Stripe subscription onto.
 *
 * The role gate itself is covered fixture-free by the spine's role × RPC matrix;
 * one non-admin case lives here anyway, because this RPC moves money's anchor
 * and "who may call it" is worth asserting where the fixtures are.
 *
 * What needs fixtures is everything else: the write (what moves and, just as
 * importantly, what does not), the four refusals that keep the function off a
 * seat with nothing to bill, the unique index firing rather than being
 * pre-checked, and the lock ordering — two admins switching in opposite
 * directions at the same moment must queue, not deadlock.
 *
 * Product UUIDs 6d0-6d4 (see the product-helpers allocation registry).
 */

const CLUB_A = "00000000-0000-0000-0000-0000000006d0";
const CLUB_B = "00000000-0000-0000-0000-0000000006d1";
const FREE_CLUB = "00000000-0000-0000-0000-0000000006d2";

/** One group on each paid club: the admin's placement, and its opposite. */
const GROUP_ON_B = "00000000-0000-0000-0000-0000000006d3";
const GROUP_ON_A = "00000000-0000-0000-0000-0000000006d4";
/** A group id no product has, for the refusal that is not about the source. */
const UNKNOWN_GROUP = "00000000-0000-0000-0000-0000000006df";

const PRICE_A = "price_test_move_source";
const PRICE_B = "price_test_move_target";

/** Rows the checkout path writes and a move must leave exactly as it found. */
const CHECKOUT_SESSION = "cs_test_admin_move";
const SIGNED_UP_AT = "2026-01-02T03:04:05Z";

describe("admin_move_participation", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let subCounter = 0;

  async function clearParticipations() {
    // family_subscriptions cascade from participations, so this clears both.
    await admin
      .from("participations")
      .delete()
      .in("product_id", [CLUB_A, CLUB_B, FREE_CLUB]);
  }

  /**
   * Writes a seat directly. A paid consumer club is exactly the shape
   * `admin_enroll_participant` refuses — its seat needs a subscription that RPC
   * cannot create — so the fixtures this file needs cannot be built through it.
   */
  async function seat(
    productId: string,
    participantId: string,
    status: Database["public"]["Enums"]["participation_status"] = "active",
  ): Promise<string> {
    const { data, error } = await admin
      .from("participations")
      .insert({
        product_id: productId,
        participant_id: participantId,
        customer_id: TEST_IDS.CUSTOMER,
        status,
        signed_up_at: SIGNED_UP_AT,
        stripe_checkout_session_id: CHECKOUT_SESSION,
      })
      .select("id")
      .single();
    if (error) throw new Error(`seat failed: ${error.message}`);
    return data.id;
  }

  /** Hangs a subscription row in `status` off a seat, priced at the source. */
  async function subscribe(
    participationId: string,
    status = "active",
  ): Promise<string> {
    subCounter += 1;
    const subscriptionId = `sub_admin_move_${subCounter}`;
    const { error } = await admin.from("family_subscriptions").insert({
      participation_id: participationId,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: `cus_admin_move_${subCounter}`,
      stripe_price_id: PRICE_A,
      currency: "eur",
      status,
    });
    if (error) throw new Error(`subscribe failed: ${error.message}`);
    return subscriptionId;
  }

  /** A seated, subscribed gamer on CLUB_A — the shape a switch starts from. */
  async function subscribedSeatOnA(
    participantId = TEST_IDS.GAMER,
  ): Promise<string> {
    const participationId = await seat(CLUB_A, participantId);
    await subscribe(participationId);
    return participationId;
  }

  async function readSeat(participationId: string) {
    const { data } = await admin
      .from("participations")
      .select(
        "product_id, group_id, group_joined_at, status, signed_up_at, stripe_checkout_session_id",
      )
      .eq("id", participationId)
      .single();
    return data;
  }

  async function readPrice(participationId: string): Promise<string | null> {
    const { data } = await admin
      .from("family_subscriptions")
      .select("stripe_price_id")
      .eq("participation_id", participationId)
      .single();
    return data?.stripe_price_id ?? null;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    await deleteTestProducts(admin, [CLUB_A, CLUB_B, FREE_CLUB]);
    // Uncapped on purpose: the cap is deliberately NOT enforced by this RPC, so
    // a fixture that could hit one would be asserting on a rule that is not
    // there.
    await createTestProduct(admin, {
      id: CLUB_A,
      productType: "consumer_club",
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: CLUB_B,
      productType: "consumer_club",
      seatCount: null,
    });
    await createTestProduct(admin, {
      id: FREE_CLUB,
      productType: "consumer_club",
      billingMode: "free",
      seatCount: null,
    });

    // One group per paid club, which is the whole point of the pair: the
    // placement argument has to be told apart from a group of the club the seat
    // is LEAVING, and that is the mistake a dialog opened on the source makes.
    const { error } = await admin.from("product_groups").insert([
      { id: GROUP_ON_B, product_id: CLUB_B, name: "Target group" },
      { id: GROUP_ON_A, product_id: CLUB_A, name: "Source group" },
    ]);
    if (error) throw new Error(`group fixtures failed: ${error.message}`);
  });

  beforeEach(clearParticipations);
  afterAll(async () => {
    await deleteTestProducts(admin, [CLUB_A, CLUB_B, FREE_CLUB]);
  });

  it("refuses a non-admin", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await customerAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("42501");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
  });

  it("moves a subscribed seat between two paid clubs and re-prices it", async () => {
    const participationId = await seat(CLUB_A, TEST_IDS.GAMER);
    const subscriptionId = await subscribe(participationId);

    const { data, error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error).toBeNull();
    const parsed = adminMoveParticipationRpcResult.parse(data);
    expect(parsed.participation_id).toBe(participationId);
    expect(parsed.source_product_id).toBe(CLUB_A);
    expect(parsed.target_product_id).toBe(CLUB_B);
    // The shared placement rule applied to the target: a PAID product always
    // lands its seat in the unassigned inbox, whatever its group list holds.
    expect(parsed.group_id).toBeNull();
    expect(parsed.stripe_subscription_id).toBe(subscriptionId);

    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(CLUB_B);
    expect(row?.group_id).toBeNull();
    expect(row?.status).toBe("active");
    // The two facts the family bought the seat with. Nothing about a switch
    // makes them untrue, and the payment marker travels with the row.
    expect(row?.stripe_checkout_session_id).toBe(CHECKOUT_SESSION);
    expect(new Date(row?.signed_up_at ?? 0).toISOString()).toBe(
      new Date(SIGNED_UP_AT).toISOString(),
    );

    expect(await readPrice(participationId)).toBe(PRICE_B);
  });

  it("places the seat in the group the admin names, and the trigger stamps the join", async () => {
    // The whole reason the argument exists: without it a paid target always
    // resolves to the unassigned inbox and the admin has a second job.
    const participationId = await subscribedSeatOnA();

    const { data, error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
      p_group_id: GROUP_ON_B,
    });

    expect(error).toBeNull();
    const parsed = adminMoveParticipationRpcResult.parse(data);
    expect(parsed.group_id).toBe(GROUP_ON_B);

    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(CLUB_B);
    expect(row?.group_id).toBe(GROUP_ON_B);
    // Never written by the function: the BEFORE UPDATE trigger stamps it from
    // group_id, which is what makes it a real join instant.
    expect(row?.group_joined_at).not.toBeNull();
  });

  it("refuses a group of the SOURCE club — the mistake a dialog opened there makes", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
      p_group_id: GROUP_ON_A,
    });

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("not a group of the target");
    // Both rows as they were: the statement rolled back whole, so the seat did
    // not move and the subscription was not re-priced either.
    const row = await readSeat(participationId);
    expect(row?.product_id).toBe(CLUB_A);
    expect(row?.group_id).toBeNull();
    expect(await readPrice(participationId)).toBe(PRICE_A);
  });

  it("refuses a group id no product has", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
      p_group_id: UNKNOWN_GROUP,
    });

    // The same refusal as a foreign group, deliberately: the function asks one
    // question — is this a group OF THE TARGET — and "no row" is the answer to
    // it whether the row is elsewhere or nowhere.
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("not a group of the target");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
    expect(await readPrice(participationId)).toBe(PRICE_A);
  });

  it("refuses a seat with no subscription row at all", async () => {
    const participationId = await seat(CLUB_A, TEST_IDS.GAMER);

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("55000");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
  });

  it("refuses a seat whose subscription is cancelled — that is no live subscription", async () => {
    // The same predicate admin_remove_participation refuses ON, read from the
    // opposite side: a dunning-dead subscription is stored as `cancelled` and
    // has no price left to swap. Such a seat leaves through the remove zone.
    const participationId = await seat(CLUB_A, TEST_IDS.GAMER);
    await subscribe(participationId, "cancelled");

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("55000");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
    expect(await readPrice(participationId)).toBe(PRICE_A);
  });

  it("refuses a target that is the source", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_A,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("23514");
    expect(await readPrice(participationId)).toBe(PRICE_A);
  });

  it("refuses a no-charge target — there is no subscription price to move to", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: FREE_CLUB,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("23514");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
  });

  it("refuses a participation that is not active", async () => {
    const participationId = await seat(CLUB_A, TEST_IDS.GAMER, "waitlisted");

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("23514");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
  });

  it("refuses an unknown participation", async () => {
    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: "00000000-0000-0000-0000-00000000dead",
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("P0002");
  });

  it("refuses an unknown target product", async () => {
    const participationId = await subscribedSeatOnA();

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: "00000000-0000-0000-0000-00000000dead",
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("P0002");
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
  });

  it("fails on the unique index when the participant already holds a seat on the target", async () => {
    // The index covers `completed` as well as active and waitlisted, so a child
    // who once finished the target club collides. Deliberately NOT pre-checked
    // in SQL: the commit route pre-flights it with a plain read before touching
    // Stripe, and the index is what makes the remaining race safe.
    const participationId = await subscribedSeatOnA();
    const completedOnB = await seat(CLUB_B, TEST_IDS.GAMER, "completed");

    const { error } = await adminAuth.rpc("admin_move_participation", {
      p_participation_id: participationId,
      p_target_product_id: CLUB_B,
      p_stripe_price_id: PRICE_B,
    });

    expect(error?.code).toBe("23505");
    // The whole statement rolled back: neither row moved and the price stands.
    expect((await readSeat(participationId))?.product_id).toBe(CLUB_A);
    const stale = await readSeat(completedOnB);
    expect(stale?.product_id).toBe(CLUB_B);
    expect(stale?.status).toBe("completed");
    expect(await readPrice(participationId)).toBe(PRICE_A);
  });

  it("lets two admins move in opposite directions at once without deadlocking", async () => {
    // The reason both product rows are locked in ONE statement ORDERED BY id.
    // Locked in the order each call happens to name them, these two transactions
    // would each hold what the other wants; ordered by id they queue on the same
    // row first and one simply waits.
    //
    // This case DOCUMENTS that intent rather than guaranteeing it is exercised:
    // two fast PostgREST calls under `Promise.all` overlap for microseconds, so
    // a dropped ORDER BY would pass here nearly always. PostgREST offers no
    // barrier — no shared session to hold a transaction open across the two
    // calls — so there is nothing to make the overlap deterministic. It fails
    // loudly if the ordering is dropped AND the two happen to collide, and it
    // is here so a reader of the function knows why the ORDER BY is load-bearing.
    const aToB = await subscribedSeatOnA(TEST_IDS.GAMER);
    const bToA = await seat(CLUB_B, TEST_IDS.GAMER_2);
    await subscribe(bToA);

    const [first, second] = await Promise.all([
      adminAuth.rpc("admin_move_participation", {
        p_participation_id: aToB,
        p_target_product_id: CLUB_B,
        p_stripe_price_id: PRICE_B,
      }),
      adminAuth.rpc("admin_move_participation", {
        p_participation_id: bToA,
        p_target_product_id: CLUB_A,
        p_stripe_price_id: PRICE_A,
      }),
    ]);

    // 40P01 is the failure this ordering exists to rule out; naming it makes a
    // regression readable rather than "one of them errored".
    expect(first.error?.code).not.toBe("40P01");
    expect(second.error?.code).not.toBe("40P01");
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    expect((await readSeat(aToB))?.product_id).toBe(CLUB_B);
    expect((await readSeat(bToA))?.product_id).toBe(CLUB_A);
    expect(await readPrice(aToB)).toBe(PRICE_B);
    expect(await readPrice(bToA)).toBe(PRICE_A);
  });
});
