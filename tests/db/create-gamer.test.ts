import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

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

  it("links a Minecraft account another user already holds", async () => {
    // minecraft_uuid used to be UNIQUE, which made this the failure case below.
    // Siblings sharing one Minecraft account across two Sogverse accounts is a
    // supported shape now, so the second link is an ordinary insert.
    const parent = await createCustomerUser("cg-share-parent@test.local");
    const first = await createCustomerUser("cg-share-child-1@test.local");
    const second = await createCustomerUser("cg-share-child-2@test.local");

    const shared = { username: "SharedCraft", uuid: "cg-uuid-shared" };

    for (const [gamer, name] of [[first, "Elder"], [second, "Younger"]] as const) {
      const { error } = await admin.rpc("create_gamer", {
        p_gamer_id: gamer.id,
        p_parent_id: parent.id,
        p_first_name: name,
        p_last_name: "Parentson",
        p_date_of_birth: "2014-01-20",
        p_minecraft_username: shared.username,
        p_minecraft_uuid: shared.uuid,
      });
      expect(error).toBeNull();
    }

    // A reverse lookup by uuid now answers with a set, which is the shape a
    // rebuilt Minecraft join check has to be written against.
    const { data: holders } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("minecraft_uuid", shared.uuid);

    expect(holders?.map((r) => r.user_id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("rolls back the entire promotion when a later statement fails", async () => {
    const gamer = await createCustomerUser("cg-rb-child@test.local");

    // The seeded gedu is not a customer, so naming it as the parent trips
    // validate_parent_gamer_on_insert at the RPC's *last* statement — after the
    // profile was promoted, the extension rows swapped, and the Minecraft row
    // written. Exactly the mid-flight failure this asserts about, and the
    // precondition comes from the seed rather than from create_gamer itself.
    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: TEST_IDS.GEDU,
      p_first_name: "Doomed",
      p_last_name: "Parentson",
      p_date_of_birth: "2016-03-03",
      p_minecraft_username: "DoomedCraft",
      p_minecraft_uuid: "cg-uuid-doomed",
    });

    expect(error?.message).toContain("Parent must be a customer account");

    // Nothing from the aborted transaction persisted: the profile is still a
    // customer, its extension row intact, and no gamer/minecraft/link rows exist.
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

    // The Minecraft insert is the statement immediately before the one that
    // failed, so its absence is what proves the abort rolled back real work.
    const { data: mcRow } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(mcRow).toBeNull();

    const { data: link } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("gamer_id", gamer.id)
      .maybeSingle();
    expect(link).toBeNull();
  });

  it("refuses to re-promote a profile that is no longer a customer (00114 guard)", async () => {
    const parent = await createCustomerUser("cg-guard-parent@test.local");
    const gamer = await createCustomerUser("cg-guard-child@test.local");

    // First call promotes the customer to a gamer — succeeds.
    const { error: firstError } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Once",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-09-09",
    });
    expect(firstError).toBeNull();

    // Second call targets the same id — now role = 'gamer', so the role =
    // 'customer' guard makes the promotion UPDATE match nothing and the function
    // raises rather than corrupting the already-promoted account.
    const { error: secondError } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Twice",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-09-09",
    });
    expect(secondError).not.toBeNull();

    // The first promotion is untouched: name from the first call, single link.
    const { data: profile } = await admin
      .from("profiles")
      .select("role, first_name")
      .eq("id", gamer.id)
      .single();
    expect(profile).toMatchObject({ role: "gamer", first_name: "Once" });

    const { data: links } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("gamer_id", gamer.id);
    expect(links).toHaveLength(1);
  });
});
