import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  adminDashboardSnapshot,
  type AdminDashboardSnapshot,
} from "@/services/admin-dashboard/admin-dashboard.contracts";

/**
 * `get_admin_dashboard` (migration 00191) — the single JSONB document behind the
 * admin dashboard, parsed through the `adminDashboardSnapshot` contract that the
 * service parses through in the browser. That parse is half the point of this
 * file: the schema is the wire contract's only definition, and CI is where it
 * meets real Postgres.
 *
 * The other half is the *rules* inside the document, none of which a schema can
 * see:
 *   - a stat that is NULL because it has no meaning for a role, versus 0
 *   - an uncertified gedu queued, and a gedu with no `gedu_profiles` row NOT
 *     queued (a data error is excluded, never silently read as uncertified)
 *   - a queued gedu's contract standing against the CURRENT version, where
 *     "accepted an older version" reads the same as "never accepted", either
 *     equally binding LANGUAGE of the current version counts, and a candidate
 *     holding both languages reports the first of the two signatures
 *   - the six product issues, each flagged only in the situation it names — a
 *     gedu fee of *zero* is a volunteer session, not a missing fee
 *   - the two unstaffed-group arrays, which are disjoint: a group somebody is in
 *     is in the first, a group nobody is in is in the second, and a group
 *     somebody teaches is in neither. Until 00241 the empty one was not reported
 *     at all, so the cases below are what keep the two halves from collapsing
 *     back into one
 *   - a live product with nothing wrong is absent from the queue entirely
 *   - a run that ended months ago is in neither product section
 *
 * **Every assertion is scoped to this file's own fixtures.** CI carries the
 * migrations' data *and* `seed.sql` *and* whatever other test files have seeded
 * in parallel, so "the queue has three entries" is a claim about the whole
 * platform and would be false for reasons that are not bugs. The document is
 * read once, after seeding, and each test looks up its own row in it.
 *
 * Product UUIDs 620-629 (see the allocation registry in product-helpers.ts).
 */

const P_UNASSIGNED = "00000000-0000-0000-0000-000000000620";
const P_VOLUNTEER = "00000000-0000-0000-0000-000000000621";
const GROUP_NO_GEDU = "00000000-0000-0000-0000-000000000622";
const P_WAITLIST = "00000000-0000-0000-0000-000000000623";
const P_MUNI = "00000000-0000-0000-0000-000000000624";
const P_CLEAN = "00000000-0000-0000-0000-000000000625";
/**
 * The product whose ONLY problem is an empty unstaffed group (00241). Its fee is
 * set and it has no queue, so if it is in the attention list at all, it is there
 * for the one reason this fixture exists to prove.
 */
const P_EMPTY_GROUP = "00000000-0000-0000-0000-000000000626";
const GROUP_EMPTY = "00000000-0000-0000-0000-000000000627";
const P_ENDED = "00000000-0000-0000-0000-000000000628";
/**
 * A group on P_CLEAN with an educator assigned and nobody in it. It is what
 * keeps P_CLEAN clean *for a reason* — before 00241 an empty group was ignored
 * whatever its staffing, so a fixture that left this one unassigned would go on
 * passing while saying nothing.
 */
const GROUP_STAFFED = "00000000-0000-0000-0000-000000000629";

/**
 * A contract version this file adds so it can seed an acceptance of something
 * that is NOT current. Its `created_at` is the epoch, which is what keeps it
 * from becoming the current version for every other test running against the
 * same database — current is the greatest `created_at`, and nothing is older
 * than this. It carries a language suffix because every version string does
 * (00202), and its BASE is shape-impossible for the same reason the fixture ids
 * are: the whitelist holds document labels, and no document is labelled this.
 */
const OLD_CONTRACT_VERSION = "not-a-version-1970-0000/fi";
const OLD_CONTRACT_CREATED_AT = "1970-01-01T00:00:00Z";

/** The moments the seeded acceptances carry, chosen so none of them can tie. */
const SIGNED_CURRENT_AT = "2026-03-04T09:15:00Z";
const SIGNED_OTHER_LANGUAGE_AT = "2026-03-05T14:20:00Z";
/** The two signatures of the gedu who signed both texts — first, then second. */
const SIGNED_BOTH_FIRST_AT = "2026-02-01T08:00:00Z";
const SIGNED_BOTH_SECOND_AT = "2026-02-02T08:00:00Z";
const SIGNED_OLD_AT = "2025-05-06T11:30:00Z";

