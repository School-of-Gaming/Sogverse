import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { adminDashboardSnapshot } from "@/services/admin-dashboard/admin-dashboard.contracts";

/**
 * `set_gedu_criminal_record_check` and the three columns behind it (00213).
 *
 * The feature records one fact and is forbidden by law from recording any
 * other: an admin saw an acceptable criminal record extract (rikostaustaote),
 * and when. The document is obtained by the educator and never reaches us, so
 * everything below tests the *record* rather than any content — that the audit
 * pair is stamped by the server, that withdrawing the check clears it, that the
 * stamp and the flag cannot be made to disagree (00214's CHECK), and that
 * nobody but an admin, calling the RPC, can write any of it.
 *
 * **Its own fixtures, not the seeded gedu.** The columns are ordinary columns on
 * a row other files also read, and a set/unset cycle on the shared educator
 * would be visible to anything running beside this file. Two throwaway gedus
 * cost one `createUser` each and make every assertion here a claim about a row
 * only this file touches.
 *
 * **The role matrix is deliberately thin.** The authorization spine signs in as
 * every role this RPC does not name and requires 42501 from its first statement,
 * from a registry that fails the build if the function is left unclassified. The
 * one negative case kept here is the gedu — the person the record is *about*,
 * and therefore the one caller whose refusal is worth reading in this file.
 */

/**
 * A profiles id that cannot exist: the nil UUID has neither the version nor the
 * variant bits `gen_random_uuid()` sets, so no account has ever carried it.
 * Guessing an "obviously unused" plausible id is what CI's combined
 * migration+seed database punishes.
 */
const NO_SUCH_PROFILE = "00000000-0000-0000-0000-000000000000";

