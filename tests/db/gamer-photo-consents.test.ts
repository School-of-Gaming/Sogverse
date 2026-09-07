import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  accessTokenFor,
  callRpcRaw,
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Gamer photo consents (00243): the marketing-consent system (00220) with the
 * subject changed from an adult's mailbox to a CHILD'S IMAGE, and every claim
 * below is about one of the three things that change follows from.
 *
 *   * **The subject is a parameter, and that is the dangerous half.** A
 *     marketing consent takes its holder from auth.uid(), so there is nothing
 *     for a caller to aim; a parent has several children, so this one has to
 *     name which. The role guard is therefore not the whole of the
 *     authorization — the parent_gamer link is — and the IDOR cases here are
 *     what prove it, including that "not your child" and "no such gamer" are
 *     refused identically so the function is no oracle.
 *   * **The answer is written by one party and read by four.** The parent
 *     answers; the parent, the CHILD, an admin and the gedus of a group the
 *     child is actively in may read. The gedu arm is the one that could drift,
 *     so it is expressed through `gedu_teaches_gamer`, which is composed from
 *     the roster's own predicate — the cases below pin both directions of it.
 *   * **A child may look and may never touch.** There is no writer that accepts
 *     a gamer, and none that accepts an admin either — the second deliberately,
 *     carried over from 00220.
 *
 * Everything else is 00220's behaviour and is re-pinned here rather than
 * assumed: revocability, an event log that records CHANGES and not calls, and a
 * first explicit "no" counting as a change because an absent row means nobody
 * ever asked.
 *
 * Product UUIDs in the 6c0-6c3 sub-range, plus 6cf (see product-helpers
 * allocation registry).
 */

const PRODUCT_PUBLISHED = "00000000-0000-0000-0000-0000000006c0";
const PRODUCT_CANCELLED = "00000000-0000-0000-0000-0000000006c1";
const PRODUCT_TAUGHT = "00000000-0000-0000-0000-0000000006c2";
const GROUP_TAUGHT = "00000000-0000-0000-0000-0000000006c3";
const PRODUCT_NOWHERE = "00000000-0000-0000-0000-0000000006cf";

const ALL_TEST_PRODUCTS = [
  PRODUCT_PUBLISHED,
  PRODUCT_CANCELLED,
  PRODUCT_TAUGHT,
];

const LYNX = "lynx_educate" as const;

/** The canonical forbidden SQLSTATE every guard primitive raises. */
const FORBIDDEN = "42501";
/** PostgreSQL SQLSTATE for check_violation, which the source gate raises. */
const CHECK_VIOLATION = "23514";

/**
 * A uuid that is nobody. Shaped so it cannot collide with a fixture: the
 * allocation registry hands out ids ending in a byte, and this one ends in a
 * run no block reserves.
 */
const NOT_A_GAMER = "00000000-0000-0000-0000-0000000009ee";

