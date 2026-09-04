import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Tests for the create_gamer() RPC (migration 00113) — the atomic
 * promote + link that the gamer-creation route calls after creating the auth
 * user. Three properties matter: it refuses a family that has no parent PIN, it
 * does the full promotion correctly, and it does it as ONE transaction, so a
 * mid-flight failure leaves nothing behind.
 *
 * Every parent in this file is created WITH a PIN (00235), because a parent
 * without one can no longer acquire a gamer at all — the gate on leaving a
 * gamer session is that PIN, so the invariant is established at the only moment
 * it is cheap to establish. `createParentUser` is what makes that explicit;
 * `createCustomerUser` remains for the accounts that are about to become
 * gamers, which need no PIN of their own.
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
      await admin.from("roblox_accounts").delete().eq("user_id", userId);
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

  /**
   * The same customer, plus the PIN create_gamer now requires of the parent.
   * Set through the service-role RPC rather than by writing `pin_hash`
   * directly, so the fixture stores a real bcrypt hash the way production does.
   */
  async function createParentUser(email: string) {
    const parent = await createCustomerUser(email);
    const { error } = await admin.rpc("set_pin_for_user", {
      p_user_id: parent.id,
      p_pin: "1234",
    });
    expect(error).toBeNull();
    return parent;
  }

  it("refuses a parent who has no PIN, with the SQLSTATE the route matches", async () => {
    // The invariant: no gamer may exist in a family with no parent PIN, because
    // the gate on leaving a gamer session IS that PIN. P0025 rather than a bare
    // raise because the route answers this one failure with a specific ask —
    // set a PIN first — instead of the generic apology every other raise gets.
    const parent = await createCustomerUser("cg-nopin-parent@test.local");
    const gamer = await createCustomerUser("cg-nopin-child@test.local");

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Unmade",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-06-15",
    });

    expect(error?.code).toBe("P0025");
    expect(error?.message).toContain("PIN_REQUIRED");

    // The guard is the FIRST statement, so nothing was written: the candidate is
    // still a customer with its trigger-seeded extension row.
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", gamer.id)
      .single();
    expect(profile?.role).toBe("customer");

    const { data: link } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("gamer_id", gamer.id)
      .maybeSingle();
    expect(link).toBeNull();
  });

  it("stores the sign-in mode, defaulting to switch-only", async () => {
    const parent = await createParentUser("cg-mode-parent@test.local");
    const byDefault = await createCustomerUser("cg-mode-default@test.local");
    const byEmail = await createCustomerUser("cg-mode-email@test.local");

    // Omitted entirely — the argument defaults to `parent`, which is the
    // switch-only shape every gamer had before the modes existed.
    const { error: defaultError } = await admin.rpc("create_gamer", {
      p_gamer_id: byDefault.id,
      p_parent_id: parent.id,
      p_first_name: "Switched",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-06-15",
    });
    expect(defaultError).toBeNull();

    const { error: emailError } = await admin.rpc("create_gamer", {
      p_gamer_id: byEmail.id,
      p_parent_id: parent.id,
      p_first_name: "Mailed",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-06-15",
      p_sign_in: "email",
    });
    expect(emailError).toBeNull();

    const { data: rows } = await admin
      .from("gamer_profiles")
      .select("user_id, sign_in")
      .in("user_id", [byDefault.id, byEmail.id]);

    const modes = Object.fromEntries(
      (rows ?? []).map((row) => [row.user_id, row.sign_in]),
    );
    expect(modes[byDefault.id]).toBe("parent");
    expect(modes[byEmail.id]).toBe("email");
  });

  it("promotes the profile, swaps extension tables, and links the parent", async () => {
    const parent = await createParentUser("cg-parent@test.local");
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
    const parent = await createParentUser("cg-mc-parent@test.local");
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
    const parent = await createParentUser("cg-share-parent@test.local");
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

  it("links an optional Roblox account in the same transaction", async () => {
    const parent = await createParentUser("cg-rbx-parent@test.local");
    const gamer = await createCustomerUser("cg-rbx-child@test.local");

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: parent.id,
      p_first_name: "Max",
      p_last_name: "Parentson",
      p_date_of_birth: "2014-01-20",
      p_roblox_username: "MaxBlox",
      // Past 2^31, so this also pins that the column is bigint rather than
      // integer — Roblox ids are int64 and an integer column would start
      // refusing real accounts years from now with no warning.
      p_roblox_user_id: 8_589_934_592,
    });
    expect(error).toBeNull();

    const { data: roblox } = await admin
      .from("roblox_accounts")
      .select("roblox_username, roblox_user_id")
      .eq("user_id", gamer.id)
      .single();
    expect(roblox).toMatchObject({
      roblox_username: "MaxBlox",
      roblox_user_id: 8_589_934_592,
    });
  });

  it("links both platforms, or neither, independently", async () => {
    const parent = await createParentUser("cg-both-parent@test.local");
    const both = await createCustomerUser("cg-both-child@test.local");
    const neither = await createCustomerUser("cg-neither-child@test.local");

    const { error: bothError } = await admin.rpc("create_gamer", {
      p_gamer_id: both.id,
      p_parent_id: parent.id,
      p_first_name: "Both",
      p_last_name: "Parentson",
      p_date_of_birth: "2014-01-20",
      p_minecraft_username: "BothCraft",
      p_minecraft_uuid: "cg-uuid-both",
      p_roblox_username: "BothBlox",
      p_roblox_user_id: 4242,
    });
    expect(bothError).toBeNull();

    const { error: neitherError } = await admin.rpc("create_gamer", {
      p_gamer_id: neither.id,
      p_parent_id: parent.id,
      p_first_name: "Neither",
      p_last_name: "Parentson",
      p_date_of_birth: "2014-01-20",
    });
    expect(neitherError).toBeNull();

    const { data: bothMc } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", both.id)
      .maybeSingle();
    const { data: bothRoblox } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", both.id)
      .maybeSingle();
    expect(bothMc).not.toBeNull();
    expect(bothRoblox).not.toBeNull();

    // A child with no game handles gets no rows at all, on either platform —
    // an empty row would be indistinguishable from a cleared one.
    const { data: neitherMc } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", neither.id)
      .maybeSingle();
    const { data: neitherRoblox } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", neither.id)
      .maybeSingle();
    expect(neitherMc).toBeNull();
    expect(neitherRoblox).toBeNull();
  });

  it("links a Roblox account another user already holds", async () => {
    // Born without a UNIQUE, for the reason 00135 dropped Minecraft's: siblings
    // sharing one game account across two Sogverse accounts is supported.
    const parent = await createParentUser("cg-rbx-share-parent@test.local");
    const first = await createCustomerUser("cg-rbx-share-1@test.local");
    const second = await createCustomerUser("cg-rbx-share-2@test.local");

    const sharedId = 68306362;

    for (const [gamer, name] of [[first, "Elder"], [second, "Younger"]] as const) {
      const { error } = await admin.rpc("create_gamer", {
        p_gamer_id: gamer.id,
        p_parent_id: parent.id,
        p_first_name: name,
        p_last_name: "Parentson",
        p_date_of_birth: "2014-01-20",
        p_roblox_username: "SharedBlox",
        p_roblox_user_id: sharedId,
      });
      expect(error).toBeNull();
    }

    const { data: holders } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("roblox_user_id", sharedId);

    expect(holders?.map((r) => r.user_id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("rolls back the entire promotion when a later statement fails", async () => {
    const gamer = await createCustomerUser("cg-rb-child@test.local");

    // A PIN-carrying account that is NOT a customer. It has to be built rather
    // than taken from the seed: the seeded gedu would now be refused by the PIN
    // guard on the FIRST statement (no customer_profiles row, so no pin_hash),
    // which is a refusal before anything is written and therefore proves
    // nothing about rollback. This account passes that guard and then trips
    // validate_parent_gamer_on_insert at the RPC's *last* statement — after the
    // profile was promoted, the extension rows swapped, and both game rows
    // written. That is the mid-flight failure this case is about.
    const impostor = await createParentUser("cg-rb-parent@test.local");
    await admin.from("profiles").update({ role: "gedu" }).eq("id", impostor.id);

    const { error } = await admin.rpc("create_gamer", {
      p_gamer_id: gamer.id,
      p_parent_id: impostor.id,
      p_first_name: "Doomed",
      p_last_name: "Parentson",
      p_date_of_birth: "2016-03-03",
      p_minecraft_username: "DoomedCraft",
      p_minecraft_uuid: "cg-uuid-doomed",
      p_roblox_username: "DoomedBlox",
      p_roblox_user_id: 777,
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

    // The two game-account inserts are the statements immediately before the
    // one that failed, so their absence is what proves the abort rolled back
    // real work.
    const { data: mcRow } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(mcRow).toBeNull();

    const { data: robloxRow } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", gamer.id)
      .maybeSingle();
    expect(robloxRow).toBeNull();

    const { data: link } = await admin
      .from("parent_gamer")
      .select("gamer_id")
      .eq("gamer_id", gamer.id)
      .maybeSingle();
    expect(link).toBeNull();
  });

  it("refuses to re-promote a profile that is no longer a customer (00114 guard)", async () => {
    const parent = await createParentUser("cg-guard-parent@test.local");
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
