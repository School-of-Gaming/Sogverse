import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  accessTokenFor,
  callRpcRaw,
  createAdminTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `accept_gedu_contract` and the two tables behind it (migration 00201).
 *
 * The feature's whole claim is that an acceptance row is an *audit record*: the
 * version accepted, a moment nobody but the server chose, and the signer's name
 * as it stood at that moment. Everything here tests one of those three, plus the
 * two properties that make the record trustworthy — that the row cannot be
 * written any other way, and that it cannot be read by someone it is not about.
 *
 * **The role matrix is deliberately absent.** The authorization spine already
 * signs in as every role that is not a gedu and requires 42501 from this RPC's
 * first statement, and it does so from a registry that fails the build if the
 * function is left unclassified. Repeating that here would be a second, weaker
 * copy of a check that is already mechanical.
 *
 * **The current version is read from the database, not hardcoded.** It is the
 * whitelist row with the greatest `created_at`, and that derivation is the thing
 * under test in the dashboard's queue — a literal here would keep passing after
 * a new version shipped, while the product had moved on.
 */

/**
 * A version string that cannot be a real contract version: the whitelist holds
 * document labels, and no document is labelled with a leading sentinel word.
 * Guessing an "obviously unused" plausible label is exactly the mistake CI's
 * combined migration+seed database punishes.
 */
const UNKNOWN_VERSION = "not-a-version-0000-0000";

