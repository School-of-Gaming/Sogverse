import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createV2TestProduct, deleteV2TestProducts } from "./v2-helpers";

/**
 * Auth + return-shape coverage for `get_gedu_product_detail_v2` (migrations
 * 00057 / 00058). The RPC is SECURITY DEFINER and hands back gamer first
 * names, dates of birth, and gender to anyone whose body-level checks
 * accept them — so this file pins the "who can call it" matrix as the
 * regression gate for the body's role + assignment guards.
 *
 * Layout:
 *   - PRODUCT_GEDU_ON: GEDU assigned to its single group, GAMER participating.
 *     The RPC should return that group with both roster entries populated.
 *   - PRODUCT_GEDU_OFF: a separate product GEDU is *not* assigned to. Used
 *     for the "assigned to some products, not this one" 42501 path.
 */

const PRODUCT_GEDU_ON = "00000000-0000-0000-0000-0000000007c1";
const PRODUCT_GEDU_OFF = "00000000-0000-0000-0000-0000000007c2";
const ALL_PRODUCTS = [PRODUCT_GEDU_ON, PRODUCT_GEDU_OFF];

const NONEXISTENT_PRODUCT_ID = "00000000-0000-0000-0000-0000000007cf";

interface GeduRpcGroupResult {
  product_id: string;
  groups: Array<{
    id: string;
    name: string;
    display_order: number;
    created_at: string;
    gedus: Array<{ id: string; first_name: string; email: string | null }>;
    participations: Array<{
      id: string;
      gamer_id: string;
      gamer_first_name: string;
      gamer_date_of_birth: string | null;
      gamer_gender: string | null;
      status: string;
      signed_up_at: string;
    }>;
  }>;
}

describe("get_gedu_product_detail_v2", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let groupId: string;

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
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteV2TestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createV2TestProduct(admin, { id, seatCount: 50 });
    }

    // PRODUCT_GEDU_ON: one group with GEDU assigned, plus an active
    // participation for GAMER so the returned roster covers both arrays.
    const created = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: PRODUCT_GEDU_ON,
      p_added_groups: [
        { tempId: "tA", name: "Cohort A", geduIds: [TEST_IDS.GEDU] },
      ],
    });
    groupId = (created.data as { tempMap: Record<string, string> }).tempMap.tA;

    await admin.from("participations_v2").insert({
      product_id: PRODUCT_GEDU_ON,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      group_id: groupId,
      credits_remaining: 1,
    });

    // PRODUCT_GEDU_OFF gets created but no assignment / participation — it's
    // there purely to exercise the assigned-gedu-on-wrong-product 42501 path.
  });

  afterAll(async () => {
    await admin
      .from("participations_v2")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Role check (first guard in the function body)
  // ---------------------------------------------------------------------------

  describe("role gate", () => {
    it("admin gets 42501 (only gedus pass the role check)", async () => {
      const { error } = await adminAuth.rpc("get_gedu_product_detail_v2", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });

    it("customer gets 42501", async () => {
      const { error } = await customerAuth.rpc("get_gedu_product_detail_v2", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });

    it("gamer gets 42501", async () => {
      const { error } = await gamerAuth.rpc("get_gedu_product_detail_v2", {
        p_product_id: PRODUCT_GEDU_ON,
      });
      expect(error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // Assignment gate (second guard — same 42501 code, different reason).
  // The product FK on gedu_group_assignments_v2 means the assignment check
  // fires for any unknown id too, so the dedicated P0002 branch in the body
  // is effectively unreachable for legitimate callers; we still cover both
  // shapes here to pin that the function refuses unknown ids.
  // ---------------------------------------------------------------------------

  describe("assignment gate", () => {
    it("gedu calling for a product they aren't assigned to → 42501", async () => {
      const { error } = await geduAuth.rpc("get_gedu_product_detail_v2", {
        p_product_id: PRODUCT_GEDU_OFF,
      });
      expect(error?.code).toBe("42501");
    });

    it("gedu calling for a non-existent product → 42501 (no assignment row)", async () => {
      const { error } = await geduAuth.rpc("get_gedu_product_detail_v2", {
        p_product_id: NONEXISTENT_PRODUCT_ID,
      });
      expect(error?.code).toBe("42501");
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path — the assigned gedu sees the product they teach
  // ---------------------------------------------------------------------------

  describe("assigned gedu", () => {
    it("returns groups[] with the gedu + the participating gamer", async () => {
      const { data, error } = await geduAuth.rpc(
        "get_gedu_product_detail_v2",
        { p_product_id: PRODUCT_GEDU_ON },
      );

      expect(error).toBeNull();
      const result = data as unknown as GeduRpcGroupResult;

      expect(result.product_id).toBe(PRODUCT_GEDU_ON);
      expect(result.groups).toHaveLength(1);

      const [group] = result.groups;
      expect(group.id).toBe(groupId);
      expect(group.name).toBe("Cohort A");

      expect(group.gedus.map((g) => g.id)).toEqual([TEST_IDS.GEDU]);
      expect(group.gedus[0].first_name).toBe("Test");

      expect(group.participations).toHaveLength(1);
      const [participation] = group.participations;
      expect(participation.gamer_id).toBe(TEST_IDS.GAMER);
      expect(participation.gamer_first_name).toBe("Test");
      expect(participation.gamer_date_of_birth).toBe("2015-06-15");
      expect(participation.gamer_gender).toBe("boy");
      expect(participation.status).toBe("active");
    });

    it("does not leak waitlisted / completed / reserving participations", async () => {
      // Flip the seeded participation through every non-active status and
      // assert it disappears from the roster, then restore for the happy
      // path test re-run. Pins the `WHERE p.status = 'active'` filter inside
      // the participations sub-aggregate.
      for (const status of ["waitlisted", "reserving", "completed"] as const) {
        await admin
          .from("participations_v2")
          .update({ status })
          .eq("product_id", PRODUCT_GEDU_ON);

        const { data, error } = await geduAuth.rpc(
          "get_gedu_product_detail_v2",
          { p_product_id: PRODUCT_GEDU_ON },
        );
        expect(error).toBeNull();
        const result = data as unknown as GeduRpcGroupResult;
        expect(result.groups[0].participations).toEqual([]);
      }

      await admin
        .from("participations_v2")
        .update({ status: "active" })
        .eq("product_id", PRODUCT_GEDU_ON);
    });
  });
});
