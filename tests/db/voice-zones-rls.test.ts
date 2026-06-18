import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * RLS coverage for voice_zones and voice_private_zone_occupants (00103, 00108).
 *
 * The persisted half of the discrete-zone voice model. The security contract
 * (see src/components/voice/CLAUDE.md):
 *   - SELECT: any group *member* (active-participation gamer, assigned gedu,
 *     admin) can read zones + private-zone occupancy.
 *   - WRITE:  only a *moderator* (assigned gedu, admin) can create/edit/delete
 *     zones or write/clear private-zone occupancy. A gamer can NEVER write —
 *     that is what makes "only a mod confines you to a private zone" real, and
 *     a gamer cannot free themselves either. Both write-paths of occupancy (a
 *     mod placing a gamer, a mod recording their own entry) are "a moderator
 *     writes a row".
 *
 * Test layout (mirrors group-rls.test.ts):
 *   - PRODUCT_X: GAMER participates (active) in group X1; GEDU assigned to X1.
 *   - PRODUCT_Y: group Y1, none of our users are members (control).
 */

const PRODUCT_X = "00000000-0000-0000-0000-0000000007c1";
const PRODUCT_Y = "00000000-0000-0000-0000-0000000007c2";
const ALL_PRODUCTS = [PRODUCT_X, PRODUCT_Y];

