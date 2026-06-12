import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { getStringRecord } from "../helpers/json";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";
import { z } from "zod";

/**
 * Tests for apply_group_changes + get_product_groups_with_details.
 * Each describe block uses its own product UUID so CI parallelism doesn't
 * cause cross-file contention.
 */

const PRODUCT_BASIC      = "00000000-0000-0000-0000-0000000007a1";
const PRODUCT_RENAME     = "00000000-0000-0000-0000-0000000007a2";
const PRODUCT_DELETE     = "00000000-0000-0000-0000-0000000007a3";
const PRODUCT_GEDU_SWAP  = "00000000-0000-0000-0000-0000000007a4";
const PRODUCT_MOVES      = "00000000-0000-0000-0000-0000000007a5";
const PRODUCT_VALIDATION = "00000000-0000-0000-0000-0000000007a6";
const PRODUCT_DETAILS    = "00000000-0000-0000-0000-0000000007a7";

const ALL_PRODUCTS = [
  PRODUCT_BASIC,
  PRODUCT_RENAME,
  PRODUCT_DELETE,
  PRODUCT_GEDU_SWAP,
  PRODUCT_MOVES,
  PRODUCT_VALIDATION,
  PRODUCT_DETAILS,
];

// Two Gedus to test multi-Gedu groups. The seed gives us GEDU; ADMIN doubles
// as a second "gedu-shaped" account for assignment uniqueness tests.
const GEDU_A = TEST_IDS.GEDU;
const GEDU_B = TEST_IDS.ADMIN;

