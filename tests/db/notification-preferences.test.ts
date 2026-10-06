import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Notification preferences: `set_notification_preference` (the one writer,
 * admin-only while every kind is an admin's) and the owner-only read policy on
 * `notification_preferences`.
 *
 * No row means off, so the seeded admin starts with nothing and every case
 * begins from that state.
 */

const FORBIDDEN = "42501";
const CHECK_VIOLATION = "23514";
const KIND = "session_report_copy" as const;
const CHANNEL = "email" as const;

describe("notification preferences", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  async function rowOf(profileId: string) {
    const { data, error } = await admin
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", profileId)
      .eq("kind", KIND)
      .eq("channel", CHANNEL)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function reset(): Promise<void> {
    await admin
      .from("notification_preferences")
      .delete()
      .in("profile_id", [
        TEST_IDS.ADMIN,
        TEST_IDS.GEDU,
        TEST_IDS.CUSTOMER,
        TEST_IDS.GAMER,
      ]);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, geduAuth, customerAuth, gamerAuth] = await Promise.all([
      createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
    ]);
  });

  beforeEach(reset);
  afterAll(reset);

  describe("setting a preference", () => {
    it("starts with no row, which is off", async () => {
      expect(await rowOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it("lets an admin turn a kind on for themselves", async () => {
      const { error } = await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      expect(error).toBeNull();
      expect(await rowOf(TEST_IDS.ADMIN)).toMatchObject({ enabled: true });
    });

    it("records turning it off again as an explicit false", async () => {
      await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      const { error } = await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: false,
      });
      expect(error).toBeNull();
      expect(await rowOf(TEST_IDS.ADMIN)).toMatchObject({ enabled: false });
    });

    it("leaves updated_at alone when the answer is already on file", async () => {
      await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      const before = await rowOf(TEST_IDS.ADMIN);
      const { error } = await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      expect(error).toBeNull();
      expect((await rowOf(TEST_IDS.ADMIN))?.updated_at).toBe(before?.updated_at);
    });

    it("refuses a missing answer", async () => {
      const { error } = await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        // @ts-expect-error -- the generated type forbids null; the function must still refuse it
        p_enabled: null,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
      expect(await rowOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it("refuses a missing channel", async () => {
      const { error } = await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        // @ts-expect-error -- the generated type forbids null; the function must still refuse it
        p_channel: null,
        p_enabled: true,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
      expect(await rowOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it.each([
      ["gedu", () => geduAuth, TEST_IDS.GEDU],
      ["customer", () => customerAuth, TEST_IDS.CUSTOMER],
      ["gamer", () => gamerAuth, TEST_IDS.GAMER],
    ] as const)("refuses a %s", async (_role, client, profileId) => {
      const { error } = await client().rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      expect(error?.code).toBe(FORBIDDEN);
      expect(await rowOf(profileId)).toBeNull();
    });
  });

  describe("reading preferences", () => {
    it("shows an admin their own rows and nobody else's", async () => {
      await adminAuth.rpc("set_notification_preference", {
        p_kind: KIND,
        p_channel: CHANNEL,
        p_enabled: true,
      });
      // A row on another profile, written past the setter, stands in for a
      // second admin's answer.
      const { error: seedError } = await admin
        .from("notification_preferences")
        .insert({
          profile_id: TEST_IDS.CUSTOMER,
          kind: KIND,
          channel: CHANNEL,
          enabled: true,
        });
      expect(seedError).toBeNull();

      const { data, error } = await adminAuth
        .from("notification_preferences")
        .select("profile_id, kind, channel, enabled");
      expect(error).toBeNull();
      expect(data).toEqual([
        {
          profile_id: TEST_IDS.ADMIN,
          kind: KIND,
          channel: CHANNEL,
          enabled: true,
        },
      ]);

      const other = await customerAuth
        .from("notification_preferences")
        .select("profile_id");
      expect(other.error).toBeNull();
      expect(other.data).toEqual([
        { profile_id: TEST_IDS.CUSTOMER },
      ]);
    });

    it("gives no Data API role a direct write", async () => {
      const { error } = await adminAuth
        .from("notification_preferences")
        .insert({
          profile_id: TEST_IDS.ADMIN,
          kind: KIND,
          channel: CHANNEL,
          enabled: true,
        });
      expect(error?.code).toBe(FORBIDDEN);
      expect(await rowOf(TEST_IDS.ADMIN)).toBeNull();
    });
  });
});