describe("gedu criminal record check", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;

  /** The educator every set/unset assertion below is about. */
  let subjectGeduId: string | null = null;
  /** Uncertified and checked, so the certification queue has something to say. */
  let queuedGeduId: string | null = null;

  async function checkRow(userId: string) {
    const { data, error } = await admin
      .from("gedu_profiles")
      .select(
        "criminal_record_check_passed, criminal_record_check_at, criminal_record_check_by",
      )
      .eq("user_id", userId)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  async function createGedu(label: string): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `gedu-crc-${label}-${Date.now()}@test.local`,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Crc", last_name: label },
    });
    expect(error).toBeNull();
    const userId = data.user!.id;

    const promoted = await admin
      .from("profiles")
      .update({ role: "gedu" })
      .eq("id", userId);
    expect(promoted.error).toBeNull();
    await admin.from("customer_profiles").delete().eq("user_id", userId);

    const seeded = await admin
      .from("gedu_profiles")
      .insert({ user_id: userId, certified: false });
    expect(seeded.error).toBeNull();

    return userId;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    subjectGeduId = await createGedu("subject");
    queuedGeduId = await createGedu("queued");
  });

  afterAll(async () => {
    // The gedu_profiles rows cascade with the accounts.
    if (subjectGeduId) await admin.auth.admin.deleteUser(subjectGeduId);
    if (queuedGeduId) await admin.auth.admin.deleteUser(queuedGeduId);
  });

  describe("recording the check", () => {
    it("starts every educator unchecked, with nothing stamped", async () => {
      // The default is what makes "nobody has recorded this yet" and "recorded
      // as not passing" one state rather than two, and it is what every gedu
      // that predates the migration reads as.
      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
      expect(row.criminal_record_check_at).toBeNull();
      expect(row.criminal_record_check_by).toBeNull();
    });

    it("stamps the moment and the admin when an admin records it", async () => {
      const before = Date.now();
      const { error } = await adminUser.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: subjectGeduId!,
        p_passed: true,
      });
      expect(error).toBeNull();

      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(true);
      // Both halves of the audit pair come from the server: the clock, and the
      // session's own user. Neither was in the call.
      expect(row.criminal_record_check_at).not.toBeNull();
      expect(
        Date.parse(row.criminal_record_check_at!),
      ).toBeGreaterThanOrEqual(before - 60_000);
      expect(row.criminal_record_check_by).toBe(TEST_IDS.ADMIN);
    });

    it("clears both stamps when the check is withdrawn", async () => {
      const { error } = await adminUser.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: subjectGeduId!,
        p_passed: false,
      });
      expect(error).toBeNull();

      // A moment left behind a withdrawn check would be a record of nothing,
      // and it would break the invariant the dashboard leans on: the stamp is
      // non-null exactly when the flag is true.
      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
      expect(row.criminal_record_check_at).toBeNull();
      expect(row.criminal_record_check_by).toBeNull();
    });
  });

  describe("who may record it, and about whom", () => {
    it("refuses the educator the record is about", async () => {
      const { error } = await gedu.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: subjectGeduId!,
        p_passed: true,
      });
      expect(error?.code).toBe("42501");

      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
    });

    it("refuses a target that is not an account at all", async () => {
      const { error } = await adminUser.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: NO_SUCH_PROFILE,
        p_passed: true,
      });
      // The same refusal a non-gedu target gets, because it is the same
      // question: the RPC writes an educator's record, and there is no educator
      // here. Raised rather than silently updating zero rows.
      expect(error?.code).toBe("P0001");
    });

    it("refuses a target who is not a gedu", async () => {
      const { error } = await adminUser.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: TEST_IDS.CUSTOMER,
        p_passed: true,
      });
      expect(error?.code).toBe("P0001");
    });
  });

  describe("the RPC is the only way in", () => {
    it("refuses a gedu's direct update of their own record", async () => {
      // Forging the record is the attack this closes, and it is closed at the
      // grant layer: gedu_profiles carries no write grant for any Data API
      // role, so no policy has to be trusted to get it right.
      const { error } = await gedu
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: true,
          criminal_record_check_at: new Date().toISOString(),
          criminal_record_check_by: TEST_IDS.ADMIN,
        })
        .eq("user_id", TEST_IDS.GEDU);
      expect(error).not.toBeNull();

      const row = await checkRow(TEST_IDS.GEDU);
      expect(row.criminal_record_check_passed).toBe(false);
    });

    it("refuses a gedu's insert of a record for somebody else", async () => {
      const { error } = await gedu.from("gedu_profiles").insert({
        user_id: NO_SUCH_PROFILE,
        criminal_record_check_passed: true,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("the stamp and the flag cannot disagree", () => {
    /**
     * The invariant the RPC maintains, enforced by a CHECK since 00214.
     *
     * Two admin surfaces read different halves of it — the dashboard's
     * certification queue ships only `criminal_record_check_at` and reads NULL
     * as "no check", while the users list reads only
     * `criminal_record_check_passed` — so a disagreeing row would have the two
     * describing one educator differently. Nothing reachable through the app can
     * write it: the table has no Data API write grant and the RPC sets both
     * columns in one statement. These cases go around all of that with the
     * service-role client, which is the only way to aim a write at the
     * constraint itself.
     */
    it("refuses a stamp left behind a false flag", async () => {
      const { error } = await admin
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: false,
          criminal_record_check_at: new Date().toISOString(),
        })
        .eq("user_id", subjectGeduId!);
      // 23514 is check_violation. A moment attached to a check nobody recorded
      // is a record of nothing, and the queue would read it as a recorded check.
      expect(error?.code).toBe("23514");

      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
      expect(row.criminal_record_check_at).toBeNull();
    });

    it("refuses a true flag with no stamp", async () => {
      const { error } = await admin
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: true,
          criminal_record_check_at: null,
        })
        .eq("user_id", subjectGeduId!);
      // The other half: the users list would print the check as recorded while
      // the queue printed it as missing.
      expect(error?.code).toBe("23514");

      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
    });

    it("admits the two states the RPC actually writes", async () => {
      // The constraint has to be an equivalence rather than a one-way ban, so
      // the pair the RPC produces on each side of the toggle still goes in.
      const recorded = await admin
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: true,
          criminal_record_check_at: new Date().toISOString(),
        })
        .eq("user_id", subjectGeduId!);
      expect(recorded.error).toBeNull();

      const withdrawn = await admin
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: false,
          criminal_record_check_at: null,
        })
        .eq("user_id", subjectGeduId!);
      expect(withdrawn.error).toBeNull();

      const row = await checkRow(subjectGeduId!);
      expect(row.criminal_record_check_passed).toBe(false);
      expect(row.criminal_record_check_at).toBeNull();
    });
  });

  describe("the certification queue reports it", () => {
    it("carries the moment for a candidate whose check is recorded, and null for one whose is not", async () => {
      const recorded = await adminUser.rpc("set_gedu_criminal_record_check", {
        p_gedu_id: queuedGeduId!,
        p_passed: true,
      });
      expect(recorded.error).toBeNull();

      // Through the admin's own session: the service-role client has no
      // profiles row, so assert_admin refuses it. The parse is half the point —
      // the contract schema is the wire shape's only definition, and this is
      // where it meets real Postgres.
      const { data, error } = await adminUser.rpc("get_admin_dashboard");
      expect(error).toBeNull();
      const snapshot = adminDashboardSnapshot.parse(data);

      const checked = snapshot.certification_queue.find(
        (g) => g.id === queuedGeduId,
      );
      expect(checked).toBeDefined();
      const stamp = await checkRow(queuedGeduId!);
      // Parsed rather than string-compared: PostgREST and jsonb render a
      // timestamptz with different offsets for the same instant.
      expect(Date.parse(checked!.criminal_record_check_at!)).toBe(
        Date.parse(stamp.criminal_record_check_at!),
      );

      const unchecked = snapshot.certification_queue.find(
        (g) => g.id === subjectGeduId,
      );
      expect(unchecked).toBeDefined();
      expect(unchecked?.criminal_record_check_at).toBeNull();
    });
  });
});
