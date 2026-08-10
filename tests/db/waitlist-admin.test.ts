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
 *    (waitlisted_at, id), parsed through the productGroupsSnapshot contract.
 *  - promote_from_waitlist seats a waitlisted gamer (capacity override, group
 *    placement, noop on a non-waitlisted row).
 *  - demote_to_waitlist sends an active gamer to the back of the waitlist, and
 *    refuses a consumer club (migration 00132).
 *  - get_waitlist_position returns the owner's 1-based position and NULL for a
 *    non-owner.
 *  - the admin RPCs reject a non-admin caller.
 *
 * Product UUIDs 5c7, 5f6 (see product-helpers allocation registry). The muni
 * product points at LOCATION_MUNICIPALITY to satisfy the online-muni location
 * constraints; the club is a plain paid consumer_club and exists only for the
 * demote refusal. Both seeded gamers (GAMER, GAMER_2) are children of CUSTOMER.
 */

const PRODUCT_MUNI = "00000000-0000-0000-0000-0000000005c7";
const PRODUCT_CLUB = "00000000-0000-0000-0000-0000000005f6";
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

    await deleteTestProducts(admin, [PRODUCT_MUNI, PRODUCT_CLUB]);
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
      id: PRODUCT_CLUB,
      productType: "consumer_club",
      seatCount: null,
      waitlistEnabled: true,
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_MUNI, PRODUCT_CLUB]);
  });

  afterEach(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", [PRODUCT_MUNI, PRODUCT_CLUB]);
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

  it("demote_to_waitlist refuses a consumer club, so no waitlisted row can hold a subscription", async () => {
    // consumer_club is the only subscription-billed type, and joining a
    // waitlist never creates a subscription — so demoting an already-active
    // club member was the only way to produce a waitlisted row with a live
    // Stripe subscription behind it. A parent could then delete that row via
    // leave_my_waitlist_spot, cascading family_subscriptions and leaving the
    // subscription billing with nothing in the database to cancel it.
    //
    // Seeded directly: create_participation on a paid club writes no row at all
    // (the seat is created when Stripe confirms payment), and the state under
    // test is an already-seated member.
    const { data: seeded } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_CLUB,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();

    const res = await adminUser.rpc("demote_to_waitlist", {
      p_participation_id: seeded!.id,
    });

    expect(res.error?.code).toBe("23514");
    // Refused, not partially applied — the member keeps the seat they pay for.
    const { data: row } = await admin
      .from("participations")
      .select("status, waitlisted_at")
      .eq("id", seeded!.id)
      .single();
    expect(row?.status).toBe("active");
    expect(row?.waitlisted_at).toBeNull();
    // The non-subscription half of the rule is the muni demote above: types
    // that never carry a subscription are untouched by this guard.
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