describe("voice_zones + voice_private_zone_occupants RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  let groupX1: string;
  let groupY1: string;
  let lockedZoneX: string; // a locked zone in group X1, seeded by admin
  let lockedZoneY: string; // a locked zone in group Y1, seeded by admin (control)

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

    // Seed a locked zone + an occupancy row in group Y1 (where none of our users
    // are members). This is the *control* that makes the "outsider can't see Y"
    // SELECT assertions non-vacuous: without a row in Y1, those tests pass even
    // with a wide-open policy because there's simply nothing in Y to leak. It
    // also gives the cross-group IDOR tests a locked Y-zone to aim at, so the
    // only failing policy clause is `is_voice_group_moderator(groupY1)` rather
    // than the zone-belongs-to-group check.
    const seededY = await admin
      .from("voice_zones")
      .insert({
        group_id: groupY1,
        name: "Y quiet room",
        icon: "skull",
        color: "violet",
        is_locked: true,
        created_by: TEST_IDS.ADMIN,
      })
      .select("id")
      .single();
    if (seededY.error) {
      throw new Error(`seed Y voice_zones insert failed: ${seededY.error.message}`);
    }
    lockedZoneY = seededY.data.id;

    const seededYOcc = await admin.from("voice_private_zone_occupants").insert({
      zone_id: lockedZoneY,
      user_id: TEST_IDS.GAMER,
      group_id: groupY1,
      placed_by: TEST_IDS.ADMIN,
      session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
    });
    if (seededYOcc.error) {
      throw new Error(`seed Y occupancy insert failed: ${seededYOcc.error.message}`);
    }
  });

  afterAll(async () => {
    // occupancy → zones cascade from the group, but delete explicitly so a
    // failed run doesn't leak rows that outlive the product teardown.
    await admin.from("voice_private_zone_occupants").delete().in("group_id", [groupX1, groupY1]);
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
          icon: "gamepad",
          color: "teal",
          created_by: TEST_IDS.GEDU,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data) await admin.from("voice_zones").delete().eq("id", data.id);
    });

    it("a zone name is optional — a moderator can create one with a null name", async () => {
      const { data, error } = await geduAuth
        .from("voice_zones")
        .insert({
          group_id: groupX1,
          name: null,
          icon: "flame",
          color: "orange",
          created_by: TEST_IDS.GEDU,
        })
        .select("id, name")
        .single();
      expect(error).toBeNull();
      expect(data?.name).toBeNull();
      if (data) await admin.from("voice_zones").delete().eq("id", data.id);
    });

    it("an empty-string name is still rejected by the length check", async () => {
      const { error } = await geduAuth.from("voice_zones").insert({
        group_id: groupX1,
        name: "",
        icon: "rocket",
        color: "red",
        created_by: TEST_IDS.GEDU,
      });
      expect(error).not.toBeNull();
    });

    it("gamer cannot create a zone", async () => {
      const { error } = await gamerAuth.from("voice_zones").insert({
        group_id: groupX1,
        name: "Sneaky",
        icon: "rocket",
        color: "red",
        created_by: TEST_IDS.GAMER,
      });
      expect(error).not.toBeNull();
    });

    it("gedu cannot create a zone in a group they're not assigned to", async () => {
      const { error } = await geduAuth.from("voice_zones").insert({
        group_id: groupY1,
        name: "Trespass",
        icon: "rocket",
        color: "red",
        created_by: TEST_IDS.GEDU,
      });
      expect(error).not.toBeNull();
    });

    it("created_by cannot be spoofed to another user", async () => {
      const { error } = await geduAuth.from("voice_zones").insert({
        group_id: groupX1,
        name: "Spoofed",
        icon: "rocket",
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

    it("gedu cannot delete a zone in a group they're not assigned to (IDOR)", async () => {
      // The DELETE policy's `is_voice_group_moderator(group_id)` is the only
      // guard against a mod tampering with another group's zones. Y1's zone is
      // invisible to this gedu's delete predicate → no error, 0 rows removed.
      const { error } = await geduAuth
        .from("voice_zones")
        .delete()
        .eq("id", lockedZoneY);
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_zones")
        .select("id")
        .eq("id", lockedZoneY);
      expect((data ?? []).length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // voice_private_zone_occupants — mod-only writes, member-readable.
  // ---------------------------------------------------------------------------

  describe("voice_private_zone_occupants", () => {
    afterAll(async () => {
      await admin.from("voice_private_zone_occupants").delete().eq("group_id", groupX1);
    });

    it("assigned gedu can place a gamer into a private zone", async () => {
      const { data, error } = await geduAuth
        .from("voice_private_zone_occupants")
        .insert({
          zone_id: lockedZoneX,
          user_id: TEST_IDS.GAMER,
          group_id: groupX1,
          placed_by: TEST_IDS.GEDU,
          session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
        })
        .select("id, user_id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      expect(data?.user_id).toBe(TEST_IDS.GAMER);
    });

    it("a moderator can record their own occupancy (user_id = placed_by = self)", async () => {
      // The "mod walks into a private zone" write-path. The token bake reads
      // this so a new joiner doesn't receive the mod's private audio either.
      const { data, error } = await geduAuth
        .from("voice_private_zone_occupants")
        .insert({
          zone_id: lockedZoneX,
          user_id: TEST_IDS.GEDU,
          group_id: groupX1,
          placed_by: TEST_IDS.GEDU,
          session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
        })
        .select("id, user_id")
        .single();
      expect(error).toBeNull();
      expect(data?.user_id).toBe(TEST_IDS.GEDU);
      await admin
        .from("voice_private_zone_occupants")
        .delete()
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GEDU);
    });

    it("re-occupying collides on the unique key, so the service deletes-then-inserts", async () => {
      // A naive second insert for the same (group, user) must conflict — this is
      // why occupyPrivateZone clears the existing row first rather than upserting
      // (the table has no UPDATE policy). Guards against a refactor back to a
      // plain insert (which would throw on every re-occupy) or to an upsert
      // (which would be RLS-denied on the UPDATE path).
      const dup = await geduAuth.from("voice_private_zone_occupants").insert({
        zone_id: lockedZoneX,
        user_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T10:00:00Z").toISOString(),
      });
      expect(dup.error).not.toBeNull(); // unique (group_id, user_id) violation

      // delete-then-insert (what the service does) overwrites to a single row.
      await geduAuth
        .from("voice_private_zone_occupants")
        .delete()
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GAMER);
      const reinsert = await geduAuth.from("voice_private_zone_occupants").insert({
        zone_id: lockedZoneX,
        user_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T11:00:00Z").toISOString(),
      });
      expect(reinsert.error).toBeNull();

      const { data } = await admin
        .from("voice_private_zone_occupants")
        .select("session_opens_at")
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GAMER);
      expect(data?.length).toBe(1);
    });

    it("group member (gamer) can read the occupancy list", async () => {
      const { data } = await gamerAuth
        .from("voice_private_zone_occupants")
        .select("user_id")
        .eq("group_id", groupX1);
      expect((data ?? []).map((r) => r.user_id)).toContain(TEST_IDS.GAMER);
    });

    it("a member cannot read another group's occupancy", async () => {
      // Y1 has a seeded occupancy row, so this control is non-vacuous: a member
      // of X1 querying across both groups must see only X1's rows. Were the
      // SELECT policy open, Y1's row would leak in here.
      const { data } = await gamerAuth
        .from("voice_private_zone_occupants")
        .select("group_id")
        .in("group_id", [groupX1, groupY1]);
      expect(new Set((data ?? []).map((r) => r.group_id))).toEqual(new Set([groupX1]));
    });

    it("gamer cannot place themselves (or anyone) into a private zone", async () => {
      const { error } = await gamerAuth.from("voice_private_zone_occupants").insert({
        zone_id: lockedZoneX,
        user_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GAMER,
        session_opens_at: new Date("2026-06-16T11:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("gamer cannot free themselves from a private zone (DELETE denied)", async () => {
      // The placed GAMER row from earlier in this block is still present. A
      // confined gamer must not be able to clear it — that would be escaping
      // confinement. RLS makes the row invisible to the delete predicate → no
      // error, 0 rows removed; the row survives (verified via admin).
      const { error } = await gamerAuth
        .from("voice_private_zone_occupants")
        .delete()
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GAMER);
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_private_zone_occupants")
        .select("id")
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GAMER);
      expect((data ?? []).length).toBe(1);
    });

    it("placed_by cannot be spoofed to another user", async () => {
      // The policy pins `placed_by = auth.uid()`. Use a distinct user_id (the
      // gedu's own) so the unique (group_id, user_id) key — not the spoof check
      // — isn't what fails; only the placed_by pin should reject this.
      const { error } = await geduAuth.from("voice_private_zone_occupants").insert({
        zone_id: lockedZoneX,
        user_id: TEST_IDS.GEDU,
        group_id: groupX1,
        placed_by: TEST_IDS.ADMIN, // not the caller
        session_opens_at: new Date("2026-06-16T11:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("gedu cannot place a user into another group's private zone (IDOR)", async () => {
      // groupY1 + lockedZoneY are a fully-formed locked zone, so the only failing
      // policy clause is `is_voice_group_moderator(groupY1)` — this gedu is a mod
      // of X1, not Y1. Guards against a mod confining children in groups they
      // don't run.
      const { error } = await geduAuth.from("voice_private_zone_occupants").insert({
        zone_id: lockedZoneY,
        user_id: TEST_IDS.GEDU,
        group_id: groupY1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T11:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();
    });

    it("gedu cannot clear another group's occupancy (IDOR)", async () => {
      // Y1's seeded occupancy row is invisible to this gedu's delete predicate →
      // no error, 0 rows removed; the row survives (verified via admin).
      const { error } = await geduAuth
        .from("voice_private_zone_occupants")
        .delete()
        .eq("group_id", groupY1)
        .eq("user_id", TEST_IDS.GAMER);
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_private_zone_occupants")
        .select("id")
        .eq("group_id", groupY1);
      expect((data ?? []).length).toBe(1);
    });

    it("occupying a non-locked zone is rejected", async () => {
      const { data: open } = await admin
        .from("voice_zones")
        .insert({
          group_id: groupX1,
          name: "Open zone",
          icon: "coffee",
          color: "sky",
          is_locked: false,
          created_by: TEST_IDS.ADMIN,
        })
        .select("id")
        .single();

      const { error } = await geduAuth.from("voice_private_zone_occupants").insert({
        zone_id: open!.id,
        user_id: TEST_IDS.GAMER,
        group_id: groupX1,
        placed_by: TEST_IDS.GEDU,
        session_opens_at: new Date("2026-06-16T12:00:00Z").toISOString(),
      });
      expect(error).not.toBeNull();

      if (open) await admin.from("voice_zones").delete().eq("id", open.id);
    });

    it("assigned gedu can clear occupancy (free a placed gamer)", async () => {
      const { error } = await geduAuth
        .from("voice_private_zone_occupants")
        .delete()
        .eq("group_id", groupX1)
        .eq("user_id", TEST_IDS.GAMER);
      expect(error).toBeNull();
      const { data } = await admin
        .from("voice_private_zone_occupants")
        .select("id")
        .eq("group_id", groupX1);
      expect(data ?? []).toEqual([]);
    });
  });
});
