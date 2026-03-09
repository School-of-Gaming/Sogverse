import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

// Use ADMIN as the gedu for new groups — the seed already assigns TEST_IDS.GEDU
// to TEST_IDS.PRODUCT, and UNIQUE(product_id, gedu_id) would conflict.
const NEW_GROUP_GEDU = TEST_IDS.ADMIN;

describe("commit_group_changes RPC", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  // Track groups created during tests so we can clean them up
  const createdGroupIds: string[] = [];

  afterEach(async () => {
    // Delete test-created groups (CASCADE removes voice_rooms)
    for (const id of createdGroupIds) {
      await admin.from("product_groups").delete().eq("id", id);
    }
    createdGroupIds.length = 0;
  });

  it("atomically creates a voice room when adding a new group", async () => {
    const { data, error } = await adminAuth.rpc("commit_group_changes", {
      p_product_id: TEST_IDS.PRODUCT,
      p_added_groups: [{ tempId: "t1", geduId: NEW_GROUP_GEDU }],
      p_updated_groups: [],
      p_deleted_group_ids: [],
      p_enrollment_moves: [],
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const result = data as { autoHidden: boolean; tempMap: Record<string, string> };
    expect(result.tempMap).toHaveProperty("t1");

    const newGroupId = result.tempMap.t1;
    createdGroupIds.push(newGroupId);

    // Verify voice room was created with correct fields
    const { data: voiceRoom } = await admin
      .from("voice_rooms")
      .select("*")
      .eq("group_id", newGroupId)
      .single();

    expect(voiceRoom).toBeTruthy();
    expect(voiceRoom!.room_type).toBe("group");
    expect(voiceRoom!.name).toBe("Test Product");
    expect(voiceRoom!.daily_room_name).toBe(`group-${newGroupId.slice(0, 8)}`);
  });

  it("creates voice rooms for multiple new groups in one call", async () => {
    const { data, error } = await adminAuth.rpc("commit_group_changes", {
      p_product_id: TEST_IDS.PRODUCT,
      p_added_groups: [
        { tempId: "t1", geduId: NEW_GROUP_GEDU },
        { tempId: "t2", geduId: TEST_IDS.CUSTOMER_2 },
      ],
      p_updated_groups: [],
      p_deleted_group_ids: [],
      p_enrollment_moves: [],
    });

    expect(error).toBeNull();
    const result = data as { autoHidden: boolean; tempMap: Record<string, string> };
    expect(Object.keys(result.tempMap)).toHaveLength(2);

    const id1 = result.tempMap.t1;
    const id2 = result.tempMap.t2;
    createdGroupIds.push(id1, id2);

    // Both groups should have voice rooms
    const { data: rooms } = await admin
      .from("voice_rooms")
      .select("group_id, daily_room_name")
      .in("group_id", [id1, id2]);

    expect(rooms).toHaveLength(2);
    const roomGroupIds = rooms!.map((r) => r.group_id);
    expect(roomGroupIds).toContain(id1);
    expect(roomGroupIds).toContain(id2);
  });

  it("CASCADE deletes voice room when group is deleted", async () => {
    // Create a group + voice room via RPC
    const { data } = await adminAuth.rpc("commit_group_changes", {
      p_product_id: TEST_IDS.PRODUCT,
      p_added_groups: [{ tempId: "t1", geduId: NEW_GROUP_GEDU }],
      p_updated_groups: [],
      p_deleted_group_ids: [],
      p_enrollment_moves: [],
    });

    const result = data as { autoHidden: boolean; tempMap: Record<string, string> };
    const groupId = result.tempMap.t1;

    // Verify voice room exists
    const { data: before } = await admin
      .from("voice_rooms")
      .select("id")
      .eq("group_id", groupId);
    expect(before).toHaveLength(1);

    // Delete the group via RPC
    const { error: deleteError } = await adminAuth.rpc("commit_group_changes", {
      p_product_id: TEST_IDS.PRODUCT,
      p_added_groups: [],
      p_updated_groups: [],
      p_deleted_group_ids: [groupId],
      p_enrollment_moves: [],
    });
    expect(deleteError).toBeNull();

    // Voice room should be gone (CASCADE)
    const { data: after } = await admin
      .from("voice_rooms")
      .select("id")
      .eq("group_id", groupId);
    expect(after).toHaveLength(0);
  });

  it("rejects non-admin callers", async () => {
    const geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    const { error } = await geduClient.rpc("commit_group_changes", {
      p_product_id: TEST_IDS.PRODUCT,
      p_added_groups: [{ tempId: "t1", geduId: NEW_GROUP_GEDU }],
      p_updated_groups: [],
      p_deleted_group_ids: [],
      p_enrollment_moves: [],
    });

    expect(error).toBeTruthy();
    expect(error!.message).toContain("Forbidden");
  });
});
