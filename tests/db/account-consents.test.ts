import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  callServiceRoleRpcResult,
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * Account-level consents (00249): what an account was opened under, and which
 * text the holder was shown when they opened it.
 *
 * The claims these cases exist to pin, in the order they matter:
 *
 *   * The VERSION is resolved by the function and never supplied by a caller.
 *     A record saying "they accepted the terms" is worth nothing in a dispute;
 *     a record saying "they accepted THIS revision, at this instant" is the
 *     whole point, so the derivation — greatest created_at for the slug — is
 *     asserted against a document that really has two revisions rather than
 *     against the single-version ones the migration seeded.
 *   * A replay writes nothing. The register route's call is not transactional
 *     with the account creation, so a retried request is an ordinary thing to
 *     expect, and the primary key is what makes it harmless.
 *   * Nothing is written on a bad argument. A NULL element in particular is
 *     refused rather than skipped, because `unnest` would quietly contribute
 *     nothing for it and the account would end up with fewer documents on file
 *     than the caller asked for — silently, on a legal record.
 *   * The grant is the whole of its access control, exactly as it is for the
 *     registration marketing writer one system over: the function names its
 *     subject in an argument because no session exists at registration, so a
 *     reachable role could otherwise record an acceptance for anybody.
 *
 * The two documents the migration published are read, never written to, so
 * these cases say nothing that another suite could break by publishing a
 * revision of the terms. The version-derivation case brings its own document.
 */

const TERMS = "terms-and-conditions";
const DECLARATION = "guardian-declaration";

/**
 * A document this suite owns, with two revisions, so the "which version is
 * current" derivation can be asserted against a real choice.
 *
 * The slug is shaped so it cannot collide with a real one: every published
 * document is named after the text it holds, and nothing is ever going to be
 * called this.
 */
const OWN_DOC = "zz-db-test-account-consent-doc";
/**
 * The two revision labels, deliberately sorting the OPPOSITE way to their
 * `created_at` order: the current one is alphabetically first. `created_at` is
 * the ordering key and `version DESC` is only a tiebreaker, so labels that
 * agreed with the timestamps would let a body that ordered by the label alone
 * pass this suite.
 */
const OWN_DOC_OLD = "1999-06-01";
const OWN_DOC_CURRENT = "1999-01-01";

/** PostgreSQL SQLSTATE for check_violation, which the argument gates raise. */
const CHECK_VIOLATION = "23514";
/** The canonical forbidden SQLSTATE a missing grant produces. */
const FORBIDDEN = "42501";

