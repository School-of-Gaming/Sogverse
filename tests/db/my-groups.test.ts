import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  seedEnrollment,
  resetEnrollmentState,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

/** A second group assigned to admin (not the test gedu) for negative isolation tests. */
const OTHER_GROUP_ID = "00000000-0000-0000-0000-0000000000a1";

describe("get_my_groups RPC", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await resetEnrollmentState(admin);
    await seedEnrollment(admin);
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    // Create a second group assigned to admin (not the test gedu) for isolation tests.
    // Gamer is NOT enrolled in this group.
    await admin.from("product_groups").upsert({
      id: OTHER_GROUP_ID,
      product_id: TEST_IDS.PRODUCT,
      gedu_id: TEST_IDS.ADMIN,
      display_order: 99,
    });
  });

  // --- Security: role isolation ---

  describe("role isolation", () => {
    it("admin sees all groups (not filtered by assignment or enrollment)", async () => {
      const { data, error } = await adminClient.rpc("get_my_groups");

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
    });

    it("gedu sees only groups where they are the assigned gedu", async () => {
      const { data, error } = await geduClient.rpc("get_my_groups");

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
    });

    it("gamer sees only groups they are enrolled in", async () => {
      const { data, error } = await gamerClient.rpc("get_my_groups");

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
    });

    it("gedu does not see groups assigned to other users", async () => {
      const { data, error } = await geduClient.rpc("get_my_groups");

      expect(error).toBeNull();
      const otherGroup = data!.find((r) => r.group_id === OTHER_GROUP_ID);
      expect(otherGroup).toBeUndefined();
    });

    it("gamer does not see groups they are not enrolled in", async () => {
      const { data, error } = await gamerClient.rpc("get_my_groups");

      expect(error).toBeNull();
      const otherGroup = data!.find((r) => r.group_id === OTHER_GROUP_ID);
      expect(otherGroup).toBeUndefined();
    });

    it("admin sees both the seeded group and the isolation group", async () => {
      const { data, error } = await adminClient.rpc("get_my_groups");

      expect(error).toBeNull();
      expect(data!.find((r) => r.group_id === TEST_IDS.GROUP)).toBeDefined();
      expect(data!.find((r) => r.group_id === OTHER_GROUP_ID)).toBeDefined();
    });

    it("customer gets a permission error", async () => {
      const { error } = await customerClient.rpc("get_my_groups");
      expect(error).not.toBeNull();
    });
  });

  // --- Privacy: data minimization for gamers ---

  describe("privacy (gamer data minimization)", () => {
    it("gamer: gamer_date_of_birth is NULL for all rows", async () => {
      const { data } = await gamerClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      for (const row of data!) {
        expect(row.gamer_date_of_birth).toBeNull();
      }
    });

    it("gamer: gamer_gender is NULL for all rows", async () => {
      const { data } = await gamerClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      for (const row of data!) {
        expect(row.gamer_gender).toBeNull();
      }
    });

    it("gamer: gamer_display_name is still returned for enrolled gamers", async () => {
      const { data } = await gamerClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      const gamerRow = data!.find((r) => r.gamer_id === TEST_IDS.GAMER);
      expect(gamerRow).toBeDefined();
      expect(gamerRow!.gamer_display_name).not.toBeNull();
    });

    it("admin: gamer_date_of_birth and gamer_gender are returned for enrolled gamers", async () => {
      const { data } = await adminClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      const gamerRow = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
      );
      expect(gamerRow).toBeDefined();
      expect(gamerRow!.gamer_date_of_birth).not.toBeNull();
      expect(gamerRow!.gamer_gender).not.toBeNull();
    });

    it("gedu: gamer_date_of_birth and gamer_gender are returned for enrolled gamers", async () => {
      const { data } = await geduClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      const gamerRow = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
      );
      expect(gamerRow).toBeDefined();
      expect(gamerRow!.gamer_date_of_birth).not.toBeNull();
      expect(gamerRow!.gamer_gender).not.toBeNull();
    });
  });

  // --- Data integrity ---

  describe("data integrity", () => {
    it("returns correct product/game/schedule info for the seeded group", async () => {
      const { data } = await geduClient.rpc("get_my_groups");
      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
      expect(seededRow!.product_id).toBe(TEST_IDS.PRODUCT);
      expect(seededRow!.product_name).toBe(SEED.PRODUCT_NAME);
      expect(seededRow!.game_id).toBe(TEST_IDS.GAME);
      expect(seededRow!.game_name).toBe(SEED.GAME_NAME);
      expect(seededRow!.day_of_week).toBeDefined();
      expect(seededRow!.start_time).toBeDefined();
      expect(seededRow!.timezone).toBeDefined();
    });

    it("includes enrolled gamers with correct enrollment IDs", async () => {
      const { data } = await geduClient.rpc("get_my_groups");
      const gamerRow = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
      );
      expect(gamerRow).toBeDefined();
      expect(gamerRow!.enrollment_id).toBe(TEST_IDS.ENROLLMENT);
    });

    it("returns voice_room_id for the group", async () => {
      const { data } = await geduClient.rpc("get_my_groups");
      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
      expect(seededRow!.voice_room_id).toBeDefined();
    });

    it("groups with no enrollments still appear (gamer fields are null)", async () => {
      // Remove the enrollment, query as admin (sees all groups), then restore
      await admin
        .from("group_enrollments")
        .delete()
        .eq("id", TEST_IDS.ENROLLMENT);

      const { data } = await adminClient.rpc("get_my_groups");
      const emptyGroup = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(emptyGroup).toBeDefined();
      expect(emptyGroup!.gamer_id).toBeNull();
      expect(emptyGroup!.gamer_display_name).toBeNull();
      expect(emptyGroup!.enrollment_id).toBeNull();

      // Restore enrollment for other tests
      await seedEnrollment(admin);
    });
  });

  afterAll(async () => {
    await admin.from("product_groups").delete().eq("id", OTHER_GROUP_ID);
    await resetEnrollmentState(admin);
  });
});
