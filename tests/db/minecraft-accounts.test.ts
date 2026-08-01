import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

describe("minecraft_accounts RLS", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    // Create test minecraft accounts (not seeded — this test owns its own data)
    await admin.from("minecraft_accounts").upsert([
      { user_id: TEST_IDS.GEDU, minecraft_username: SEED.MINECRAFT_USERNAME_GEDU },
      { user_id: TEST_IDS.GAMER, minecraft_username: SEED.MINECRAFT_USERNAME_GAMER },
    ], { onConflict: "user_id" });
  });

  afterAll(async () => {
    await admin
      .from("minecraft_accounts")
      .delete()
      .in("user_id", [TEST_IDS.GEDU, TEST_IDS.GAMER]);
  });

  // -- Read own account --

  it("gamer can read own minecraft account", async () => {
    const { data, error } = await gamerClient
      .from("minecraft_accounts")
      .select("user_id, minecraft_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(error).toBeNull();
    expect(data!.minecraft_username).toBe(SEED.MINECRAFT_USERNAME_GAMER);
  });

  it("gedu can read own minecraft account", async () => {
    const { data, error } = await geduClient
      .from("minecraft_accounts")
      .select("user_id, minecraft_username")
      .eq("user_id", TEST_IDS.GEDU)
      .single();

    expect(error).toBeNull();
    expect(data!.minecraft_username).toBe(SEED.MINECRAFT_USERNAME_GEDU);
  });

  // -- Cross-user isolation --

  it("gamer cannot read gedu's minecraft account", async () => {
    const { data } = await gamerClient
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GEDU);

    expect(data).toEqual([]);
  });

  it("gedu cannot read gamer's minecraft account", async () => {
    const { data } = await geduClient
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER);

    expect(data).toEqual([]);
  });

  // -- Parent can read linked gamer's account --

  it("linked parent can read gamer's minecraft account", async () => {
    const { data, error } = await customerClient
      .from("minecraft_accounts")
      .select("user_id, minecraft_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(error).toBeNull();
    expect(data!.minecraft_username).toBe(SEED.MINECRAFT_USERNAME_GAMER);
  });

  it("unlinked parent cannot read gamer's minecraft account", async () => {
    const { data } = await customer2Client
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER);

    expect(data).toEqual([]);
  });

  // -- Admin full access --

  it("admin can read all minecraft accounts", async () => {
    const { data, error } = await adminClient
      .from("minecraft_accounts")
      .select("user_id")
      .in("user_id", [TEST_IDS.GAMER, TEST_IDS.GEDU]);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  // -- Two accounts may share one Minecraft account --
  //
  // minecraft_uuid carried a UNIQUE constraint until it was dropped. It forbade
  // the case it was most often met with — siblings sharing one Minecraft account
  // from two Sogverse accounts — while never answering the question that made
  // uniqueness sound useful in the first place (which of them is playing).

  it("allows two users to hold the same minecraft_uuid", async () => {
    const sharedUuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";

    try {
      const { error: gamerError } = await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: sharedUuid })
        .eq("user_id", TEST_IDS.GAMER);

      const { error: geduError } = await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: sharedUuid })
        .eq("user_id", TEST_IDS.GEDU);

      expect(gamerError).toBeNull();
      expect(geduError).toBeNull();

      // Both rows really carry it — a reverse lookup by uuid returns a set, not
      // a row, which is what a rebuilt join check has to be written against.
      const { data } = await admin
        .from("minecraft_accounts")
        .select("user_id")
        .eq("minecraft_uuid", sharedUuid);

      expect(data?.map((r) => r.user_id).sort()).toEqual(
        [TEST_IDS.GAMER, TEST_IDS.GEDU].sort(),
      );
    } finally {
      // Reset both to NULL even if assertions fail
      await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: null })
        .in("user_id", [TEST_IDS.GAMER, TEST_IDS.GEDU]);
    }
  });

  // -- Writes: own row yes, anyone else's no, DELETE nobody --
  //
  // Phase 3 of the DB authorization refactor moved the account-linking route off
  // the service-role client, which meant granting INSERT/UPDATE and adding the
  // two self-write policies. What was previously "authenticated cannot write
  // this table at all" is now "authenticated can write exactly their own row".

  it("gamer can update own minecraft account", async () => {
    const { error } = await gamerClient
      .from("minecraft_accounts")
      .update({ minecraft_username: "OwnEdit" })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();

    const { data } = await admin
      .from("minecraft_accounts")
      .select("minecraft_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data!.minecraft_username).toBe("OwnEdit");

    await admin
      .from("minecraft_accounts")
      .update({ minecraft_username: SEED.MINECRAFT_USERNAME_GAMER })
      .eq("user_id", TEST_IDS.GAMER);
  });

  it("gamer cannot insert a row for another user", async () => {
    // The INSERT policy's WITH CHECK derives the target from auth.uid(), so a
    // gamer naming the gedu's id is refused rather than silently re-pointed.
    const { error } = await gamerClient
      .from("minecraft_accounts")
      .insert({ user_id: TEST_IDS.ADMIN, minecraft_username: "Hacker" });

    expect(error).not.toBeNull();

    const { data } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.ADMIN);

    expect(data).toEqual([]);
  });

  it("linked parent cannot update their gamer's minecraft account", async () => {
    // The parent may READ this row (policy above). Write access does not follow
    // from read access — the parent-facing edit path goes through the gamers
    // route, not a direct table write.
    await customerClient
      .from("minecraft_accounts")
      .update({ minecraft_username: "Hacked" })
      .eq("user_id", TEST_IDS.GAMER);

    const { data } = await admin
      .from("minecraft_accounts")
      .select("minecraft_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data!.minecraft_username).toBe(SEED.MINECRAFT_USERNAME_GAMER);
  });

  it("gamer cannot delete own minecraft account directly", async () => {
    await gamerClient
      .from("minecraft_accounts")
      .delete()
      .eq("user_id", TEST_IDS.GAMER);

    // Verify it still exists
    const { data } = await admin
      .from("minecraft_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data).not.toBeNull();
  });
});
