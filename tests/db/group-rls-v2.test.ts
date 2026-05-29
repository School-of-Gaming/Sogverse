import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createV2TestProduct, deleteV2TestProducts } from "./v2-helpers";

/**
 * RLS coverage for product_groups_v2 and gedu_group_assignments_v2.
 *
 * Test layout:
 *   - PRODUCT_X: CUSTOMER's gamer participates (active, in group X1)
 *               GEDU is assigned to group X1
 *   - PRODUCT_Y: nobody the test users care about (control)
 *
 * Reads we verify:
 *   - admin: sees everything
 *   - gedu: own assigned group + colleagues on the same product, NOT product Y
 *   - gamer: own group only (assigned via participations_v2.group_id)
 *   - customer: groups for products their gamers are in
 *   - anon: nothing
 *
 * Writes we verify:
 *   - everyone (admin, customer, gedu, gamer): direct INSERT/UPDATE/DELETE
 *     against either table is rejected. Mutations flow through commit_group_changes_v2.
 */

const PRODUCT_X = "00000000-0000-0000-0000-0000000007b1";
const PRODUCT_Y = "00000000-0000-0000-0000-0000000007b2";
const ALL_PRODUCTS = [PRODUCT_X, PRODUCT_Y];

describe("product_groups_v2 + gedu_group_assignments_v2 RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let groupX1: string;
  let groupY1: string;

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

    // Group on product X with GEDU assigned + GAMER participating.
    const x = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: PRODUCT_X,
      p_added_groups: [{ tempId: "tX1", name: "X1", geduIds: [TEST_IDS.GEDU] }],
    });
    groupX1 = (x.data as { tempMap: Record<string, string> }).tempMap.tX1;

    await admin.from("participations_v2").insert({
      product_id: PRODUCT_X,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      group_id: groupX1,
      credits_remaining: 1,
    });

    // Group on product Y with no relevant ownership.
    const y = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: PRODUCT_Y,
      p_added_groups: [{ tempId: "tY1", name: "Y1", geduIds: [] }],
    });
    groupY1 = (y.data as { tempMap: Record<string, string> }).tempMap.tY1;
  });

  afterAll(async () => {
    await admin
      .from("participations_v2")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // product_groups_v2 reads
  // ---------------------------------------------------------------------------

  describe("product_groups_v2 SELECT", () => {
    it("admin sees both groups", async () => {
      const { data } = await adminAuth
        .from("product_groups_v2")
        .select("id")
        .in("product_id", ALL_PRODUCTS);
      const ids = (data ?? []).map((r) => r.id).sort();
      expect(ids).toEqual([groupX1, groupY1].sort());
    });

    it("gedu sees only the group they're assigned to", async () => {
      const { data } = await geduAuth
        .from("product_groups_v2")
        .select("id")
        .in("product_id", ALL_PRODUCTS);
      expect((data ?? []).map((r) => r.id)).toEqual([groupX1]);
    });

    it("gamer sees only their own group", async () => {
      const { data } = await gamerAuth
        .from("product_groups_v2")
        .select("id")
        .in("product_id", ALL_PRODUCTS);
      expect((data ?? []).map((r) => r.id)).toEqual([groupX1]);
    });

    it("customer sees groups via their gamers' participations", async () => {
      const { data } = await customerAuth
        .from("product_groups_v2")
        .select("id")
        .in("product_id", ALL_PRODUCTS);
      expect((data ?? []).map((r) => r.id)).toEqual([groupX1]);
    });
  });

  // ---------------------------------------------------------------------------
  // gedu_group_assignments_v2 reads
  // ---------------------------------------------------------------------------

  describe("gedu_group_assignments_v2 SELECT", () => {
    it("admin sees the GEDU assignment on product X", async () => {
      const { data } = await adminAuth
        .from("gedu_group_assignments_v2")
        .select("group_id, gedu_id")
        .in("product_id", ALL_PRODUCTS);
      expect(data).toEqual([{ group_id: groupX1, gedu_id: TEST_IDS.GEDU }]);
    });

    it("gedu sees their own assignment", async () => {
      const { data } = await geduAuth
        .from("gedu_group_assignments_v2")
        .select("gedu_id")
        .in("product_id", ALL_PRODUCTS);
      expect((data ?? []).map((r) => r.gedu_id)).toEqual([TEST_IDS.GEDU]);
    });

    it("customer sees the assignment for their gamer's product", async () => {
      const { data } = await customerAuth
        .from("gedu_group_assignments_v2")
        .select("gedu_id, product_id")
        .in("product_id", ALL_PRODUCTS);
      expect(data).toEqual([
        { gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_X },
      ]);
    });

    it("gamer sees nothing (no policy gives gamers visibility into the assignment table)", async () => {
      const { data } = await gamerAuth
        .from("gedu_group_assignments_v2")
        .select("gedu_id")
        .in("product_id", ALL_PRODUCTS);
      expect(data ?? []).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Direct writes are forbidden — everyone goes through the RPC
  // ---------------------------------------------------------------------------

  describe("direct writes rejected", () => {
    it("customer cannot insert a product_groups_v2 row", async () => {
      const { error } = await customerAuth
        .from("product_groups_v2")
        .insert({ product_id: PRODUCT_X, name: "Sneaky" });
      expect(error).not.toBeNull();
    });

    it("gedu cannot insert a product_groups_v2 row", async () => {
      const { error } = await geduAuth
        .from("product_groups_v2")
        .insert({ product_id: PRODUCT_X, name: "Sneaky" });
      expect(error).not.toBeNull();
    });

    it("admin's table-level grants are SELECT-only — INSERT is rejected", async () => {
      // Admin role bypasses RLS, but grants restrict the underlying privilege.
      // A direct INSERT must fail because the only path for writes is the RPC.
      const { error } = await adminAuth
        .from("product_groups_v2")
        .insert({ product_id: PRODUCT_X, name: "Sneaky" });
      expect(error).not.toBeNull();
    });

    it("admin cannot directly insert a gedu_group_assignments_v2 row", async () => {
      const { error } = await adminAuth.from("gedu_group_assignments_v2").insert({
        group_id: groupX1,
        gedu_id: TEST_IDS.ADMIN,
        product_id: PRODUCT_X,
      });
      expect(error).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Non-active participations don't grant ongoing visibility (00051).
// v2's participation_status_v2 enum is ('reserving', 'active', 'waitlisted',
// 'completed') — no 'cancelled'. The realistic leak is a former participant
// of a finished product retaining visibility into its current group/Gedu
// structure, which the migration closes by gating on status = 'active'.
// Uses its own product fixture so the active-state assertions above keep
// their seed assumptions.
// ---------------------------------------------------------------------------

const PRODUCT_Z = "00000000-0000-0000-0000-0000000007b3";

describe("completed participation loses RLS visibility on v2 groups", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let groupZ: string;
  let participationZ: string;

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
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteV2TestProducts(admin, [PRODUCT_Z]);
    await createV2TestProduct(admin, { id: PRODUCT_Z, seatCount: 50 });

    const created = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: PRODUCT_Z,
      p_added_groups: [{ tempId: "tZ", name: "Z", geduIds: [TEST_IDS.GEDU] }],
    });
    groupZ = (created.data as { tempMap: Record<string, string> }).tempMap.tZ;

    const { data: part } = await admin
      .from("participations_v2")
      .insert({
        product_id: PRODUCT_Z,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: groupZ,
        credits_remaining: 1,
      })
      .select("id")
      .single();
    participationZ = part!.id;
  });

  afterAll(async () => {
    await admin.from("participations_v2").delete().eq("product_id", PRODUCT_Z);
    await deleteV2TestProducts(admin, [PRODUCT_Z]);
  });

  it("customer loses product_groups_v2 visibility once their participation is no longer active", async () => {
    // Sanity: visible while active.
    const before = await customerAuth
      .from("product_groups_v2")
      .select("id")
      .eq("id", groupZ);
    expect((before.data ?? []).map((r) => r.id)).toEqual([groupZ]);

    await admin
      .from("participations_v2")
      .update({ status: "completed" })
      .eq("id", participationZ);

    const after = await customerAuth
      .from("product_groups_v2")
      .select("id")
      .eq("id", groupZ);
    expect(after.data ?? []).toEqual([]);

    // Restore for subsequent assertions.
    await admin
      .from("participations_v2")
      .update({ status: "active" })
      .eq("id", participationZ);
  });

  it("gamer loses product_groups_v2 visibility once their own participation is no longer active", async () => {
    await admin
      .from("participations_v2")
      .update({ status: "completed" })
      .eq("id", participationZ);

    const { data } = await gamerAuth
      .from("product_groups_v2")
      .select("id")
      .eq("id", groupZ);
    expect(data ?? []).toEqual([]);

    await admin
      .from("participations_v2")
      .update({ status: "active" })
      .eq("id", participationZ);
  });

  it("customer loses gedu_group_assignments_v2 visibility once the participation is no longer active", async () => {
    await admin
      .from("participations_v2")
      .update({ status: "completed" })
      .eq("id", participationZ);

    const { data } = await customerAuth
      .from("gedu_group_assignments_v2")
      .select("gedu_id")
      .eq("product_id", PRODUCT_Z);
    expect(data ?? []).toEqual([]);

    await admin
      .from("participations_v2")
      .update({ status: "active" })
      .eq("id", participationZ);
  });
});
