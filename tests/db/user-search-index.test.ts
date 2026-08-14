import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  searchedProfile,
  SEARCHED_PROFILE_COLUMNS,
} from "@/services/users/users.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `user_search_index` — the view the admin user search matches against.
 *
 * What it exists to prove is the half of the search that lives outside the
 * application: that a person really is findable by the artifacts an admin is
 * handed. A unit test can only assert the request that went out; whether the
 * blob a game handle is supposed to be in actually contains it is a fact about
 * this view, and nothing but a real database can answer it.
 *
 * The gamer's handles are not seeded — this file owns them, on the same
 * upsert/delete bracket the per-platform RLS tests use, and db files run with
 * `fileParallelism: false` so the brackets cannot overlap.
 */
describe("user_search_index", () => {
  // Service-role — bypasses RLS. Setup, teardown, and the structural claims.
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;

  /** Restored in teardown, so a profile this file borrows is handed back. */
  let originalPhone: string | null = null;

  /**
   * Stored exactly as the column holds one: E.164 with the `+` stripped. The
   * search reduces whatever was typed to its trailing digits, so this is the
   * value both a national and an international spelling have to reach.
   */
  const STORED_PHONE = "358401234567";
  const PHONE_TAIL = "1234567";

  /**
   * Handles this file owns, and the reason they are not `SEED.*`.
   *
   * The seeded Minecraft name is `TestGamer`, and the seeded gamer's email is
   * `testgamer@gamer.sogverse.internal` — so `ILIKE '%TestGamer%'` matches that
   * profile through its *email*, and every assertion below would pass with the
   * `minecraft_accounts` join deleted from the view outright. A fixture that
   * cannot fail is worse than no fixture, because it reads as coverage.
   *
   * These share no substring with any seeded email, name or the phone digits
   * above, so a match can only have come through the join under test.
   */
  const MINECRAFT_HANDLE = "EnderDragon42";
  const ROBLOX_HANDLE = "ZephyrPilot88";

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

    const { data: before } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", TEST_IDS.GAMER)
      .single();
    originalPhone = before?.phone ?? null;

    // One person holding BOTH platforms — which is also the row that would
    // duplicate if either join were ever written against a non-unique key.
    await admin.from("minecraft_accounts").upsert(
      [{ user_id: TEST_IDS.GAMER, minecraft_username: MINECRAFT_HANDLE }],
      { onConflict: "user_id" },
    );
    await admin.from("roblox_accounts").upsert(
      [{ user_id: TEST_IDS.GAMER, roblox_username: ROBLOX_HANDLE }],
      { onConflict: "user_id" },
    );
    await admin
      .from("profiles")
      .update({ phone: STORED_PHONE })
      .eq("id", TEST_IDS.GAMER);
  });

  afterAll(async () => {
    await admin.from("minecraft_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await admin
      .from("profiles")
      .update({ phone: originalPhone })
      .eq("id", TEST_IDS.GAMER);
  });

  /**
   * The ids an admin's search for `needle` reaches.
   *
   * Nullable, and deliberately not narrowed here: PostgreSQL cannot carry a
   * column's NOT NULL through a view, so this is the shape every consumer of
   * the view really gets. The service re-tightens it with a zod parse, which is
   * its own case at the foot of this file; a test that cast the nullability
   * away would be quietly asserting the thing it is here to check.
   */
  async function searchAsAdmin(needle: string): Promise<(string | null)[]> {
    const { data, error } = await adminClient
      .from("user_search_index")
      .select("id")
      .ilike("search_blob", `%${needle}%`);

    expect(error).toBeNull();
    return (data ?? []).map((row) => row.id);
  }

  // =========================================================================
  // What the change was for
  // =========================================================================

  // A gamer's email is the synthetic <token>@gamer.sogverse.internal address,
  // so their game handle is the only real-world name they have. Before this
  // view, "who is TestGamer?" was unanswerable.
  it("finds a gamer by their Minecraft handle", async () => {
    expect(await searchAsAdmin(MINECRAFT_HANDLE)).toContain(
      TEST_IDS.GAMER,
    );
  });

  // Independently of the other platform — the two are separate tables and a
  // person may hold either, both, or neither.
  it("finds a gamer by their Roblox handle", async () => {
    expect(await searchAsAdmin(ROBLOX_HANDLE)).toContain(
      TEST_IDS.GAMER,
    );
  });

  // The parent who messaged on WhatsApp. The needle is the trailing digits
  // because that is the part a national and an international spelling share.
  it("finds a person by the trailing digits of their phone number", async () => {
    expect(await searchAsAdmin(PHONE_TAIL)).toContain(TEST_IDS.GAMER);
  });

  it("still finds a person by name and by email", async () => {
    const { data } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(await searchAsAdmin(data!.first_name)).toContain(TEST_IDS.CUSTOMER);
    expect(await searchAsAdmin(data!.email)).toContain(TEST_IDS.CUSTOMER);
  });

  // =========================================================================
  // The structural guarantee the search's totals rest on
  // =========================================================================

  // The search reports "showing 20 of N" off this view's row count, so a join
  // that multiplied a profile would not merely repeat a row on screen — it
  // would overstate the total by however many game accounts that person holds.
  // The migration asserts this at apply time; this is what catches a platform
  // added later against a key that is not unique.
  it("holds exactly one row per profile", async () => {
    const { count: profiles } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const { count: indexed } = await admin
      .from("user_search_index")
      .select("id", { count: "exact", head: true });

    expect(indexed).toBe(profiles);
  });

  // A person holding two game accounts is the specific row that would
  // duplicate, so it is asserted on its own rather than trusted to the count.
  it("holds one row for a person with accounts on both platforms", async () => {
    const { data, error } = await admin
      .from("user_search_index")
      .select("id")
      .eq("id", TEST_IDS.GAMER);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // =========================================================================
  // The view is not an enumeration hole
  // =========================================================================

  // SECURITY INVOKER is what makes this true: the view can answer with nothing
  // a direct read of `profiles` would not already return. Granting SELECT on an
  // object carrying every profile column is exactly the change that needs this
  // pinned rather than assumed.
  it("does not let one customer reach another through the view", async () => {
    const { data: theirs } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", TEST_IDS.CUSTOMER_2)
      .single();

    const { data } = await customerClient
      .from("user_search_index")
      .select("id")
      .ilike("search_blob", `%${theirs!.email}%`);

    expect(data).toEqual([]);
  });

  // The other direction of the same rule, on the field this change added: a
  // handle must not become a way to find a child you have no relationship to.
  it("does not let an unrelated customer find a gamer by their handle", async () => {
    const { data } = await customer2Client
      .from("user_search_index")
      .select("id")
      .ilike("search_blob", `%${MINECRAFT_HANDLE}%`);

    expect(data).toEqual([]);
  });

  it("lets a parent reach their own linked gamer", async () => {
    const { data } = await customerClient
      .from("user_search_index")
      .select("id")
      .ilike("search_blob", `%${MINECRAFT_HANDLE}%`);

    expect((data ?? []).map((row) => row.id)).toContain(TEST_IDS.GAMER);
  });

  // =========================================================================
  // The wire shape
  // =========================================================================

  // PostgreSQL cannot carry NOT NULL through a view, so the generated row type
  // is nullable on every column and the service re-tightens it with this
  // schema. Parsing real view output is what proves the schema describes the
  // database rather than describing what somebody assumed it holds.
  it("returns rows the searched-profile schema accepts", async () => {
    const { data, error } = await adminClient
      .from("user_search_index")
      // The service's own column list, not a copy — a copy here silently
      // drifts the first time `profiles` gains a column, and the parse below
      // then fails in CI only.
      .select(SEARCHED_PROFILE_COLUMNS)
      .eq("id", TEST_IDS.GAMER)
      .single();

    expect(error).toBeNull();
    expect(() => searchedProfile.parse(data)).not.toThrow();
  });
});
