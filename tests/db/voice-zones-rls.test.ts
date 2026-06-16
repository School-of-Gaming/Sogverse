import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * RLS coverage for voice_zones and voice_locked_placements (00103).
 *
 * The persisted half of the discrete-zone voice model. The security contract
 * (see src/components/voice/CLAUDE.md):
 *   - SELECT: any group *member* (active-participation gamer, assigned gedu,
 *     admin) can read zones + the locked roster.
 *   - WRITE:  only a *moderator* (assigned gedu, admin) can create/edit/delete
 *     zones or insert/delete locked placements. A gamer can NEVER write — that
 *     is what makes "only a mod moves you into a locked zone" real, independent
 *     of any client behavior.
 *
 * Test layout (mirrors group-rls.test.ts):
 *   - PRODUCT_X: GAMER participates (active) in group X1; GEDU assigned to X1.
 *   - PRODUCT_Y: group Y1, none of our users are members (control).
 */

const PRODUCT_X = "00000000-0000-0000-0000-0000000007c1";
const PRODUCT_Y = "00000000-0000-0000-0000-0000000007c2";
const ALL_PRODUCTS = [PRODUCT_X, PRODUCT_Y];

describe("voice_zones + voice_locked_placements RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let groupX1: string;
  let groupY1: string;
  let lockedZoneX: string; // a locked zone in group X1, seeded by admin

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, seatCount: 50 });
    }

    const x = await adminAuth.rpc("apply_group_changes", {
      p_product_id: PRODUCT_X,
      p_added_groups: [{ tempId: "tX1", name: "X1", geduIds: [TEST_IDS.GEDU] }],
    });
    groupX1 = getStringRecord(x.data, "tempMap").tX1;

    await admin.from("participations").insert({
      product_id: PRODUCT_X,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      group_id: groupX1,
    });

    const y = await adminAuth.rpc("apply_group_changes", {
      p_product_id: PRODUCT_Y,
      p_added_groups: [{ tempId: "tY1", name: "Y1", geduIds: [] }],
    });
    groupY1 = getStringRecord(y.data, "tempMap").tY1;

    // Seed one locked zone in X1 via the service-role client (bypasses RLS).
    // Surface the error: a swallowed insert failure here would skip the whole
    // suite via a null-deref in beforeAll rather than reporting the real cause.
    // Don't destructure — that collapses the {data}|{error} union and the
    // narrowing below would lint as an impossible condition.
    const seeded = await admin
      .from("voice_zones")
      .insert({
        group_id: groupX1,
        name: "Quiet room",
        icon: "ghost",
        color: "indigo",
        is_locked: true,
        created_by: TEST_IDS.ADMIN,
      })
      .select("id")
      .single();
    if (seeded.error) {
      throw new Error(`seed voice_zones insert failed: ${seeded.error.message}`);
    }
    lockedZoneX = seeded.data.id;
  });

  afterAll(async () => {
    // placements → zones cascade from the group, but delete explicitly so a
    // failed run doesn't leak rows that outlive the product teardown.
    await admin.from("voice_locked_placements").delete().in("group_id", [groupX1, groupY1]);
    await admin.from("voice_zones").delete().in("group_id", [groupX1, groupY1]);
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // voice_zones SELECT — members of the group see its zones; outsiders don't.
  // ---------------------------------------------------------------------------

  describe("voice_zones SELECT", () => {
    it("gamer sees zones for their own group only", async () => {
      const { data } = await gamerAuth
        .from("voice_zones")
        .select("id, group_id")
        .in("group_id", [groupX1, groupY1]);
      expect((data ?? []).map((r) => r.group_id)).toEqual([groupX1]);
    });

    it("assigned gedu sees zones for their group only", async () => {
      const { data } = await geduAuth
        .from("voice_zones")
        .select("group_id")
        .in("group_id", [groupX1, groupY1]);
      expect((data ?? []).map((r) => r.group_id)).toEqual([groupX1]);
    });

    it("admin sees the seeded zone", async () => {
      const { data } = await adminAuth
        .from("voice_zones")
        .select("id")
        .eq("id", lockedZoneX);
      expect((data ?? []).map((r) => r.id)).toEqual([lockedZoneX]);
    });
  });

  // ---------------------------------------------------------------------------
  // voice_zones writes — moderators only.
  // ---------------------------------------------------------------------------

  describe("voice_zones writes", () => {
    it("assigned gedu can create a custom zone in their group", async () => {
      const { data, error } = await geduAuth
        .from("voice_zones")
        .insert({
          group_id: groupX1,
          name: "Strategy corner",
          icon: "crown",
          color: "teal",
          created_by: TEST_IDS.GEDU,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data) await admin.from("voice_zones").delete().eq("id", data.id);
    });

    it("gamer cannot create a zone", async () => {
      const { error } = await gamerAuth.from("voice_zones").insert({
        group_id: groupX1,
        name: "Sneaky",
        icon: "star",
        color: "red",
        created_by: TEST_IDS.GAMER,
      });
      expect(error).not.toBeNull();
    });

    it("gedu cannot create a zone in a group they're not assigned to", async () => {
      const { error } = await geduAuth.from("voice_zones").insert({
        group_id: groupY1,
        name: "Trespass",
        icon: "star",
        color: "red",
        created_by: TEST_IDS.GEDU,
      });
      expect(error).not.toBeNull();
    });

    it("created_by cannot be spoofed to another user", async () => {
      const { error } = await geduAuth.from("voice_zones").insert({
        group_id: groupX1,
        name: "Spoofed",
        icon: "star",
        color: "red",
        created_by: TEST_IDS.ADMIN, // not the caller
      });
      expect(error).not.toBeNull();
    });

    it("gamer cannot delete a moderator's zone", async () => {
      const { error } = await gamerAuth
        .from("voice_zones")
        .delete()
        .eq("id", lockedZoneX);
      // RLS makes the row invisible to the delete predicate → no error, 0 rows.
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_zones")
        .select("id")
        .eq("id", lockedZoneX);
      expect((data ?? []).length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // voice_locked_placements — mod-only writes, member-readable roster.
  // ---------------------------------------------------------------------------

  describe("voice_locked_placements", () => {
    afterAll(async () => {
      await admin.from("voice_locked_placements").delete().eq("group_id", groupX1);
    });

    it("assigned gedu can place a gamer into a locked zone", async () => {
      const { data, error } = await geduAuth
        .from("voice_locked_placements")
        .insert({
          zone_id: lockedZoneX,
          gamer_id: TEST_IDS.GAMER,
          group_id: groupX1,
          placed_by: TEST_IDS.GEDU,
          session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
          gamer_name: "Test Gamer",
        })
        .select("id, gamer_name")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      expect(data?.gamer_name).toBe("Test Gamer");
    });

    it("re-placing a gamer collides on the unique key, so the service deletes-then-inserts", async () => {
      // A naive second insert for the same (group, gamer) must conflict — this
      // is why placeInLockedZone clears the existing row first rather than
      // upserting (the table has no UPDATE policy). Guards against a refactor
      // back to a plain insert (which would throw on every re-placement) or to
      // an upsert (which would be RLS-denied on the UPDATE path).
      const dup = await geduAuth.from("voice_locked_placements").insert({
        zone_id: lockedZoneX,
        gamer_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
        gamer_name: "Dup",
      });
      expect(dup.error).not.toBeNull(); // unique (group_id, gamer_id) violation

      // delete-then-insert (what the service does) overwrites to a single row.
      await geduAuth
        .from("voice_locked_placements")
        .delete()
        .eq("group_id", groupX1)
        .eq("gamer_id", TEST_IDS.GAMER);
      const reinsert = await geduAuth.from("voice_locked_placements").insert({
        zone_id: lockedZoneX,
        gamer_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
        gamer_name: "Renamed Gamer",
      });
      expect(reinsert.error).toBeNull();

      const { data } = await admin
        .from("voice_locked_placements")
        .select("gamer_name")
        .eq("group_id", groupX1)
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(data?.length).toBe(1);
      expect(data?.[0]?.gamer_name).toBe("Renamed Gamer");
    });

    it("group member (gamer) can read the locked roster", async () => {
      const { data } = await gamerAuth
        .from("voice_locked_placements")
        .select("gamer_id")
        .eq("group_id", groupX1);
      expect((data ?? []).map((r) => r.gamer_id)).toContain(TEST_IDS.GAMER);
    });

    it("gamer cannot place themselves (or anyone) into a locked zone", async () => {
      const { error } = await gamerAuth.from("voice_locked_placements").insert({
        zone_id: lockedZoneX,
        gamer_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GAMER,
        session_opens_at: new Date("2026-06-16T11:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("placing into a non-locked zone is rejected", async () => {
      const { data: open } = await admin
        .from("voice_zones")
        .insert({
          group_id: groupX1,
          name: "Open zone",
          icon: "music",
          color: "sky",
          is_locked: false,
          created_by: TEST_IDS.ADMIN,
        })
        .select("id")
        .single();

      const { error } = await geduAuth.from("voice_locked_placements").insert({
        zone_id: open!.id,
        gamer_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T12:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();

      if (open) await admin.from("voice_zones").delete().eq("id", open.id);
    });

    it("assigned gedu can remove a placement", async () => {
      const { error } = await geduAuth
        .from("voice_locked_placements")
        .delete()
        .eq("group_id", groupX1)
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_locked_placements")
        .select("id")
        .eq("group_id", groupX1);
      expect(data ?? []).toEqual([]);
    });
  });
});
