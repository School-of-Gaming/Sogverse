import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `gamer_consent_acceptances` (00250) — who may READ a guardian declaration.
 *
 * The row says that a named adult declared a named child to be theirs, so it is
 * two people's personal data in one record and the read side is the whole of
 * its exposure: there is no `authenticated` write grant for a policy to
 * authorize, and the only writer is `create_gamer`, which is service-role and
 * is exercised in `create-gamer.test.ts`. What is left to prove is that the two
 * SELECT policies narrow to exactly the readers the table intends, and that
 * nobody else is a reader at all.
 *
 * Every negative below is an UNFILTERED select, which is the point: a policy is
 * the only thing standing between a stranger and the table, so asking for
 * everything is what shows it holds. A `.eq()` on a single child would pass just
 * as well against a table with no policy at all on a row that happens not to be
 * the one asked for.
 *
 * The child's own absence is deliberate and is asserted rather than assumed —
 * see the case for it.
 */
describe("gamer_consent_acceptances read scoping (00250)", () => {
  let admin: SupabaseClient<Database>;
  let parentA: SupabaseClient<Database>;
  let parentB: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  /** The version the fixture row is stamped with, so teardown can find it. */
  let version: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    [parentA, parentB, gamer, adminAuth] = await Promise.all([
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER_2.email,
        TEST_CREDENTIALS.CUSTOMER_2.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
    ]);

    // The seeded fixtures predate the declaration, so the row under test is
    // written here rather than found. Stamped with whatever version is current,
    // resolved the way create_gamer resolves it — greatest created_at, version
    // DESC to break a tie — so a reworded declaration does not edit this file.
    const { data: current, error: versionError } = await admin
      .from("consent_document_versions")
      .select("version")
      .eq("document_slug", "guardian-declaration")
      .order("created_at", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .single();
    expect(versionError).toBeNull();
    version = current!.version;

    // Parent A's declaration about their own seeded child. `upsert` rather than
    // `insert` because the primary key is (gamer, slug, version) and the row may
    // already stand from an earlier run that died before its teardown.
    const { error } = await admin.from("gamer_consent_acceptances").upsert({
      gamer_id: TEST_IDS.GAMER,
      document_slug: "guardian-declaration",
      document_version: version,
      accepted_by: TEST_IDS.CUSTOMER,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    // Keyed on all three primary-key columns: this file's own row and nothing
    // a concurrent worker may have written about the same child.
    await admin
      .from("gamer_consent_acceptances")
      .delete()
      .eq("gamer_id", TEST_IDS.GAMER)
      .eq("document_slug", "guardian-declaration")
      .eq("document_version", version);
  });

  it("lets a linked parent read the declaration about their own child", async () => {
    const mine = await parentA.from("gamer_consent_acceptances").select("*");

    expect(mine.error).toBeNull();
    expect(mine.data).toContainEqual(
      expect.objectContaining({
        gamer_id: TEST_IDS.GAMER,
        document_slug: "guardian-declaration",
        document_version: version,
        accepted_by: TEST_IDS.CUSTOMER,
      }),
    );

    // And nothing beyond their own family, from that same unfiltered query. The
    // policy is keyed on the parent_gamer LINK rather than on accepted_by, so
    // the permitted set is exactly this parent's children.
    const strangers = (mine.data ?? [])
      .map((row) => row.gamer_id)
      .filter((id) => id !== TEST_IDS.GAMER && id !== TEST_IDS.GAMER_2);
    expect(strangers).toEqual([]);
  });

  it("tells another family's parent nothing about that child", async () => {
    // A parent linked to no gamer at all. `is_parent_of` is false for every row
    // in the table, so the unfiltered read is empty rather than refused — the
    // grant is there, the policy is what withholds the rows.
    const theirs = await parentB.from("gamer_consent_acceptances").select("*");

    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
  });

  it("tells the child nothing, because no policy makes them a reader", async () => {
    // INTENTIONAL, and the reason it is pinned: the table carries two SELECT
    // policies, one for admins and one for a linked parent, and neither matches
    // a gamer. A declaration is a statement an ADULT makes about their own
    // standing, so the child is its subject and not a party to it — unlike the
    // photo consents (00244), which the child may read because the answer is
    // about what happens to them. A policy for gamers arriving here later is a
    // decision somebody has to make on purpose, and this case is what makes
    // them notice they are making it.
    const own = await gamer.from("gamer_consent_acceptances").select("*");

    expect(own.error).toBeNull();
    expect(own.data).toEqual([]);
  });

  it("lets an admin read it, through the policy and not the service role", async () => {
    // Signed in as a real admin session rather than the service-role client, so
    // this is the `is_admin()` policy answering and not RLS being bypassed.
    const asAdmin = await adminAuth
      .from("gamer_consent_acceptances")
      .select("gamer_id, accepted_by")
      .eq("gamer_id", TEST_IDS.GAMER);

    expect(asAdmin.error).toBeNull();
    expect(asAdmin.data).toEqual([
      { gamer_id: TEST_IDS.GAMER, accepted_by: TEST_IDS.CUSTOMER },
    ]);
  });

  it("tells anon nothing, and is refused before any policy runs", async () => {
    // `anon` holds no grant on this table at all, so the refusal comes from the
    // grant layer — the stronger of the two, since a policy can be edited and a
    // missing grant fails closed whatever the policies say.
    const stranger = await anon.from("gamer_consent_acceptances").select("*");

    expect(stranger.error).not.toBeNull();
    expect(stranger.data).toBeNull();
  });
});
