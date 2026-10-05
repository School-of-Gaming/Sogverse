import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `set_gedu_badge` and the `gedu_badges` table behind it.
 *
 * A row means the gedu holds that badge; revoking deletes it. Granting stamps
 * the moment and the acting admin server-side, and granting a badge already
 * held keeps the original stamp. Reads: an admin reads every row, a gedu their
 * own, and nobody else any.
 *
 * **Its own fixtures, not the seeded gedu**, so no other file sees a badge come
 * and go. Two throwaway gedus: the subject every grant is about, and a
 * bystander whose badge the subject must not be able to read. The subject signs
 * in with the password it was created with.
 *
 * The role matrix for the RPC is the authorization spine's job; the negative
 * case kept here is the gedu the badge is about.
 */

/** The nil UUID: no account has ever carried it. */
const NO_SUCH_PROFILE = "00000000-0000-0000-0000-000000000000";
const PASSWORD = "testpassword123";

describe("gedu badges", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let subject: SupabaseClient<Database>;

  let subjectId: string | null = null;
  let bystanderId: string | null = null;

  async function createGedu(label: string): Promise<{ id: string; email: string }> {
    const email = `gedu-badge-${label}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: "Badge", last_name: label },
    });
    expect(error).toBeNull();
    const userId = data.user!.id;

    const promoted = await admin.from("profiles").update({ role: "gedu" }).eq("id", userId);
    expect(promoted.error).toBeNull();
    await admin.from("customer_profiles").delete().eq("user_id", userId);

    const seeded = await admin.from("gedu_profiles").insert({ user_id: userId });
    expect(seeded.error).toBeNull();

    return { id: userId, email };
  }

  async function badgeRows(geduId: string) {
    const { data, error } = await admin
      .from("gedu_badges")
      .select("badge, granted_at, granted_by")
      .eq("gedu_id", geduId);
    expect(error).toBeNull();
    return data!;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    const s = await createGedu("subject");
    subjectId = s.id;
    bystanderId = (await createGedu("bystander")).id;
    subject = await createAuthenticatedClient(s.email, PASSWORD);
  });

  afterAll(async () => {
    // The badge rows cascade with the gedu_profiles rows, which cascade with
    // the accounts.
    if (subjectId) await admin.auth.admin.deleteUser(subjectId);
    if (bystanderId) await admin.auth.admin.deleteUser(bystanderId);
  });

  describe("granting and revoking", () => {
    it("stamps the moment and the admin when an admin grants a badge", async () => {
      const before = Date.now();
      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: subjectId!,
        p_badge: "neuroinclusive",
        p_held: true,
      });
      expect(error).toBeNull();

      const rows = await badgeRows(subjectId!);
      expect(rows).toHaveLength(1);
      expect(rows[0].badge).toBe("neuroinclusive");
      expect(rows[0].granted_by).toBe(TEST_IDS.ADMIN);
      expect(Date.parse(rows[0].granted_at)).toBeGreaterThanOrEqual(before - 60_000);
    });

    it("keeps the original stamp when a held badge is granted again", async () => {
      const [first] = await badgeRows(subjectId!);

      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: subjectId!,
        p_badge: "neuroinclusive",
        p_held: true,
      });
      expect(error).toBeNull();

      const rows = await badgeRows(subjectId!);
      expect(rows).toHaveLength(1);
      expect(rows[0].granted_at).toBe(first.granted_at);
    });

    it("deletes the row when an admin revokes the badge", async () => {
      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: subjectId!,
        p_badge: "neuroinclusive",
        p_held: false,
      });
      expect(error).toBeNull();
      expect(await badgeRows(subjectId!)).toHaveLength(0);
    });

    it("accepts revoking a badge that is not held", async () => {
      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: subjectId!,
        p_badge: "flagship",
        p_held: false,
      });
      expect(error).toBeNull();
      expect(await badgeRows(subjectId!)).toHaveLength(0);
    });
  });

  describe("who may grant, and to whom", () => {
    it("refuses the gedu the badge would be about", async () => {
      const { error } = await subject.rpc("set_gedu_badge", {
        p_gedu_id: subjectId!,
        p_badge: "flagship",
        p_held: true,
      });
      expect(error?.code).toBe("42501");
      expect(await badgeRows(subjectId!)).toHaveLength(0);
    });

    it("refuses a target who is not a gedu", async () => {
      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: TEST_IDS.CUSTOMER,
        p_badge: "flagship",
        p_held: true,
      });
      expect(error?.code).toBe("P0001");
    });

    it("refuses a target that is not an account at all", async () => {
      const { error } = await adminUser.rpc("set_gedu_badge", {
        p_gedu_id: NO_SUCH_PROFILE,
        p_badge: "flagship",
        p_held: true,
      });
      expect(error?.code).toBe("P0001");
    });

    it("refuses a gedu's direct insert of their own badge", async () => {
      // Closed at the grant layer: authenticated holds SELECT alone.
      const { error } = await subject
        .from("gedu_badges")
        .insert({ gedu_id: subjectId!, badge: "flagship" });
      expect(error).not.toBeNull();
      expect(await badgeRows(subjectId!)).toHaveLength(0);
    });
  });

  describe("who reads which badges", () => {
    beforeAll(async () => {
      for (const geduId of [subjectId!, bystanderId!]) {
        const { error } = await adminUser.rpc("set_gedu_badge", {
          p_gedu_id: geduId,
          p_badge: "flagship",
          p_held: true,
        });
        expect(error).toBeNull();
      }
    });

    it("lets an admin read every gedu's badges", async () => {
      const { data, error } = await adminUser
        .from("gedu_badges")
        .select("gedu_id")
        .in("gedu_id", [subjectId!, bystanderId!]);
      expect(error).toBeNull();
      expect(new Set(data!.map((r) => r.gedu_id))).toEqual(
        new Set([subjectId, bystanderId]),
      );
    });

    it("lets a gedu read their own badges and nobody else's", async () => {
      const { data, error } = await subject.from("gedu_badges").select("gedu_id, badge");
      expect(error).toBeNull();
      expect(data).toEqual([{ gedu_id: subjectId, badge: "flagship" }]);
    });

    it.each([
      ["parent", TEST_CREDENTIALS.CUSTOMER],
      ["gamer", TEST_CREDENTIALS.GAMER],
    ] as const)("lets a %s read none", async (_label, credentials) => {
      const client = await createAuthenticatedClient(
        credentials.email,
        credentials.password,
      );
      const { data, error } = await client.from("gedu_badges").select("gedu_id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
});
