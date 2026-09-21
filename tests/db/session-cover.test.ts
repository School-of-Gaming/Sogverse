import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Constants, type Database } from "@/types";
import { adminDashboardCoverRequest } from "@/services/admin-dashboard/admin-dashboard.contracts";
import {
  anonymousCoverRequestDocument,
  coverRequestDocument,
  openCoverRequests,
  sessionStaffGedu,
} from "@/services/session-cover/session-cover.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * Session covers (00272): who is absent, who stood in, who may reach what, and
 * the mechanical check that keeps the access surface complete.
 *
 * Four things about this file are decisions rather than convenience, and each
 * would otherwise read as a gap:
 *
 * 1. **The derivation and the may-cover guard are exercised through the ADMIN
 *    client, on purpose.** Both predicates take the gedu as an ARGUMENT rather
 *    than reading `auth.uid()`, because every writer has to ask them about
 *    somebody else, and both are granted to `service_role` alone. So the cases
 *    below name the gedu they are asking about, which is also what makes them
 *    readable: "is A expected on this date" is the claim, not "am I".
 *
 * 2. **The ACCESS predicates are exercised as the gedu, because they answer only
 *    about the caller.** `gedu_covers_group` is the one cover predicate granted
 *    to `authenticated` (the `gedus_read_assigned_groups` policy calls it, and a
 *    policy is evaluated as the querying role), so it is asked through each
 *    gedu's own client. Its sibling `gedu_covers_session` is internal and is
 *    observed through the two surfaces that are date-scoped: the voice
 *    predicates and the report-mail claim.
 *
 * 3. **The window fixtures are written straight to the table, not through the
 *    RPCs.** A cover twenty days in the past is exactly the state the window has
 *    to close on, and no RPC will create one (the gedu path refuses a past date
 *    and the admin path still requires a schedule weekday). Writing the row is
 *    how the boundary gets tested rather than argued about.
 *
 * 4. **Nothing asserts on "today" at a boundary that could move mid-test.** The
 *    two voice predicates hardcode "today in the product's timezone", so a case
 *    that seeded a cover on today and read the predicate a second later would
 *    flip if the run crossed UTC midnight. The admitting case therefore seeds
 *    covers on today AND tomorrow — whichever the database calls today, one
 *    matches — and the refusing case seeds one a week out, which no reading of
 *    "today" can reach. Every other date in this file is at least three days
 *    from a boundary.
 *
 * Layout:
 *   - PRODUCT (remote club, UTC, a slot on every weekday so any date is
 *     writable) carries GROUP_A — assigned to the seeded GEDU, with GAMER on its
 *     roster — and GROUP_B, its sister group with no educator. Two groups
 *     because the whole point of the model is that a gedu may cover a group of a
 *     product they already teach, and one group cannot be both.
 *   - SITE_PRODUCT (in-person, at its own SITE) carries GROUP_SITE, so the
 *     location-shaped cover arm of `set_site_notes` has a building to be about.
 *   - OFF_PRODUCT carries GROUP_OFF, which nobody here teaches or covers.
 *   - SUB and THIRD are minted gedus, certified, torn down with the file.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000810";
const GROUP_A = "00000000-0000-0000-0000-000000000811";
const GROUP_B = "00000000-0000-0000-0000-000000000812";
const SITE_PRODUCT = "00000000-0000-0000-0000-000000000813";
const SITE = "00000000-0000-0000-0000-000000000814";
const GROUP_SITE = "00000000-0000-0000-0000-000000000815";
const OFF_PRODUCT = "00000000-0000-0000-0000-000000000816";
const GROUP_OFF = "00000000-0000-0000-0000-000000000817";

const ALL_PRODUCTS = [PRODUCT, SITE_PRODUCT, OFF_PRODUCT];
const ALL_GROUPS = [GROUP_A, GROUP_B, GROUP_SITE, GROUP_OFF];

/** The canonical forbidden SQLSTATE every guard primitive raises. */
const FORBIDDEN = "42501";
/** What the write validators raise: 23514. */
const CHECK_VIOLATION = "23514";

/**
 * A UTC calendar date `offset` days from now, UTC-pinned end to end — built with
 * `Date.UTC` and read back through `toISOString`, never by stepping a zoned Date
 * by 86_400_000. The product's timezone is UTC, so this is the product's own
 * calendar.
 */
function utcDate(offset: number): string {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  return day.toISOString().slice(0, 10);
}

/** The scheduled instants for a date, matching the 10:00–11:00 UTC slot. */
function slotInstants(date: string): { starts_at: string; ends_at: string } {
  return {
    starts_at: `${date}T10:00:00.000Z`,
    ends_at: `${date}T11:00:00.000Z`,
  };
}

// ---------------------------------------------------------------------------
// The wire shapes are the app's own, imported rather than restated: every
// assertion below parses real RPC output through the very schemas the client
// parses it through, which is what makes this suite the thing that keeps
// Postgres and TypeScript honest about each other. Only the two shapes with no
// client reader — the catalog rows the completeness check reads — are local.
// ---------------------------------------------------------------------------

const geduFeedCoverHalves = z.object({
  gedus: z.array(sessionStaffGedu),
  covers: z.array(coverRequestDocument),
});

const dashboardCoverRequests = z.array(adminDashboardCoverRequest);

const assignmentSummaries = z.array(
  z.object({
    product_id: z.string(),
    group_id: z.string(),
    group_name: z.string(),
    kind: z.enum(["assignment", "cover"]),
    covered_date: z.string().nullable(),
    attention_count: z.number(),
  }),
);

const functionSurface = z.array(
  z.object({ function_name: z.string(), body: z.string() }),
);
const policyExpressions = z.array(
  z.object({
    table_name: z.string(),
    policy_name: z.string(),
    expression: z.string(),
  }),
);

