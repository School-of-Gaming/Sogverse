import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * `user_list_entries` — the one paged read behind the admin users page, the
 * participant picker and the gedu picker.
 *
 * It replaced `user_search_index` in 00270, and this file replaced that view's
 * own test. What it exists to prove is the half of those three surfaces that
 * lives outside the application, and there is more of it than there used to be:
 * not only that a person is findable by the artifacts an admin is handed, but
 * that a *family* is one row, that the row carries what its children render, and
 * that `security_invoker` still makes the caller's own RLS the only thing
 * deciding any of it.
 *
 * The handles, the phone and the spoken languages are not seeded — this file
 * owns them, on the same upsert/restore bracket the per-platform RLS tests use,
 * and db files run with `fileParallelism: false` so the brackets cannot overlap.
 */
describe("user_list_entries", () => {
  /** Service-role — bypasses RLS. Setup, restore, and the structural claims. */
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;

  /** Restored in teardown, so a profile this file borrows is handed back. */
  let originalPhone: string | null = null;
  let originalLanguages: Database["public"]["Enums"]["spoken_language"][] = [];

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
   * The seeded Minecraft name is `TestGedu`/`TestGamer` and the seeded gamer's
   * email is `testgamer@gamer.sogverse.internal` — so `ILIKE '%TestGamer%'`
   * matches through the *email* that is already in the blob, and every assertion
   * below would pass with the game-account joins deleted outright. A fixture
   * that cannot fail is worse than no fixture, because it reads as coverage.
   *
   * These share no substring with any seeded email, name or the phone digits
   * above, so a match can only have come through the join under test — and,
   * because they are set on the *child*, only through the family half of the
   * blob.
   */
  const MINECRAFT_HANDLE = "EnderDragon42";
  const ROBLOX_HANDLE = "ZephyrPilot88";

  /**
   * The language the gedu speaks for the duration of this file.
   *
   * `sv` rather than `fi` or `en`: the containment assertion names the gedu's
   * own id rather than claiming anything about the whole result, so a real
   * profile also speaking Swedish cannot break it — but a code nothing else in
   * the fixtures uses keeps the failure message readable when it does break.
   */
  const SPOKEN: Database["public"]["Enums"]["spoken_language"][] = ["sv"];

  /**
   * One embedded child, as the view builds it.
   *
   * The column is `jsonb`, so the generated type is `Json` and the compiler can
   * say nothing about what is inside it. This schema is what says it instead,
   * and parsing real view output is what proves the schema describes the
   * database rather than describing what somebody assumed it holds. Every field
   * is one the two list surfaces render or gate on.
   */
  const embeddedGamer = z.object({
    id: z.string().uuid(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    email_verified_at: z.string().nullable(),
    role: z.enum(["admin", "customer", "gamer", "gedu"]),
    created_at: z.string(),
    sign_in: z.enum(["parent", "username", "email"]).nullable(),
  });
  const embeddedGamers = z.array(embeddedGamer);

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

    const { data: gedu } = await admin
      .from("profiles")
      .select("spoken_languages")
      .eq("id", TEST_IDS.GEDU)
      .single();
    originalLanguages = gedu?.spoken_languages ?? [];

    // The CHILD holds both platforms — which is the row that would duplicate if
    // either join were written against a non-unique key, and the person whose
    // handles have to reach their PARENT's row through the family blob.
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
    await admin
      .from("profiles")
      .update({ spoken_languages: SPOKEN })
      .eq("id", TEST_IDS.GEDU);
  });

  afterAll(async () => {
    await admin.from("minecraft_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await admin.from("roblox_accounts").delete().eq("user_id", TEST_IDS.GAMER);
    await admin
      .from("profiles")
      .update({ phone: originalPhone })
      .eq("id", TEST_IDS.GAMER);
    await admin
      .from("profiles")
      .update({ spoken_languages: originalLanguages })
      .eq("id", TEST_IDS.GEDU);
  });

  /** The ids an admin's search for `needle` reaches. */
  async function searchAsAdmin(needle: string): Promise<(string | null)[]> {
    const { data, error } = await adminClient
      .from("user_list_entries")
      .select("id")
      .ilike("family_search_blob", `%${needle}%`);

    expect(error).toBeNull();
    return (data ?? []).map((row) => row.id);
  }

  // =========================================================================
  // What a row is
  // =========================================================================

  // The shape the whole change is for: one request, ordered, capped, counted.
  it("answers a newest-first page of 25 with an exact total", async () => {
    const { data, error, count } = await adminClient
      .from("user_list_entries")
      .select("id, role, created_at, certified, linked_gamers", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .order("id")
      .limit(25);

    expect(error).toBeNull();
    expect(typeof count).toBe("number");
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).length).toBeLessThanOrEqual(25);

    // Newest first, with the id tiebreaker — the order the keyset page below
    // resumes from, and the one the index is built in.
    const rows = data ?? [];
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      expect(previous.created_at).not.toBeNull();
      expect(current.created_at).not.toBeNull();
      const descends = previous.created_at! > current.created_at!;
      const tied =
        previous.created_at === current.created_at &&
        previous.id! < current.id!;
      expect(descends || tied).toBe(true);
    }
  });

  it("carries a customer's children inside the row, oldest first", async () => {
    const { data, error } = await adminClient
      .from("user_list_entries")
      .select("id, role, linked_gamers")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(error).toBeNull();
    expect(data!.role).toBe("customer");

    const gamers = embeddedGamers.parse(data!.linked_gamers);
    expect(gamers.map((g) => g.id)).toEqual(
      expect.arrayContaining([TEST_IDS.GAMER, TEST_IDS.GAMER_2]),
    );

    // Everything a list row renders about a child has to be on the row itself —
    // the keyed follow-up read this view exists to delete.
    const child = gamers.find((g) => g.id === TEST_IDS.GAMER)!;
    expect(child.role).toBe("gamer");
    expect(child.first_name.length).toBeGreaterThan(0);
    expect(child.email).toContain("@");
    // The seeded children were created with the default sign-in mode, and it is
    // the fact whose per-gamer lookup used to gate the skeleton.
    expect(child.sign_in).toBe("parent");

    const created = gamers.map((g) => g.created_at);
    expect([...created].sort()).toEqual(created);
  });

  // The collapse, from the side that would duplicate a child on screen.
  it("does not list a linked gamer as a top-level row", async () => {
    const { data, error } = await adminClient
      .from("user_list_entries")
      .select("id")
      .eq("id", TEST_IDS.GAMER);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // And the side that would lose a child altogether. A gamer whose parent link
  // was deleted is reachable from no family row, so the list has to carry them
  // itself or they exist in the database and nowhere else.
  it("lists a gamer with no parent link as a top-level row", async () => {
    await admin
      .from("parent_gamer")
      .delete()
      .eq("id", TEST_IDS.PARENT_GAMER_2_LINK);

    try {
      const { data, error } = await adminClient
        .from("user_list_entries")
        .select("id, role")
        .eq("id", TEST_IDS.GAMER_2)
        .single();

      expect(error).toBeNull();
      expect(data!.role).toBe("gamer");
    } finally {
      await admin.from("parent_gamer").insert({
        id: TEST_IDS.PARENT_GAMER_2_LINK,
        parent_id: TEST_IDS.CUSTOMER,
        gamer_id: TEST_IDS.GAMER_2,
      });
    }
  });

  // The claim the list's "N results" rests on: a derived value written as a
  // join rather than a scalar subquery would make a two-child family two rows,
  // and the total would overstate itself by however many children each has.
  it("holds exactly one row per top-level entry", async () => {
    const { data: links } = await admin
      .from("parent_gamer")
      .select("gamer_id");
    const linked = new Set((links ?? []).map((row) => row.gamer_id));

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, role");
    const expected = (profiles ?? [])
      .filter((p) => p.role !== "gamer" || !linked.has(p.id))
      .map((p) => p.id);

    const { data: entries, error } = await adminClient
      .from("user_list_entries")
      .select("id");

    expect(error).toBeNull();
    const ids = (entries ?? []).map((row) => row.id);

    expect(ids.length).toBe(new Set(ids).size);
    expect([...ids].sort()).toEqual([...expected].sort());
  });

  // =========================================================================
  // The family search blob
  // =========================================================================

  // The bug the family blob fixes. A gedu asks "who is EnderDragon42?"; the
  // answer an admin needs is the family, and matching per person returned a
  // child's row that the list then collapsed away.
  it("finds a family by a child's Minecraft handle", async () => {
    const hits = await searchAsAdmin(MINECRAFT_HANDLE);

    expect(hits).toContain(TEST_IDS.CUSTOMER);
    expect(hits).not.toContain(TEST_IDS.GAMER);
  });

  // Independently of the other platform — the two are separate tables and a
  // person may hold either, both, or neither.
  it("finds a family by a child's Roblox handle", async () => {
    expect(await searchAsAdmin(ROBLOX_HANDLE)).toContain(TEST_IDS.CUSTOMER);
  });

  // The needle is the trailing digits because that is the part a national and
  // an international spelling share.
  it("finds a family by the trailing digits of a child's phone number", async () => {
    expect(await searchAsAdmin(PHONE_TAIL)).toContain(TEST_IDS.CUSTOMER);
  });

  it("finds a family by a child's own name", async () => {
    const { data } = await admin
      .from("profiles")
      .select("first_name")
      .eq("id", TEST_IDS.GAMER)
      .single();

    expect(await searchAsAdmin(data!.first_name)).toContain(TEST_IDS.CUSTOMER);
  });

  it("still finds a person by their own name and email", async () => {
    const { data } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(await searchAsAdmin(data!.first_name)).toContain(TEST_IDS.CUSTOMER);
    expect(await searchAsAdmin(data!.email)).toContain(TEST_IDS.CUSTOMER);
  });

  // =========================================================================
  // The filters the surfaces apply, applied where the rows are
  // =========================================================================

  it("filters by role as an equality on the view", async () => {
    const { data, error } = await adminClient
      .from("user_list_entries")
      .select("id, role")
      .eq("role", "gedu");

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(TEST_IDS.GEDU);
    expect(ids).not.toContain(TEST_IDS.CUSTOMER);
    expect((data ?? []).every((row) => row.role === "gedu")).toBe(true);
  });

  // The gedu picker's "speaks X" chip. This is the case that proves an
  // array-containment filter survives the trip through a view column: the
  // enum array keeps its own type here, so PostgREST casts `{sv}` to it exactly
  // as it would against `profiles`.
  it("filters by spoken language through the view's enum array column", async () => {
    const { data, error } = await adminClient
      .from("user_list_entries")
      .select("id, spoken_languages")
      .eq("role", "gedu")
      .contains("spoken_languages", SPOKEN);

    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id)).toContain(TEST_IDS.GEDU);
  });

  // The keyset page, exactly as the app sends it: everything strictly after the
  // last row of the previous page under `(created_at DESC, id ASC)`.
  it("resumes a page from the last row's created_at and id", async () => {
    const first = await adminClient
      .from("user_list_entries")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(2);

    expect(first.error).toBeNull();
    const page = first.data ?? [];
    expect(page.length).toBe(2);

    const last = page[page.length - 1];
    const second = await adminClient
      .from("user_list_entries")
      .select("id, created_at")
      .or(
        `created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.gt.${last.id})`,
      )
      .order("created_at", { ascending: false })
      .order("id")
      .limit(2);

    expect(second.error).toBeNull();
    const ids = new Set(page.map((row) => row.id));
    for (const row of second.data ?? []) {
      expect(ids.has(row.id)).toBe(false);
    }
  });

  // =========================================================================
  // Gedu standing
  // =========================================================================

  it("reports a certified gedu as certified and a customer as not", async () => {
    const { data: gedu, error } = await adminClient
      .from("user_list_entries")
      .select("certified, criminal_record_check_passed")
      .eq("id", TEST_IDS.GEDU)
      .single();

    expect(error).toBeNull();
    expect(gedu!.certified).toBe(true);

    // `false` rather than NULL for somebody with no gedu_profiles row at all —
    // `role` is what says whether the value means anything.
    const { data: customer } = await adminClient
      .from("user_list_entries")
      .select("certified")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(customer!.certified).toBe(false);
  });

  // The column has to read the stored flag rather than restate the role, which
  // only a gedu who is NOT certified can show.
  it("reports an uncertified gedu as uncertified", async () => {
    await admin
      .from("gedu_profiles")
      .update({ certified: false, certified_at: null })
      .eq("user_id", TEST_IDS.GEDU);

    try {
      const { data, error } = await adminClient
        .from("user_list_entries")
        .select("certified")
        .eq("id", TEST_IDS.GEDU)
        .single();

      expect(error).toBeNull();
      expect(data!.certified).toBe(false);
    } finally {
      await admin
        .from("gedu_profiles")
        .update({ certified: true, certified_at: new Date().toISOString() })
        .eq("user_id", TEST_IDS.GEDU);
    }
  });

  // The second flag is a second fact, not a copy of the first: certification
  // and the record check gate different things and move independently.
  it("reports the criminal record check separately from certification", async () => {
    const before = await adminClient
      .from("user_list_entries")
      .select("certified, criminal_record_check_passed")
      .eq("id", TEST_IDS.GEDU)
      .single();

    expect(before.error).toBeNull();
    expect(before.data!.criminal_record_check_passed).toBe(false);

    await admin
      .from("gedu_profiles")
      .update({
        criminal_record_check_passed: true,
        criminal_record_check_at: new Date().toISOString(),
      })
      .eq("user_id", TEST_IDS.GEDU);

    try {
      const { data } = await adminClient
        .from("user_list_entries")
        .select("certified, criminal_record_check_passed")
        .eq("id", TEST_IDS.GEDU)
        .single();

      expect(data!.criminal_record_check_passed).toBe(true);
      expect(data!.certified).toBe(true);
    } finally {
      await admin
        .from("gedu_profiles")
        .update({
          criminal_record_check_passed: false,
          criminal_record_check_at: null,
        })
        .eq("user_id", TEST_IDS.GEDU);
    }
  });

  // =========================================================================
  // The view is not an enumeration hole — the scope half of its spine entry
  // =========================================================================

  // SECURITY INVOKER is what makes this true: the view can answer with nothing
  // a direct read of the six tables it selects from would not already return.
  // Granting SELECT on an object carrying every profile column plus a family's
  // children is exactly the change that needs this pinned rather than assumed.
  it("gives a customer their own family row and nobody else's", async () => {
    const { data, error } = await customerClient
      .from("user_list_entries")
      .select("id, linked_gamers");

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);

    expect(ids).toContain(TEST_IDS.CUSTOMER);
    expect(ids).not.toContain(TEST_IDS.CUSTOMER_2);
    expect(ids).not.toContain(TEST_IDS.ADMIN);

    // Their own children ride along, because their own policies permit the
    // links and the profiles behind them.
    const own = (data ?? []).find((row) => row.id === TEST_IDS.CUSTOMER)!;
    expect(embeddedGamers.parse(own.linked_gamers).map((g) => g.id)).toContain(
      TEST_IDS.GAMER,
    );
  });

  it("does not let one customer reach another through the view", async () => {
    const { data: theirs } = await admin
      .from("profiles")
      .select("email")
      .eq("id", TEST_IDS.CUSTOMER_2)
      .single();

    const { data } = await customerClient
      .from("user_list_entries")
      .select("id")
      .ilike("family_search_blob", `%${theirs!.email}%`);

    expect(data).toEqual([]);
  });

  // The other direction of the same rule, on the field the family blob added: a
  // child's handle must not become a way to find a family you have no
  // relationship to.
  it("does not let an unrelated customer find a family by a child's handle", async () => {
    const { data } = await customer2Client
      .from("user_list_entries")
      .select("id")
      .ilike("family_search_blob", `%${MINECRAFT_HANDLE}%`);

    expect(data).toEqual([]);
  });
});
