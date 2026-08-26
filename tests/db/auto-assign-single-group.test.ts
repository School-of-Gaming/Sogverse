import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  adminEnrollParticipantRpcResult,
  createParticipationRpcResult,
} from "@/services/participations/participations.contracts";

/**
 * Automatic placement into a product's single group (migration 00206).
 *
 * The rule under test is one predicate with two halves, and every case below
 * moves exactly one of them: the product charges nothing (billing_mode 'free'
 * or 'external_contract') AND it has exactly one group. Both true and the new
 * seat lands in that group; either false and it lands in the unassigned inbox
 * (group_id NULL), which is what every enrollment did before.
 *
 * Both instant-active writers are covered, because they are separate bodies
 * that have to agree: `create_participation` (the family self-enrollment path)
 * and `admin_enroll_participant` (comp-enrollment). The paid case is only
 * meaningful on the admin path — `create_participation` never writes a row at
 * all for a paid shape, it returns kind='validated' and leaves the seat to the
 * Stripe webhook — so that is where the paid-stays-unassigned case lives.
 *
 * `group_joined_at` is asserted on an auto-placed row: nothing here writes that
 * column, so a stamp on it proves the BEFORE INSERT trigger saw the group_id
 * arrive with the INSERT rather than the placement having been bolted on
 * afterwards.
 *
 * Product UUIDs 660-669 (see the product-helpers allocation registry): five
 * products, each with its own groups, because the whole matrix is about how
 * many groups a product has and one shared product could not hold three
 * different answers at once.
 */

const FREE_ONE_GROUP = "00000000-0000-0000-0000-000000000660";
const FREE_NO_GROUPS = "00000000-0000-0000-0000-000000000661";
const FREE_TWO_GROUPS = "00000000-0000-0000-0000-000000000662";
const MUNI_ONE_GROUP = "00000000-0000-0000-0000-000000000663";
const PAID_CAMP_ONE_GROUP = "00000000-0000-0000-0000-000000000664";

const GROUP_OF_FREE = "00000000-0000-0000-0000-000000000665";
const GROUP_A_OF_FREE_TWO = "00000000-0000-0000-0000-000000000666";
const GROUP_B_OF_FREE_TWO = "00000000-0000-0000-0000-000000000667";
const GROUP_OF_MUNI = "00000000-0000-0000-0000-000000000668";
const GROUP_OF_PAID_CAMP = "00000000-0000-0000-0000-000000000669";

const ALL_PRODUCTS = [
  FREE_ONE_GROUP,
  FREE_NO_GROUPS,
  FREE_TWO_GROUPS,
  MUNI_ONE_GROUP,
  PAID_CAMP_ONE_GROUP,
];

// Non-consumer products need a non-null end_date
// (chk_products_non_consumer_has_end_date), and it must not have passed or the
// effective-status gate reads the product as completed and refuses signups.
const FAR_FUTURE = "2099-12-31";