describe("gamer photo consents (00243)", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let gamer2: SupabaseClient<Database>;
  /**
   * A signed-in admin rather than the service-role client, for every RPC here
   * that is guard-first: the guard resolves the caller's role from their
   * `profiles` row via `auth.uid()`, and a service-role connection has no uid,
   * so its role reads NULL and every such call is refused with 42501 before its
   * body runs.
   */
  let adminAuth: SupabaseClient<Database>;
  /** The same admin as a raw PostgREST token, for the NULL-element case. */
  let adminToken: string;

  /**
   * A gamer created by this file and linked to the seeded parent, whose whole
   * job is to be on NOBODY's roster.
   *
   * The seeded children cannot play that part. `TEST_IDS.GAMER` and
   * `TEST_IDS.GAMER_2` are fixtures a dozen other db-test files put into groups
   * of their own, and CI runs those files in parallel workers — so "the gedu
   * cannot see this child" would be a claim about what every other file
   * happened to be doing at that instant, which is not a claim at all. A child
   * only this file knows about is the only way to assert the negative half of
   * the gedu scope and mean it.
   */
  let outsiderGamerId: string;

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
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    gamer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER_2.email,
      TEST_CREDENTIALS.GAMER_2.password,
    );
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    adminToken = await accessTokenFor(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);

    // Published, so `can_read_product` is true for everybody including anon —
    // which is the state a shop page is read in.
    await createTestProduct(admin, {
      id: PRODUCT_PUBLISHED,
      status: "pending",
      isVisible: true,
      seatCount: null,
    });
    // Cancelled and unlisted, so the same predicate is false for anyone but an
    // admin. Its ask set is seeded identically, so a difference in what comes
    // back can only be the predicate.
    await createTestProduct(admin, {
      id: PRODUCT_CANCELLED,
      status: "cancelled",
      isVisible: false,
      seatCount: null,
    });
    // The club whose roster the gedu arm of the read policy is asserted on.
    await createTestProduct(admin, {
      id: PRODUCT_TAUGHT,
      status: "running",
      isVisible: true,
      seatCount: null,
    });

    const group = await admin
      .from("product_groups")
      .insert({
        id: GROUP_TAUGHT,
        product_id: PRODUCT_TAUGHT,
        name: "Photo Cohort",
      });
    expect(group.error).toBeNull();

    const assignment = await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_TAUGHT,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRODUCT_TAUGHT,
    });
    expect(assignment.error).toBeNull();

    const seat = await admin.from("participations").insert({
      product_id: PRODUCT_TAUGHT,
      group_id: GROUP_TAUGHT,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    expect(seat.error).toBeNull();

    outsiderGamerId = await createOutsiderGamer();
  });

  afterAll(async () => {
    await resetConsents();
    await deleteOutsiderGamer();
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterEach(async () => {
    await resetConsents();
  });

  /**
   * Build a gamer by hand rather than through `create_gamer`, which refuses a
   * parent with no PIN — the seeded customer has none, and giving them one
   * would mutate shared seed state that parent-pin.test.ts reads. These are the
   * same four statements seed.sql makes to promote its own children.
   */
  async function createOutsiderGamer(): Promise<string> {
    const created = await admin.auth.admin.createUser({
      email: "photo-outsider@gamer.sogverse.internal",
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Outsider", last_name: "Child" },
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;

    const promoted = await admin
      .from("profiles")
      .update({ role: "gamer" })
      .eq("id", userId);
    expect(promoted.error).toBeNull();
    await admin.from("customer_profiles").delete().eq("user_id", userId);
    const profile = await admin
      .from("gamer_profiles")
      .insert({ user_id: userId, date_of_birth: "2014-01-01" });
    expect(profile.error).toBeNull();
    const link = await admin
      .from("parent_gamer")
      .insert({ parent_id: TEST_IDS.CUSTOMER, gamer_id: userId });
    expect(link.error).toBeNull();

    return userId;
  }

  async function deleteOutsiderGamer() {
    if (!outsiderGamerId) return;
    await admin
      .from("participations")
      .delete()
      .eq("participant_id", outsiderGamerId);
    await admin.from("parent_gamer").delete().eq("gamer_id", outsiderGamerId);
    await admin.from("gamer_profiles").delete().eq("user_id", outsiderGamerId);
    await admin.from("profiles").delete().eq("id", outsiderGamerId);
    await admin.auth.admin.deleteUser(outsiderGamerId);
  }

  /**
   * Both consent tables, for every child this file touches. Events first: they
   * are append-only history and nothing cascades them from the state table, so
   * a suite that cleaned only the state rows would carry a growing log between
   * cases and make every "exactly one event" assertion drift.
   */
  async function resetConsents() {
    const gamers = [TEST_IDS.GAMER, TEST_IDS.GAMER_2, outsiderGamerId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    await admin
      .from("gamer_photo_consent_events")
      .delete()
      .in("gamer_id", gamers);
    await admin.from("gamer_photo_consents").delete().in("gamer_id", gamers);
  }

  /** One child's current state, read with RLS bypassed. */
  async function stateFor(gamerId: string) {
    const { data, error } = await admin
      .from("gamer_photo_consents")
      .select("consent_type, granted")
      .eq("gamer_id", gamerId);
    if (error) throw new Error(`reading state failed: ${error.message}`);
    return data;
  }

  /** One child's whole history, oldest first. */
  async function eventsFor(gamerId: string) {
    const { data, error } = await admin
      .from("gamer_photo_consent_events")
      .select("consent_type, granted, source, answered_by")
      .eq("gamer_id", gamerId)
      .order("created_at");
    if (error) throw new Error(`reading events failed: ${error.message}`);
    return data;
  }

  function set(
    client: SupabaseClient<Database>,
    gamerId: string,
    granted: boolean,
    source: string,
  ) {
    return client.rpc("set_gamer_photo_consent", {
      p_gamer_id: gamerId,
      p_consent_type: LYNX,
      p_granted: granted,
      p_source: source,
    });
  }

  // -------------------------------------------------------------------------
  // The one writer
  // -------------------------------------------------------------------------

  describe("set_gamer_photo_consent", () => {
    it("records a grant, and the parent reads it back through their own policy", async () => {
      const res = await set(customer, TEST_IDS.GAMER, true, "settings");
      expect(res.error).toBeNull();

      expect(await stateFor(TEST_IDS.GAMER)).toEqual([
        { consent_type: LYNX, granted: true },
      ]);

      // Through the caller's own RLS view, not the service-role client: the
      // read policy is half of what makes this usable at all.
      const own = await customer
        .from("gamer_photo_consents")
        .select("gamer_id, granted")
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(own.error).toBeNull();
      expect(own.data).toEqual([{ gamer_id: TEST_IDS.GAMER, granted: true }]);
    });

    it("stamps the ANSWERING PARENT on the event, which is the column the marketing twin has no need of", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();

      // The subject and the answerer are two different people here, so the
      // event has to say who spoke. It is taken from auth.uid() inside the RPC
      // and is not a parameter, which is what makes it provenance rather than a
      // claim.
      expect(await eventsFor(TEST_IDS.GAMER)).toEqual([
        {
          consent_type: LYNX,
          granted: true,
          source: "settings",
          answered_by: TEST_IDS.CUSTOMER,
        },
      ]);
    });

    it("revokes what it granted, and grants again after that", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();
      expect(
        (await set(customer, TEST_IDS.GAMER, false, "settings")).error,
      ).toBeNull();
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "enrolment")).error,
      ).toBeNull();

      // ONE state row holding the latest answer, and three events: granting,
      // revoking and granting again is the ordinary life of a revocable
      // consent, and those rows are history rather than duplicates.
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([
        { consent_type: LYNX, granted: true },
      ]);
      expect(await eventsFor(TEST_IDS.GAMER)).toHaveLength(3);
    });

    it("appends NO event when the submitted state already matches", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();

      // This matters more here than in the marketing twin: every enrolment
      // writes every asked box whether or not the parent touched it, so the
      // no-op path is the COMMON path rather than a stale-tab edge case. An
      // event log that recorded it would answer "how often did this parent
      // change their mind" with a number made of signups.
      const replay = await set(customer, TEST_IDS.GAMER, true, "enrolment");
      expect(replay.error).toBeNull();

      // And the source of the answer on file is not relabelled by the no-op.
      expect(await eventsFor(TEST_IDS.GAMER)).toEqual([
        {
          consent_type: LYNX,
          granted: true,
          source: "settings",
          answered_by: TEST_IDS.CUSTOMER,
        },
      ]);
    });

    it("records a FIRST explicit no as a change, because an absent row is not a refusal", async () => {
      // Both states keep the child out of the photograph, and only one of them
      // is a decision the parent made. A comparison treating the missing row as
      // false would swallow this event entirely.
      expect(
        (await set(customer, TEST_IDS.GAMER, false, "enrolment")).error,
      ).toBeNull();

      expect(await stateFor(TEST_IDS.GAMER)).toEqual([
        { consent_type: LYNX, granted: false },
      ]);
      expect(await eventsFor(TEST_IDS.GAMER)).toHaveLength(1);
    });

    it("refuses the registration source, writing nothing at all", async () => {
      // There is no `registration` value in the CHECK at all — no gamer exists
      // when a sign-up form is filled in — so the source that its marketing
      // twin merely refuses to accept from a client is one this system cannot
      // express.
      const res = await set(customer, TEST_IDS.GAMER, true, "registration");

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
      expect(await eventsFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses a source it has never heard of", async () => {
      const res = await set(
        customer,
        TEST_IDS.GAMER,
        true,
        "a-surface-that-does-not-exist",
      );
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await eventsFor(TEST_IDS.GAMER)).toEqual([]);
    });

    // ---- the target half of the authorization ------------------------------

    it("refuses a parent aiming at another family's child, and writes nothing", async () => {
      // The case the role guard alone cannot catch: customer2 IS a customer, so
      // they pass `assert_role`. What stops them is the parent_gamer link, and
      // this is the whole reason the subject being a parameter is safe.
      const res = await set(customer2, TEST_IDS.GAMER, true, "settings");

      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
      expect(await eventsFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses a uuid that is nobody with the SAME error, so it is no oracle", async () => {
      // Distinguishable answers here would turn this function into a way of
      // asking "is this uuid a child on your platform", which is a question
      // about children we do not answer.
      const stranger = await set(customer2, TEST_IDS.GAMER, true, "settings");
      const nobody = await set(customer2, NOT_A_GAMER, true, "settings");

      expect(nobody.error?.code).toBe(stranger.error?.code);
      expect(nobody.error?.code).toBe(FORBIDDEN);
    });

    // ---- the role half -----------------------------------------------------

    it("refuses the CHILD, even about themselves", async () => {
      // A child may see the answer and may never give it. Consent to photograph
      // a child is a parental decision, and a surface that accepted it from the
      // child would be the platform recording a consent it knows to be invalid.
      const res = await set(gamer, TEST_IDS.GAMER, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses a gedu", async () => {
      const res = await set(gedu, TEST_IDS.GAMER, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses an ADMIN too, which is the design and not an oversight", async () => {
      // 00220's ruling, carried over: an admin editing another family's answer
      // about their own child is not a thing this platform does. Admins read
      // it on the gamer's admin page and that is the whole of their access.
      const res = await set(adminAuth, TEST_IDS.GAMER, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Who can read what
  // -------------------------------------------------------------------------

  describe("read scoping", () => {
    it("lets a parent read their own children's rows and never another family's", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();
      expect(
        (await set(customer, TEST_IDS.GAMER_2, false, "settings")).error,
      ).toBeNull();

      // Unfiltered: the policy is the only thing narrowing this, which is
      // exactly the claim under test.
      const mine = await customer.from("gamer_photo_consents").select("gamer_id");
      expect(mine.error).toBeNull();
      expect(new Set((mine.data ?? []).map((r) => r.gamer_id))).toEqual(
        new Set([TEST_IDS.GAMER, TEST_IDS.GAMER_2]),
      );

      // A parent of nobody sees nothing, from the same unfiltered query.
      const theirs = await customer2
        .from("gamer_photo_consents")
        .select("gamer_id");
      expect(theirs.error).toBeNull();
      expect(theirs.data).toEqual([]);
    });

    it("lets a child read their OWN answer and not their sibling's", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();
      expect(
        (await set(customer, TEST_IDS.GAMER_2, true, "settings")).error,
      ).toBeNull();

      // The read exists so a child told "you are not in the photos" can find
      // out why. It stops at their own row: a sibling's answer is their
      // sibling's, and the two children share a parent, not a permission.
      const own = await gamer.from("gamer_photo_consents").select("gamer_id");
      expect(own.error).toBeNull();
      expect(own.data).toEqual([{ gamer_id: TEST_IDS.GAMER }]);

      const sibling = await gamer2
        .from("gamer_photo_consents")
        .select("gamer_id");
      expect(sibling.error).toBeNull();
      expect(sibling.data).toEqual([{ gamer_id: TEST_IDS.GAMER_2 }]);
    });

    it("shows a gedu the children on their roster and nobody else's", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();
      expect(
        (await set(customer, outsiderGamerId, true, "settings")).error,
      ).toBeNull();

      // The rostered child, because this gedu is assigned to the group that
      // child is actively in — the same two conditions get_gedu_group_feed
      // composes before it will hand over a roster at all.
      const rostered = await gedu
        .from("gamer_photo_consents")
        .select("gamer_id")
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(rostered.error).toBeNull();
      expect(rostered.data).toEqual([{ gamer_id: TEST_IDS.GAMER }]);

      // And not the child on nobody's roster. This is the half that could only
      // be asserted against a child no other test file can enroll — see the
      // note on `outsiderGamerId`.
      const outsider = await gedu
        .from("gamer_photo_consents")
        .select("gamer_id")
        .eq("gamer_id", outsiderGamerId);
      expect(outsider.error).toBeNull();
      expect(outsider.data).toEqual([]);
    });

    it("stops showing a gedu a child whose seat is no longer active", async () => {
      // Driven with the outsider rather than the seeded child, so both halves
      // are claims about a roster only this file can change: the seeded child
      // may be sitting in another worker's group taught by the same gedu, which
      // would make the "after" read succeed for a reason this case is not about.
      expect(
        (await set(customer, outsiderGamerId, true, "settings")).error,
      ).toBeNull();

      const seat = await admin.from("participations").insert({
        product_id: PRODUCT_TAUGHT,
        group_id: GROUP_TAUGHT,
        participant_id: outsiderGamerId,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      });
      expect(seat.error).toBeNull();

      try {
        const joined = await gedu
          .from("gamer_photo_consents")
          .select("gamer_id")
          .eq("gamer_id", outsiderGamerId);
        expect(joined.error).toBeNull();
        expect(joined.data).toEqual([{ gamer_id: outsiderGamerId }]);

        const ended = await admin
          .from("participations")
          .update({ status: "completed" })
          .eq("group_id", GROUP_TAUGHT)
          .eq("participant_id", outsiderGamerId);
        expect(ended.error).toBeNull();

        // The roster's own active filter, borrowed rather than restated: a seat
        // that is no longer active is off the feed's roster, so it is off this
        // list too.
        const left = await gedu
          .from("gamer_photo_consents")
          .select("gamer_id")
          .eq("gamer_id", outsiderGamerId);
        expect(left.error).toBeNull();
        expect(left.data).toEqual([]);
      } finally {
        await admin
          .from("participations")
          .delete()
          .eq("group_id", GROUP_TAUGHT)
          .eq("participant_id", outsiderGamerId);
      }
    });

    it("keeps the HISTORY to admins, which is narrower than the state beside it", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();

      // A gedu needs today's answer to decide whether to raise a camera, and
      // has no business in the history of a family's deliberations. Neither
      // does the family's own account: the log is an audit trail, and an audit
      // is an admin.
      for (const [who, client] of [
        ["parent", customer],
        ["gamer", gamer],
        ["gedu", gedu],
      ] as const) {
        const events = await client
          .from("gamer_photo_consent_events")
          .select("gamer_id");
        expect(events.error, `${who} errored`).toBeNull();
        expect(events.data, `${who} could read the history`).toEqual([]);
      }

      const asAdmin = await adminAuth
        .from("gamer_photo_consent_events")
        .select("gamer_id, answered_by")
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(asAdmin.error).toBeNull();
      expect(asAdmin.data).toEqual([
        { gamer_id: TEST_IDS.GAMER, answered_by: TEST_IDS.CUSTOMER },
      ]);
    });

    it("tells anon nothing about either table", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();

      // No grant at all for `anon`, so this is refused by the grant layer
      // rather than filtered to nothing by a policy — the stronger of the two.
      expect(
        (await anon.from("gamer_photo_consents").select("gamer_id")).error,
      ).not.toBeNull();
      expect(
        (await anon.from("gamer_photo_consent_events").select("gamer_id")).error,
      ).not.toBeNull();
    });

    it("holds no write grant for authenticated on any of the three tables", async () => {
      // Every row is written by a guarded function, so a direct write must be
      // refused by the missing grant rather than by a policy that could be
      // edited.
      const state = await customer.from("gamer_photo_consents").insert({
        gamer_id: TEST_IDS.GAMER,
        consent_type: LYNX,
        granted: true,
      });
      expect(state.error).not.toBeNull();

      const event = await customer.from("gamer_photo_consent_events").insert({
        gamer_id: TEST_IDS.GAMER,
        consent_type: LYNX,
        granted: true,
        source: "settings",
      });
      expect(event.error).not.toBeNull();

      const ask = await customer.from("product_gamer_photo_consents").insert({
        product_id: PRODUCT_PUBLISHED,
        consent_type: LYNX,
      });
      expect(ask.error).not.toBeNull();
    });

    it("gives an authenticated caller no UPDATE or DELETE path to the answer either", async () => {
      expect(
        (await set(customer, TEST_IDS.GAMER, true, "settings")).error,
      ).toBeNull();

      // The append-only claim, tested from the two callers who could plausibly
      // be granted it: a parent revokes by calling the RPC, and the child the
      // row is about has no write path at all.
      const parentUpdate = await customer
        .from("gamer_photo_consents")
        .update({ granted: false })
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(parentUpdate.error).not.toBeNull();

      const childUpdate = await gamer
        .from("gamer_photo_consents")
        .update({ granted: true })
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(childUpdate.error).not.toBeNull();

      const wipe = await customer
        .from("gamer_photo_consent_events")
        .delete()
        .eq("gamer_id", TEST_IDS.GAMER);
      expect(wipe.error).not.toBeNull();

      expect(await stateFor(TEST_IDS.GAMER)).toEqual([
        { consent_type: LYNX, granted: true },
      ]);
      expect(await eventsFor(TEST_IDS.GAMER)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // The staff predicate itself
  // -------------------------------------------------------------------------

  /**
   * `gedu_teaches_gamer` is exposed to `authenticated` for one reason: an RLS
   * policy evaluates its USING clause as the querying role, so the gedu arm of
   * the read policy above cannot call a private helper. That makes it a
   * self-scoping function in the §3.4 sense, and this block is the scope test
   * the spine's completeness check requires of one.
   */
  describe("gedu_teaches_gamer", () => {
    it("answers about the CALLER, and is total for a uuid that is nobody", async () => {
      const rostered = await gedu.rpc("gedu_teaches_gamer", {
        p_gamer_id: TEST_IDS.GAMER,
      });
      expect(rostered.error).toBeNull();
      expect(rostered.data).toBe(true);

      const outsider = await gedu.rpc("gedu_teaches_gamer", {
        p_gamer_id: outsiderGamerId,
      });
      expect(outsider.error).toBeNull();
      expect(outsider.data).toBe(false);

      // The same question from a caller who teaches nobody. The argument names
      // the CHILD and never the asker, so there is nothing here for one role to
      // borrow another's answer with.
      const asParent = await customer.rpc("gedu_teaches_gamer", {
        p_gamer_id: TEST_IDS.GAMER,
      });
      expect(asParent.error).toBeNull();
      expect(asParent.data).toBe(false);

      const asChild = await gamer.rpc("gedu_teaches_gamer", {
        p_gamer_id: TEST_IDS.GAMER,
      });
      expect(asChild.error).toBeNull();
      expect(asChild.data).toBe(false);

      // Total rather than three-valued: a USING clause handed NULL would admit
      // nothing, which looks like a working policy right up until it is not.
      const nobody = await gedu.rpc("gedu_teaches_gamer", {
        p_gamer_id: NOT_A_GAMER,
      });
      expect(nobody.error).toBeNull();
      expect(nobody.data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The admin writer of a product's ask set
  // -------------------------------------------------------------------------

  describe("admin_set_product_gamer_photo_consents", () => {
    afterEach(async () => {
      await admin
        .from("product_gamer_photo_consents")
        .delete()
        .in("product_id", ALL_TEST_PRODUCTS);
    });

    async function asksFor(productId: string) {
      const { data, error } = await admin
        .from("product_gamer_photo_consents")
        .select("consent_type")
        .eq("product_id", productId);
      if (error) throw new Error(`reading asks failed: ${error.message}`);
      return data.map((r) => r.consent_type).sort();
    }

    it("refuses a caller who is not an admin", async () => {
      const res = await customer.rpc(
        "admin_set_product_gamer_photo_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [LYNX] },
      );
      // The GUARD raising it, not a missing grant: the function is granted to
      // `authenticated`, which this caller is, so the EXECUTE privilege is held
      // and the body is what refuses.
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([]);
    });

    it("attaches the ask an admin picks, and clears it again", async () => {
      const attached = await adminAuth.rpc(
        "admin_set_product_gamer_photo_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [LYNX] },
      );
      expect(attached.error).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([LYNX]);

      const cleared = await adminAuth.rpc(
        "admin_set_product_gamer_photo_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [] },
      );
      expect(cleared.error).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([]);
    });

    it("refuses a NULL element and leaves the existing set intact", async () => {
      expect(
        (
          await adminAuth.rpc("admin_set_product_gamer_photo_consents", {
            p_product_id: PRODUCT_PUBLISHED,
            p_consent_types: [LYNX],
          })
        ).error,
      ).toBeNull();

      // Raw PostgREST, because `gamer_photo_consent_type[]` cannot express an
      // array with a NULL in it and casting around the generated type would be
      // the suppression the code-style rule warns about. The assertion that
      // matters is not the refusal but what survives it: 00211's three-valued
      // `NOT (col = ANY (array))` would have made the replacing DELETE match
      // nothing and quietly degrade the wipe-and-replace into a merge.
      const res = await callRpcRaw(
        adminToken,
        "admin_set_product_gamer_photo_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [null] },
      );

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(res.message).toContain("NULL");
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([LYNX]);
    });

    it("refuses a product that does not exist, even on a call that clears", async () => {
      // The case the foreign key cannot catch: a clear performs no INSERT, so
      // without the explicit existence check a typo'd id would delete nothing
      // and report success.
      const res = await adminAuth.rpc(
        "admin_set_product_gamer_photo_consents",
        { p_product_id: PRODUCT_NOWHERE, p_consent_types: [] },
      );
      expect(res.error).not.toBeNull();
      expect(res.error?.message).toContain("does not exist");
    });
  });

  // -------------------------------------------------------------------------
  // A product's ask is exactly as visible as the product
  // -------------------------------------------------------------------------

  describe("product_gamer_photo_consents readability", () => {
    beforeAll(async () => {
      const seeded = await admin.from("product_gamer_photo_consents").insert([
        { product_id: PRODUCT_PUBLISHED, consent_type: LYNX },
        { product_id: PRODUCT_CANCELLED, consent_type: LYNX },
      ]);
      if (seeded.error) {
        throw new Error(`seeding asks failed: ${seeded.error.message}`);
      }
    });

    afterAll(async () => {
      await admin
        .from("product_gamer_photo_consents")
        .delete()
        .in("product_id", ALL_TEST_PRODUCTS);
    });

    it("tells a stranger that a published product carries the ask", async () => {
      // The shop reason this policy is `TO anon` at all: a product page is read
      // by people with no account, and it has to be able to say what signing up
      // would ask them.
      const res = await anon
        .from("product_gamer_photo_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_PUBLISHED);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ consent_type: LYNX }]);
    });

    it("tells the same stranger nothing about a product they cannot read", async () => {
      const res = await anon
        .from("product_gamer_photo_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_CANCELLED);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    });

    it("shows an admin both, because can_read_product's first arm is theirs", async () => {
      const res = await adminAuth
        .from("product_gamer_photo_consents")
        .select("product_id")
        .in("product_id", [PRODUCT_PUBLISHED, PRODUCT_CANCELLED]);
      expect(res.error).toBeNull();
      expect(new Set((res.data ?? []).map((r) => r.product_id))).toEqual(
        new Set([PRODUCT_PUBLISHED, PRODUCT_CANCELLED]),
      );
    });
  });
});