describe("session covers", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let subAuth: SupabaseClient<Database>;
  let thirdAuth: SupabaseClient<Database>;

  let subId = "";
  let thirdId = "";

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    // Unique per run: CI's database carries the seed fixtures AND whatever a
    // previous run left behind, so a fixed address is a collision waiting to
    // happen.
    const stamp = Date.now();
    const accounts = [
      { email: `cover-sub-${stamp}@test.local`, first: "Saku", last: "Substitute" },
      { email: `cover-third-${stamp}@test.local`, first: "Kolme", last: "Thirdson" },
    ];
    const ids: string[] = [];
    for (const account of accounts) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: account.first, last_name: account.last },
      });
      expect(error).toBeNull();
      const id = created.user?.id ?? "";
      expect(id).toBeTruthy();
      ids.push(id);
      // handle_new_user lands every signup as a customer; the gedu role and the
      // extension row are an admin's doing, exactly as in the real flow. Both are
      // CERTIFIED, because certification is one of the four may-cover refusals
      // and the cases that need it absent take it away deliberately.
      await admin.from("profiles").update({ role: "gedu" }).eq("id", id);
      await admin.from("customer_profiles").delete().eq("user_id", id);
      await admin.from("gedu_profiles").insert({ user_id: id, certified: true });
    }
    [subId, thirdId] = ids;

    subAuth = await createAuthenticatedClient(accounts[0].email, "testpassword123");
    thirdAuth = await createAuthenticatedClient(accounts[1].email, "testpassword123");

    // The SEEDED gedu's certification is deliberately never written here, in
    // either direction. gedu-registration.test.ts de-certifies and re-certifies
    // that exact account, and CI runs the files in parallel workers against one
    // database — so a reset of that row would stomp its window. Nothing below
    // depends on the seeded gedu being certified: they file absences (which
    // needs no certification) and hold assignments (likewise), and every case
    // that needs a certified COVER uses one of the two minted accounts.

    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.from("locations").delete().eq("id", SITE);
    await admin.from("locations").insert({
      id: SITE,
      name: "Cover Hall",
      type: "site",
      parent_id: TEST_IDS.LOCATION_MUNICIPALITY,
      country_code: "FI",
    });

    // Inserted directly rather than through createTestProduct: that helper always
    // writes a REMOTE product and takes no fee arguments, and this file needs one
    // of each and the two per-session fees the pool list reports.
    await admin.from("products").insert([
      {
        id: PRODUCT,
        product_type: "consumer_club",
        billing_mode: "free",
        topic: "minecraft_java",
        spoken_language_code: "en",
        is_remote: true,
        location_id: null,
        timezone: "UTC",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        is_visible: true,
        created_by: TEST_IDS.ADMIN,
        start_date: utcDate(-60),
        end_date: utcDate(60),
        min_age: 8,
        max_age: 18,
        seat_count: null,
        primary_gedu_fee_cents: 5000,
        assistant_gedu_fee_cents: 3000,
      },
      {
        id: SITE_PRODUCT,
        product_type: "consumer_club",
        billing_mode: "free",
        topic: "minecraft_java",
        spoken_language_code: "en",
        is_remote: false,
        location_id: SITE,
        timezone: "UTC",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        is_visible: true,
        created_by: TEST_IDS.ADMIN,
        start_date: utcDate(-60),
        end_date: utcDate(60),
        min_age: 8,
        max_age: 18,
        seat_count: null,
      },
      {
        id: OFF_PRODUCT,
        product_type: "consumer_club",
        billing_mode: "free",
        topic: "minecraft_java",
        spoken_language_code: "en",
        is_remote: true,
        location_id: null,
        timezone: "UTC",
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
        is_visible: true,
        created_by: TEST_IDS.ADMIN,
        start_date: utcDate(-60),
        end_date: utcDate(60),
        min_age: 8,
        max_age: 18,
        seat_count: null,
      },
    ]);

    await admin
      .from("product_translations")
      .insert([
        { product_id: PRODUCT, locale: "en", name: "Cover Club", short_description: "x" },
      ]);

    // A slot on every weekday, so `group_session_date_is_writable` accepts any
    // date in the term and no case has to pick its dates around a calendar.
    await admin.from("schedule_slots").insert(
      [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
        [PRODUCT, SITE_PRODUCT].map((product_id) => ({
          product_id,
          weekday,
          start_time: "10:00",
          duration_minutes: 60,
        })),
      ),
    );

    await admin.from("product_groups").insert([
      { id: GROUP_A, product_id: PRODUCT, name: "Cohort A" },
      { id: GROUP_B, product_id: PRODUCT, name: "Cohort B" },
      { id: GROUP_SITE, product_id: SITE_PRODUCT, name: "Hall Cohort" },
      { id: GROUP_OFF, product_id: OFF_PRODUCT, name: "Elsewhere" },
    ]);

    await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP_A, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT, role: "primary" },
      {
        group_id: GROUP_SITE,
        gedu_id: TEST_IDS.GEDU,
        product_id: SITE_PRODUCT,
        role: "primary",
      },
    ]);

    // One active seat on GROUP_A, because the assignment summaries' owed count is
    // guarded on a non-empty roster.
    await admin.from("participations").insert({
      product_id: PRODUCT,
      group_id: GROUP_A,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    // Assignments hold ON DELETE RESTRICT onto profiles, and so do a cover
    // request's two people — but requests cascade with their group, which
    // cascades with its product, so deleting the products is the whole of the
    // cover cleanup. The assignments still have to go before the accounts do.
    await admin.from("gedu_group_assignments").delete().in("gedu_id", [subId, thirdId]);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.from("site_details").delete().eq("location_id", SITE);
    await admin.from("site_staff_details").delete().eq("location_id", SITE);
    await admin.from("locations").delete().eq("id", SITE);
    await admin.auth.admin.deleteUser(subId);
    await admin.auth.admin.deleteUser(thirdId);
  });

  /** Nothing recorded: every block starts from an unstaffed, uncovered group. */
  beforeEach(async () => {
    await admin.from("session_cover_requests").delete().in("group_id", ALL_GROUPS);
    await admin.from("group_sessions").delete().in("group_id", ALL_GROUPS);
    await admin
      .from("gedu_profiles")
      .update({ certified: true })
      .in("user_id", [subId, thirdId]);
    await admin
      .from("gedu_group_assignments")
      .delete()
      .in("gedu_id", [subId, thirdId]);
  });

  /** Writes a request row straight to the table, bypassing every RPC guard. */
  async function seedRequest(input: {
    groupId?: string;
    date: string;
    absent?: string;
    coveredBy?: string | null;
    status?: Database["public"]["Enums"]["cover_request_status"];
    role?: Database["public"]["Enums"]["gedu_assignment_role"];
  }): Promise<string> {
    const covered = input.coveredBy ?? null;
    const { data, error } = await admin
      .from("session_cover_requests")
      .insert({
        group_id: input.groupId ?? GROUP_A,
        session_date: input.date,
        requested_by: input.absent ?? TEST_IDS.GEDU,
        role: input.role ?? "primary",
        status: input.status ?? (covered ? "covered" : "open"),
        covered_by: covered,
        approved_by: covered ? TEST_IDS.ADMIN : null,
        approved_at: covered ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id ?? "";
  }

  async function isExpected(gedu: string, date: string, group = GROUP_A) {
    const { data, error } = await admin.rpc("gedu_is_expected_at_session", {
      p_gedu_id: gedu,
      p_group_id: group,
      p_session_date: date,
    });
    expect(error).toBeNull();
    return data;
  }

  async function mayCover(
    gedu: string,
    date: string,
    absent: string,
    group = GROUP_A,
  ) {
    const { data, error } = await admin.rpc("gedu_may_cover_session", {
      p_gedu_id: gedu,
      p_group_id: group,
      p_session_date: date,
      p_absent_gedu_id: absent,
    });
    expect(error).toBeNull();
    return data;
  }

  async function coversGroup(
    client: SupabaseClient<Database>,
    group = GROUP_A,
  ) {
    const { data, error } = await client.rpc("gedu_covers_group", {
      p_group_id: group,
    });
    expect(error).toBeNull();
    return data;
  }

  async function statusOf(requestId: string) {
    const { data, error } = await admin
      .from("session_cover_requests")
      .select("status, covered_by, approved_by, approved_at")
      .eq("id", requestId)
      .single();
    expect(error).toBeNull();
    return data;
  }

  // -------------------------------------------------------------------------
  // 1. The access surface stays complete
  // -------------------------------------------------------------------------

  describe("the assignment-gate completeness check", () => {
    /**
     * Members whose reference to `gedu_group_assignments` is NOT a gate, each
     * with the reason it is not. The enumeration is a QUERY, not a snapshot: a
     * seventh gate added next year is found by the catalogs, not by memory.
     *
     * A member carrying a cover branch — a reference to `session_cover_requests`,
     * `gedu_covers_group` or `gedu_covers_session` — must NOT appear here, and
     * the second assertion below is what polices that: an annotation left behind
     * on a member that has since been widened reads as coverage while covering
     * nothing, which is how every allowlist design fails.
     *
     * `validate_gedu_assignment_product` is a member of the same set and is
     * deliberately absent: it is a TRIGGER function, and the catalog helper
     * excludes those by design (PostgREST cannot invoke one, so it is not a
     * callable surface). 00272's own end-of-migration block, which reads pg_proc
     * directly, does name it.
     *
     * **Two blind spots this check cannot see, and neither is theoretical.** A
     * function whose body is `BEGIN ATOMIC` has a NULL `prosrc` — the catalogs
     * hold its parse tree instead of its text — so it would arrive with an empty
     * expression and be read as referencing nothing; today there are none, and
     * the schema-wide parse of this file's `functionSurface` (a non-nullable
     * `body`) is what would fail the moment one appeared. And a VIEW that joins
     * `gedu_group_assignments` is not a function or a policy, so it is not a
     * member at all; views are held to the `security_invoker` rule and the
     * spine's own registry instead, which is a different mechanism rather than
     * this one applied more widely.
     */
    const ASSIGNMENT_ONLY: Record<string, string> = {
      "function:chat_channel_roster_ids":
        "LISTS who a channel can name rather than gating on it. Its own comment carries the decision: a covering gedu becomes mentionable once they send.",
      "function:get_my_family_product_feed":
        "LISTS the group's gedus by first name for a FAMILY. The report attribution chip already names whoever wrote a report, so a family learns nothing new from a cover — and this is the app's one STRICT client schema, so a widened document would fail the old app's parse rather than be stripped by it.",
      "function:get_product_groups_with_details":
        "LISTS a group's gedus for the admin groups panel, which is the PERMANENT assignment editor. Admin-gated, and the list is exactly what that panel edits.",
      "policy:gedu_group_assignments.customers_read_assignments_via_gamers":
        "reads assignment ROWS for a parent whose child is on the product. A read of the rows, not a gate on them.",
    };

    const COVER_BRANCH = [
      "session_cover_requests",
      "gedu_covers_group",
      "gedu_covers_session",
    ];

    /**
     * Every function body and every policy expression in `public` — the pool the
     * member set is drawn from, and also what the leaf check below searches for
     * references to an annotated member.
     */
    async function surface() {
      const functions = await admin.rpc("_list_function_authorization_surface");
      expect(functions.error).toBeNull();
      const policies = await admin.rpc("_list_policy_expressions");
      expect(policies.error).toBeNull();

      return [
        ...functionSurface
          .parse(functions.data)
          .map((fn) => ({
            key: `function:${fn.function_name}`,
            expression: fn.body,
          })),
        ...policyExpressions
          .parse(policies.data)
          .map((policy) => ({
            key: `policy:${policy.table_name}.${policy.policy_name}`,
            expression: policy.expression,
          })),
      ];
    }

    async function members() {
      return (await surface()).filter((row) =>
        row.expression.includes("gedu_group_assignments"),
      );
    }

    it("every gate on gedu_group_assignments carries a cover branch or is annotated", async () => {
      const unbranched = [
        ...new Set(
          (await members())
            .filter(
              (row) => !COVER_BRANCH.some((name) => row.expression.includes(name)),
            )
            .map((row) => row.key),
        ),
      ].sort();

      expect(
        unbranched,
        "a function body or policy expression that references gedu_group_assignments " +
          "must either reference the cover branch (session_cover_requests, " +
          "gedu_covers_group or gedu_covers_session) or be annotated in " +
          "ASSIGNMENT_ONLY above with the reason its reference is not a gate",
      ).toEqual(Object.keys(ASSIGNMENT_ONLY).sort());
    });

    it("no annotation survives the member being widened or removed", async () => {
      // The other direction, and the load-bearing one: allowlist growth is this
      // design's failure mode, and an entry for a member that now carries the
      // branch (or has gone) is an allowlist entry vetting nothing.
      const rows = await members();
      const byKey = new Map(rows.map((row) => [row.key, row.expression]));

      const stale = Object.keys(ASSIGNMENT_ONLY)
        .filter((key) => {
          const expression = byKey.get(key);
          if (expression === undefined) return true;
          return COVER_BRANCH.some((name) => expression.includes(name));
        })
        .sort();

      expect(
        stale,
        "an annotation is stale: its member either no longer references " +
          "gedu_group_assignments at all, or has since gained a cover branch — " +
          "delete the entry in the same change",
      ).toEqual([]);
    });

    /**
     * The annotated members that are NOT leaves, with every body that composes
     * them — see the test below for why an unlisted composer is a hole.
     */
    const ANNOTATED_COMPOSERS: Record<string, string[]> = {
      "function:chat_channel_roster_ids": [
        "function:chat_body_mentions_are_roster",
        "function:get_chat_channel_roster",
        "function:set_chat_lock",
      ],
    };

    it("no annotated member is composed by a body this check never sees", async () => {
      // The hole an annotation can hide in. A member is a body that NAMES
      // gedu_group_assignments, so a helper that names it and is annotated
      // "not a gate" takes its callers out of the set with it: they reference
      // the helper, not the table, so they are never members and never have to
      // carry a cover branch — and one of them may be exactly the gate the
      // annotation said this one was not.
      //
      // The rule is therefore: an annotated member is a LEAF, or its composers
      // are written down here, because the annotation has to be true of them
      // too. A new composer fails this and is decided by a person.
      const rows = await surface();

      for (const key of Object.keys(ASSIGNMENT_ONLY)) {
        // A policy composes nothing — no expression can name one.
        if (!key.startsWith("function:")) continue;
        const name = key.slice("function:".length);

        const composers = rows
          .filter((row) => row.key !== key && row.expression.includes(name))
          .map((row) => row.key)
          .sort();

        expect(
          composers,
          `${key} is annotated as not-a-gate, and these bodies compose it — ` +
            "each inherits the annotation without being checked for one. Either " +
            "list them in ANNOTATED_COMPOSERS having satisfied yourself the " +
            "reason holds for them too, or widen the member itself",
        ).toEqual((ANNOTATED_COMPOSERS[key] ?? []).slice().sort());
      }
    });

    it("every widened gate names the cover branch", async () => {
      // Named positively as well, so a gate that was widened and later reverted
      // fails here rather than quietly rejoining the annotated list.
      const branched = new Set(
        (await members())
          .filter((row) => COVER_BRANCH.some((name) => row.expression.includes(name)))
          .map((row) => row.key),
      );

      for (const key of [
        // Not a gate — the assignment writer, which was annotated as such until
        // 00276 gave it the orphan SWEEP: removing an assignment unseats
        // somebody, and every other unseating already withdraws the cover
        // requests it orphans. The reference is real, so the honest answer is
        // that it is branched; it is named here rather than annotated so that
        // losing the sweep fails loudly instead of quietly rejoining the
        // annotated list.
        "function:apply_group_changes",
        "function:gedu_teaches_group",
        "function:gedu_teaches_group_product",
        "function:is_voice_group_member",
        "function:is_voice_group_moderator",
        "function:claim_group_session_report_email",
        "function:set_group_member_minecraft",
        "function:set_group_member_roblox",
        "function:set_site_notes",
        "function:get_gedu_assigned_product",
        "policy:product_groups.gedus_read_assigned_groups",
      ]) {
        expect(branched.has(key), `${key} has lost its cover branch`).toBe(true);
      }
    });
  });

  /**
   * The PERMANENT home of the access-posture checks 00272 also asserts at the
   * foot of itself. Two things about that migration's copy are worth knowing
   * here, because this is the copy that runs on every build:
   *
   * - **Its grant sweep asks about four privileges** — SELECT, INSERT, UPDATE
   *   and DELETE — and a table can be granted TRUNCATE, REFERENCES or TRIGGER
   *   too. None of the three is a read or a write of rows, but REFERENCES lets a
   *   grantee build a foreign key onto the table (an existence oracle, and a
   *   lock on deletes) and TRIGGER lets them attach code to it. The sweep below
   *   covers all seven, and proves it can SEE all seven rather than asserting an
   *   empty list against a helper that might only ever report four.
   * - **Its role-backfill assertion is vacuous on a fresh database.** "No
   *   assignment has a role other than primary" is true and worth asserting, and
   *   CI builds its database from `migrations/` with no assignments in it, so
   *   that clause proves the backfill nowhere but on staging. The column's
   *   DEFAULT — which is what makes the backfill correct — is asserted from
   *   `information_schema` in the same block and is not vacuous.
   */
  describe("the two cover tables are off the Data API", () => {
    /** Every privilege `information_schema` can report on a table. */
    const TABLE_PRIVILEGES = [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ];
    const COVER_TABLES = ["session_cover_requests", "session_cover_offers"];

    async function coverTableGrants(grantee: string) {
      const { data, error } = await admin.rpc("_list_table_grants", {
        p_grantee: grantee,
      });
      expect(error).toBeNull();
      return z
        .array(z.object({ table_name: z.string(), privilege_type: z.string() }))
        .parse(data)
        .filter((row) => COVER_TABLES.includes(row.table_name));
    }

    it("neither authenticated nor anon holds any grant on them", async () => {
      for (const grantee of ["authenticated", "anon"]) {
        expect(
          await coverTableGrants(grantee),
          `${grantee} can reach a cover table directly — every read and write ` +
            "goes through a SECURITY DEFINER RPC, the same posture as group_sessions",
        ).toEqual([]);
      }
    });

    it("and the sweep can see every privilege a table can carry", async () => {
      // Without this the assertion above could pass for the wrong reason: a
      // helper that only ever reported the four DML privileges would return an
      // empty list for a table granted TRUNCATE and look like proof. service_role
      // holds GRANT ALL on both tables, so all seven must come back for each.
      const granted = await coverTableGrants("service_role");

      for (const table of COVER_TABLES) {
        expect(
          granted
            .filter((row) => row.table_name === table)
            .map((row) => row.privilege_type)
            .sort(),
          `the grant sweep cannot see every privilege type on ${table}, so the ` +
            "empty result it reports for authenticated and anon proves less " +
            "than it appears to",
        ).toEqual([...TABLE_PRIVILEGES].sort());
      }
    });

    it("a gedu's own client cannot read a request row", async () => {
      const date = utcDate(4);
      await seedRequest({ date });

      const { data, error } = await geduAuth
        .from("session_cover_requests")
        .select("id");

      // No grant at all, so PostgREST refuses rather than returning an empty set
      // — which is the fail-closed shape, and the reason the admin-only policy on
      // the table decides nothing today.
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. The derivation
  // -------------------------------------------------------------------------

  describe("who is expected at a session", () => {
    it("an assigned gedu is expected, and an unassigned one is not", async () => {
      const date = utcDate(5);
      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(true);
      expect(await isExpected(subId, date)).toBe(false);
    });

    it("an OPEN request takes the requester out", async () => {
      const date = utcDate(5);
      await seedRequest({ date });
      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
      // …and only on that date.
      expect(await isExpected(TEST_IDS.GEDU, utcDate(6))).toBe(true);
    });

    it("a COVERED request puts the sub in and keeps the requester out", async () => {
      const date = utcDate(5);
      await seedRequest({ date, coveredBy: subId });
      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
      expect(await isExpected(subId, date)).toBe(true);
    });

    it("a CHAIN names only the last sub", async () => {
      const date = utcDate(5);
      // A is out, SUB covers; SUB is then out too, THIRD covers.
      await seedRequest({ date, coveredBy: subId });
      await seedRequest({ date, absent: subId, coveredBy: thirdId });

      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
      expect(await isExpected(subId, date)).toBe(false);
      expect(await isExpected(thirdId, date)).toBe(true);
    });

    it("an OPEN sub-of-sub request leaves nobody expected", async () => {
      const date = utcDate(5);
      await seedRequest({ date, coveredBy: subId });
      await seedRequest({ date, absent: subId });

      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
      expect(await isExpected(subId, date)).toBe(false);
      expect(await isExpected(thirdId, date)).toBe(false);
    });

    it("a WITHDRAWN request restores the assigned gedu", async () => {
      const date = utcDate(5);
      const id = await seedRequest({ date });
      await admin
        .from("session_cover_requests")
        .update({ status: "withdrawn" })
        .eq("id", id);

      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(true);
    });

    it("a cleared cover leaves the absence standing", async () => {
      // The distinction the whole model rests on: clearing a cover reopens the
      // REQUEST, it does not cancel the ABSENCE. Nobody is expected, which is
      // exactly "back in the queue".
      const date = utcDate(5);
      const id = await seedRequest({ date, coveredBy: subId });

      const { error } = await adminAuth.rpc("clear_session_cover", {
        p_request_id: id,
      });
      expect(error).toBeNull();

      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
      expect(await isExpected(subId, date)).toBe(false);
    });

    it("answers about the group and the date it was asked about", async () => {
      const date = utcDate(5);
      await seedRequest({ date, coveredBy: subId });
      // A cover on GROUP_A says nothing about GROUP_B, and nothing about
      // another date of GROUP_A.
      expect(await isExpected(subId, date, GROUP_B)).toBe(false);
      expect(await isExpected(subId, utcDate(6))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The access window
  // -------------------------------------------------------------------------

  describe("the cover access window", () => {
    it("is open before the report is mailed, inside the 15-day fallback", async () => {
      await seedRequest({ date: utcDate(-3), coveredBy: subId });
      expect(await coversGroup(subAuth)).toBe(true);
    });

    it("has closed 15 days after the session when no report was ever mailed", async () => {
      await seedRequest({ date: utcDate(-20), coveredBy: subId });
      expect(await coversGroup(subAuth)).toBe(false);
    });

    it("is still open on the 14th day and shut on the 16th", async () => {
      // The boundary, walked rather than asserted at one point — the predicate
      // has to be shown FLIPPING, or a body that always answered true would pass
      // the case above.
      const id = await seedRequest({ date: utcDate(-14), coveredBy: subId });
      expect(await coversGroup(subAuth)).toBe(true);

      await admin
        .from("session_cover_requests")
        .update({ session_date: utcDate(-16) })
        .eq("id", id);
      expect(await coversGroup(subAuth)).toBe(false);
    });

    it("closes 24 hours after the report is mailed, however early that is", async () => {
      const date = utcDate(-3);
      await seedRequest({ date, coveredBy: subId });
      await admin.from("group_sessions").insert({
        group_id: GROUP_A,
        session_date: date,
        ...slotInstants(date),
        report: "a report",
        report_emailed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });

      // One hour after the send: the 24 hours have not run out, and the mail
      // arm — not the 15-day fallback — is what is deciding.
      expect(await coversGroup(subAuth)).toBe(true);

      await admin
        .from("group_sessions")
        .update({
          report_emailed_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        })
        .eq("group_id", GROUP_A)
        .eq("session_date", date);

      // Twenty-five hours after the send, and still eleven days inside the
      // fallback: the mail arm overrides it, which is the whole point of the
      // COALESCE reading the mail stamp first.
      expect(await coversGroup(subAuth)).toBe(false);
    });

    it("shuts the moment the holder is de-certified, mid-window", async () => {
      await seedRequest({ date: utcDate(-3), coveredBy: subId });
      expect(await coversGroup(subAuth)).toBe(true);

      await admin
        .from("gedu_profiles")
        .update({ certified: false })
        .eq("user_id", subId);

      expect(await coversGroup(subAuth)).toBe(false);
    });

    it("answers only about the caller", async () => {
      // The spine classifies gedu_covers_group as self-scoping, and this is the
      // scope test it names: the same group id, three callers, three answers.
      await seedRequest({ date: utcDate(-3), coveredBy: subId });

      expect(await coversGroup(subAuth)).toBe(true);
      expect(await coversGroup(thirdAuth)).toBe(false);
      // The ABSENT gedu does not cover their own absence, even though they are
      // the group's assigned educator — this predicate is about covers alone.
      expect(await coversGroup(geduAuth)).toBe(false);
    });

    it("says nothing about a group the cover is not on", async () => {
      await seedRequest({ date: utcDate(-3), coveredBy: subId });
      expect(await coversGroup(subAuth, GROUP_B)).toBe(false);
      expect(await coversGroup(subAuth, GROUP_OFF)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. May cover: the four refusals
  // -------------------------------------------------------------------------

  describe("who may be seated as a sub", () => {
    const date = utcDate(5);

    it("refuses the absent gedu themselves", async () => {
      await seedRequest({ date });
      expect(await mayCover(TEST_IDS.GEDU, date, TEST_IDS.GEDU)).toBe(false);
    });

    it("refuses an uncertified gedu", async () => {
      await seedRequest({ date });
      expect(await mayCover(subId, date, TEST_IDS.GEDU)).toBe(true);

      await admin
        .from("gedu_profiles")
        .update({ certified: false })
        .eq("user_id", subId);

      expect(await mayCover(subId, date, TEST_IDS.GEDU)).toBe(false);
    });

    it("refuses somebody already expected at that session", async () => {
      await seedRequest({ date });
      // SUB is seated as the cover, so SUB is now expected — and cannot also be
      // the answer to a second seat on the same session.
      await admin
        .from("session_cover_requests")
        .update({
          status: "covered",
          covered_by: subId,
          approved_by: TEST_IDS.ADMIN,
          approved_at: new Date().toISOString(),
        })
        .eq("group_id", GROUP_A)
        .eq("session_date", date);

      expect(await mayCover(subId, date, TEST_IDS.GEDU)).toBe(false);

      // An ASSIGNED gedu is expected too, and is refused for the same reason
      // rather than for a different one.
      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_A,
        gedu_id: thirdId,
        product_id: PRODUCT,
        role: "assistant",
      });
      expect(await mayCover(thirdId, date, TEST_IDS.GEDU)).toBe(false);
    });

    it("refuses somebody holding a non-withdrawn request of their own", async () => {
      await seedRequest({ date, coveredBy: subId });
      // SUB, now the cover, files their own absence. They may no longer be the
      // answer to anybody else's absence on that date either.
      await seedRequest({ date, absent: subId });
      expect(await mayCover(subId, date, TEST_IDS.GEDU)).toBe(false);

      // Withdraw it and they are a candidate again — the refusal is about a LIVE
      // request, and a withdrawn row is history.
      await admin
        .from("session_cover_requests")
        .update({ status: "withdrawn" })
        .eq("requested_by", subId)
        .eq("session_date", date);
      // …still refused, because they remain the covered_by of a live cover and
      // are therefore expected. This is condition (3) taking over from (4),
      // which is what the two of them together are for.
      expect(await mayCover(subId, date, TEST_IDS.GEDU)).toBe(false);
    });

    it("admits a clean candidate", async () => {
      await seedRequest({ date });
      expect(await mayCover(thirdId, date, TEST_IDS.GEDU)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. The widened workspace gate
  // -------------------------------------------------------------------------

  describe("the workspace a cover reaches", () => {
    it("admits a live cover to the group feed, and shuts again when the window does", async () => {
      const id = await seedRequest({ date: utcDate(-3), coveredBy: subId });

      const open = await subAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(open.error).toBeNull();
      expect(open.data).not.toBeNull();

      await admin
        .from("session_cover_requests")
        .update({ session_date: utcDate(-20) })
        .eq("id", id);

      const shut = await subAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(shut.error?.code).toBe(FORBIDDEN);
    });

    it("refuses a gedu with no cover and no assignment", async () => {
      const { error } = await thirdAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("resolves the covered group when the caller has no assignment on the product", async () => {
      await seedRequest({ groupId: GROUP_B, date: utcDate(-3), coveredBy: subId });

      const { data, error } = await subAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT,
      });
      expect(error).toBeNull();
      expect(z.object({ my_group_id: z.string() }).parse(data).my_group_id).toBe(
        GROUP_B,
      );
    });

    it("takes p_group_id so a cover on a SISTER group lands in the right workspace", async () => {
      // A gedu assigned to GROUP_A who covers GROUP_B. Without the parameter the
      // assignment wins, which is exactly why the cover card's link carries the
      // group id. The MINTED account holds both roles here rather than the seeded
      // one, so the case depends on no certification this file does not own.
      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_A,
        gedu_id: subId,
        product_id: PRODUCT,
        role: "assistant",
      });
      await seedRequest({
        groupId: GROUP_B,
        date: utcDate(-3),
        absent: thirdId,
        coveredBy: subId,
      });

      const withoutGroup = await subAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT,
      });
      expect(withoutGroup.error).toBeNull();
      expect(
        z.object({ my_group_id: z.string() }).parse(withoutGroup.data).my_group_id,
      ).toBe(GROUP_A);

      const withGroup = await subAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT,
        p_group_id: GROUP_B,
      });
      expect(withGroup.error).toBeNull();
      expect(
        z.object({ my_group_id: z.string() }).parse(withGroup.data).my_group_id,
      ).toBe(GROUP_B);
    });

    it("refuses a p_group_id the caller neither teaches nor covers", async () => {
      const { error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT,
        p_group_id: GROUP_B,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("admits a live cover to the site notes of an in-person product at that site", async () => {
      await seedRequest({
        groupId: GROUP_SITE,
        date: utcDate(-3),
        coveredBy: subId,
      });

      const { error } = await subAuth.rpc("set_site_notes", {
        p_location_id: SITE,
        p_public_note: "Door code 1234",
        p_gedu_note: "The lift is out",
      });
      expect(error).toBeNull();

      const refused = await thirdAuth.rpc("set_site_notes", {
        p_location_id: SITE,
        p_public_note: "nope",
        p_gedu_note: "nope",
      });
      expect(refused.error?.code).toBe(FORBIDDEN);
    });
  });

  // -------------------------------------------------------------------------
  // 6. The two date-scoped exceptions
  // -------------------------------------------------------------------------

  describe("the voice room admits a cover on the covered date only", () => {
    async function voiceArms() {
      const member = await subAuth.rpc("is_voice_group_member", {
        p_group_id: GROUP_A,
      });
      expect(member.error).toBeNull();
      const moderator = await subAuth.rpc("is_voice_group_moderator", {
        p_group_id: GROUP_A,
      });
      expect(moderator.error).toBeNull();
      return { member: member.data, moderator: moderator.data };
    }

    it("admits a cover dated YESTERDAY, so a session running past midnight keeps it", async () => {
      // A session dated Monday that runs to 00:30 is still Monday's session at
      // 00:10 on Tuesday, and a 00:10 start has its whole pre-window on Monday.
      // Asking only about today ejected the cover from the room and the chat at
      // local midnight; the predicates now take today OR yesterday.
      //
      // TWO ROWS, and the second one is not slack — it is what makes this case
      // immune to the run crossing UTC midnight between these two statements.
      // If the database still calls today what the runner does, the -1 row is
      // yesterday and it is the yesterday arm that admits. If midnight has
      // passed, the -1 row is two days back and the +1 row has become today, so
      // the case still passes rather than flaking; the two-days-back case below
      // is deterministic under either reading and is what proves the window is
      // exactly two days wide.
      await seedRequest({ date: utcDate(-1), coveredBy: subId });
      await seedRequest({ date: utcDate(1), coveredBy: subId });

      expect(await voiceArms()).toEqual({ member: true, moderator: true });
    });

    it("refuses a cover dated TWO DAYS ago, so the overlap is one day and not a week", async () => {
      // Deterministic however the run straddles midnight: two days back reads as
      // two or three days back, and neither is admitted.
      await seedRequest({ date: utcDate(-2), coveredBy: subId });

      expect(await voiceArms()).toEqual({ member: false, moderator: false });

      // …while the group-wide gate is open on the same fixture — the access
      // window runs fifteen days — which is what makes this case about the DATE
      // arm rather than about the cover having expired.
      expect(await coversGroup(subAuth)).toBe(true);
    });

    it("refuses a cover whose date is not today", async () => {
      // A week out, so no reading of "today" can reach it however the run
      // straddles UTC midnight.
      await seedRequest({ date: utcDate(7), coveredBy: subId });

      const member = await subAuth.rpc("is_voice_group_member", {
        p_group_id: GROUP_A,
      });
      expect(member.error).toBeNull();
      expect(member.data).toBe(false);

      const moderator = await subAuth.rpc("is_voice_group_moderator", {
        p_group_id: GROUP_A,
      });
      expect(moderator.error).toBeNull();
      expect(moderator.data).toBe(false);

      // …while the group-wide gate is wide open on the same fixture, which is
      // what makes this case about the DATE and not about the cover.
      expect(await coversGroup(subAuth)).toBe(true);
    });

    it("admits a cover on today", async () => {
      // Seeded on today AND tomorrow: whichever date the database calls today,
      // one of the two rows matches, so this cannot flake at a midnight
      // boundary. Two rows on two dates are legal — the live-seat key is per
      // (group, date, person).
      await seedRequest({ date: utcDate(0), coveredBy: subId });
      await seedRequest({ date: utcDate(1), coveredBy: subId });

      const member = await subAuth.rpc("is_voice_group_member", {
        p_group_id: GROUP_A,
      });
      expect(member.error).toBeNull();
      expect(member.data).toBe(true);

      const moderator = await subAuth.rpc("is_voice_group_moderator", {
        p_group_id: GROUP_A,
      });
      expect(moderator.error).toBeNull();
      expect(moderator.data).toBe(true);
    });

    it("leaves the assignment arm product-wide", async () => {
      // The cover branch ADDS to the existing mobility rather than narrowing it:
      // the seeded gedu is assigned to GROUP_A and reaches GROUP_B's room on any
      // date, as they always did.
      const { data, error } = await geduAuth.rpc("is_voice_group_member", {
        p_group_id: GROUP_B,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });
  });

  describe("the family report mail admits a cover on the covered date only", () => {
    it("refuses the claim for a date the cover is not on", async () => {
      const covered = utcDate(-3);
      const other = utcDate(-4);
      await seedRequest({ date: covered, coveredBy: subId });

      // A report exists on BOTH dates, so the refusal cannot be the "nothing to
      // send" arm standing in for the authorization one.
      for (const date of [covered, other]) {
        await admin.from("group_sessions").insert({
          group_id: GROUP_A,
          session_date: date,
          ...slotInstants(date),
          report: "a report",
        });
      }

      const wrongDate = await subAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_A,
        p_session_date: other,
      });
      expect(wrongDate.error?.code).toBe(FORBIDDEN);

      const rightDate = await subAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_A,
        p_session_date: covered,
      });
      expect(rightDate.error).toBeNull();
    });

    it("still admits the group's assigned gedu on any date", async () => {
      const date = utcDate(-4);
      await admin.from("group_sessions").insert({
        group_id: GROUP_A,
        session_date: date,
        ...slotInstants(date),
        report: "a report",
      });

      const { error } = await geduAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_A,
        p_session_date: date,
      });
      expect(error).toBeNull();
    });

    it("lets a cover write the report on any date of the group", async () => {
      // Writing is group-wide and only the MAIL is date-scoped, which is the
      // asymmetry the plan is explicit about: a sub may fix a typo, and may not
      // announce a session they did not run.
      await seedRequest({ date: utcDate(-3), coveredBy: subId });

      const { error } = await subAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(-4),
        p_report: "written by the sub",
        p_gedu_note: "",
      });
      expect(error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 7. The gedu writes
  // -------------------------------------------------------------------------

  describe("filing, withdrawing and offering", () => {
    it("files a request with the filer's assignment role and a trimmed note", async () => {
      const date = utcDate(5);
      const { data, error } = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_reason: "sick",
        p_reason_note: "   a note   ",
      });
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.status).toBe("open");
      expect(doc.role).toBe("primary");
      expect(doc.requested_by).toBe(TEST_IDS.GEDU);
      expect(doc.is_requester).toBe(true);
      expect(doc.offer_count).toBe(0);
      // Admin-only on the wire, present as null so the document keeps one shape.
      expect(doc.reason).toBeNull();
      expect(doc.reason_note).toBeNull();

      const { data: row } = await admin
        .from("session_cover_requests")
        .select("reason, reason_note")
        .eq("id", doc.id)
        .single();
      expect(row?.reason).toBe("sick");
      expect(row?.reason_note).toBe("a note");
    });

    it("carries the ASSISTANT role when that is the filer's role", async () => {
      await admin
        .from("gedu_group_assignments")
        .update({ role: "assistant" })
        .eq("group_id", GROUP_A)
        .eq("gedu_id", TEST_IDS.GEDU);

      const { data, error } = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(5),
        p_reason: "other",
      });
      expect(error).toBeNull();
      expect(coverRequestDocument.parse(data).role).toBe("assistant");

      await admin
        .from("gedu_group_assignments")
        .update({ role: "primary" })
        .eq("group_id", GROUP_A)
        .eq("gedu_id", TEST_IDS.GEDU);
    });

    it("refuses a gedu who is not expected at that session", async () => {
      const { error } = await subAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(5),
        p_reason: "sick",
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("lets an approved cover file their own absence, with the covered role", async () => {
      const date = utcDate(5);
      await seedRequest({ date, coveredBy: subId, role: "assistant" });

      const { data, error } = await subAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_reason: "other",
      });
      expect(error).toBeNull();
      const doc = coverRequestDocument.parse(data);
      expect(doc.requested_by).toBe(subId);
      expect(doc.role).toBe("assistant");
    });

    it("refuses a past date, a missing reason, and an unscheduled one", async () => {
      const past = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(-5),
        p_reason: "sick",
      });
      expect(past.error?.code).toBe(CHECK_VIOLATION);

      const noReason = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(5),
      });
      expect(noReason.error?.code).toBe(CHECK_VIOLATION);

      // Beyond the term's end date, so the writable-date check refuses it.
      const outsideTerm = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: utcDate(120),
        p_reason: "sick",
      });
      expect(outsideTerm.error?.code).toBe(CHECK_VIOLATION);
    });

    it("withdraws its own open request, and refuses somebody else's", async () => {
      const date = utcDate(5);
      const mine = await seedRequest({ date });

      const stranger = await subAuth.rpc("withdraw_session_cover_request", {
        p_request_id: mine,
      });
      expect(stranger.error?.code).toBe(FORBIDDEN);

      const { data, error } = await geduAuth.rpc("withdraw_session_cover_request", {
        p_request_id: mine,
      });
      expect(error).toBeNull();
      expect(coverRequestDocument.parse(data).status).toBe("withdrawn");

      // And a withdrawn row does not block a fresh request for the same seat.
      const again = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_reason: "sick",
      });
      expect(again.error).toBeNull();
    });

    it("refuses to withdraw a request an admin has already covered", async () => {
      const id = await seedRequest({ date: utcDate(5), coveredBy: subId });
      const { error } = await geduAuth.rpc("withdraw_session_cover_request", {
        p_request_id: id,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("offers idempotently, and refuses a candidate the guard turns down", async () => {
      const id = await seedRequest({ date: utcDate(5) });

      for (let i = 0; i < 2; i += 1) {
        const { error } = await subAuth.rpc("offer_session_cover", {
          p_request_id: id,
        });
        expect(error).toBeNull();
      }
      const { count } = await admin
        .from("session_cover_offers")
        .select("id", { count: "exact", head: true })
        .eq("request_id", id);
      expect(count).toBe(1);

      // The absent gedu cannot offer on their own absence.
      const own = await geduAuth.rpc("offer_session_cover", { p_request_id: id });
      expect(own.error?.code).toBe(FORBIDDEN);
    });

    it("refuses an offer on a past session and on a covered request", async () => {
      const past = await seedRequest({ date: utcDate(-5) });
      const pastOffer = await subAuth.rpc("offer_session_cover", {
        p_request_id: past,
      });
      expect(pastOffer.error?.code).toBe(CHECK_VIOLATION);

      const taken = await seedRequest({ date: utcDate(5), coveredBy: thirdId });
      const takenOffer = await subAuth.rpc("offer_session_cover", {
        p_request_id: taken,
      });
      expect(takenOffer.error?.code).toBe(CHECK_VIOLATION);
    });

    it("withdraws an offer, and refuses once the caller IS the cover", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });

      const { error } = await subAuth.rpc("withdraw_session_cover_offer", {
        p_request_id: id,
      });
      expect(error).toBeNull();
      const { count } = await admin
        .from("session_cover_offers")
        .select("id", { count: "exact", head: true })
        .eq("request_id", id);
      expect(count).toBe(0);

      await subAuth.rpc("offer_session_cover", { p_request_id: id });
      await admin
        .from("session_cover_requests")
        .update({
          status: "covered",
          covered_by: subId,
          approved_by: TEST_IDS.ADMIN,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      const late = await subAuth.rpc("withdraw_session_cover_offer", {
        p_request_id: id,
      });
      expect(late.error?.code).toBe(CHECK_VIOLATION);
    });

    it("never names the absent gedu to the gedu who offers", async () => {
      // The pool list omits the absent person on purpose, and before 00276 the
      // offer that followed it handed them over: the document every write
      // returns always carried requested_by. One button-press was the whole
      // attack, and it worked on any open request in the pool.
      const id = await seedRequest({ date: utcDate(5) });
      await admin
        .from("session_cover_requests")
        .update({ reason: "sick", reason_note: "private" })
        .eq("id", id);

      const { data, error } = await subAuth.rpc("offer_session_cover", {
        p_request_id: id,
      });
      expect(error).toBeNull();

      const doc = anonymousCoverRequestDocument.parse(data);
      expect(doc.requested_by).toBeNull();
      expect(doc.requested_by_first_name).toBeNull();
      expect(doc.is_requester).toBe(false);
      // Nor by any other route off the same document.
      expect(doc.reason).toBeNull();
      expect(doc.reason_note).toBeNull();
      expect(doc.offer_count).toBeNull();
      expect(JSON.stringify(doc)).not.toContain(TEST_IDS.GEDU);
    });

    it("refuses a withdraw from a gedu holding no offer, rather than answering with the document", async () => {
      // The same leak without even a write: withdrawing an offer that was never
      // made deleted nothing and returned the request anyway, which made this
      // RPC a free lookup of who is away, keyed by request id. 42501 is the
      // answer an unknown id already gets, so it is not an existence oracle
      // either.
      const id = await seedRequest({ date: utcDate(5) });

      const { data, error } = await thirdAuth.rpc(
        "withdraw_session_cover_offer",
        { p_request_id: id },
      );

      expect(error?.code).toBe(FORBIDDEN);
      expect(data).toBeNull();
    });

    it("conceals the absent gedu on a withdraw that does delete an offer", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });

      const { data, error } = await subAuth.rpc("withdraw_session_cover_offer", {
        p_request_id: id,
      });
      expect(error).toBeNull();

      const doc = anonymousCoverRequestDocument.parse(data);
      expect(doc.requested_by).toBeNull();
      expect(doc.requested_by_first_name).toBeNull();
      expect(JSON.stringify(doc)).not.toContain(TEST_IDS.GEDU);
    });

    it("lets a losing offerer withdraw from a request somebody else took", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await thirdAuth.rpc("offer_session_cover", { p_request_id: id });
      await admin
        .from("session_cover_requests")
        .update({
          status: "covered",
          covered_by: subId,
          approved_by: TEST_IDS.ADMIN,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      const { error } = await thirdAuth.rpc("withdraw_session_cover_offer", {
        p_request_id: id,
      });
      expect(error).toBeNull();
    });
  });

  describe("the pool list", () => {
    it("carries the request the caller could take, with its role's fee and no absent name", async () => {
      const date = utcDate(7);
      const id = await seedRequest({ date });

      const { data, error } = await subAuth.rpc("get_open_cover_requests");
      expect(error).toBeNull();
      const rows = openCoverRequests.parse(data);
      const mine = rows.find((row) => row.request_id === id);

      expect(mine).toBeDefined();
      expect(mine?.group_name).toBe("Cohort A");
      expect(mine?.session_date).toBe(date);
      expect(mine?.role).toBe("primary");
      expect(mine?.fee_cents).toBe(5000);
      expect(mine?.has_offered).toBe(false);
      expect(mine?.product.site_name).toBeNull();
      expect(mine?.product.schedule_slots.length).toBe(7);
      // The absent gedu is not named, anywhere on the row. Naming them
      // half-reveals a private reason.
      expect(JSON.stringify(mine)).not.toContain(TEST_IDS.GEDU);
    });

    it("reports the assistant fee for an assistant seat", async () => {
      const id = await seedRequest({ date: utcDate(7), role: "assistant" });
      const { data } = await subAuth.rpc("get_open_cover_requests");
      const row = openCoverRequests
        .parse(data)
        .find((entry) => entry.request_id === id);
      expect(row?.fee_cents).toBe(3000);
    });

    it("flips has_offered once the caller has offered", async () => {
      const id = await seedRequest({ date: utcDate(7) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });

      const { data } = await subAuth.rpc("get_open_cover_requests");
      const row = openCoverRequests
        .parse(data)
        .find((entry) => entry.request_id === id);
      expect(row?.has_offered).toBe(true);
    });

    it("excludes the caller's own absence, a covered request and a past one", async () => {
      const own = await seedRequest({ date: utcDate(7) });
      const taken = await seedRequest({
        groupId: GROUP_B,
        date: utcDate(7),
        absent: thirdId,
        coveredBy: subId,
      });
      const past = await seedRequest({
        groupId: GROUP_SITE,
        date: utcDate(-7),
      });

      const { data } = await geduAuth.rpc("get_open_cover_requests");
      const ids = openCoverRequests.parse(data).map((row) => row.request_id);
      expect(ids).not.toContain(own);
      expect(ids).not.toContain(taken);
      expect(ids).not.toContain(past);
    });

    it("is empty for an uncertified gedu rather than a refusal", async () => {
      await seedRequest({ date: utcDate(7) });
      await admin
        .from("gedu_profiles")
        .update({ certified: false })
        .eq("user_id", subId);

      const { data, error } = await subAuth.rpc("get_open_cover_requests");
      expect(error).toBeNull();
      // Scoped to this file's own groups: another worker's fixtures are not this
      // case's business, and an uncertified gedu could only ever see them by the
      // same predicate failing.
      expect(
        openCoverRequests
          .parse(data)
          .filter((row) => ALL_GROUPS.includes(row.group_id)),
      ).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 8. The admin writes and their cascades
  // -------------------------------------------------------------------------

  describe("the admin staffing editor", () => {
    it("approves one offer and leaves the others standing", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });
      await thirdAuth.rpc("offer_session_cover", { p_request_id: id });

      const { data: offers } = await admin
        .from("session_cover_offers")
        .select("id, gedu_id")
        .eq("request_id", id);
      const chosen = offers?.find((offer) => offer.gedu_id === subId);
      expect(chosen).toBeDefined();

      const { data, error } = await adminAuth.rpc("approve_session_cover_offer", {
        p_offer_id: chosen?.id ?? "",
      });
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.status).toBe("covered");
      expect(doc.covered_by).toBe(subId);
      expect(doc.approved_at).not.toBeNull();
      // The admin document carries the reason and the offer count.
      expect(doc.offer_count).toBe(2);

      const { count } = await admin
        .from("session_cover_offers")
        .select("id", { count: "exact", head: true })
        .eq("request_id", id);
      expect(count).toBe(2);
    });

    it("refuses a second approval on the same request", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });
      await thirdAuth.rpc("offer_session_cover", { p_request_id: id });
      const { data: offers } = await admin
        .from("session_cover_offers")
        .select("id, gedu_id")
        .eq("request_id", id);

      const first = offers?.find((offer) => offer.gedu_id === subId)?.id ?? "";
      const second = offers?.find((offer) => offer.gedu_id === thirdId)?.id ?? "";

      expect(
        (await adminAuth.rpc("approve_session_cover_offer", { p_offer_id: first }))
          .error,
      ).toBeNull();
      const again = await adminAuth.rpc("approve_session_cover_offer", {
        p_offer_id: second,
      });
      expect(again.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses to seat a sub for a requester who no longer holds a seat", async () => {
      // The second line of defence behind the groups panel's own sweep: a
      // request whose requester has been unassigned by any route at all is not
      // an absence anybody can cover, and approving it would put a stranger in
      // the group's workspace to stand in for nobody. The row is emptied here
      // by deleting the assignment directly, which is the state the sweep is
      // meant to make impossible — this asserts what happens if it ever is not.
      const id = await seedRequest({ date: utcDate(5) });
      await subAuth.rpc("offer_session_cover", { p_request_id: id });
      const { data: offers } = await admin
        .from("session_cover_offers")
        .select("id")
        .eq("request_id", id);

      await admin
        .from("gedu_group_assignments")
        .delete()
        .eq("group_id", GROUP_A)
        .eq("gedu_id", TEST_IDS.GEDU);

      const refused = await adminAuth.rpc("approve_session_cover_offer", {
        p_offer_id: offers?.[0]?.id ?? "",
      });
      expect(refused.error?.code).toBe(CHECK_VIOLATION);
      expect((await statusOf(id))?.status).toBe("open");

      // Restored for the rest of the file: the seeded assignment is fixture,
      // not state this block owns.
      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_A,
        gedu_id: TEST_IDS.GEDU,
        product_id: PRODUCT,
        role: "primary",
      });
    });

    it("sets a sub on a PAST session with no request at all", async () => {
      const date = utcDate(-5);
      const { data, error } = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: TEST_IDS.GEDU,
        p_sub_gedu_id: subId,
      });
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.status).toBe("covered");
      expect(doc.requested_by).toBe(TEST_IDS.GEDU);
      expect(doc.covered_by).toBe(subId);
      expect(doc.role).toBe("primary");
      expect(doc.reason).toBeNull();
    });

    it("covers an OPEN request rather than filing a second one", async () => {
      const date = utcDate(5);
      const id = await seedRequest({ date });

      const { data, error } = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: TEST_IDS.GEDU,
        p_sub_gedu_id: subId,
      });
      expect(error).toBeNull();
      expect(coverRequestDocument.parse(data).id).toBe(id);

      const { count } = await admin
        .from("session_cover_requests")
        .select("id", { count: "exact", head: true })
        .eq("group_id", GROUP_A)
        .eq("session_date", date);
      expect(count).toBe(1);
    });

    it("RE-POINTS an existing cover, and sweeps the displaced sub's own absence", async () => {
      const date = utcDate(5);
      const first = await seedRequest({ date, coveredBy: subId });
      // The seated sub files their own absence, which only makes sense while they
      // hold the seat.
      const chain = await seedRequest({ date, absent: subId });

      const { data, error } = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: TEST_IDS.GEDU,
        p_sub_gedu_id: thirdId,
      });
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.id).toBe(first);
      expect(doc.covered_by).toBe(thirdId);

      // SUB no longer holds a seat there, so their own request is withdrawn and
      // is stripped of any cover it carried.
      const swept = await statusOf(chain);
      expect(swept?.status).toBe("withdrawn");
      expect(swept?.covered_by).toBeNull();

      expect(await isExpected(thirdId, date)).toBe(true);
      expect(await isExpected(subId, date)).toBe(false);
    });

    it("does not overwrite the gedu's reason when the admin supplies none", async () => {
      const date = utcDate(5);
      const { data: seeded } = await geduAuth.rpc("request_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_reason: "sick",
        p_reason_note: "a note",
      });
      expect(coverRequestDocument.parse(seeded).status).toBe("open");

      const { data } = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: TEST_IDS.GEDU,
        p_sub_gedu_id: subId,
      });
      const doc = coverRequestDocument.parse(data);
      expect(doc.reason).toBe("sick");
      expect(doc.reason_note).toBe("a note");
    });

    it("refuses a sub the guard turns down and an absent gedu who is not expected", async () => {
      const date = utcDate(5);

      const notExpected = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: subId,
        p_sub_gedu_id: thirdId,
      });
      expect(notExpected.error?.code).toBe(CHECK_VIOLATION);

      const selfCover = await adminAuth.rpc("set_session_cover", {
        p_group_id: GROUP_A,
        p_session_date: date,
        p_absent_gedu_id: TEST_IDS.GEDU,
        p_sub_gedu_id: TEST_IDS.GEDU,
      });
      expect(selfCover.error?.code).toBe(CHECK_VIOLATION);
    });

    it("clears a cover back to open and withdraws the cleared sub's own request", async () => {
      const date = utcDate(5);
      const first = await seedRequest({ date, coveredBy: subId });
      const chain = await seedRequest({ date, absent: subId, coveredBy: thirdId });

      const { data, error } = await adminAuth.rpc("clear_session_cover", {
        p_request_id: first,
      });
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.status).toBe("open");
      expect(doc.covered_by).toBeNull();

      // The fixpoint: SUB lost their seat, so SUB's own request goes — and with
      // it THIRD's cover, which existed only to answer it.
      const swept = await statusOf(chain);
      expect(swept?.status).toBe("withdrawn");
      expect(swept?.covered_by).toBeNull();
      expect(await isExpected(thirdId, date)).toBe(false);
      expect(await isExpected(subId, date)).toBe(false);
      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(false);
    });

    it("refuses to clear a request that has no cover", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      const { error } = await adminAuth.rpc("clear_session_cover", {
        p_request_id: id,
      });
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("withdraws a request as admin and unwinds the substitution", async () => {
      const date = utcDate(5);
      const first = await seedRequest({ date, coveredBy: subId });
      const chain = await seedRequest({ date, absent: subId });

      const { data, error } = await adminAuth.rpc(
        "withdraw_session_cover_request_as_admin",
        { p_request_id: first },
      );
      expect(error).toBeNull();

      const doc = coverRequestDocument.parse(data);
      expect(doc.status).toBe("withdrawn");
      expect(doc.covered_by).toBeNull();

      expect((await statusOf(chain))?.status).toBe("withdrawn");
      // The absence is off, so the assigned gedu is expected again.
      expect(await isExpected(TEST_IDS.GEDU, date)).toBe(true);
    });

    it("refuses to withdraw an already-withdrawn request", async () => {
      const id = await seedRequest({ date: utcDate(5) });
      await admin
        .from("session_cover_requests")
        .update({ status: "withdrawn" })
        .eq("id", id);

      const { error } = await adminAuth.rpc(
        "withdraw_session_cover_request_as_admin",
        { p_request_id: id },
      );
      expect(error?.code).toBe(CHECK_VIOLATION);
    });

    it("leaves a request whose requester is still ASSIGNED alone", async () => {
      // The sweep withdraws a request whose requester holds no seat. The
      // assigned gedu always holds one, so their own request survives every
      // cascade — which is what stops a clear from cancelling the absence.
      const date = utcDate(5);
      const id = await seedRequest({ date, coveredBy: subId });
      await adminAuth.rpc("clear_session_cover", { p_request_id: id });
      expect((await statusOf(id))?.status).toBe("open");
    });
  });

  // -------------------------------------------------------------------------
  // 9. The widened reads
  // -------------------------------------------------------------------------

  describe("the documents the surfaces read", () => {
    it("the gedu feed carries the group's gedus with roles and its non-withdrawn covers", async () => {
      const date = utcDate(5);
      const open = await seedRequest({ date });
      const gone = await seedRequest({ date: utcDate(6) });
      await admin
        .from("session_cover_requests")
        .update({ status: "withdrawn" })
        .eq("id", gone);

      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(error).toBeNull();

      const halves = geduFeedCoverHalves.parse(data);
      expect(halves.gedus).toEqual([
        { id: TEST_IDS.GEDU, first_name: expect.any(String), role: "primary" },
      ]);
      expect(halves.covers.map((cover) => cover.id)).toEqual([open]);
      // The requester sees their own offer count and no reason.
      expect(halves.covers[0].is_requester).toBe(true);
      expect(halves.covers[0].offer_count).toBe(0);
      expect(halves.covers[0].reason).toBeNull();
    });

    it("the gedu feed gives an ADMIN caller the reason and withholds it from a colleague", async () => {
      const date = utcDate(5);
      await seedRequest({ date, coveredBy: subId });
      await admin
        .from("session_cover_requests")
        .update({ reason: "sick", reason_note: "private" })
        .eq("group_id", GROUP_A)
        .eq("session_date", date);

      const asAdmin = await adminAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(asAdmin.error).toBeNull();
      const adminCovers = geduFeedCoverHalves.parse(asAdmin.data).covers;
      expect(adminCovers[0].reason).toBe("sick");
      expect(adminCovers[0].reason_note).toBe("private");
      expect(adminCovers[0].offer_count).toBe(0);

      // The COVER is a colleague on this document, not the requester.
      const asSub = await subAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(asSub.error).toBeNull();
      const subCovers = geduFeedCoverHalves.parse(asSub.data).covers;
      expect(subCovers[0].reason).toBeNull();
      expect(subCovers[0].is_requester).toBe(false);
      expect(subCovers[0].offer_count).toBeNull();

      // …and STILL NAMES WHO IS AWAY, to the colleague as much as to the admin.
      // This is the one document that reveals the requester to a non-admin, and
      // it is the line the pool's anonymity is not about: the workspace is
      // reached only by staff on the group, and the session card says "X is
      // away, Y is covering". Withholding the name here would leave the
      // staffing line undrawable — which is exactly what happened when the
      // concealment was first written against the admin flag alone.
      expect(subCovers[0].requested_by).toBe(TEST_IDS.GEDU);
      expect(subCovers[0].requested_by_first_name).toBeTruthy();
      expect(adminCovers[0].requested_by).toBe(TEST_IDS.GEDU);
    });

    it("the admin product-session document carries roles and covers per group", async () => {
      const date = utcDate(5);
      await seedRequest({ date });

      const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: PRODUCT,
      });
      expect(error).toBeNull();

      const groups = z
        .object({
          groups: z.array(
            z.object({
              id: z.string(),
              gedus: z.array(
                z.object({
                  id: z.string(),
                  first_name: z.string().nullable(),
                  role: z.enum(Constants.public.Enums.gedu_assignment_role),
                }),
              ),
              covers: z.array(coverRequestDocument),
            }),
          ),
        })
        .parse(data).groups;

      const a = groups.find((group) => group.id === GROUP_A);
      const b = groups.find((group) => group.id === GROUP_B);
      expect(a?.gedus.map((gedu) => gedu.role)).toEqual(["primary"]);
      expect(a?.covers.length).toBe(1);
      // Admin-only end to end, so the reason travels here unconditionally.
      expect(a?.covers[0].offer_count).toBe(0);
      expect(b?.gedus).toEqual([]);
      expect(b?.covers).toEqual([]);
    });

    it("the admin dashboard queues the open request with its offers and their standing", async () => {
      const date = utcDate(7);
      const id = await seedRequest({ date });
      await admin
        .from("session_cover_requests")
        .update({ reason: "sick", reason_note: "flu" })
        .eq("id", id);
      await subAuth.rpc("offer_session_cover", { p_request_id: id });

      const { data, error } = await adminAuth.rpc("get_admin_dashboard");
      expect(error).toBeNull();

      const queue = dashboardCoverRequests.parse(
        z.object({ cover_requests: z.unknown() }).parse(data).cover_requests,
      );
      const mine = queue.find((row) => row.id === id);
      expect(mine).toBeDefined();
      expect(mine?.group_name).toBe("Cohort A");
      expect(mine?.reason).toBe("sick");
      expect(mine?.reason_note).toBe("flu");
      expect(mine?.requested_by).toBe(TEST_IDS.GEDU);
      expect(mine?.product.translations.length).toBeGreaterThan(0);
      // The product shell carries the schedule slots beside the timezone, which
      // is the pair a client resolves the session's clock face from — the queue
      // states a time, not only a day. Seeded as one 10:00 slot of an hour on
      // every weekday, so the request's own date is necessarily projected and
      // the row is never the orphan.
      expect(mine?.product.schedule_slots.length).toBe(7);
      expect(
        mine?.product.schedule_slots.every(
          (slot) => slot.start_time === "10:00" && slot.duration_minutes === 60,
        ),
      ).toBe(true);
      expect(
        mine?.product.schedule_slots
          .map((slot) => slot.weekday)
          .sort((a, b) => a - b),
      ).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(mine?.offers.length).toBe(1);
      expect(mine?.offers[0].gedu_id).toBe(subId);
      expect(mine?.offers[0].certified).toBe(true);
      expect(mine?.offers[0].criminal_record_check_at).toBeNull();
    });

    it("the admin dashboard drops a request whose date has passed", async () => {
      const id = await seedRequest({ date: utcDate(-7) });
      const { data } = await adminAuth.rpc("get_admin_dashboard");
      const queue = dashboardCoverRequests.parse(
        z.object({ cover_requests: z.unknown() }).parse(data).cover_requests,
      );
      expect(queue.map((row) => row.id)).not.toContain(id);
    });

    it("get_my_assigned_products discriminates a cover row from an assignment row", async () => {
      const date = utcDate(-3);
      await seedRequest({ date, coveredBy: subId });

      // Scoped to this file's own product throughout: CI runs the db files in
      // parallel workers against ONE database, and several of them assign the
      // seeded gedu to fixtures of their own, so a whole-result claim about that
      // account would be a claim about whatever else happens to be running.
      const mine = await geduAuth.rpc("get_my_assigned_products");
      expect(mine.error).toBeNull();
      expect(
        (mine.data ?? [])
          .filter((row) => row.product_id === PRODUCT)
          .map((row) => ({ kind: row.kind, covered_date: row.covered_date })),
      ).toEqual([{ kind: "assignment", covered_date: null }]);

      const theirs = await subAuth.rpc("get_my_assigned_products");
      expect(theirs.error).toBeNull();
      expect((theirs.data ?? []).filter((row) => row.group_id === GROUP_A)).toEqual([
        expect.objectContaining({
          kind: "cover",
          covered_date: date,
          group_id: GROUP_A,
          product_id: PRODUCT,
        }),
      ]);
    });

    it("get_my_assigned_products drops a cover whose window has closed", async () => {
      await seedRequest({ date: utcDate(-20), coveredBy: subId });
      const { data, error } = await subAuth.rpc("get_my_assigned_products");
      expect(error).toBeNull();
      expect((data ?? []).filter((row) => row.group_id === GROUP_A)).toEqual([]);
    });

    it("the summaries carry a cover row for the covered date and stop counting the absent gedu's", async () => {
      const date = utcDate(-3);
      const epoch = utcDate(-3);

      // The claim is made in ABSOLUTE terms rather than as a before/after
      // difference, and that is what keeps it off a clock: the product has a slot
      // on every weekday, so an occurrence's end instant passes once a day, and a
      // difference measured across that instant would be one out. Absences are
      // filed on EVERY date the epoch admits — today-3, today-2, today-1 and
      // today — so the count is exactly zero whether or not today's occurrence
      // has finished yet.
      const before = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: epoch,
      });
      expect(before.error).toBeNull();
      const baseline = assignmentSummaries
        .parse(before.data)
        .find((row) => row.group_id === GROUP_A);
      expect(baseline?.kind).toBe("assignment");
      expect(baseline?.covered_date).toBeNull();
      // Three finished occurrences at least, and possibly today's fourth.
      expect(baseline?.attention_count).toBeGreaterThanOrEqual(3);

      await seedRequest({ date, coveredBy: subId });
      for (const other of [utcDate(-2), utcDate(-1), utcDate(0)]) {
        await seedRequest({ date: other });
      }

      const after = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: epoch,
      });
      const reduced = assignmentSummaries
        .parse(after.data)
        .find((row) => row.group_id === GROUP_A);
      // Every date they are absent on is not their work, so nothing is left.
      expect(reduced?.attention_count).toBe(0);

      const theirs = await subAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: epoch,
      });
      expect(theirs.error).toBeNull();
      const cover = assignmentSummaries
        .parse(theirs.data)
        .filter((row) => row.group_id === GROUP_A);
      expect(cover.length).toBe(1);
      expect(cover[0].kind).toBe("cover");
      expect(cover[0].covered_date).toBe(date);
      // One date's worth of work, not the group's whole history.
      expect(cover[0].attention_count).toBe(1);
    });

    it("the product-groups snapshot carries each pill's role", async () => {
      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_B,
        gedu_id: subId,
        product_id: PRODUCT,
        role: "assistant",
      });

      const { data, error } = await adminAuth.rpc(
        "get_product_groups_with_details",
        { p_product_id: PRODUCT },
      );
      expect(error).toBeNull();

      const groups = z
        .object({
          groups: z.array(
            z.object({
              id: z.string(),
              gedus: z.array(
                z.object({
                  id: z.string(),
                  role: z.enum(Constants.public.Enums.gedu_assignment_role),
                }),
              ),
            }),
          ),
        })
        .parse(data).groups;

      expect(
        groups.find((group) => group.id === GROUP_A)?.gedus[0]?.role,
      ).toBe("primary");
      expect(
        groups.find((group) => group.id === GROUP_B)?.gedus[0]?.role,
      ).toBe("assistant");
    });
  });

  // -------------------------------------------------------------------------
  // 10. Roles through the assignment writer
  // -------------------------------------------------------------------------

  describe("apply_group_changes and the role column", () => {
    it("upserts the role, so a role change is ONE add", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        p_gedu_assignments_added: [
          { groupId: GROUP_A, geduId: TEST_IDS.GEDU, role: "assistant" },
        ],
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("gedu_group_assignments")
        .select("role")
        .eq("group_id", GROUP_A)
        .eq("gedu_id", TEST_IDS.GEDU)
        .single();
      expect(data?.role).toBe("assistant");

      await admin
        .from("gedu_group_assignments")
        .update({ role: "primary" })
        .eq("group_id", GROUP_A)
        .eq("gedu_id", TEST_IDS.GEDU);
    });

    it("defaults an omitted role to primary", async () => {
      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        p_gedu_assignments_added: [{ groupId: GROUP_B, geduId: subId }],
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("gedu_group_assignments")
        .select("role")
        .eq("group_id", GROUP_B)
        .eq("gedu_id", subId)
        .single();
      expect(data?.role).toBe("primary");
    });

    it("withdraws the live requests a REMOVAL orphans", async () => {
      // Removing a gedu from a group unseats them without touching a cover row,
      // which is what made this the one unseating that left live requests
      // behind: an open request by somebody who is no longer expected, ready for
      // an admin to answer with a sub for nobody.
      const open = await seedRequest({ date: utcDate(5) });
      const covered = await seedRequest({ date: utcDate(6), coveredBy: subId });

      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        p_gedu_assignments_removed: [
          { groupId: GROUP_A, geduId: TEST_IDS.GEDU },
        ],
      });
      expect(error).toBeNull();

      // Both go, and the covered one is emptied rather than merely closed: a
      // withdrawn row carries no sub, so invoicing finds no phantom
      // substitution for a session nobody was absent from.
      expect((await statusOf(open))?.status).toBe("withdrawn");
      const swept = await statusOf(covered);
      expect(swept?.status).toBe("withdrawn");
      expect(swept?.covered_by).toBeNull();
      expect(swept?.approved_by).toBeNull();
      expect(swept?.approved_at).toBeNull();

      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_A,
        gedu_id: TEST_IDS.GEDU,
        product_id: PRODUCT,
        role: "primary",
      });
    });

    it("sweeps by the derivation and not by the name in the removal", async () => {
      // The sweep is only correct if it is narrow. It withdraws every request on
      // the touched (group, date) whose requester no longer holds a seat — so a
      // colleague who is still assigned keeps their absence on the very same
      // date, and another group of the same product is not swept at all.
      const date = utcDate(5);
      await admin.from("gedu_group_assignments").insert([
        { group_id: GROUP_A, gedu_id: thirdId, product_id: PRODUCT, role: "assistant" },
        { group_id: GROUP_B, gedu_id: subId, product_id: PRODUCT, role: "primary" },
      ]);

      const removed = await seedRequest({ date });
      const colleague = await seedRequest({ date, absent: thirdId });
      const otherGroup = await seedRequest({
        groupId: GROUP_B,
        date,
        absent: subId,
      });

      const { error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        p_gedu_assignments_removed: [
          { groupId: GROUP_A, geduId: TEST_IDS.GEDU },
        ],
      });
      expect(error).toBeNull();

      expect((await statusOf(removed))?.status).toBe("withdrawn");
      expect((await statusOf(colleague))?.status).toBe("open");
      expect((await statusOf(otherGroup))?.status).toBe("open");

      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_A,
        gedu_id: TEST_IDS.GEDU,
        product_id: PRODUCT,
        role: "primary",
      });
    });

    it("reads an added group's inline gedus with their roles, and the legacy id array", async () => {
      const { data, error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        p_added_groups: [
          {
            tempId: "tmp-roles",
            name: "Cover Roles",
            gedus: [{ geduId: subId, role: "assistant" }],
          },
          { tempId: "tmp-legacy", name: "Cover Legacy", geduIds: [thirdId] },
        ],
      });
      expect(error).toBeNull();

      const map = z
        .object({ tempMap: z.record(z.string(), z.string()) })
        .parse(data).tempMap;

      const rolesGroup = map["tmp-roles"];
      const legacyGroup = map["tmp-legacy"];
      expect(rolesGroup).toBeTruthy();
      expect(legacyGroup).toBeTruthy();

      const { data: rows } = await admin
        .from("gedu_group_assignments")
        .select("group_id, gedu_id, role")
        .in("group_id", [rolesGroup, legacyGroup]);

      expect(rows?.find((row) => row.group_id === rolesGroup)?.role).toBe(
        "assistant",
      );
      expect(rows?.find((row) => row.group_id === legacyGroup)?.role).toBe(
        "primary",
      );

      // Created inside the case, so removed inside it: the groups these rows hang
      // off are not in ALL_GROUPS and the file's teardown would leave them.
      await admin
        .from("gedu_group_assignments")
        .delete()
        .in("group_id", [rolesGroup, legacyGroup]);
      await admin
        .from("product_groups")
        .delete()
        .in("id", [rolesGroup, legacyGroup]);
    });
  });
});