const ALL_PRODUCTS = [
  P_UNASSIGNED,
  P_VOLUNTEER,
  P_WAITLIST,
  P_MUNI,
  P_CLEAN,
  P_EMPTY_GROUP,
  P_ENDED,
];

/**
 * A bare calendar date `offset` days from today, UTC-pinned end to end: built
 * from `Date.UTC` and read back through `toISOString`, so there is no zoned wall
 * clock anywhere in it and the day arithmetic is exact. Every fixture product is
 * created in the `UTC` timezone (the helper's default), which is what makes a
 * UTC date the right one to compare the RPC's own windows against.
 */
function utcDay(offset: number): string {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  return day.toISOString().slice(0, 10);
}

describe("get_admin_dashboard", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let snapshot: AdminDashboardSnapshot;

  /** The uncertified gedu that must appear in the queue. Has signed nothing. */
  let queuedGeduId: string | null = null;
  /** A gedu whose `gedu_profiles` row is missing — a data error, not a queue entry. */
  let orphanGeduId: string | null = null;
  /** Queued, and has accepted the language of the current version the ordering picks. */
  let signedGeduId: string | null = null;
  /** Queued, and has accepted the OTHER language of that same current version. */
  let otherLanguageGeduId: string | null = null;
  /** Queued, and has accepted BOTH languages of the current version. */
  let bothLanguagesGeduId: string | null = null;
  /** Queued, and has accepted only a version that is no longer current. */
  let staleGeduId: string | null = null;

  function attention(productId: string) {
    return snapshot.attention_products.find((p) => p.id === productId);
  }

  function scheduled(productId: string) {
    return snapshot.schedule_products.find((p) => p.id === productId);
  }

  /** Promotes a freshly-created customer profile to a gedu, extension row optional. */
  async function promoteToGedu(userId: string, withProfileRow: boolean) {
    const promoted = await admin
      .from("profiles")
      .update({ role: "gedu" })
      .eq("id", userId);
    expect(promoted.error).toBeNull();

    await admin.from("customer_profiles").delete().eq("user_id", userId);

    if (withProfileRow) {
      const seeded = await admin
        .from("gedu_profiles")
        .insert({ user_id: userId, certified: false });
      expect(seeded.error).toBeNull();
    }
  }

  async function createGedu(
    label: string,
    withProfileRow: boolean,
  ): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: `admin-dashboard-${label}-${Date.now()}@test.local`,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Dash", last_name: label },
    });
    expect(error).toBeNull();
    const userId = data.user!.id;
    await promoteToGedu(userId, withProfileRow);
    return userId;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // --- products -----------------------------------------------------------
    //
    // Every one of them is uncapped and waitlist-free unless the case is about
    // seats, so a fixture built for one issue cannot accidentally raise another.
    await createTestProduct(admin, {
      id: P_UNASSIGNED,
      seatCount: null,
      waitlistEnabled: false,
    });
    await createTestProduct(admin, {
      id: P_VOLUNTEER,
      seatCount: null,
      waitlistEnabled: false,
    });
    await createTestProduct(admin, {
      id: P_WAITLIST,
      seatCount: 2,
      waitlistEnabled: true,
    });
    await createTestProduct(admin, {
      id: P_MUNI,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: utcDay(60),
      seatCount: null,
      waitlistEnabled: false,
    });
    await createTestProduct(admin, {
      id: P_CLEAN,
      seatCount: null,
      waitlistEnabled: false,
      startDate: utcDay(-7),
      endDate: utcDay(60),
    });
    await createTestProduct(admin, {
      id: P_EMPTY_GROUP,
      seatCount: null,
      waitlistEnabled: false,
    });
    // Effectively over: the start and end are both in the past, so this one is
    // neither pending nor running, and its end date is far outside the window
    // the schedule keeps recent runs in.
    await createTestProduct(admin, {
      id: P_ENDED,
      seatCount: null,
      waitlistEnabled: false,
      startDate: utcDay(-200),
      endDate: utcDay(-100),
    });

    // Fees. A *set* fee is what makes the "missing fee" flag mean anything, and
    // zero is the case the flag must not fire on.
    const fees = await admin
      .from("products")
      .update({ primary_gedu_fee_cents: 0 })
      .eq("id", P_VOLUNTEER);
    expect(fees.error).toBeNull();

    for (const [id, cents] of [
      [P_WAITLIST, 5000],
      [P_MUNI, 4000],
      [P_CLEAN, 3000],
      [P_EMPTY_GROUP, 3500],
    ] as const) {
      const set = await admin
        .from("products")
        .update({ primary_gedu_fee_cents: cents })
        .eq("id", id);
      expect(set.error).toBeNull();
    }

    // Names live in product_translations, one row per locale, and the RPC ships
    // the whole array — so every fixture needs at least one.
    const names = await admin.from("product_translations").insert(
      ALL_PRODUCTS.map((id) => ({
        product_id: id,
        locale: "en",
        name: `Admin dashboard fixture ${id.slice(-3)}`,
        short_description: "Fixture",
      })),
    );
    expect(names.error).toBeNull();

    // --- groups -------------------------------------------------------------
    //
    // Three, one per answer the pair of group arrays can give: a group with a
    // member and no educator, a group with neither, and a group with an educator
    // and no member. The third is the one that has to be there — it is what
    // makes "in neither array" a fact about the assignment rather than an
    // accident of the fixture being empty.
    const groups = await admin.from("product_groups").insert([
      { id: GROUP_NO_GEDU, product_id: P_VOLUNTEER, name: "Orphaned group" },
      { id: GROUP_EMPTY, product_id: P_EMPTY_GROUP, name: "Empty group" },
      { id: GROUP_STAFFED, product_id: P_CLEAN, name: "Staffed empty group" },
    ]);
    expect(groups.error).toBeNull();

    const assignment = await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_STAFFED,
      gedu_id: TEST_IDS.GEDU,
      product_id: P_CLEAN,
    });
    expect(assignment.error).toBeNull();

    // --- participations -----------------------------------------------------
    const participations = await admin.from("participations").insert([
      // An active seat in no group at all.
      {
        product_id: P_UNASSIGNED,
        group_id: null,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      // A group with a member and no educator assigned to it.
      {
        product_id: P_VOLUNTEER,
        group_id: GROUP_NO_GEDU,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      // Somebody queueing on a product with both its seats free.
      {
        product_id: P_WAITLIST,
        group_id: null,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      },
    ]);
    expect(participations.error).toBeNull();

    // --- the schedule facts -------------------------------------------------
    const slot = await admin.from("schedule_slots").insert({
      product_id: P_CLEAN,
      weekday: 2,
      start_time: "17:00",
      duration_minutes: 90,
    });
    expect(slot.error).toBeNull();

    // --- gedus --------------------------------------------------------------
    queuedGeduId = await createGedu("queued", true);
    orphanGeduId = await createGedu("orphan", false);
    signedGeduId = await createGedu("signed", true);
    otherLanguageGeduId = await createGedu("otherlang", true);
    bothLanguagesGeduId = await createGedu("bothlang", true);
    staleGeduId = await createGedu("stale", true);

    // --- contract standing --------------------------------------------------
    //
    // Seeded through the service-role client rather than by calling the RPC as
    // each gedu, because what is under test here is the dashboard's derivation
    // of "current", and that wants acceptances with chosen timestamps and
    // chosen versions. The RPC's own behaviour is gedu-contract.test.ts's job.
    //
    // A version string is `<base>/<language>` (00202), and the languages of one
    // base are the same agreement published twice — so "current" is a BASE, and
    // both of its texts are it. The rows are read in the RPC's own order, which
    // is what lets the cases below speak of "the language the queue's pick
    // lands on" and "the other one" without hardcoding either.
    const versions = await admin
      .from("gedu_contract_versions")
      .select("version")
      .order("created_at", { ascending: false })
      .order("version", { ascending: false });
    expect(versions.error).toBeNull();
    const currentBase = versions.data![0].version.split("/")[0];
    const currentVersions = versions
      .data!.filter((v) => v.version.split("/")[0] === currentBase)
      .map((v) => v.version);
    // The version in force is published in both Finnish and English, and the
    // cross-language cases below would pass vacuously against one text.
    expect(currentVersions.length).toBeGreaterThanOrEqual(2);

    await admin
      .from("gedu_contract_versions")
      .delete()
      .eq("version", OLD_CONTRACT_VERSION);
    const oldVersion = await admin.from("gedu_contract_versions").insert({
      version: OLD_CONTRACT_VERSION,
      created_at: OLD_CONTRACT_CREATED_AT,
    });
    expect(oldVersion.error).toBeNull();

    const acceptances = await admin.from("gedu_contract_acceptances").insert([
      {
        gedu_id: signedGeduId,
        contract_version: currentVersions[0],
        accepted_at: SIGNED_CURRENT_AT,
        signed_name: "Dash signed",
      },
      // The other equally binding text of the SAME version. A queue comparing
      // whole version strings would read this signature as no signature.
      {
        gedu_id: otherLanguageGeduId,
        contract_version: currentVersions[1],
        accepted_at: SIGNED_OTHER_LANGUAGE_AT,
        signed_name: "Dash otherlang",
      },
      // Both texts of one version — two rows for one agreement, which a scalar
      // subquery would refuse to answer at all. Seeded later-signature-first so
      // the expected answer cannot come from insertion order.
      {
        gedu_id: bothLanguagesGeduId,
        contract_version: currentVersions[1],
        accepted_at: SIGNED_BOTH_SECOND_AT,
        signed_name: "Dash bothlang",
      },
      {
        gedu_id: bothLanguagesGeduId,
        contract_version: currentVersions[0],
        accepted_at: SIGNED_BOTH_FIRST_AT,
        signed_name: "Dash bothlang",
      },
      // The stale gedu signs BOTH an old version and nothing current, which is
      // the case a naive "has this gedu accepted anything" read gets wrong.
      {
        gedu_id: staleGeduId,
        contract_version: OLD_CONTRACT_VERSION,
        accepted_at: SIGNED_OLD_AT,
        signed_name: "Dash stale",
      },
    ]);
    expect(acceptances.error).toBeNull();

    // One read, after everything is in place. Through the admin's own session:
    // the service-role client has no profiles row, so assert_admin refuses it.
    const { data, error } = await adminUser.rpc("get_admin_dashboard");
    expect(error).toBeNull();
    snapshot = adminDashboardSnapshot.parse(data);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
    if (queuedGeduId) await admin.auth.admin.deleteUser(queuedGeduId);
    if (orphanGeduId) await admin.auth.admin.deleteUser(orphanGeduId);
    // Acceptances cascade with the account; the fixture version does not, and
    // leaving it behind would put a nonsense label in every later read of the
    // whitelist.
    if (signedGeduId) await admin.auth.admin.deleteUser(signedGeduId);
    if (otherLanguageGeduId)
      await admin.auth.admin.deleteUser(otherLanguageGeduId);
    if (bothLanguagesGeduId)
      await admin.auth.admin.deleteUser(bothLanguagesGeduId);
    if (staleGeduId) await admin.auth.admin.deleteUser(staleGeduId);
    await admin
      .from("gedu_contract_versions")
      .delete()
      .eq("version", OLD_CONTRACT_VERSION);
  });

  it("refuses a non-admin caller", async () => {
    const { error } = await customer.rpc("get_admin_dashboard");
    expect(error?.code).toBe("42501");
  });

  describe("users", () => {
    it("carries one tile per role, including roles nobody holds", () => {
      const roles = snapshot.users.map((u) => u.role).sort();
      expect(roles).toEqual(["admin", "customer", "gamer", "gedu"]);
    });

    it("reports no verification stat for gamers, and one for everyone else", () => {
      for (const tile of snapshot.users) {
        // A gamer's address is synthetic, so "0 verified" would report a
        // problem that does not exist. NULL says the stat has no meaning.
        if (tile.role === "gamer") {
          expect(tile.verified).toBeNull();
        } else {
          expect(tile.verified).not.toBeNull();
        }
        expect(tile.total).toBeGreaterThan(0);
      }
    });

    it("reports certification only for gedus", () => {
      for (const tile of snapshot.users) {
        if (tile.role === "gedu") {
          expect(tile.certified).not.toBeNull();
        } else {
          expect(tile.certified).toBeNull();
        }
      }
    });

    it("counts this file's new gedus", () => {
      const gedus = snapshot.users.find((u) => u.role === "gedu");
      // Six were created above and none is certified, so the platform holds at
      // least six — a relative claim, because CI's database also carries
      // seed.sql and whatever other files have seeded alongside this one.
      expect(gedus?.total).toBeGreaterThanOrEqual(6);
    });
  });

  describe("certification queue", () => {
    it("queues an uncertified gedu, with the facts the wait is worded from", () => {
      const entry = snapshot.certification_queue.find(
        (g) => g.id === queuedGeduId,
      );
      expect(entry).toBeDefined();
      expect(entry?.first_name).toBe("Dash");
      expect(entry?.last_name).toBe("queued");
      expect(Date.parse(entry!.created_at)).not.toBeNaN();
    });

    it("excludes a gedu whose gedu_profiles row is missing", () => {
      // A missing extension row is a data error, and the one action this queue
      // offers writes to exactly that row. Reading its absence as "uncertified"
      // would put a broken account in front of an admin with nothing to do
      // about it, so the join excludes it instead.
      const entry = snapshot.certification_queue.find(
        (g) => g.id === orphanGeduId,
      );
      expect(entry).toBeUndefined();
    });

    it("carries the moment a candidate accepted the current contract", () => {
      const entry = snapshot.certification_queue.find(
        (g) => g.id === signedGeduId,
      );
      expect(entry).toBeDefined();
      // Parsed rather than string-compared: PostgREST renders a timestamptz with
      // a `+00:00` offset, which is the same instant written differently.
      expect(Date.parse(entry!.contract_accepted_at!)).toBe(
        Date.parse(SIGNED_CURRENT_AT),
      );
    });

    it("carries it for a candidate who signed the other language of that version", () => {
      // The two texts are one agreement, so which one this gedu could read is
      // not a fact about their standing. A comparison on whole version strings
      // would report them as unsigned the day the second text was published.
      const entry = snapshot.certification_queue.find(
        (g) => g.id === otherLanguageGeduId,
      );
      expect(entry).toBeDefined();
      expect(Date.parse(entry!.contract_accepted_at!)).toBe(
        Date.parse(SIGNED_OTHER_LANGUAGE_AT),
      );
    });

    it("reports the first signature for a candidate who signed both languages", () => {
      // Two rows for one agreement is a legitimate state, and the queue has to
      // answer rather than error on it. The answer is the earlier moment: that
      // is when this person agreed to these terms, and countersigning the other
      // text afterwards does not move it.
      const entry = snapshot.certification_queue.find(
        (g) => g.id === bothLanguagesGeduId,
      );
      expect(entry).toBeDefined();
      expect(Date.parse(entry!.contract_accepted_at!)).toBe(
        Date.parse(SIGNED_BOTH_FIRST_AT),
      );
    });

    it("says nothing for a candidate who has signed nothing", () => {
      const entry = snapshot.certification_queue.find(
        (g) => g.id === queuedGeduId,
      );
      expect(entry?.contract_accepted_at).toBeNull();
    });

    it("says nothing for a candidate whose acceptance is of an older version", () => {
      // The queue is about standing against the terms in force TODAY, so an
      // out-of-date signature reads the same as no signature. A read that asked
      // "has this gedu accepted anything" would show a date here and tell an
      // admin the opposite of the truth. The fixture version is encoded like
      // every other, so what excludes it is its BASE and not its shape.
      const entry = snapshot.certification_queue.find(
        (g) => g.id === staleGeduId,
      );
      expect(entry).toBeDefined();
      expect(entry?.contract_accepted_at).toBeNull();
    });
  });

  describe("attention queue", () => {
    it("counts active seats sitting in no group", () => {
      const product = attention(P_UNASSIGNED);
      expect(product?.unassigned_count).toBe(1);
      expect(product?.groups_without_gedu).toEqual([]);
      expect(product?.empty_groups_without_gedu).toEqual([]);
      expect(product?.waitlist).toBeNull();
      expect(product?.product_type).toBe("consumer_club");
      expect(product?.translations).toEqual([
        { locale: "en", name: `Admin dashboard fixture ${P_UNASSIGNED.slice(-3)}` },
      ]);
    });

    it("flags an unset gedu fee, and treats a fee of zero as a decision", () => {
      expect(attention(P_UNASSIGNED)?.missing_gedu_fee).toBe(true);
      // Zero is a volunteer session — somebody chose it. Only NULL is a blank.
      expect(attention(P_VOLUNTEER)?.missing_gedu_fee).toBe(false);
    });

    it("names a group that has members and no educator", () => {
      const product = attention(P_VOLUNTEER);
      expect(product?.groups_without_gedu).toEqual([
        { id: GROUP_NO_GEDU, name: "Orphaned group" },
      ]);
      // Somebody is in it, so it is in one array and not the other. The two
      // halves are told apart by membership and nothing else.
      expect(product?.empty_groups_without_gedu).toEqual([]);
    });

    it("names an empty group with no educator, in its own array", () => {
      // Until 00241 this group was reported nowhere: the group check skipped it
      // for having no members, on the reasoning that an admin building next
      // term's groups has not made a mistake. That reasoning now sets the line's
      // rank on the page instead of hiding the group.
      const product = attention(P_EMPTY_GROUP);
      expect(product?.empty_groups_without_gedu).toEqual([
        { id: GROUP_EMPTY, name: "Empty group" },
      ]);
      expect(product?.groups_without_gedu).toEqual([]);
    });

    it("puts a product in the queue for an empty unstaffed group alone", () => {
      // Its fee is set, it has no cap and no queue, and nobody is enrolled on
      // it — so its presence here is the empty group and nothing else. This is
      // the whole behaviour change: before 00241 this product was absent.
      const product = attention(P_EMPTY_GROUP);
      expect(product).toBeDefined();
      expect(product?.unassigned_count).toBe(0);
      expect(product?.waitlist).toBeNull();
      expect(product?.missing_gedu_fee).toBe(false);
      expect(product?.missing_municipality_fee).toBe(false);
    });

    it("reports a queue against open seats, with the delta", () => {
      expect(attention(P_WAITLIST)?.waitlist).toEqual({
        waitlist_count: 1,
        open_seats: 2,
        // No offer has been sent in this fixture, so the seat-offer work
        // (00207) contributes a zero: every open seat still needs an admin.
        live_offer_count: 0,
      });
    });

    it("flags a municipality club with no municipality fee", () => {
      const product = attention(P_MUNI);
      expect(product?.missing_municipality_fee).toBe(true);
      // Its gedu fee is set, so the municipality fee is the only thing wrong.
      expect(product?.missing_gedu_fee).toBe(false);
      expect(product?.unassigned_count).toBe(0);
    });

    it("says nothing about a live product with nothing wrong", () => {
      // P_CLEAN has a fee, no queue, no unassigned seats — and one group that is
      // empty but ASSIGNED, which is the case both group arrays exclude. Since
      // 00241 that assignment is load-bearing: an empty group with no educator
      // would put this product in the queue.
      expect(attention(P_CLEAN)).toBeUndefined();
    });

    it("says nothing about a run that is over", () => {
      // Its gedu fee is unset, so its absence is the effective-status filter
      // doing the work rather than the product having nothing wrong.
      expect(attention(P_ENDED)).toBeUndefined();
    });
  });

  describe("schedule set", () => {
    it("carries the calendar facts a week resolves from", () => {
      const product = scheduled(P_CLEAN);
      expect(product).toBeDefined();
      expect(product?.timezone).toBe("UTC");
      expect(product?.start_date).toBe(utcDay(-7));
      expect(product?.end_date).toBe(utcDay(60));
      expect(product?.seat_count).toBeNull();
      expect(product?.active_count).toBe(0);
      expect(product?.waitlist_count).toBe(0);
      expect(product?.schedule_slots).toEqual([
        { weekday: 2, start_time: "17:00", duration_minutes: 90 },
      ]);
    });

    it("carries the seat counts a chip is titled with", () => {
      const product = scheduled(P_WAITLIST);
      expect(product?.seat_count).toBe(2);
      expect(product?.active_count).toBe(0);
      expect(product?.waitlist_count).toBe(1);
    });

    it("omits a run that ended months ago", () => {
      expect(scheduled(P_ENDED)).toBeUndefined();
    });
  });
});