describe("apply_group_changes", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, seatCount: 50 });
    }
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Adding groups (with and without inline gedus)
  // ---------------------------------------------------------------------------

  describe("adding groups", () => {
    afterEach(async () => {
      await admin
        .from("product_groups")
        .delete()
        .eq("product_id", PRODUCT_BASIC);
    });

    it("creates a group and returns the temp id mapping", async () => {
      const { data, error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_BASIC,
        p_added_groups: [{ tempId: "t1", name: "Group A", geduIds: [] }],
      });

      expect(error).toBeNull();
      const tempMap = getStringRecord(data, "tempMap");
      expect(tempMap).toHaveProperty("t1");

      const newId = tempMap.t1;
      const { data: row } = await admin
        .from("product_groups")
        .select("name, product_id")
        .eq("id", newId)
        .single();
      expect(row?.name).toBe("Group A");
      expect(row?.product_id).toBe(PRODUCT_BASIC);
    });

    it("creates a group with inline Gedu assignments", async () => {
      const { data } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_BASIC,
        p_added_groups: [
          { tempId: "t1", name: "Group A", geduIds: [GEDU_A, GEDU_B] },
        ],
      });
      const newId = getStringRecord(data, "tempMap").t1;

      const { data: assignments } = await admin
        .from("gedu_group_assignments")
        .select("gedu_id")
        .eq("group_id", newId);
      const ids = (assignments ?? []).map((r) => r.gedu_id).sort();
      expect(ids).toEqual([GEDU_A, GEDU_B].sort());
    });

    it("rejects a blank name", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_BASIC,
        p_added_groups: [{ tempId: "t1", name: "   ", geduIds: [] }],
      });
      expect(error).not.toBeNull();
    });

    it("creates multiple groups in one call", async () => {
      const { data } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_BASIC,
        p_added_groups: [
          { tempId: "t1", name: "Group A", geduIds: [] },
          { tempId: "t2", name: "Group B", geduIds: [] },
          { tempId: "t3", name: "Group C", geduIds: [] },
        ],
      });
      const map = getStringRecord(data, "tempMap");
      const ids = [map.t1, map.t2, map.t3];
      expect(new Set(ids).size).toBe(3);

      const { data: rows } = await admin
        .from("product_groups")
        .select("id, name")
        .in("id", ids);
      expect((rows ?? []).map((r) => r.name).sort()).toEqual([
        "Group A",
        "Group B",
        "Group C",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Renaming
  // ---------------------------------------------------------------------------

  describe("renaming groups", () => {
    let groupId: string;

    beforeAll(async () => {
      const { data } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_RENAME,
        p_added_groups: [{ tempId: "t1", name: "Initial", geduIds: [] }],
      });
      groupId = getStringRecord(data, "tempMap").t1;
    });

    it("updates the name", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_RENAME,
        p_renamed_groups: [{ groupId, name: "Renamed" }],
      });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from("product_groups")
        .select("name")
        .eq("id", groupId)
        .single();
      expect(row?.name).toBe("Renamed");
    });

    it("rejects a blank rename via the table-level check constraint", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_RENAME,
        p_renamed_groups: [{ groupId, name: "   " }],
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Deleting groups
  // ---------------------------------------------------------------------------

  describe("deleting groups", () => {
    afterEach(async () => {
      await admin
        .from("participations")
        .delete()
        .eq("product_id", PRODUCT_DELETE);
      await admin
        .from("product_groups")
        .delete()
        .eq("product_id", PRODUCT_DELETE);
    });

    it("cascades to gedu assignments", async () => {
      const created = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_DELETE,
        p_added_groups: [{ tempId: "t1", name: "Group A", geduIds: [GEDU_A] }],
      });
      const groupId = getStringRecord(created.data, "tempMap").t1;

      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_DELETE,
        p_deleted_group_ids: [groupId],
      });

      const { data: assignments } = await admin
        .from("gedu_group_assignments")
        .select("group_id")
        .eq("group_id", groupId);
      expect(assignments).toEqual([]);
    });

    it("sends participations back to the unassigned inbox", async () => {
      const created = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_DELETE,
        p_added_groups: [{ tempId: "t1", name: "Group A", geduIds: [] }],
      });
      const groupId = getStringRecord(created.data, "tempMap").t1;

      // Insert an active participation in the group.
      const { data: part } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_DELETE,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
          group_id: groupId,
        })
        .select("id")
        .single();

      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_DELETE,
        p_deleted_group_ids: [groupId],
      });

      const { data: row } = await admin
        .from("participations")
        .select("group_id, status")
        .eq("id", part!.id)
        .single();
      expect(row?.group_id).toBeNull();
      expect(row?.status).toBe("active");
    });

    it("ignores groups that belong to a different product", async () => {
      // Create a group on PRODUCT_BASIC and try to delete it via PRODUCT_DELETE.
      const created = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_BASIC,
        p_added_groups: [{ tempId: "t1", name: "G", geduIds: [] }],
      });
      const otherId = getStringRecord(created.data, "tempMap").t1;

      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_DELETE,
        p_deleted_group_ids: [otherId],
      });

      // Group still exists.
      const { data: row } = await admin
        .from("product_groups")
        .select("id")
        .eq("id", otherId)
        .maybeSingle();
      expect(row?.id).toBe(otherId);

      // Cleanup.
      await admin.from("product_groups").delete().eq("id", otherId);
    });
  });

  // ---------------------------------------------------------------------------
  // Gedu assignment swap (remove + add in one batch)
  // ---------------------------------------------------------------------------

  describe("Gedu assignment swap across groups", () => {
    afterEach(async () => {
      await admin
        .from("product_groups")
        .delete()
        .eq("product_id", PRODUCT_GEDU_SWAP);
    });

    it("moving a Gedu from group A to group B in one call clears the unique conflict", async () => {
      const setup = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_GEDU_SWAP,
        p_added_groups: [
          { tempId: "tA", name: "Group A", geduIds: [GEDU_A] },
          { tempId: "tB", name: "Group B", geduIds: [] },
        ],
      });
      const map = getStringRecord(setup.data, "tempMap");
      const groupA = map.tA;
      const groupB = map.tB;

      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_GEDU_SWAP,
        p_gedu_assignments_removed: [{ groupId: groupA, geduId: GEDU_A }],
        p_gedu_assignments_added: [{ groupId: groupB, geduId: GEDU_A }],
      });
      expect(error).toBeNull();

      const { data: rows } = await admin
        .from("gedu_group_assignments")
        .select("group_id, gedu_id")
        .eq("product_id", PRODUCT_GEDU_SWAP);
      expect(rows).toEqual([{ group_id: groupB, gedu_id: GEDU_A }]);
    });

    it("rejects assigning the same Gedu to two groups in one product", async () => {
      const setup = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_GEDU_SWAP,
        p_added_groups: [
          { tempId: "tA", name: "Group A", geduIds: [GEDU_A] },
          { tempId: "tB", name: "Group B", geduIds: [] },
        ],
      });
      const groupB = getStringRecord(setup.data, "tempMap").tB;

      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_GEDU_SWAP,
        p_gedu_assignments_added: [{ groupId: groupB, geduId: GEDU_A }],
      });
      expect(error).not.toBeNull();
    });

    it("can assign Gedus to brand-new groups via temp id resolution", async () => {
      const { data, error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_GEDU_SWAP,
        p_added_groups: [
          { tempId: "tA", name: "Group A", geduIds: [] },
        ],
        p_gedu_assignments_added: [{ groupId: "tA", geduId: GEDU_A }],
      });
      expect(error).toBeNull();
      const newId = getStringRecord(data, "tempMap").tA;

      const { data: rows } = await admin
        .from("gedu_group_assignments")
        .select("gedu_id")
        .eq("group_id", newId);
      expect((rows ?? []).map((r) => r.gedu_id)).toEqual([GEDU_A]);
    });
  });

  // ---------------------------------------------------------------------------
  // Participation moves
  // ---------------------------------------------------------------------------

  describe("participation moves", () => {
    let groupA: string;
    let groupB: string;
    let participationId: string;

    beforeAll(async () => {
      const setup = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        p_added_groups: [
          { tempId: "tA", name: "A", geduIds: [] },
          { tempId: "tB", name: "B", geduIds: [] },
        ],
      });
      const map = getStringRecord(setup.data, "tempMap");
      groupA = map.tA;
      groupB = map.tB;

      const { data: part } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_MOVES,
          gamer_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
          group_id: null,
        })
        .select("id")
        .single();
      participationId = part!.id;
    });

    afterAll(async () => {
      await admin
        .from("participations")
        .delete()
        .eq("product_id", PRODUCT_MOVES);
      await admin
        .from("product_groups")
        .delete()
        .eq("product_id", PRODUCT_MOVES);
    });

    it("moves a participation from unassigned to a group", async () => {
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        p_participation_moves: [{ participationId, toGroupId: groupA }],
      });
      const { data: row } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();
      expect(row?.group_id).toBe(groupA);
    });

    it("moves a participation from group A to group B", async () => {
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        p_participation_moves: [{ participationId, toGroupId: groupB }],
      });
      const { data: row } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();
      expect(row?.group_id).toBe(groupB);
    });

    it("toGroupId=null sends the participation back to the inbox", async () => {
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        p_participation_moves: [{ participationId, toGroupId: null }],
      });
      const { data: row } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();
      expect(row?.group_id).toBeNull();
    });

    it("can move a participation to a brand-new group via temp id resolution", async () => {
      const { data } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        p_added_groups: [{ tempId: "tNew", name: "Brand New", geduIds: [] }],
        p_participation_moves: [
          { participationId, toGroupId: "tNew" },
        ],
      });
      const newId = getStringRecord(data, "tempMap").tNew;

      const { data: row } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();
      expect(row?.group_id).toBe(newId);
    });

    it("rolls back the entire batch if any single statement fails", async () => {
      // Snapshot current group_id so we can verify it's unchanged afterwards.
      const { data: before } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();

      // Set up: a duplicate Gedu assignment will trip the (gedu_id, product_id)
      // unique constraint inside the RPC. We pair it with a participation move
      // and expect the move to be rolled back too.
      await admin.from("gedu_group_assignments").insert({
        group_id: groupA,
        gedu_id: GEDU_A,
        product_id: PRODUCT_MOVES,
      });

      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_MOVES,
        // Will fail: GEDU_A already assigned to groupA in this product.
        p_gedu_assignments_added: [{ groupId: groupB, geduId: GEDU_A }],
        p_participation_moves: [{ participationId, toGroupId: groupA }],
      });
      expect(error).not.toBeNull();

      const { data: after } = await admin
        .from("participations")
        .select("group_id")
        .eq("id", participationId)
        .single();
      expect(after?.group_id).toBe(before?.group_id);

      // Cleanup the seed assignment.
      await admin
        .from("gedu_group_assignments")
        .delete()
        .eq("group_id", groupA)
        .eq("gedu_id", GEDU_A);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation: cross-product moves, missing product, denorm trigger
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it("returns Forbidden when called by a non-admin", async () => {
      const customerAuth = await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      );
      const { error } = await customerAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_VALIDATION,
        p_added_groups: [{ tempId: "t1", name: "X", geduIds: [] }],
      });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("raises P0002 when the product does not exist", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: "00000000-0000-0000-0000-0000000007ff",
        p_added_groups: [{ tempId: "t1", name: "X", geduIds: [] }],
      });
      expect(error).not.toBeNull();
    });

    it("denorm trigger rejects a manual insert with mismatched product_id", async () => {
      // Create a group on PRODUCT_BASIC and try to insert an assignment
      // claiming a different product. The trigger should reject it.
      const { data: created } = await adminAuth.rpc(
        "apply_group_changes",
        {
          p_product_id: PRODUCT_VALIDATION,
          p_added_groups: [{ tempId: "t1", name: "G", geduIds: [] }],
        },
      );
      const groupId = getStringRecord(created, "tempMap").t1;

      const { error } = await admin.from("gedu_group_assignments").insert({
        group_id: groupId,
        gedu_id: GEDU_A,
        product_id: PRODUCT_BASIC, // wrong product
      });
      expect(error).not.toBeNull();

      // Cleanup.
      await admin
        .from("product_groups")
        .delete()
        .eq("product_id", PRODUCT_VALIDATION);
    });
  });
});