describe("automatic placement into a single group (00206)", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  /** The seat a participant holds on a product, read past RLS. */
  async function seatOn(productId: string, participantId: string) {
    const { data } = await admin
      .from("participations")
      .select("group_id, group_joined_at, status")
      .eq("product_id", productId)
      .eq("participant_id", participantId)
      .single();
    return data;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // Free consumer clubs — the shape 00166 unlocked, and the cheapest product
    // to build three times over. seatCount null so no case can be answered by
    // the seat cap instead of by the placement rule.
    for (const id of [FREE_ONE_GROUP, FREE_NO_GROUPS, FREE_TWO_GROUPS]) {
      await createTestProduct(admin, {
        id,
        productType: "consumer_club",
        billingMode: "free",
        seatCount: null,
      });
    }

    await createTestProduct(admin, {
      id: MUNI_ONE_GROUP,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: FAR_FUTURE,
      seatCount: null,
    });

    // Paid, and comp-enrollable: the refusal in admin_enroll_participant is the
    // pair (consumer_club, paid), so a paid CAMP is the product that reaches
    // the INSERT while still having money on its seat.
    await createTestProduct(admin, {
      id: PAID_CAMP_ONE_GROUP,
      productType: "camp",
      billingMode: "paid",
      seatCount: null,
      startDate: "2099-06-01",
      endDate: "2099-06-05",
    });

    const { error } = await admin.from("product_groups").insert([
      { id: GROUP_OF_FREE, product_id: FREE_ONE_GROUP, name: "The only group" },
      { id: GROUP_A_OF_FREE_TWO, product_id: FREE_TWO_GROUPS, name: "Group A" },
      { id: GROUP_B_OF_FREE_TWO, product_id: FREE_TWO_GROUPS, name: "Group B" },
      { id: GROUP_OF_MUNI, product_id: MUNI_ONE_GROUP, name: "The only group" },
      {
        id: GROUP_OF_PAID_CAMP,
        product_id: PAID_CAMP_ONE_GROUP,
        name: "The only group",
      },
    ]);
    if (error) throw new Error(`seeding groups failed: ${error.message}`);
  });

  beforeEach(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  describe("create_participation — the family self-enrollment path", () => {
    function register(
      productId: string,
      shape: "free" | "external",
      gamerId: string = TEST_IDS.GAMER,
    ) {
      return admin.rpc("create_participation", {
        p_product_id: productId,
        p_participant_id: gamerId,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: shape,
        p_currency: "eur",
      });
    }

    it("places a free signup into the product's only group", async () => {
      const res = await register(FREE_ONE_GROUP, "free");
      expect(res.error).toBeNull();
      expect(createParticipationRpcResult.parse(res.data).kind).toBe(
        "free_active",
      );

      const seat = await seatOn(FREE_ONE_GROUP, TEST_IDS.GAMER);
      expect(seat?.status).toBe("active");
      expect(seat?.group_id).toBe(GROUP_OF_FREE);
      // Nothing in the RPC writes this column — the BEFORE INSERT trigger does,
      // and only because group_id arrived with the row.
      expect(seat?.group_joined_at).not.toBeNull();
    });

    it("leaves a free signup unassigned when the product has no groups", async () => {
      const res = await register(FREE_NO_GROUPS, "free");
      expect(res.error).toBeNull();

      const seat = await seatOn(FREE_NO_GROUPS, TEST_IDS.GAMER);
      expect(seat?.status).toBe("active");
      expect(seat?.group_id).toBeNull();
      expect(seat?.group_joined_at).toBeNull();
    });

    it("leaves a free signup unassigned when the product has two groups", async () => {
      // Two groups is a real placement decision, and it stays a human's — the
      // inbox is doing its job here rather than being clerical overhead.
      const res = await register(FREE_TWO_GROUPS, "free");
      expect(res.error).toBeNull();

      const seat = await seatOn(FREE_TWO_GROUPS, TEST_IDS.GAMER);
      expect(seat?.status).toBe("active");
      expect(seat?.group_id).toBeNull();
    });

    it("places a municipality (external_contract) signup into the only group", async () => {
      // The half of the rule that matters most in practice: a municipality club
      // takes a whole school year's intake, and every one of those seats was
      // landing in the inbox to be dragged into the single column by hand.
      const res = await register(MUNI_ONE_GROUP, "external");
      expect(res.error).toBeNull();
      expect(createParticipationRpcResult.parse(res.data).kind).toBe(
        "external_active",
      );

      const seat = await seatOn(MUNI_ONE_GROUP, TEST_IDS.GAMER);
      expect(seat?.group_id).toBe(GROUP_OF_MUNI);
      expect(seat?.group_joined_at).not.toBeNull();
    });

    it("places every signup into the same single group, not just the first", async () => {
      await register(FREE_ONE_GROUP, "free", TEST_IDS.GAMER);
      await register(FREE_ONE_GROUP, "free", TEST_IDS.GAMER_2);

      const first = await seatOn(FREE_ONE_GROUP, TEST_IDS.GAMER);
      const second = await seatOn(FREE_ONE_GROUP, TEST_IDS.GAMER_2);
      expect(first?.group_id).toBe(GROUP_OF_FREE);
      expect(second?.group_id).toBe(GROUP_OF_FREE);
    });
  });

  describe("admin_enroll_participant — the comp-enrollment path", () => {
    function enroll(productId: string, participantId = TEST_IDS.GAMER) {
      return adminAuth.rpc("admin_enroll_participant", {
        p_product_id: productId,
        p_participant_id: participantId,
      });
    }

    it("places a comp-enrollment into a free product's only group", async () => {
      const { data, error } = await enroll(FREE_ONE_GROUP);
      expect(error).toBeNull();
      expect(
        adminEnrollParticipantRpcResult.parse(data).participation_id,
      ).toBeTruthy();

      const seat = await seatOn(FREE_ONE_GROUP, TEST_IDS.GAMER);
      expect(seat?.status).toBe("active");
      expect(seat?.group_id).toBe(GROUP_OF_FREE);
      expect(seat?.group_joined_at).not.toBeNull();
    });

    it("leaves a comp-enrollment unassigned when the product has no groups", async () => {
      const { error } = await enroll(FREE_NO_GROUPS);
      expect(error).toBeNull();

      const seat = await seatOn(FREE_NO_GROUPS, TEST_IDS.GAMER);
      expect(seat?.group_id).toBeNull();
      expect(seat?.group_joined_at).toBeNull();
    });

    it("leaves a comp-enrollment unassigned when the product has two groups", async () => {
      const { error } = await enroll(FREE_TWO_GROUPS);
      expect(error).toBeNull();

      const seat = await seatOn(FREE_TWO_GROUPS, TEST_IDS.GAMER);
      expect(seat?.group_id).toBeNull();
    });

    it("places a comp-enrollment onto a municipality club's only group", async () => {
      const { error } = await enroll(MUNI_ONE_GROUP);
      expect(error).toBeNull();

      const seat = await seatOn(MUNI_ONE_GROUP, TEST_IDS.GAMER);
      expect(seat?.group_id).toBe(GROUP_OF_MUNI);
    });

    it("leaves a PAID product's comp-enrollment unassigned, single group or not", async () => {
      // The billing half of the predicate, on the one path that can reach an
      // INSERT with money on the seat. A paid camp with exactly one group is
      // deliberately the same as it always was: the placement rule is keyed to
      // billing_mode, not to how many groups happen to exist.
      const { error } = await enroll(PAID_CAMP_ONE_GROUP);
      expect(error).toBeNull();

      const seat = await seatOn(PAID_CAMP_ONE_GROUP, TEST_IDS.GAMER);
      expect(seat?.status).toBe("active");
      expect(seat?.group_id).toBeNull();
      expect(seat?.group_joined_at).toBeNull();
    });
  });
});
