import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * Coverage for the gedu self-registration RPCs (migration 00111):
 *   - register_gedu: atomic promotion of a freshly-created customer profile
 *     into a fully-populated, unverified gedu (service_role only).
 *   - set_gedu_verified: admin-only verify / un-verify, stamping the audit
 *     columns server-side.
 */
describe("gedu registration + verification RPCs", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
  });

  afterAll(async () => {
    // Restore the seeded gedu to its verified baseline in case a test flipped
    // it. Through the signed-in admin, not the service-role client: since 00121
    // the RPC's guard refuses a caller with no profiles row.
    await adminClient.rpc("set_gedu_verified", {
      p_gedu_id: TEST_IDS.GEDU,
      p_verified: true,
    });
  });

  describe("register_gedu", () => {
    let createdUserId: string | null = null;
    let gameAccountUserId: string | null = null;

    afterAll(async () => {
      // Cascade-deletes profiles, gedu_profiles, gedu_locations and both
      // game-account rows.
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      if (gameAccountUserId) {
        await admin.auth.admin.deleteUser(gameAccountUserId);
      }
    });

    it("atomically promotes a new customer profile into an unverified gedu", async () => {
      const email = `gedu-reg-${Date.now()}@test.local`;
      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: "testpassword123",
          email_confirm: true,
          user_metadata: { first_name: "Reg", last_name: "Tester" },
        });
      expect(createError).toBeNull();
      createdUserId = created.user!.id;

      const { error: rpcError } = await admin.rpc("register_gedu", {
        p_user_id: createdUserId,
        p_first_name: "Reg",
        p_last_name: "Tester",
        p_locale: "en",
        p_phone: "", // absent → NULLIF → NULL (won't trip the phone CHECK)
        p_spoken_languages: ["en"],
        p_location_ids: [TEST_IDS.LOCATION_REGION],
        p_minecraft_username: "",
        p_minecraft_uuid: "",
        p_roblox_username: "",
        p_roblox_user_id: "",
      });
      expect(rpcError).toBeNull();

      const { data: profile } = await admin
        .from("profiles")
        .select("role, first_name, last_name, phone, spoken_languages")
        .eq("id", createdUserId)
        .single();
      expect(profile?.role).toBe("gedu");
      expect(profile?.first_name).toBe("Reg");
      expect(profile?.phone).toBeNull();
      expect(profile?.spoken_languages).toEqual(["en"]);

      // customer extension swapped for gedu extension, unverified.
      const { data: cust } = await admin
        .from("customer_profiles")
        .select("user_id")
        .eq("user_id", createdUserId)
        .maybeSingle();
      expect(cust).toBeNull();

      const { data: gedu } = await admin
        .from("gedu_profiles")
        .select("verified, verified_at, verified_by")
        .eq("user_id", createdUserId)
        .single();
      expect(gedu?.verified).toBe(false);
      expect(gedu?.verified_at).toBeNull();
      expect(gedu?.verified_by).toBeNull();

      // Coverage rows inserted.
      const { data: locs } = await admin
        .from("gedu_locations")
        .select("location_id")
        .eq("gedu_id", createdUserId);
      expect(locs?.map((l) => l.location_id)).toEqual([
        TEST_IDS.LOCATION_REGION,
      ]);
    });

    it("links both game accounts, NULLIFing the empty-string sentinels", async () => {
      // Every optional text argument this RPC takes uses '' for "absent" — the
      // generated Args types are non-null — and the Roblox account id rides the
      // same convention as text rather than inventing a second one. What this
      // asserts is that the cast on the other side really produces the number.
      const email = `gedu-games-${Date.now()}@test.local`;
      const { data: created } = await admin.auth.admin.createUser({
        email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Games", last_name: "Tester" },
      });
      gameAccountUserId = created.user!.id;

      const { error } = await admin.rpc("register_gedu", {
        p_user_id: gameAccountUserId,
        p_first_name: "Games",
        p_last_name: "Tester",
        p_locale: "en",
        p_phone: "",
        p_spoken_languages: [],
        p_location_ids: [],
        p_minecraft_username: "GeduCraft",
        // Absent → NULL, while the username above is still recorded.
        p_minecraft_uuid: "",
        p_roblox_username: "GeduBlox",
        p_roblox_user_id: "8589934592",
      });
      expect(error).toBeNull();

      const { data: mc } = await admin
        .from("minecraft_accounts")
        .select("minecraft_username, minecraft_uuid")
        .eq("user_id", gameAccountUserId)
        .single();
      expect(mc).toMatchObject({
        minecraft_username: "GeduCraft",
        minecraft_uuid: null,
      });

      const { data: roblox } = await admin
        .from("roblox_accounts")
        .select("roblox_username, roblox_user_id")
        .eq("user_id", gameAccountUserId)
        .single();
      expect(roblox).toMatchObject({
        roblox_username: "GeduBlox",
        // Past 2^31 — the column is bigint, as Roblox's int64 ids require.
        roblox_user_id: 8_589_934_592,
      });
    });

    it("writes no game-account rows when both sentinels are empty", async () => {
      // The educator from the first test gave neither handle. An empty row would
      // be indistinguishable from a cleared one, so there must be no row at all.
      const { data: mc } = await admin
        .from("minecraft_accounts")
        .select("user_id")
        .eq("user_id", createdUserId!)
        .maybeSingle();
      expect(mc).toBeNull();

      const { data: roblox } = await admin
        .from("roblox_accounts")
        .select("user_id")
        .eq("user_id", createdUserId!)
        .maybeSingle();
      expect(roblox).toBeNull();
    });

    it("refuses to operate on a profile that is not a fresh customer", async () => {
      // The seeded gedu is already a gedu — the role guard must reject it.
      const { error } = await admin.rpc("register_gedu", {
        p_user_id: TEST_IDS.GEDU,
        p_first_name: "Nope",
        p_last_name: "Nope",
        p_locale: "en",
        p_phone: "",
        p_spoken_languages: [],
        p_location_ids: [],
        p_minecraft_username: "",
        p_minecraft_uuid: "",
        p_roblox_username: "",
        p_roblox_user_id: "",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("set_gedu_verified", () => {
    it("admin can un-verify then re-verify a gedu, stamping the audit columns", async () => {
      const { error: unverifyError } = await adminClient.rpc(
        "set_gedu_verified",
        { p_gedu_id: TEST_IDS.GEDU, p_verified: false },
      );
      expect(unverifyError).toBeNull();

      const { data: afterUnverify } = await admin
        .from("gedu_profiles")
        .select("verified, verified_at, verified_by")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(afterUnverify?.verified).toBe(false);
      expect(afterUnverify?.verified_at).toBeNull();
      expect(afterUnverify?.verified_by).toBeNull();

      const { error: verifyError } = await adminClient.rpc("set_gedu_verified", {
        p_gedu_id: TEST_IDS.GEDU,
        p_verified: true,
      });
      expect(verifyError).toBeNull();

      const { data: afterVerify } = await admin
        .from("gedu_profiles")
        .select("verified, verified_at, verified_by")
        .eq("user_id", TEST_IDS.GEDU)
        .single();
      expect(afterVerify?.verified).toBe(true);
      expect(afterVerify?.verified_at).not.toBeNull();
      expect(afterVerify?.verified_by).toBe(TEST_IDS.ADMIN);
    });

    it("rejects a non-admin caller with the canonical 42501", async () => {
      // 00121 moved this RPC onto assert_admin(), so its refusal now carries the
      // same forbidden ERRCODE as every other role-gated RPC instead of a
      // generic raise. That is what let the role × RPC matrix pick it up.
      const { error } = await geduClient.rpc("set_gedu_verified", {
        p_gedu_id: TEST_IDS.GEDU,
        p_verified: false,
      });
      expect(error?.code).toBe("42501");
    });
  });
});
