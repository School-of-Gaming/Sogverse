import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Tests for the handle_new_user() trigger — specifically that privileged
 * roles (admin, gedu) cannot be obtained via raw_user_meta_data (which
 * anyone can set at signup). The trigger ignores the role field entirely
 * and defaults all non-gamer signups to customer. Privileged roles are
 * assigned by API routes after user creation.
 */
describe("handle_new_user() role assignment", () => {
  let admin: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterEach(async () => {
    // Clean up any users created during tests (reverse order)
    for (const userId of createdUserIds.reverse()) {
      await admin.from("gamer_profiles").delete().eq("user_id", userId);
      await admin.from("customer_profiles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    createdUserIds.length = 0;
  });

  async function createTestUser(opts: {
    email: string;
    user_metadata?: Record<string, string>;
  }) {
    const { data, error } = await admin.auth.admin.createUser({
      email: opts.email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: opts.user_metadata,
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    createdUserIds.push(data.user!.id);
    return data.user!;
  }

  async function getProfile(userId: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  it("blocks admin role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-admin@test.local",
      user_metadata: { role: "admin", display_name: "Fake Admin" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gedu role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gedu@test.local",
      user_metadata: { role: "gedu", display_name: "Fake Gedu" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gamer role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gamer@test.local",
      user_metadata: { role: "gamer", display_name: "Fake Gamer" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("defaults to customer when no role metadata is provided", async () => {
    const user = await createTestUser({
      email: "norole@test.local",
      user_metadata: { display_name: "No Role User" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("assigns gamer role via @gamer.sogverse.internal email domain", async () => {
    const user = await createTestUser({
      email: "triggertest@gamer.sogverse.internal",
      user_metadata: {
        display_name: "Trigger Gamer",
        date_of_birth: "2015-01-01",
        gender: "girl",
      },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("gamer");
    expect(profile.email).toBeNull();
    expect(profile.username).toBe("triggertest");

    // Verify gamer_profiles extension row was created
    const { data: gamerProfile, error } = await admin
      .from("gamer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    expect(error).toBeNull();
    expect(gamerProfile!.date_of_birth).toBe("2015-01-01");
    expect(gamerProfile!.gender).toBe("girl");
  });
});