// ===========================================================================
// get_product_groups_with_details
// ===========================================================================

describe("get_product_groups_with_details", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    await deleteTestProducts(admin, [PRODUCT_DETAILS]);
    await createTestProduct(admin, { id: PRODUCT_DETAILS, seatCount: 50 });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_DETAILS]);
  });

  it("returns groups, their gedus + participations, and the unassigned inbox", async () => {
    const setup = await adminAuth.rpc("apply_group_changes", {
      p_product_id: PRODUCT_DETAILS,
      p_added_groups: [
        { tempId: "tA", name: "Alpha", geduIds: [GEDU_A] },
      ],
    });
    const groupA = getStringRecord(setup.data, "tempMap").tA;

    // One participation in Alpha, one unassigned.
    await admin.from("participations").insert([
      {
        product_id: PRODUCT_DETAILS,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: groupA,
      },
      {
        product_id: PRODUCT_DETAILS,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: null,
      },
    ]);

    const { data, error } = await adminAuth.rpc(
      "get_product_groups_with_details",
      { p_product_id: PRODUCT_DETAILS },
    );
    expect(error).toBeNull();

    // Parse through the production contract schema (not an ad-hoc subset) so
    // this real RPC output is the CI guard that groups.contracts.ts stays true
    // to Postgres. The admin Groups panel calls productGroupsSnapshot.parse()
    // on this exact shape; a drift would throw and blank the whole panel, so
    // the schema needs a test that runs real output through it. This row has a
    // grouped + an unassigned participation, exercising both detail arrays.
    const result = productGroupsSnapshot.parse(data);

    expect(result.product_id).toBe(PRODUCT_DETAILS);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe("Alpha");
    expect(result.groups[0].gedus.map((g) => g.id)).toEqual([GEDU_A]);
    expect(result.groups[0].participations.map((p) => p.gamer_id)).toEqual([
      TEST_IDS.GAMER,
    ]);
    expect(result.unassigned.map((p) => p.gamer_id)).toEqual([TEST_IDS.GAMER_2]);

    // Cleanup.
    await admin
      .from("participations")
      .delete()
      .eq("product_id", PRODUCT_DETAILS);
  });

  it("orders participations by updated_at (most recently moved last)", async () => {
    const setup = await adminAuth.rpc("apply_group_changes", {
      p_product_id: PRODUCT_DETAILS,
      p_added_groups: [{ tempId: "tA", name: "Alpha", geduIds: [] }],
    });
    const groupA = getStringRecord(setup.data, "tempMap").tA;

    // Two gamers in the group; GAMER_2 touched more recently than GAMER, so the
    // RPC must return GAMER first and GAMER_2 last.
    await admin.from("participations").insert([
      {
        product_id: PRODUCT_DETAILS,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: groupA,
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        product_id: PRODUCT_DETAILS,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: groupA,
        updated_at: "2026-02-01T00:00:00Z",
      },
    ]);

    const { data } = await adminAuth.rpc("get_product_groups_with_details", {
      p_product_id: PRODUCT_DETAILS,
    });
    const result = z
      .object({
        groups: z.array(
          z.object({
            id: z.string(),
            participations: z.array(z.object({ gamer_id: z.string() })),
          }),
        ),
      })
      .parse(data);
    // A prior test leaves its own group behind, so target the one we created.
    const alpha = result.groups.find((g) => g.id === groupA);
    expect(alpha?.participations.map((p) => p.gamer_id)).toEqual([
      TEST_IDS.GAMER,
      TEST_IDS.GAMER_2,
    ]);

    // Cleanup.
    await admin
      .from("participations")
      .delete()
      .eq("product_id", PRODUCT_DETAILS);
  });

  it("returns Forbidden when called by a non-admin", async () => {
    const customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    const { error } = await customerAuth.rpc(
      "get_product_groups_with_details",
      { p_product_id: PRODUCT_DETAILS },
    );
    expect(error?.code).toBe("42501");
  });
});
