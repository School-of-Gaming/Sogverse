import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

/**
 * roblox_accounts RLS — the same five questions minecraft_accounts answers,
 * asked of the table that arrived after it.
 *
 * The reason this is its own file rather than a parameterised sweep over both
 * tables: the two are meant to be the same shape, and a shared loop would pass
 * for either of them being right. Written out, a divergence in one platform's
 * policies shows up as a failing assertion about that platform.
 */
describe("roblox_accounts RLS", () => {
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

    // Not seeded — this test owns its own data.
    await admin.from("roblox_accounts").upsert(
      [
        { user_id: TEST_IDS.GEDU, roblox_username: SEED.ROBLOX_USERNAME_GEDU },
        { user_id: TEST_IDS.GAMER, roblox_username: SEED.ROBLOX_USERNAME_GAMER },
      ],
      { onConflict: "user_id" },
    );
  });

  afterAll(async () => {
    await admin
      .from("roblox_accounts")
      .delete()
      .in("user_id", [TEST_IDS.GEDU, TEST_IDS.GAMER]);
  });

  // -- Read own account --

  it("gamer can read own roblox account", async () => {
    const { data, error } = await gamerClient
      .from("roblox_accounts")
      .select("user_id, roblox_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(error).toBeNull();
    expect(data!.roblox_username).toBe(SEED.ROBLOX_USERNAME_GAMER);
  });

  it("gedu can read own roblox account", async () => {
    const { data, error } = await geduClient
      .from("roblox_accounts")
      .select("user_id, roblox_username")
      .eq("user_id", TEST_IDS.GEDU)
      .single();

    expect(error).toBeNull();
    expect(data!.roblox_username).toBe(SEED.ROBLOX_USERNAME_GEDU);
  });

  // -- Cross-user isolation --

  it("gamer cannot read gedu's roblox account", async () => {
    const { data } = await gamerClient
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GEDU);

    expect(data).toEqual([]);
  });

  it("gedu cannot read gamer's roblox account", async () => {
    const { data } = await geduClient
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER);

    expect(data).toEqual([]);
  });

  // -- Parent can read linked gamer's account --

  it("linked parent can read gamer's roblox account", async () => {
    const { data, error } = await customerClient
      .from("roblox_accounts")
      .select("user_id, roblox_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(error).toBeNull();
    expect(data!.roblox_username).toBe(SEED.ROBLOX_USERNAME_GAMER);
  });

  it("unlinked parent cannot read gamer's roblox account", async () => {
    const { data } = await customer2Client
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER);

    expect(data).toEqual([]);
  });

  // -- Admin full access --

  it("admin can read all roblox accounts", async () => {
    const { data, error } = await adminClient
      .from("roblox_accounts")
      .select("user_id")
      .in("user_id", [TEST_IDS.GAMER, TEST_IDS.GEDU]);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  // -- Admin writes anyone's row --
  //
  // The admin user page edits these in place, on the admin's OWN user-bound
  // client — no service-role anywhere in that path. So `admin_full_access_*`
  // being a `FOR ALL` policy is not decoration: it is the only thing permitting
  // the write, and if it were ever narrowed to SELECT the feature would fail
  // closed with nothing else to catch it.

  it("admin can update another user's roblox account", async () => {
    const { error } = await adminClient
      .from("roblox_accounts")
      .update({ roblox_username: "AdminFixed", roblox_user_id: 156 })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();

    const { data } = await admin
      .from("roblox_accounts")
      .select("roblox_username, roblox_user_id")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data).toMatchObject({
      roblox_username: "AdminFixed",
      roblox_user_id: 156,
    });

    await admin
      .from("roblox_accounts")
      .update({
        roblox_username: SEED.ROBLOX_USERNAME_GAMER,
        roblox_user_id: null,
      })
      .eq("user_id", TEST_IDS.GAMER);
  });

  it("admin can insert a roblox account for a user who has none", async () => {
    // The route upserts, so the first save for an account that never had a
    // handle is an INSERT naming somebody else's id — the statement the
    // self-write WITH CHECK refuses and the admin policy has to allow.
    await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER_2);

    try {
      const { error } = await adminClient
        .from("roblox_accounts")
        .insert({ user_id: TEST_IDS.GAMER_2, roblox_username: "AdminAdded" });

      expect(error).toBeNull();

      const { data } = await admin
        .from("roblox_accounts")
        .select("roblox_username")
        .eq("user_id", TEST_IDS.GAMER_2)
        .single();

      expect(data!.roblox_username).toBe("AdminAdded");
    } finally {
      await admin
        .from("roblox_accounts")
        .delete()
        .eq("user_id", TEST_IDS.GAMER_2);
    }
  });

  it("admin still cannot delete a roblox account — there is no grant", async () => {
    // Unlinking clears the columns; the row itself only ever goes with the
    // profile. The admin policy is `FOR ALL`, so this is the *grant* refusing,
    // which is a stronger guarantee than a policy and worth pinning separately.
    const { error } = await adminClient
      .from("roblox_accounts")
      .delete()
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).not.toBeNull();

    const { data } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER)
      .maybeSingle();

    expect(data).not.toBeNull();
  });

  // -- Two accounts may share one Roblox account --
  //
  // The column is born without a UNIQUE for the reason 00135 dropped Minecraft's:
  // siblings sharing one game account from two Sogverse accounts is a reasonable
  // thing for a family to do, and a constraint here would forbid it outright
  // while never answering the question that makes uniqueness sound useful (which
  // of them is playing).

  it("allows two users to hold the same roblox_user_id", async () => {
    const sharedId = 68306362;

    try {
      const { error: gamerError } = await admin
        .from("roblox_accounts")
        .update({ roblox_user_id: sharedId })
        .eq("user_id", TEST_IDS.GAMER);

      const { error: geduError } = await admin
        .from("roblox_accounts")
        .update({ roblox_user_id: sharedId })
        .eq("user_id", TEST_IDS.GEDU);

      expect(gamerError).toBeNull();
      expect(geduError).toBeNull();

      const { data } = await admin
        .from("roblox_accounts")
        .select("user_id")
        .eq("roblox_user_id", sharedId);

      expect(data?.map((r) => r.user_id).sort()).toEqual(
        [TEST_IDS.GAMER, TEST_IDS.GEDU].sort(),
      );
    } finally {
      await admin
        .from("roblox_accounts")
        .update({ roblox_user_id: null })
        .in("user_id", [TEST_IDS.GAMER, TEST_IDS.GEDU]);
    }
  });

  it("stores an account id past the 32-bit range", async () => {
    // The column is bigint because Roblox ids are int64. An `integer` column
    // would take today's ids and start refusing them at 2^31, which is the kind
    // of failure that arrives years later with no warning.
    const bigId = 8_589_934_592; // 2^33

    try {
      const { error } = await admin
        .from("roblox_accounts")
        .update({ roblox_user_id: bigId })
        .eq("user_id", TEST_IDS.GAMER);

      expect(error).toBeNull();

      const { data } = await admin
        .from("roblox_accounts")
        .select("roblox_user_id")
        .eq("user_id", TEST_IDS.GAMER)
        .single();

      expect(data!.roblox_user_id).toBe(bigId);
    } finally {
      await admin
        .from("roblox_accounts")
        .update({ roblox_user_id: null })
        .eq("user_id", TEST_IDS.GAMER);
    }
  });

  // -- Writes: own row yes, anyone else's no, DELETE nobody --

  it("gamer can update own roblox account", async () => {
    const { error } = await gamerClient
      .from("roblox_accounts")
      .update({ roblox_username: "OwnEdit" })
      .eq("user_id", TEST_IDS.GAMER);

    expect(error).toBeNull();

    const { data } = await admin
      .from("roblox_accounts")
      .select("roblox_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data!.roblox_username).toBe("OwnEdit");

    await admin
      .from("roblox_accounts")
      .update({ roblox_username: SEED.ROBLOX_USERNAME_GAMER })
      .eq("user_id", TEST_IDS.GAMER);
  });

  it("gamer cannot insert a row for another user", async () => {
    // The INSERT policy's WITH CHECK derives the target from auth.uid(), so a
    // gamer naming the admin's id is refused rather than silently re-pointed.
    const { error } = await gamerClient
      .from("roblox_accounts")
      .insert({ user_id: TEST_IDS.ADMIN, roblox_username: "Hacker" });

    expect(error).not.toBeNull();

    const { data } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.ADMIN);

    expect(data).toEqual([]);
  });

  it("linked parent cannot update their gamer's roblox account", async () => {
    // The parent may READ this row (policy above). Write access does not follow
    // from read access — the parent-facing edit path goes through the gamers
    // route, not a direct table write.
    await customerClient
      .from("roblox_accounts")
      .update({ roblox_username: "Hacked" })
      .eq("user_id", TEST_IDS.GAMER);

    const { data } = await admin
      .from("roblox_accounts")
      .select("roblox_username")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data!.roblox_username).toBe(SEED.ROBLOX_USERNAME_GAMER);
  });

  it("gamer cannot delete own roblox account directly", async () => {
    await gamerClient
      .from("roblox_accounts")
      .delete()
      .eq("user_id", TEST_IDS.GAMER);

    const { data } = await admin
      .from("roblox_accounts")
      .select("user_id")
      .eq("user_id", TEST_IDS.GAMER)
      .single();

    expect(data).not.toBeNull();
  });
});
