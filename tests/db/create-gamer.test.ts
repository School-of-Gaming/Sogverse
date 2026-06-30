import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Tests for the create_gamer() RPC (migration 00113) — the atomic
 * promote + link that the gamer-creation route calls after creating the auth
 * user. Two properties matter: it does the full promotion correctly, and it
 * does it as ONE transaction, so a mid-flight failure leaves nothing behind.
 */
describe("create_gamer() atomic promotion", () => {
  let admin: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterEach(async () => {
    for (const userId of createdUserIds.reverse()) {
      await admin.from("parent_gamer").delete().eq("gamer_id", userId);
      await admin.from("parent_gamer").delete().eq("parent_id", userId);
      await admin.from("minecraft_accounts").delete().eq("user_id", userId);
      await admin.from("gamer_profiles").delete().eq("user_id", userId);
      await admin.from("customer_profiles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    createdUserIds.length = 0;
  });

  /**
   * Create an auth user. The handle_new_user() trigger seeds it as a 'customer'
   * with a customer_profiles row — exactly the state the route hands to
   * create_gamer() for a brand-new gamer (and the state a real parent is in).
   */
  async function createCustomerUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Test", last_name: "User" },
    });
    expect(error).toBeNull();
    createdUserIds.push(data.user!.id);
    return data.user!;
  }

  it("promotes the profile, swaps extension tables, and links the parent", async () => {
    const parent = await createCustomerUser("cg-parent@test.local");
    const gamer = await createCustomerUser("cg-child@test.local");

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Lily",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-06-15",
      p_gender: "girl",
    });
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("role, first_name, last_name")
      .eq("id", gamer.id)
      .single();
    expect(profile).toMatchObject({
      role: "gamer",
      first_name: "Lily",
      last_name: "Parentson",
    });

    // Extension tables swapped: customer row gone, gamer row present.
    const { data: customerRow } = await admin
      .from("customer_profiles")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(customerRow).toBeNull();

    const { data: gamerRow } = await admin
      .from("gamer_profiles")
      .select("date_of_birth, gender")
      .eq("user_id", gamer.id)
      .single();
    expect(gamerRow).toMatchObject({ date_of_birth: "2015-06-15", gender: "girl" });

    const { data: link } = await admin
      .from("parent_gamer")
      .select("parent_id, gamer_id")
      .eq("gamer_id", gamer.id)
      .single();
    expect(link).toMatchObject({ parent_id: parent.id, gamer_id: gamer.id });
  });

  it("links an optional Minecraft account in the same transaction", async () => {
    const parent = await createCustomerUser("cg-mc-parent@test.local");
    const gamer = await createCustomerUser("cg-mc-child@test.local");

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Max",
      p_last_name: "Parentson",
      p_date_of_birth: "2014-01-20",
      p_minecraft_username: "MaxCraft",
      p_minecraft_uuid: "cg-uuid-unique-1",
    });
    expect(error).toBeNull();

    const { data: mc } = await admin
      .from("minecraft_accounts")
      .select("minecraft_username, minecraft_uuid")
      .eq("user_id", gamer.id)
      .single();
    expect(mc).toMatchObject({ minecraft_username: "MaxCraft", minecraft_uuid: "cg-uuid-unique-1" });
  });

  it("rolls back the entire promotion when the Minecraft UUID is already taken", async () => {
    const parent = await createCustomerUser("cg-rb-parent@test.local");
    const gamer = await createCustomerUser("cg-rb-child@test.local");

    // Pre-claim the UUID with an unrelated account so the RPC's minecraft
    // insert hits the unique constraint partway through the transaction.
    await admin.from("minecraft_accounts").insert({
      user_id: parent.id,
      minecraft_username: "Claimer",
      minecraft_uuid: "cg-uuid-conflict",
    });

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Doomed",
      p_last_name: "Parentson",
      p_date_of_birth: "2016-03-03",
      p_minecraft_username: "DoomedCraft",
      p_minecraft_uuid: "cg-uuid-conflict",
    });

    // Surfaces the unique violation as SQLSTATE 23505 (the route maps it to 409).
    expect(error?.code).toBe("23505");

    // Nothing from the aborted transaction persisted: the profile is still a
    // customer, its extension row intact, and no gamer/link rows exist.
    const { data: profile } = await admin
      .from("profiles")
      .select("role, first_name")
      .eq("id", gamer.id)
      .single();
    expect(profile).toMatchObject({ role: "customer", first_name: "Test" });

    const { data: customerRow } = await admin
      .from("customer_profiles")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(customerRow).not.toBeNull();

    const { data: gamerRow } = await admin
      .from("gamer_profiles")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(gamerRow).toBeNull();

    const { data: link } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("gamer_id", gamer.id)
      .maybeSingle();
    expect(link).toBeNull();
  });
});