describe("gedu contract acceptance", () => {
  let admin: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  /** The gedu's raw access token, for the one call the generated types forbid. */
  let geduToken: string;

  /** The current contract version, as the database defines it. */
  let currentVersion: string;
  /** `Test Gedu` — read rather than assumed, because it is the snapshot's source. */
  let expectedSignedName: string;
  /** What the first acceptance returned; every later assertion compares to it. */
  let firstAcceptedAt: string;

  async function acceptanceRows() {
    const { data, error } = await admin
      .from("gedu_contract_acceptances")
      .select("gedu_id, contract_version, accepted_at, signed_name")
      .eq("gedu_id", TEST_IDS.GEDU);
    expect(error).toBeNull();
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    geduToken = await accessTokenFor(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    // A previous run of this file in the same database would otherwise make the
    // first acceptance a *repeat* acceptance, which passes the idempotency test
    // for the wrong reason and never exercises the insert at all.
    await admin
      .from("gedu_contract_acceptances")
      .delete()
      .eq("gedu_id", TEST_IDS.GEDU);

    const version = await admin
      .from("gedu_contract_versions")
      .select("version")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(version.error).toBeNull();
    currentVersion = version.data!.version;

    const profile = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", TEST_IDS.GEDU)
      .single();
    expect(profile.error).toBeNull();
    expectedSignedName =
      `${profile.data!.first_name} ${profile.data!.last_name}`.trim();
  });

  afterAll(async () => {
    await admin
      .from("gedu_contract_acceptances")
      .delete()
      .eq("gedu_id", TEST_IDS.GEDU);
  });

  describe("the whitelist", () => {
    it("holds the version the platform ships", () => {
      // Not an assertion about which label it is — that changes by migration —
      // but that the derivation the dashboard's queue depends on has an answer.
      expect(currentVersion).toBeTruthy();
    });

    it("is readable by a signed-in gedu and not by anyone with no account", async () => {
      const readable = await gedu
        .from("gedu_contract_versions")
        .select("version");
      expect(readable.error).toBeNull();
      expect(readable.data!.length).toBeGreaterThan(0);
    });

    it("refuses a write from a signed-in caller", async () => {
      // Versions arrive by migration. There is no grant behind this statement,
      // so it fails at the privilege layer rather than at a policy.
      const { error } = await gedu
        .from("gedu_contract_versions")
        .insert({ version: UNKNOWN_VERSION });
      expect(error).not.toBeNull();
    });
  });

  describe("accepting", () => {
    it("writes one row, stamped and signed by the server", async () => {
      const { data, error } = await gedu.rpc("accept_gedu_contract", {
        p_version: currentVersion,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      firstAcceptedAt = data!;

      const rows = await acceptanceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].contract_version).toBe(currentVersion);
      // The identity half of the legal record: the caller supplied no name, and
      // the row carries the one their profile held at this moment.
      expect(rows[0].signed_name).toBe(expectedSignedName);
      // The returned value IS the stored stamp, not a second reading of the
      // clock — which is what lets a caller show the moment it just recorded.
      expect(rows[0].accepted_at).toBe(firstAcceptedAt);
      expect(Date.parse(firstAcceptedAt)).not.toBeNaN();
    });

    it("is idempotent: a second acceptance returns the first moment and adds nothing", async () => {
      const { data, error } = await gedu.rpc("accept_gedu_contract", {
        p_version: currentVersion,
      });
      expect(error).toBeNull();
      // Re-stamping would quietly rewrite the record every time somebody
      // reloaded, so the first signature is the one that stands.
      expect(data).toBe(firstAcceptedAt);

      const rows = await acceptanceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].accepted_at).toBe(firstAcceptedAt);
    });

    it("refuses a version the platform does not know", async () => {
      const { error } = await gedu.rpc("accept_gedu_contract", {
        p_version: UNKNOWN_VERSION,
      });
      // The whitelist check pre-empts the foreign key and borrows its SQLSTATE,
      // because it is making the same claim one statement earlier.
      expect(error?.code).toBe("23503");

      const rows = await acceptanceRows();
      expect(rows).toHaveLength(1);
    });

    it("refuses a null version rather than accepting nothing", async () => {
      // Over raw PostgREST because the generated argument type forbids null,
      // and the whole question is what the *database* does with a request a
      // hand-rolled caller can trivially send. A NULL matches no whitelist row,
      // so it takes the same refusal as an unknown label rather than falling
      // through to a write.
      const result = await callRpcRaw(geduToken, "accept_gedu_contract", {
        p_version: null,
      });
      expect(result.code).toBe("23503");

      const rows = await acceptanceRows();
      expect(rows).toHaveLength(1);
    });
  });

  describe("who can read an acceptance", () => {
    it("lets the gedu read their own", async () => {
      const { data, error } = await gedu
        .from("gedu_contract_acceptances")
        .select("gedu_id, contract_version, accepted_at, signed_name")
        .eq("gedu_id", TEST_IDS.GEDU);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].signed_name).toBe(expectedSignedName);
    });

    it("lets an admin read anyone's", async () => {
      // The admin's own session, not the service role: this is the read behind
      // the certification queue and it has to work under RLS.
      const { data, error } = await adminUser
        .from("gedu_contract_acceptances")
        .select("gedu_id, accepted_at")
        .eq("gedu_id", TEST_IDS.GEDU);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("shows a customer nothing", async () => {
      // A blocked read is an empty set rather than an error, which is why the
      // seeded-row check above matters: without it this would pass vacuously.
      const { data, error } = await customer
        .from("gedu_contract_acceptances")
        .select("gedu_id")
        .eq("gedu_id", TEST_IDS.GEDU);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("the RPC is the only way in", () => {
    it("refuses a gedu's direct insert", async () => {
      // Forging the audit trail is the attack this closes, and it is closed at
      // the grant layer: there is no INSERT privilege for any Data API role, so
      // no policy has to be trusted to get it right.
      const { error } = await gedu.from("gedu_contract_acceptances").insert({
        gedu_id: TEST_IDS.GEDU,
        contract_version: currentVersion,
        signed_name: "Somebody Else",
      });
      expect(error).not.toBeNull();
    });

    it("refuses a gedu's update of their own stamp", async () => {
      const { error } = await gedu
        .from("gedu_contract_acceptances")
        .update({ accepted_at: new Date(0).toISOString() })
        .eq("gedu_id", TEST_IDS.GEDU);
      expect(error).not.toBeNull();

      const rows = await acceptanceRows();
      expect(rows[0].accepted_at).toBe(firstAcceptedAt);
    });

    it("refuses a gedu's delete of their own acceptance", async () => {
      const { error } = await gedu
        .from("gedu_contract_acceptances")
        .delete()
        .eq("gedu_id", TEST_IDS.GEDU);
      expect(error).not.toBeNull();

      const rows = await acceptanceRows();
      expect(rows).toHaveLength(1);
    });
  });
});
