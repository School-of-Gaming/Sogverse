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
  let customer2Client: SupabaseClient<Database>;

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
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
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

    it("customer sees groups where their gamers are enrolled", async () => {
      const { data, error } = await customerClient.rpc("get_my_groups");

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);

      const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(seededRow).toBeDefined();
    });

    it("customer does not see groups where other customers' gamers are enrolled", async () => {
      const { data, error } = await customer2Client.rpc("get_my_groups");

      expect(error).toBeNull();
      // Customer 2 has no enrollments — should see no groups
      expect(data).toEqual([]);
    });

    it("customer does not see groups with no enrollment from their gamers", async () => {
      const { data, error } = await customerClient.rpc("get_my_groups");

      expect(error).toBeNull();
      // OTHER_GROUP_ID has no enrollments from this customer's gamers
      const otherGroup = data!.find((r) => r.group_id === OTHER_GROUP_ID);
      expect(otherGroup).toBeUndefined();
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
  });

  // --- Privacy: data minimization ---

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

    it("customer: DOB/gender returned for own gamers", async () => {
      const { data } = await customerClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      const ownGamerRow = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
      );
      expect(ownGamerRow).toBeDefined();
      expect(ownGamerRow!.gamer_date_of_birth).not.toBeNull();
      expect(ownGamerRow!.gamer_gender).not.toBeNull();
    });

    it("gamer: last_charge_session_date is always NULL", async () => {
      const { data } = await gamerClient.rpc("get_my_groups");
      expect(data).not.toBeNull();
      for (const row of data!) {
        expect(row.last_charge_session_date).toBeNull();
      }
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

    it("returns product_token_cost for all roles", async () => {
      // Admin
      const { data: adminData } = await adminClient.rpc("get_my_groups");
      const adminRow = adminData!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(adminRow).toBeDefined();
      expect(adminRow!.product_token_cost).toBe(SEED.PRODUCT_TOKEN_COST);

      // Gedu
      const { data: geduData } = await geduClient.rpc("get_my_groups");
      const geduRow = geduData!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(geduRow!.product_token_cost).toBe(SEED.PRODUCT_TOKEN_COST);

      // Customer
      const { data: customerData } = await customerClient.rpc("get_my_groups");
      const customerRow = customerData!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(customerRow!.product_token_cost).toBe(SEED.PRODUCT_TOKEN_COST);
    });

    it("customer: voice_room_id is returned", async () => {
      const { data } = await customerClient.rpc("get_my_groups");
      const row = data!.find((r) => r.group_id === TEST_IDS.GROUP);
      expect(row).toBeDefined();
      expect(row!.voice_room_id).toBeDefined();
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

  // --- Cross-customer privacy: two families sharing a group ---

  describe("cross-customer privacy (shared group)", () => {
    let gamer2Id: string;
    let enrollment2Id: string;
    let txId1: string;
    let txId2: string;

    beforeAll(async () => {
      // Create a second gamer owned by Customer 2.
      // auth.admin.createUser triggers profile creation.
      const { data: { user } } = await admin.auth.admin.createUser({
        email: "testgamer2@gamer.sogverse.internal",
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { display_name: "Test Gamer 2" },
      });
      gamer2Id = user!.id;

      // Promote to gamer role and set up extension table + parent link
      await admin.from("profiles").update({
        role: "gamer",
        username: "testgamer2",
        email: null,
      }).eq("id", gamer2Id);

      await admin.from("gamer_profiles").insert({
        user_id: gamer2Id,
        date_of_birth: "2016-06-15",
        gender: "boy",
      });

      await admin.from("parent_gamer").insert({
        parent_id: TEST_IDS.CUSTOMER_2,
        gamer_id: gamer2Id,
      });

      // Enroll gamer 2 in the same group as gamer 1 (enrolled by Customer 2)
      const { data: enrollment } = await admin.from("group_enrollments").insert({
        group_id: TEST_IDS.GROUP,
        gamer_id: gamer2Id,
        enrolled_by: TEST_IDS.CUSTOMER_2,
        status: "active",
      }).select("id").single();
      enrollment2Id = enrollment!.id;

      // Insert charges for both enrollments
      const { data: tx1 } = await admin.from("token_transactions").insert({
        user_id: TEST_IDS.CUSTOMER,
        amount: -SEED.PRODUCT_TOKEN_COST,
        type: "enrollment",
        description: "Charge for gamer 1",
        balance_after: SEED.CUSTOMER_TOKEN_BALANCE - SEED.PRODUCT_TOKEN_COST,
      }).select("id").single();
      txId1 = tx1!.id;

      await admin.from("enrollment_charges").insert({
        enrollment_id: TEST_IDS.ENROLLMENT,
        amount: SEED.PRODUCT_TOKEN_COST,
        transaction_id: txId1,
        session_date: "2026-03-20",
      });

      const { data: tx2 } = await admin.from("token_transactions").insert({
        user_id: TEST_IDS.CUSTOMER_2,
        amount: -SEED.PRODUCT_TOKEN_COST,
        type: "enrollment",
        description: "Charge for gamer 2",
        balance_after: 0,
      }).select("id").single();
      txId2 = tx2!.id;

      await admin.from("enrollment_charges").insert({
        enrollment_id: enrollment2Id,
        amount: SEED.PRODUCT_TOKEN_COST,
        transaction_id: txId2,
        session_date: "2026-03-22",
      });
    });

    afterAll(async () => {
      await admin.from("enrollment_charges").delete().eq("enrollment_id", enrollment2Id);
      await admin.from("enrollment_charges").delete().eq("enrollment_id", TEST_IDS.ENROLLMENT);
      await admin.from("group_enrollments").delete().eq("id", enrollment2Id);
      await admin.from("token_transactions").delete().eq("id", txId1);
      await admin.from("token_transactions").delete().eq("id", txId2);
      await admin.from("parent_gamer").delete().eq("gamer_id", gamer2Id);
      await admin.from("gamer_profiles").delete().eq("user_id", gamer2Id);
      await admin.auth.admin.deleteUser(gamer2Id);
    });

    it("customer 1 sees own charge date, NULL for other family's gamer", async () => {
      const { data, error } = await customerClient.rpc("get_my_groups");
      expect(error).toBeNull();

      const ownRow = data!.find((r) => r.gamer_id === TEST_IDS.GAMER);
      expect(ownRow).toBeDefined();
      expect(ownRow!.last_charge_session_date).toBe("2026-03-20");

      const otherRow = data!.find((r) => r.gamer_id === gamer2Id);
      expect(otherRow).toBeDefined();
      expect(otherRow!.last_charge_session_date).toBeNull();
    });

    it("customer 2 sees own charge date, NULL for other family's gamer", async () => {
      const { data, error } = await customer2Client.rpc("get_my_groups");
      expect(error).toBeNull();

      const ownRow = data!.find((r) => r.gamer_id === gamer2Id);
      expect(ownRow).toBeDefined();
      expect(ownRow!.last_charge_session_date).toBe("2026-03-22");

      const otherRow = data!.find((r) => r.gamer_id === TEST_IDS.GAMER);
      expect(otherRow).toBeDefined();
      expect(otherRow!.last_charge_session_date).toBeNull();
    });

    it("customer 1 sees own gamer's DOB/gender, NULL for other family's gamer", async () => {
      const { data } = await customerClient.rpc("get_my_groups");

      const ownRow = data!.find((r) => r.gamer_id === TEST_IDS.GAMER);
      expect(ownRow!.gamer_date_of_birth).not.toBeNull();
      expect(ownRow!.gamer_gender).not.toBeNull();

      const otherRow = data!.find((r) => r.gamer_id === gamer2Id);
      expect(otherRow!.gamer_date_of_birth).toBeNull();
      expect(otherRow!.gamer_gender).toBeNull();
    });

    it("admin sees all charge dates (not scoped by customer)", async () => {
      const { data } = await adminClient.rpc("get_my_groups");

      const gamer1Row = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
      );
      expect(gamer1Row!.last_charge_session_date).toBe("2026-03-20");

      const gamer2Row = data!.find(
        (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === gamer2Id,
      );
      expect(gamer2Row!.last_charge_session_date).toBe("2026-03-22");
    });
  });

  afterAll(async () => {
    await admin.from("product_groups").delete().eq("id", OTHER_GROUP_ID);
    await resetEnrollmentState(admin);
  });
});
