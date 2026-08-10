import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  createParticipationRpcResult,
  demoteToWaitlistRpcResult,
  joinWaitlistRpcResult,
  promoteFromWaitlistRpcResult,
  waitlistPositionResult,
} from "@/services/participations/participations.contracts";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";

/**
 * Admin waitlist read + promote/demote, and the self-position RPC (migration
 * 00118). Covers:
 *  - get_product_groups_with_details surfaces the waitlist in derived order
 *    (waitlisted_at, id), parsed through the productGroupsSnapshot contract,
 *    carrying both per-participation money flags the admin panel decides a
 *    drag from: has_live_subscription (00166, made a real read on the waitlist
 *    branch and status-filtered by 00170) and has_payment_marker (00167).
 *  - promote_from_waitlist seats a waitlisted gamer (capacity override, group
 *    placement, noop on a non-waitlisted row).
 *  - demote_to_waitlist sends an active gamer to the back of the waitlist, and
 *    refuses a participation carrying a live Stripe subscription — on any
 *    product type (migration 00166 re-keyed 00132's consumer-club refusal to
 *    the subscription it was standing in for). "Live" means status is anything
 *    but `cancelled` (00170): past_due still refuses, a dunning-dead row does
 *    not, because otherwise the seat could never be freed at all.
 *  - get_waitlist_position returns the owner's 1-based position and NULL for a
 *    non-owner.
 *  - the admin RPCs reject a non-admin caller.
 *
 * Product UUIDs 5c7, 5f6 (see product-helpers allocation registry). The muni
 * product points at LOCATION_MUNICIPALITY to satisfy the online-muni location
 * constraints; the club is a FREE consumer_club — the shape 00132's type rule
 * would have wrongly refused, and the reason that rule was re-keyed. Both
 * seeded gamers (GAMER, GAMER_2) are children of CUSTOMER.
 */

const PRODUCT_MUNI = "00000000-0000-0000-0000-0000000005c7";
const PRODUCT_FREE_CLUB = "00000000-0000-0000-0000-0000000005f6";
const FAR_FUTURE = "2099-12-31";