describe("account consents (00249)", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  afterEach(async () => {
    // Acceptances first: a version row is the target of the acceptances'
    // composite foreign key, so deleting the document before them would be
    // refused rather than cascading.
    await admin
      .from("account_consent_acceptances")
      .delete()
      .in("customer_id", [
        TEST_IDS.CUSTOMER,
        TEST_IDS.CUSTOMER_2,
        TEST_IDS.GEDU,
        TEST_IDS.GAMER,
      ]);
    // The document takes its versions with it (ON DELETE CASCADE from 00210).
    await admin.from("consent_documents").delete().eq("slug", OWN_DOC);
  });

  /** Every row on file for one account, as (slug, version) pairs. */
  async function acceptancesFor(
    customerId: string,
  ): Promise<{ document_slug: string; document_version: string }[]> {
    const { data, error } = await admin
      .from("account_consent_acceptances")
      .select("document_slug, document_version")
      .eq("customer_id", customerId)
      .order("document_slug");
    if (error) throw new Error(`reading acceptances failed: ${error.message}`);
    return data;
  }

  function record(
    client: SupabaseClient<Database>,
    slugs: string[],
    // Widened to `string`: the default narrows to the seeded customer's literal
    // type, and several cases here deliberately aim it elsewhere.
    customerId: string = TEST_IDS.CUSTOMER,
  ) {
    return client.rpc("record_account_consents", {
      p_customer_id: customerId,
      p_document_slugs: slugs,
    });
  }

  /** Publishes this suite's own document with two revisions. */
  async function seedOwnDocument(): Promise<void> {
    const { error: docError } = await admin
      .from("consent_documents")
      .insert({ slug: OWN_DOC });
    expect(docError).toBeNull();

    // created_at written explicitly, because it is the ordering key the
    // function reads and `now()` would make both rows tie inside one statement.
    // The OLDER row is inserted LAST on purpose: insertion order must not be
    // what decides which version is current.
    const { error: versionError } = await admin
      .from("consent_document_versions")
      .insert([
        {
          document_slug: OWN_DOC,
          version: OWN_DOC_CURRENT,
          created_at: "2026-02-01T00:00:00Z",
        },
        {
          document_slug: OWN_DOC,
          version: OWN_DOC_OLD,
          created_at: "2026-01-01T00:00:00Z",
        },
      ]);
    expect(versionError).toBeNull();
  }

  // -------------------------------------------------------------------------
  // What it writes
  // -------------------------------------------------------------------------

  describe("recording an acceptance", () => {
    it("writes one row per document, each at that document's current version", async () => {
      const res = await record(admin, [TERMS, DECLARATION]);
      expect(res.error).toBeNull();
      expect(res.data).toBe(2);

      // The versions are read back from the registry rather than hardcoded: a
      // later migration publishing a revision of the terms must not fail this
      // case, because the claim is "whatever is current", not "this string".
      const { data: current, error } = await admin
        .from("consent_document_versions")
        .select("document_slug, version")
        .in("document_slug", [TERMS, DECLARATION]);
      expect(error).toBeNull();

      const rows = await acceptancesFor(TEST_IDS.CUSTOMER);
      expect(rows.map((row) => row.document_slug).sort()).toEqual(
        [DECLARATION, TERMS].sort(),
      );
      for (const row of rows) {
        const published = (current ?? []).filter(
          (candidate) => candidate.document_slug === row.document_slug,
        );
        expect(published.map((candidate) => candidate.version)).toContain(
          row.document_version,
        );
      }
    });

    it("picks the revision with the newest created_at, not the newest insert", async () => {
      await seedOwnDocument();

      const res = await record(admin, [OWN_DOC]);
      expect(res.error).toBeNull();
      expect(res.data).toBe(1);

      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([
        { document_slug: OWN_DOC, document_version: OWN_DOC_CURRENT },
      ]);
    });

    it("writes nothing on a replay of the same acceptance", async () => {
      expect((await record(admin, [TERMS, DECLARATION])).data).toBe(2);

      // The register route's call is not in the same transaction as the account
      // creation, so a retried request is ordinary. The primary key is what
      // makes it harmless — and the returned count is what says so out loud.
      const replay = await record(admin, [TERMS, DECLARATION]);
      expect(replay.error).toBeNull();
      expect(replay.data).toBe(0);

      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toHaveLength(2);
    });

    it("counts a repeated slug in one call once", async () => {
      const res = await record(admin, [TERMS, TERMS]);
      expect(res.error).toBeNull();
      expect(res.data).toBe(1);
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toHaveLength(1);
    });

    it("records a later revision as a fresh row rather than an overwrite", async () => {
      await seedOwnDocument();
      expect((await record(admin, [OWN_DOC])).data).toBe(1);

      // A new revision is published. Accepting it is a NEW agreement, and the
      // old one still happened — which is why the version is part of the key.
      const { error } = await admin
        .from("consent_document_versions")
        .insert({
          document_slug: OWN_DOC,
          version: "1999-12-01",
          created_at: "2026-03-01T00:00:00Z",
        });
      expect(error).toBeNull();

      expect((await record(admin, [OWN_DOC])).data).toBe(1);
      const rows = await acceptancesFor(TEST_IDS.CUSTOMER);
      expect([...rows.map((row) => row.document_version)].sort()).toEqual(
        [OWN_DOC_CURRENT, "1999-12-01"].sort(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // What it refuses
  // -------------------------------------------------------------------------

  describe("refusals", () => {
    it("refuses an empty set", async () => {
      const res = await record(admin, []);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a NULL element, rather than skipping it", async () => {
      // Raw, because the generated argument type cannot express a NULL inside
      // the array and casting around it would be the suppression the code-style
      // rule warns about. Skipping such an element is the failure being ruled
      // out: `unnest` contributes nothing for it, so the account would end up
      // with one document on file and no sign that a second was asked for.
      const res = await callServiceRoleRpcResult("record_account_consents", {
        p_customer_id: TEST_IDS.CUSTOMER,
        p_document_slugs: [TERMS, null],
      });
      expect(res.code).toBe(CHECK_VIOLATION);
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a NULL array", async () => {
      const res = await callServiceRoleRpcResult("record_account_consents", {
        p_customer_id: TEST_IDS.CUSTOMER,
        p_document_slugs: null,
      });
      expect(res.code).toBe(CHECK_VIOLATION);
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a document nothing has ever published", async () => {
      // Shaped so it cannot exist rather than merely being unlikely: no
      // published document is named after the absence of one.
      const res = await record(admin, [TERMS, "zz-no-such-document-at-all"]);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      // All or nothing: the valid half of the set is not quietly written.
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a document identity with no version yet", async () => {
      const { error } = await admin
        .from("consent_documents")
        .insert({ slug: OWN_DOC });
      expect(error).toBeNull();

      // A slug with no published revision is a data error only a migration can
      // create, and recording an acceptance of a text nobody has published is
      // not a lesser outcome than failing loudly.
      const res = await record(admin, [OWN_DOC]);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a profile that is not a customer", async () => {
      // The invariant assert_role gives a self-service writer, read off the
      // named profile because there is no session at registration. Neither an
      // educator nor a child holds the account a declaration belongs to.
      const gedu = await record(admin, [TERMS], TEST_IDS.GEDU);
      expect(gedu.error).not.toBeNull();
      expect(await acceptancesFor(TEST_IDS.GEDU)).toEqual([]);

      const child = await record(admin, [TERMS], TEST_IDS.GAMER);
      expect(child.error).not.toBeNull();
      expect(await acceptancesFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses a missing customer", async () => {
      const res = await callServiceRoleRpcResult("record_account_consents", {
        p_customer_id: null,
        p_document_slugs: [TERMS],
      });
      expect(res.code).toBe(CHECK_VIOLATION);
    });
  });

  // -------------------------------------------------------------------------
  // Who can reach it, and who can read what
  // -------------------------------------------------------------------------

  describe("access", () => {
    // **The one that matters.** The function takes its subject as an argument,
    // because no session exists when the register route calls it. That makes
    // the grant the whole of its access control: a reachable role could
    // otherwise record an acceptance against any account id it liked.
    it("is unreachable by every role a browser can hold", async () => {
      for (const [role, client] of [
        ["customer", customer],
        ["customer2", customer2],
        ["admin", adminAuth],
        ["anon", anon],
      ] as const) {
        const res = await record(client, [TERMS], TEST_IDS.CUSTOMER_2);
        expect(res.error, `${role} could call it`).not.toBeNull();
        expect(res.error?.code, `${role} was not refused execute`).toBe(
          FORBIDDEN,
        );
      }
      expect(await acceptancesFor(TEST_IDS.CUSTOMER_2)).toEqual([]);
    });

    it("lets a customer read their own rows and nobody else's", async () => {
      expect((await record(admin, [TERMS, DECLARATION])).error).toBeNull();
      expect(
        (await record(admin, [TERMS], TEST_IDS.CUSTOMER_2)).error,
      ).toBeNull();

      const { data, error } = await customer
        .from("account_consent_acceptances")
        .select("customer_id, document_slug");
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(new Set((data ?? []).map((row) => row.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER]),
      );
    });

    it("lets an admin read every account's rows", async () => {
      expect((await record(admin, [TERMS])).error).toBeNull();
      expect(
        (await record(admin, [TERMS], TEST_IDS.CUSTOMER_2)).error,
      ).toBeNull();

      const { data, error } = await adminAuth
        .from("account_consent_acceptances")
        .select("customer_id")
        .in("customer_id", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
      expect(error).toBeNull();
      expect(new Set((data ?? []).map((row) => row.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]),
      );
    });

    it("shows an unauthenticated caller nothing at all", async () => {
      expect((await record(admin, [TERMS])).error).toBeNull();

      // No anon grant and no anon policy: a row names a person.
      const { error } = await anon
        .from("account_consent_acceptances")
        .select("customer_id");
      expect(error).not.toBeNull();
    });

    it("holds no write grant for authenticated", async () => {
      expect((await record(admin, [TERMS])).error).toBeNull();
      const [row] = await acceptancesFor(TEST_IDS.CUSTOMER);

      // Every row is written by the one service-role function, so a direct
      // write must be refused by the MISSING GRANT rather than by a policy that
      // could be edited — including a write a customer aims at their own row,
      // which any actor-only policy would have let through.
      const insert = await customer
        .from("account_consent_acceptances")
        .insert({
          customer_id: TEST_IDS.CUSTOMER,
          document_slug: row.document_slug,
          document_version: row.document_version,
        });
      expect(insert.error?.code).toBe(FORBIDDEN);

      const update = await customer
        .from("account_consent_acceptances")
        .update({ accepted_at: "1999-01-01T00:00:00Z" })
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(update.error?.code).toBe(FORBIDDEN);

      const remove = await customer
        .from("account_consent_acceptances")
        .delete()
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(remove.error?.code).toBe(FORBIDDEN);

      // Nothing moved.
      expect(await acceptancesFor(TEST_IDS.CUSTOMER)).toHaveLength(1);
    });
  });
});
