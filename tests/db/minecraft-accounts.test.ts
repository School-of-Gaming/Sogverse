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

  // -- UNIQUE constraint on minecraft_uuid --

  it("rejects duplicate minecraft_uuid across users", async () => {
    const sharedUuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";

    try {
      // Set a UUID on the gamer's account
      await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: sharedUuid })
        .eq("user_id", TEST_IDS.GAMER);

      // Try to set the same UUID on the gedu's account — should fail
      const { error } = await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: sharedUuid })
        .eq("user_id", TEST_IDS.GEDU);

      expect(error).not.toBeNull();
      expect(error!.message).toContain("minecraft_accounts_uuid_unique");
    } finally {
      // Reset both to NULL even if assertions fail
      await admin
        .from("minecraft_accounts")
        .update({ minecraft_uuid: null })
        .in("user_id", [TEST_IDS.GAMER, TEST_IDS.GEDU]);
    }
  });

  it("allows multiple users with NULL minecraft_uuid", async () => {
    // Both test accounts have NULL uuid — verify they coexist
    const { data, error } = await admin
      .from("minecraft_accounts")
      .select("user_id, minecraft_uuid")
      .is("minecraft_uuid", null);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  // -- Write restrictions (no INSERT/UPDATE/DELETE grants for authenticated) --

  it("gamer cannot insert a minecraft account directly", async () => {
    const { error } = await gamerClient
      .from("minecraft_accounts")
      .insert({
        user_id: TEST_IDS.GAMER,
        minecraft_username: "Hacker",
      });

    expect(error).not.toBeNull();
  });

  it("gamer cannot update own minecraft account directly", async () => {
    // RLS would allow reading but the table-level GRANT only has SELECT
    await gamerClient
      .from("minecraft_accounts")
      .update({ minecraft_username: "Hacked" })
      .eq("user_id", TEST_IDS.GAMER);

    // Verify it wasn't changed
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