describe("waitlist — admin read + promote/demote + self position", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    await deleteTestProducts(admin, [PRODUCT_MUNI, PRODUCT_FREE_CLUB]);
    await createTestProduct(admin, {
      id: PRODUCT_MUNI,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: FAR_FUTURE,
      seatCount: 1,
      waitlistEnabled: true,
    });
    await createTestProduct(admin, {
      id: PRODUCT_FREE_CLUB,
      productType: "consumer_club",
      billingMode: "free",
      seatCount: null,
      waitlistEnabled: true,
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_MUNI, PRODUCT_FREE_CLUB]);
  });

  afterEach(async () => {
    // Deleting the participations takes any family_subscriptions rows with them
    // (participation_id is ON DELETE CASCADE), which is what the subscribed-
    // demote test below relies on for cleanup.
    await admin
      .from("participations")
      .delete()
      .in("product_id", [PRODUCT_MUNI, PRODUCT_FREE_CLUB]);
    await admin.from("product_groups").delete().eq("product_id", PRODUCT_MUNI);
    await admin
      .from("products")
      .update({ seat_count: 1 })
      .eq("id", PRODUCT_MUNI);
  });

  /**
   * Adds a gamer to the waitlist; returns the participation id.
   *
   * Goes through the guarded wrapper rather than the engine: migration 00126
   * revoked service_role EXECUTE on join_waitlist, so the admin client cannot
   * reach it. CUSTOMER is the parent of both seeded gamers, which is what the
   * engine's parent-of-gamer check wants.
   */
  async function joinWaitlist(gamerId: string): Promise<string> {
    const res = await customer.rpc("join_product_waitlist", {
      p_product_id: PRODUCT_MUNI,
      p_gamer_id: gamerId,
    });
    expect(res.error).toBeNull();
    return joinWaitlistRpcResult.parse(res.data).participation_id;
  }

  /** Registers a gamer as an active (external) participation; returns its id. */
  async function registerActive(gamerId: string): Promise<string> {
    const res = await admin.rpc("create_participation", {
      p_product_id: PRODUCT_MUNI,
      p_gamer_id: gamerId,
      p_customer_id: TEST_IDS.CUSTOMER,
      p_purchase_shape: "external",
      p_currency: "eur",
    });
    expect(res.error).toBeNull();
    const parsed = createParticipationRpcResult.parse(res.data);
    expect(parsed.kind).toBe("external_active");
    return parsed.participation_id!;
  }

  it("get_product_groups_with_details returns the waitlist in derived order", async () => {
    // GAMER joins first, GAMER_2 second → that's the waitlist order.
    await joinWaitlist(TEST_IDS.GAMER);
    await joinWaitlist(TEST_IDS.GAMER_2);

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_MUNI,
    });
    expect(res.error).toBeNull();

    const snapshot = productGroupsSnapshot.parse(res.data);
    expect(snapshot.waitlist).toHaveLength(2);
    expect(snapshot.waitlist.map((p) => p.gamer_id)).toEqual([
      TEST_IDS.GAMER,
      TEST_IDS.GAMER_2,
    ]);
    // Waitlisted rows never carry a seat, so none leak into the active lists.
    expect(snapshot.unassigned).toHaveLength(0);
    expect(snapshot.waitlist.every((p) => p.status === "waitlisted")).toBe(true);
    // False because neither row has a subscription behind it — not because the
    // branch says so. Since 00170 the waitlist branch is a real read like the
    // other two; the test below is the one that proves it can answer true.
    expect(snapshot.waitlist.every((p) => !p.has_live_subscription)).toBe(true);
  });

  it("get_product_groups_with_details flags which active participations carry a live subscription", async () => {
    // The field exists so the panel's demote dialog can fire from the drag
    // handler without asking the database once per chip. Two active members on
    // one product, one of them subscribed: the flag has to separate them.
    const { data: seeded } = await admin
      .from("participations")
      .insert([
        {
          product_id: PRODUCT_FREE_CLUB,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
        {
          product_id: PRODUCT_FREE_CLUB,
          gamer_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
      ])
      .select("id, gamer_id");

    const subscribed = seeded!.find((r) => r.gamer_id === TEST_IDS.GAMER)!;
    await admin.from("family_subscriptions").insert({
      participation_id: subscribed.id,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_snapshot_flag_test",
      stripe_customer_id: "cus_snapshot_flag_test",
      currency: "eur",
      status: "active",
    });

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_FREE_CLUB,
    });
    expect(res.error).toBeNull();

    // Parsed through the production contract, so the added field is verified
    // against real Postgres output rather than assumed.
    const snapshot = productGroupsSnapshot.parse(res.data);
    const flags = Object.fromEntries(
      snapshot.unassigned.map((p) => [p.gamer_id, p.has_live_subscription]),
    );
    expect(flags).toEqual({
      [TEST_IDS.GAMER]: true,
      [TEST_IDS.GAMER_2]: false,
    });
    // Neither seat went through Checkout — they were written straight into the
    // table, the shape a free club's enrollment produces — so no money ever
    // arrived for either and 00167's marker is false on both.
    expect(snapshot.unassigned.every((p) => !p.has_payment_marker)).toBe(true);
  });

  it("get_product_groups_with_details flags which waitlisted rows money once arrived for", async () => {
    // The promote dialog's condition, and the branch where it decides
    // something. Both rows are waitlisted and otherwise identical; the marker
    // is the recorded Checkout Session id, which demotion does NOT clear. So
    // it is what separates a camper who genuinely paid and was later moved to
    // the waitlist — who promotes back with a plain drag — from a family that
    // only ever joined the queue, who gets the dialog. Keying the refusal on
    // the product's billing alone would trap the former there forever.
    const paid = await joinWaitlist(TEST_IDS.GAMER);
    await joinWaitlist(TEST_IDS.GAMER_2);
    await admin
      .from("participations")
      .update({ stripe_checkout_session_id: "cs_test_waitlist_marker" })
      .eq("id", paid);

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_MUNI,
    });
    expect(res.error).toBeNull();

    // Parsed through the production contract, so the added field is verified
    // against real Postgres output rather than assumed.
    const snapshot = productGroupsSnapshot.parse(res.data);
    const markers = Object.fromEntries(
      snapshot.waitlist.map((p) => [p.gamer_id, p.has_payment_marker]),
    );
    expect(markers).toEqual({
      [TEST_IDS.GAMER]: true,
      [TEST_IDS.GAMER_2]: false,
    });
  });

  it("get_product_groups_with_details reads has_live_subscription on the WAITLIST branch too", async () => {
    // Until 00170 this branch returned a constant false, on the reasoning that
    // demote_to_waitlist refuses a subscribed row so the state cannot exist.
    // It can: the products webhook inserts family_subscriptions after a Stripe
    // round trip WITHOUT holding the product gate lock, so a demote landing in
    // that window produces exactly this row — and the manual sub-adoption
    // process writes one directly. The row is staged the same way here, and the
    // snapshot has to report it rather than assert it away: a panel told the
    // seat is free of money would happily let an admin act on it.
    const queued = await joinWaitlist(TEST_IDS.GAMER);
    const plain = await joinWaitlist(TEST_IDS.GAMER_2);
    await admin.from("family_subscriptions").insert({
      participation_id: queued,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_waitlisted_live",
      stripe_customer_id: "cus_waitlisted_live",
      currency: "eur",
      status: "active",
    });

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_MUNI,
    });
    expect(res.error).toBeNull();

    const snapshot = productGroupsSnapshot.parse(res.data);
    const flags = Object.fromEntries(
      snapshot.waitlist.map((p) => [p.id, p.has_live_subscription]),
    );
    expect(flags).toEqual({ [queued]: true, [plain]: false });
  });

  it("get_product_groups_with_details treats a cancelled subscription as not live", async () => {
    // The other half of 00170. A dunning-exhausted subscription (Stripe
    // `unpaid`) is stored as `cancelled` and never fires subscription.deleted,
    // so the row outlives anything Stripe will ever bill. Reporting it as live
    // is what made the seat unmovable and unremovable.
    const { data: seeded } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_FREE_CLUB,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();
    await admin.from("family_subscriptions").insert({
      participation_id: seeded!.id,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_snapshot_dead",
      stripe_customer_id: "cus_snapshot_dead",
      currency: "eur",
      status: "cancelled",
    });

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_FREE_CLUB,
    });
    expect(res.error).toBeNull();

    const snapshot = productGroupsSnapshot.parse(res.data);
    expect(snapshot.unassigned).toHaveLength(1);
    expect(snapshot.unassigned[0].has_live_subscription).toBe(false);
  });

  it("promote_from_waitlist seats a gamer over a full cap (capacity override)", async () => {
    // 1 seat, taken by GAMER. GAMER_2 waits.
    await registerActive(TEST_IDS.GAMER);
    const waiting = await joinWaitlist(TEST_IDS.GAMER_2);

    const res = await adminUser.rpc("promote_from_waitlist", {
      p_participation_id: waiting,
    });
    expect(res.error).toBeNull();
    const parsed = promoteFromWaitlistRpcResult.parse(res.data);
    expect(parsed.kind).toBe("promoted");

    const { data: row } = await admin
      .from("participations")
      .select("status, group_id, waitlisted_at")
      .eq("id", waiting)
      .single();
    expect(row?.status).toBe("active");
    expect(row?.group_id).toBeNull();
    expect(row?.waitlisted_at).toBeNull();

    // Override is real: active_count now exceeds the 1-seat cap.
    const { data: counts } = await admin
      .from("product_seat_counts")
      .select("active_count, waitlist_count")
      .eq("product_id", PRODUCT_MUNI)
      .single();
    expect(counts?.active_count).toBe(2);
    expect(counts?.waitlist_count).toBe(0);
  });

  it("promote_from_waitlist places the gamer into the given group", async () => {
    const { data: group } = await admin
      .from("product_groups")
      .insert({ product_id: PRODUCT_MUNI, name: "Group A" })
      .select("id")
      .single();
    const waiting = await joinWaitlist(TEST_IDS.GAMER);

    const res = await adminUser.rpc("promote_from_waitlist", {
      p_participation_id: waiting,
      p_group_id: group!.id,
    });
    expect(promoteFromWaitlistRpcResult.parse(res.data).kind).toBe("promoted");

    const { data: row } = await admin
      .from("participations")
      .select("status, group_id")
      .eq("id", waiting)
      .single();
    expect(row?.status).toBe("active");
    expect(row?.group_id).toBe(group!.id);
  });

  it("promote_from_waitlist is a noop on a row that isn't waitlisted", async () => {
    const active = await registerActive(TEST_IDS.GAMER);

    const res = await adminUser.rpc("promote_from_waitlist", {
      p_participation_id: active,
    });
    const parsed = promoteFromWaitlistRpcResult.parse(res.data);
    expect(parsed.kind).toBe("noop");
  });

  it("demote_to_waitlist sends an active gamer to the back of the waitlist", async () => {
    // GAMER already waiting (front of the line); GAMER_2 active.
    const front = await joinWaitlist(TEST_IDS.GAMER);
    const active = await registerActive(TEST_IDS.GAMER_2);

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: active,
    });
    expect(res.error).toBeNull();
    expect(demoteToWaitlistRpcResult.parse(res.data).kind).toBe("demoted");

    const { data: rows } = await admin
      .from("participations")
      .select("id, status, group_id, waitlisted_at")
      .eq("product_id", PRODUCT_MUNI);
    const demoted = rows?.find((r) => r.id === active);
    const frontRow = rows?.find((r) => r.id === front);
    expect(demoted?.status).toBe("waitlisted");
    expect(demoted?.group_id).toBeNull();
    // Back of the line: stamped after the gamer already waiting.
    expect(
      new Date(demoted!.waitlisted_at!).getTime(),
    ).toBeGreaterThan(new Date(frontRow!.waitlisted_at!).getTime());
  });

  it("demote_to_waitlist refuses a participation with a live Stripe subscription, whatever the product type", async () => {
    // Joining a waitlist never creates a subscription, so demoting an
    // already-active member is the only way to produce a waitlisted row with a
    // live Stripe subscription behind it. A parent could then delete that row
    // via leave_my_waitlist_spot, cascading family_subscriptions and leaving
    // the subscription billing with nothing in the database to cancel it.
    //
    // Deliberately staged on the MUNI product: 00132 refused this by product
    // type, which meant a subscription attached to anything else walked
    // straight through. 00166 keys the refusal to the subscription itself, so
    // the type here is exactly the one the old rule would have waved past.
    const active = await registerActive(TEST_IDS.GAMER);
    await admin.from("family_subscriptions").insert({
      participation_id: active,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_demote_refusal_test",
      stripe_customer_id: "cus_demote_refusal_test",
      currency: "eur",
      status: "active",
    });

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: active,
    });

    // The same errcode admin_remove_participation raises for the same
    // condition, so one refusal maps to one message wherever it is reached.
    expect(res.error?.code).toBe("55000");
    // Refused, not partially applied — the member keeps the seat they pay for.
    const { data: row } = await admin
      .from("participations")
      .select("status, waitlisted_at")
      .eq("id", active)
      .single();
    expect(row?.status).toBe("active");
    expect(row?.waitlisted_at).toBeNull();
  });

  it("demote_to_waitlist still refuses a past_due subscription — dunning is not death", async () => {
    // 00170 narrowed the refusal to "not cancelled", and past_due is the value
    // most likely to be mistaken for dead. It is not: Stripe is still retrying,
    // the subscription can recover on the next attempt, and demoting it would
    // put a billable subscription on a row the parent can delete outright.
    const active = await registerActive(TEST_IDS.GAMER);
    await admin.from("family_subscriptions").insert({
      participation_id: active,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_demote_past_due",
      stripe_customer_id: "cus_demote_past_due",
      currency: "eur",
      status: "past_due",
    });

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: active,
    });

    expect(res.error?.code).toBe("55000");
    const { data: row } = await admin
      .from("participations")
      .select("status")
      .eq("id", active)
      .single();
    expect(row?.status).toBe("active");
  });

  it("demote_to_waitlist allows a participation whose subscription is cancelled", async () => {
    // The bug 00170 fixes. The webhook UPDATES status in place rather than
    // deleting the row, and a subscription Stripe gave up dunning (`unpaid`)
    // lands as `cancelled` without ever firing subscription.deleted. Under the
    // old row-existence test that dead row refused the demote forever, so the
    // seat could never be freed for anybody else.
    const active = await registerActive(TEST_IDS.GAMER);
    await admin.from("family_subscriptions").insert({
      participation_id: active,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_demote_dead",
      stripe_customer_id: "cus_demote_dead",
      currency: "eur",
      status: "cancelled",
    });

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: active,
    });
    expect(res.error).toBeNull();
    expect(demoteToWaitlistRpcResult.parse(res.data).kind).toBe("demoted");

    const { data: row } = await admin
      .from("participations")
      .select("status, group_id, waitlisted_at")
      .eq("id", active)
      .single();
    expect(row?.status).toBe("waitlisted");
    expect(row?.group_id).toBeNull();
    expect(row?.waitlisted_at).not.toBeNull();
  });

  it("demote_to_waitlist demotes a free-club member, which the old type rule refused", async () => {
    // A free club enrolls through create_participation's free branch, exactly
    // as a free event does — instant active row, no Stripe, so no subscription
    // to orphan. 00132 would have refused this purely for being a consumer
    // club; there is nothing here to protect and the drag now goes through.
    const enrolled = await admin.rpc("create_participation", {
      p_product_id: PRODUCT_FREE_CLUB,
      p_gamer_id: TEST_IDS.GAMER,
      p_customer_id: TEST_IDS.CUSTOMER,
      p_purchase_shape: "free",
      p_currency: "eur",
    });
    expect(enrolled.error).toBeNull();
    const parsed = createParticipationRpcResult.parse(enrolled.data);
    expect(parsed.kind).toBe("free_active");

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: parsed.participation_id!,
    });
    expect(res.error).toBeNull();
    expect(demoteToWaitlistRpcResult.parse(res.data).kind).toBe("demoted");

    const { data: row } = await admin
      .from("participations")
      .select("status, group_id, waitlisted_at")
      .eq("id", parsed.participation_id!)
      .single();
    expect(row?.status).toBe("waitlisted");
    expect(row?.group_id).toBeNull();
    expect(row?.waitlisted_at).not.toBeNull();
  });

  it("get_waitlist_position returns the owner's 1-based position, NULL for a non-owner", async () => {
    await joinWaitlist(TEST_IDS.GAMER);
    const second = await joinWaitlist(TEST_IDS.GAMER_2);

    // The purchasing parent (CUSTOMER) owns both rows → sees position 2.
    const owned = await customer.rpc("get_waitlist_position", {
      p_participation_id: second,
    });
    expect(owned.error).toBeNull();
    expect(waitlistPositionResult.parse(owned.data)).toBe(2);

    // A different parent gets NULL — no leak of another family's queue.
    const foreign = await customer2.rpc("get_waitlist_position", {
      p_participation_id: second,
    });
    expect(foreign.error).toBeNull();
    expect(waitlistPositionResult.parse(foreign.data)).toBeNull();
  });

  it("rejects promote/demote from a non-admin caller", async () => {
    const waiting = await joinWaitlist(TEST_IDS.GAMER);

    const promote = await customer.rpc("promote_from_waitlist", {
      p_participation_id: waiting,
    });
    expect(promote.error?.code).toBe("42501");

    const active = await registerActive(TEST_IDS.GAMER_2);
    const demote = await customer.rpc("demote_to_waitlist", {
      p_participation_id: active,
    });
    expect(demote.error?.code).toBe("42501");
  });

  /**
   * The grant posture migration 00126 established. join_waitlist takes the
   * customer id as a parameter, so any role that can execute it can enqueue a
   * gamer on someone else's behalf; since Phase 3 no role can. The wrapper
   * (join_product_waitlist) is SECURITY DEFINER and reaches the engine through
   * ownership, so it keeps working — every joinWaitlist() call above proves it.
   */
  describe("join_waitlist engine grants", () => {
    it("authenticated users cannot call join_waitlist directly", async () => {
      const { error } = await customer.rpc("join_waitlist", {
        p_product_id: PRODUCT_MUNI,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it("service_role cannot call join_waitlist directly either", async () => {
      const { error } = await admin.rpc("join_waitlist", {
        p_product_id: PRODUCT_MUNI,
        p_gamer_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });
  });
});
