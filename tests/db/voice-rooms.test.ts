import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  seedEnrollment,
  resetEnrollmentState,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

describe("voice_rooms RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password
    );

    // Gamer needs an active enrollment to see the group voice room
    await seedEnrollment(admin);
  });

  afterAll(async () => {
    await resetEnrollmentState(admin);
  });

  // =========================================================================
  // Admin — sees all rooms
  // =========================================================================

  it("admin can see all voice rooms (group + admin lounge + gedu lounge)", async () => {
    const { data, error } = await adminClient
      .from("voice_rooms")
      .select("id, room_type");

    expect(error).toBeNull();

    const types = data!.map((r) => r.room_type);
    expect(types).toContain("group");
    expect(types).toContain("admin_only");
    expect(types).toContain("gedu_only");
  });

  // =========================================================================
  // Gedu — sees gedu lounge + assigned group rooms
  // =========================================================================

  it("gedu can see gedu lounge", async () => {
    const { data, error } = await geduClient
      .from("voice_rooms")
      .select("id, room_type")
      .eq("room_type", "gedu_only");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("gedu can see group rooms they are assigned to", async () => {
    const { data, error } = await geduClient
      .from("voice_rooms")
      .select("id, room_type, group_id")
      .eq("room_type", "group");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    // The seed group is assigned to the test gedu
    expect(data!.some((r) => r.group_id === TEST_IDS.GROUP)).toBe(true);
  });

  it("gedu cannot see admin lounge", async () => {
    const { data } = await geduClient
      .from("voice_rooms")
      .select("id")
      .eq("room_type", "admin_only");

    expect(data).toEqual([]);
  });

  // =========================================================================
  // Gamer — sees group rooms where actively enrolled
  // =========================================================================

  it("gamer can see group room for enrolled group", async () => {
    const { data, error } = await gamerClient
      .from("voice_rooms")
      .select("id, room_type, group_id")
      .eq("group_id", TEST_IDS.GROUP);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].room_type).toBe("group");
  });

  it("gamer cannot see admin lounge", async () => {
    const { data } = await gamerClient
      .from("voice_rooms")
      .select("id")
      .eq("room_type", "admin_only");

    expect(data).toEqual([]);
  });

  it("gamer cannot see gedu lounge", async () => {
    const { data } = await gamerClient
      .from("voice_rooms")
      .select("id")
      .eq("room_type", "gedu_only");

    expect(data).toEqual([]);
  });

  // =========================================================================
  // Customer — sees nothing (voice rooms are not customer-facing)
  // =========================================================================

  it("customer cannot see any voice rooms", async () => {
    const { data } = await customerClient
      .from("voice_rooms")
      .select("id");

    expect(data).toEqual([]);
  });

  // =========================================================================
  // Write restrictions
  // =========================================================================

  it("gedu cannot insert a voice room", async () => {
    const { error } = await geduClient.from("voice_rooms").insert({
      room_type: "group",
      name: "Injected Room",
      daily_room_name: "injected-room",
    });

    expect(error).not.toBeNull();
  });

  it("gamer cannot delete a voice room", async () => {
    await gamerClient
      .from("voice_rooms")
      .delete()
      .eq("group_id", TEST_IDS.GROUP);

    // Verify it still exists
    const { data } = await admin
      .from("voice_rooms")
      .select("id")
      .eq("group_id", TEST_IDS.GROUP)
      .single();

    expect(data).not.toBeNull();
  });
});
