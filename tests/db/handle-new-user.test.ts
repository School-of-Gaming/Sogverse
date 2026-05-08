import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Tests for the handle_new_user() trigger — verifies that the trigger
 * ALWAYS assigns customer role regardless of metadata or email domain.
 * All other roles are promoted by server-side API routes after creation.
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
      user_metadata: { role: "admin", first_name: "Fake", last_name: "Admin" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gedu role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gedu@test.local",
      user_metadata: { role: "gedu", first_name: "Fake", last_name: "Gedu" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gamer role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gamer@test.local",
      user_metadata: { role: "gamer", first_name: "Fake", last_name: "Gamer" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gamer email domain from creating gamer account", async () => {
    const user = await createTestUser({
      email: "sneaky@gamer.sogverse.internal",
      user_metadata: { first_name: "Sneaky", last_name: "Gamer" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("defaults to customer when no role metadata is provided", async () => {
    const user = await createTestUser({
      email: "norole@test.local",
      user_metadata: { first_name: "No Role", last_name: "User" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("creates customer_profiles extension row for every signup", async () => {
    const user = await createTestUser({
      email: "extension@test.local",
      user_metadata: { first_name: "Extension", last_name: "Test" },
    });

    const { data, error } = await admin
      .from("customer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    expect(error).toBeNull();
    expect(data!.token_balance).toBe(0);
  });
});
