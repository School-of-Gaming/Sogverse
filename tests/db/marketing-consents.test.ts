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
 * Marketing consents (00220): the REVOCABLE half of the consent story, and
 * deliberately not the same system as the enrolment conditions 00210 built.
 *
 * The claims these cases exist to pin, in the order they matter:
 *
 *   * A parent can say yes and then say no. That is the whole difference from
 *     `consent_acceptances`, whose rows are statements about the past and carry
 *     no revoked state at all — so if a future change ever made these two
 *     systems converge, the revoke cases here are what would notice.
 *   * The event log records CHANGES, not calls. A repeat submission of the
 *     state already on file appends nothing, because a log that counted page
 *     loads could not answer the one question it exists for. A first explicit
 *     "no" IS a change, because an absent row means never answered.
 *   * `registration` is a source no signed-in caller may claim. It is written
 *     only by the register route through the service-role client, and it is the
 *     one field on an event that nothing else can corroborate.
 *   * The consent is ACCOUNT-level and belongs to the purchasing customer, so
 *     a gamer and a gedu are refused by the role guard rather than by an empty
 *     result, and one family can never read another's answers.
 *
 * Product UUIDs in the 690-691 sub-range (see product-helpers allocation
 * registry).
 */

const PRODUCT_PUBLISHED = "00000000-0000-0000-0000-000000000690";
const PRODUCT_CANCELLED = "00000000-0000-0000-0000-000000000691";

const ALL_TEST_PRODUCTS = [PRODUCT_PUBLISHED, PRODUCT_CANCELLED];

const SOG = "school_of_gaming" as const;
const LYNX = "lynx_educate" as const;

/** The canonical forbidden SQLSTATE every guard primitive raises. */
const FORBIDDEN = "42501";
/** PostgreSQL SQLSTATE for check_violation, which the source gate raises. */
const CHECK_VIOLATION = "23514";

describe("marketing consents (00220)", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
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
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
    await resetConsents();
  });

  afterEach(async () => {
    await resetConsents();
  });

  /**
   * Both consent tables, for both seeded families. Events first: they are
   * append-only history and nothing cascades them from the state table, so a
   * suite that cleaned only the state rows would carry a growing log between
   * cases and make every "exactly one event" assertion drift.
   */
  async function resetConsents() {
    const customers = [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2];
    await admin
      .from("marketing_consent_events")
      .delete()
      .in("customer_id", customers);
    await admin.from("marketing_consents").delete().in("customer_id", customers);
  }

  /**
   * The seeded customer's current state, sorted by consent type — in JS, and
   * deliberately not with `.order("consent_type")`.
   *
   * PostgreSQL sorts an enum column by its DECLARATION order, so ordering in
   * the database would put `school_of_gaming` before `lynx_educate` and make
   * every assertion below silently depend on the line order inside the
   * migration's CREATE TYPE. Sorting the strings here is stable against that.
   */
  async function stateFor(customerId: string) {
    const { data, error } = await admin
      .from("marketing_consents")
      .select("consent_type, granted")
      .eq("customer_id", customerId);
    if (error) throw new Error(`reading state failed: ${error.message}`);
    return [...data].sort((a, b) => a.consent_type.localeCompare(b.consent_type));
  }

  /** The seeded customer's whole history, oldest first. */
  async function eventsFor(customerId: string) {
    const { data, error } = await admin
      .from("marketing_consent_events")
      .select("consent_type, granted, source")
      .eq("customer_id", customerId)
      .order("created_at");
    if (error) throw new Error(`reading events failed: ${error.message}`);
    return data;
  }

  function set(
    client: SupabaseClient<Database>,
    consentType: Database["public"]["Enums"]["marketing_consent_type"],
    granted: boolean,
    source: string,
  ) {
    return client.rpc("set_marketing_consent", {
      p_consent_type: consentType,
      p_granted: granted,
      p_source: source,
    });
  }

  // -------------------------------------------------------------------------
  // The self-service writer
  // -------------------------------------------------------------------------

  describe("set_marketing_consent", () => {
    it("records a grant, and the parent reads their own state back", async () => {
      const res = await set(customer, SOG, true, "settings");
      expect(res.error).toBeNull();

      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true },
      ]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true, source: "settings" },
      ]);

      // Through the caller's own RLS view, not the service-role client: the
      // read policy is half of what makes this usable at all.
      const own = await customer
        .from("marketing_consents")
        .select("consent_type, granted")
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(own.error).toBeNull();
      expect(own.data).toEqual([{ consent_type: SOG, granted: true }]);
    });

    it("revokes what it granted — the whole difference from an enrolment condition", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();
      expect((await set(customer, SOG, false, "settings")).error).toBeNull();

      // ONE state row, holding the latest answer: the state table is a current
      // answer and never an accumulating log.
      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: false },
      ]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true, source: "settings" },
        { consent_type: SOG, granted: false, source: "settings" },
      ]);
    });

    it("grants again after a revoke, because a revocable consent has no terminal state", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();
      expect((await set(customer, SOG, false, "settings")).error).toBeNull();
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true },
      ]);
      // Three rows and no unique constraint anywhere: granting, revoking and
      // granting again is the ordinary life of one of these, and the three rows
      // are history rather than duplicates.
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toHaveLength(3);
    });

    it("keeps the two consent types apart, each with its own state and source", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();
      expect((await set(customer, LYNX, false, "enrolment")).error).toBeNull();

      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: LYNX, granted: false },
        { consent_type: SOG, granted: true },
      ]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true, source: "settings" },
        { consent_type: LYNX, granted: false, source: "enrolment" },
      ]);
    });

    it("appends NO event when the submitted state already matches", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      // The stale-tab resubmit, and the settings form that was saved without
      // anything being touched. Both succeed — this is idempotent, not refused —
      // and both leave the history alone, because an event log of "changes"
      // that recorded non-changes would answer "how often did this parent
      // change their mind" with a number made of page loads.
      const replay = await set(customer, SOG, true, "settings");
      expect(replay.error).toBeNull();

      expect(await eventsFor(TEST_IDS.CUSTOMER)).toHaveLength(1);
    });

    it("does NOT let a repeat submission relabel the source of the answer on file", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();
      // Same state, different surface. Skipping the event is what keeps the
      // provenance of the ORIGINAL answer intact — an appended row here would
      // make the newest event claim the consent came from a signup panel.
      expect((await set(customer, SOG, true, "enrolment")).error).toBeNull();

      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true, source: "settings" },
      ]);
    });

    it("records a FIRST explicit no as a change, because an absent row is not a refusal", async () => {
      // The asymmetry the idempotency check is written around: "never answered"
      // and "answered no" are both "do not mail", and only one of them is a
      // decision the parent made. A comparison that treated the missing row as
      // false would swallow this event entirely.
      expect((await set(customer, LYNX, false, "enrolment")).error).toBeNull();

      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: LYNX, granted: false },
      ]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: LYNX, granted: false, source: "enrolment" },
      ]);
    });

    it("refuses the registration source, writing nothing at all", async () => {
      const res = await set(customer, SOG, true, "registration");

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain("registration");
      // Both halves, because the refusal has to be the whole transaction: a
      // state row written with the event refused would leave the platform
      // mailing somebody on the strength of a call it rejected.
      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a source it has never heard of", async () => {
      const res = await set(customer, SOG, true, "a-surface-that-does-not-exist");
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toEqual([]);
    });

    it("refuses a gedu", async () => {
      // The role guard, not an empty result: a gedu's relationship with us is a
      // contract (00201) rather than a mailing list, so there is no consent for
      // them to hold and the refusal says so.
      const res = await set(gedu, SOG, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GEDU)).toEqual([]);
    });

    it("refuses a gamer", async () => {
      const res = await set(gamer, SOG, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses an ADMIN too, which is the design and not an oversight", async () => {
      // An admin who is also a parent holds their consents on that customer
      // account and toggles them there like anybody else. An admin editing
      // somebody else's marketing consent is not a thing this platform does —
      // the answer belongs to whoever owns the mailbox.
      const res = await set(adminAuth, SOG, true, "settings");
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await stateFor(TEST_IDS.ADMIN)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Who can read what
  // -------------------------------------------------------------------------

  describe("read scoping", () => {
    it("lets a customer read their own rows and never another family's", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      // A second family's answer, written with the service-role client so it
      // exists without the customer under test ever touching it.
      const seeded = await admin.from("marketing_consents").insert({
        customer_id: TEST_IDS.CUSTOMER_2,
        consent_type: SOG,
        granted: true,
      });
      expect(seeded.error).toBeNull();
      const seededEvent = await admin.from("marketing_consent_events").insert({
        customer_id: TEST_IDS.CUSTOMER_2,
        consent_type: SOG,
        granted: true,
        source: "registration",
      });
      expect(seededEvent.error).toBeNull();

      // Unfiltered reads: the policy is the only thing narrowing them, which is
      // exactly the claim under test.
      const state = await customer
        .from("marketing_consents")
        .select("customer_id");
      expect(state.error).toBeNull();
      expect(new Set((state.data ?? []).map((r) => r.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER]),
      );

      const events = await customer
        .from("marketing_consent_events")
        .select("customer_id");
      expect(events.error).toBeNull();
      expect(new Set((events.data ?? []).map((r) => r.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER]),
      );

      // And the other way round, so the pass cannot be an artefact of which
      // family happened to be seeded first.
      const theirs = await customer2
        .from("marketing_consents")
        .select("customer_id");
      expect(theirs.error).toBeNull();
      expect(new Set((theirs.data ?? []).map((r) => r.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER_2]),
      );
    });

    it("lets an admin read anyone's state and history", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      const state = await adminAuth
        .from("marketing_consents")
        .select("customer_id, granted")
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(state.error).toBeNull();
      expect(state.data).toEqual([
        { customer_id: TEST_IDS.CUSTOMER, granted: true },
      ]);

      const events = await adminAuth
        .from("marketing_consent_events")
        .select("customer_id")
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(events.error).toBeNull();
      expect(events.data).toHaveLength(1);
    });

    it("tells anon nothing about either table", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      // No grant at all for `anon`, so this is refused by the grant layer
      // rather than filtered to nothing by a policy — the stronger of the two.
      const state = await anon.from("marketing_consents").select("customer_id");
      expect(state.error).not.toBeNull();

      const events = await anon
        .from("marketing_consent_events")
        .select("customer_id");
      expect(events.error).not.toBeNull();
    });

    it("holds no write grant for authenticated on any of the three tables", async () => {
      // Every row is written by a guarded function or by the service-role
      // client, so a direct write must be refused by the missing grant rather
      // than by a policy that could be edited.
      const state = await customer.from("marketing_consents").insert({
        customer_id: TEST_IDS.CUSTOMER,
        consent_type: SOG,
        granted: true,
      });
      expect(state.error).not.toBeNull();

      const event = await customer.from("marketing_consent_events").insert({
        customer_id: TEST_IDS.CUSTOMER,
        consent_type: SOG,
        granted: true,
        source: "registration",
      });
      expect(event.error).not.toBeNull();

      const ask = await customer.from("product_marketing_consents").insert({
        product_id: PRODUCT_PUBLISHED,
        consent_type: LYNX,
      });
      expect(ask.error).not.toBeNull();
    });

    it("gives an authenticated caller no UPDATE or DELETE path to their own answer either", async () => {
      expect((await set(customer, SOG, true, "settings")).error).toBeNull();

      // The append-only claim, tested from the one caller who could plausibly
      // be granted it: a parent revokes by calling the RPC, never by editing or
      // deleting the row that records what they said.
      const update = await customer
        .from("marketing_consents")
        .update({ granted: false })
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(update.error).not.toBeNull();

      const wipe = await customer
        .from("marketing_consent_events")
        .delete()
        .eq("customer_id", TEST_IDS.CUSTOMER);
      expect(wipe.error).not.toBeNull();

      expect(await stateFor(TEST_IDS.CUSTOMER)).toEqual([
        { consent_type: SOG, granted: true },
      ]);
      expect(await eventsFor(TEST_IDS.CUSTOMER)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // The admin writer of a product's ask set
  // -------------------------------------------------------------------------

  describe("admin_set_product_marketing_consents", () => {
    afterEach(async () => {
      await admin
        .from("product_marketing_consents")
        .delete()
        .in("product_id", ALL_TEST_PRODUCTS);
    });

    /** Sorted in JS, for the reason `stateFor` above spells out. */
    async function asksFor(productId: string) {
      const { data, error } = await admin
        .from("product_marketing_consents")
        .select("consent_type")
        .eq("product_id", productId);
      if (error) throw new Error(`reading asks failed: ${error.message}`);
      return data.map((r) => r.consent_type).sort();
    }

    it("refuses a caller who is not an admin", async () => {
      const res = await customer.rpc("admin_set_product_marketing_consents", {
        p_product_id: PRODUCT_PUBLISHED,
        p_consent_types: [LYNX],
      });
      // The GUARD raising it, not a missing grant: the function is granted to
      // `authenticated`, which this caller is, so the EXECUTE privilege is held
      // and the body is what refuses. The success cases below stand on the same
      // footing (a signed-in admin rather than the service-role client, which
      // has no auth.uid() for the guard to read), so a refusal here cannot be
      // the calling context rather than the role.
      expect(res.error?.code).toBe(FORBIDDEN);
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([]);
    });

    it("attaches the ask an admin picks", async () => {
      const res = await adminAuth.rpc("admin_set_product_marketing_consents", {
        p_product_id: PRODUCT_PUBLISHED,
        p_consent_types: [LYNX],
      });
      expect(res.error).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([LYNX]);
    });

    it("replaces the set rather than merging into it", async () => {
      expect(
        (
          await adminAuth.rpc("admin_set_product_marketing_consents", {
            p_product_id: PRODUCT_PUBLISHED,
            p_consent_types: [LYNX, SOG],
          })
        ).error,
      ).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([LYNX, SOG]);

      const replaced = await adminAuth.rpc(
        "admin_set_product_marketing_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [SOG] },
      );
      expect(replaced.error).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([SOG]);
    });

    it("clears the set when handed nothing", async () => {
      expect(
        (
          await adminAuth.rpc("admin_set_product_marketing_consents", {
            p_product_id: PRODUCT_PUBLISHED,
            p_consent_types: [LYNX],
          })
        ).error,
      ).toBeNull();

      const cleared = await adminAuth.rpc(
        "admin_set_product_marketing_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [] },
      );
      expect(cleared.error).toBeNull();
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([]);
    });

    it("refuses a NULL element and leaves the existing set intact", async () => {
      expect(
        (
          await adminAuth.rpc("admin_set_product_marketing_consents", {
            p_product_id: PRODUCT_PUBLISHED,
            p_consent_types: [LYNX, SOG],
          })
        ).error,
      ).toBeNull();

      // Raw PostgREST, because `marketing_consent_type[]` cannot express an
      // array with a NULL in it and casting around the generated type would be
      // the suppression the code-style rule warns about. The assertion that
      // matters is not the refusal but what survives it: 00211's three-valued
      // `NOT (col = ANY (array))` would have made the replacing DELETE match
      // nothing and quietly degrade the wipe-and-replace into a merge.
      const res = await callRpcRaw(
        adminToken,
        "admin_set_product_marketing_consents",
        { p_product_id: PRODUCT_PUBLISHED, p_consent_types: [SOG, null] },
      );

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(res.message).toContain("NULL");
      expect(await asksFor(PRODUCT_PUBLISHED)).toEqual([LYNX, SOG]);
    });

    it("refuses a product that does not exist, even on a call that clears", async () => {
      // The case the foreign key cannot catch: a clear performs no INSERT, so
      // without the explicit existence check a typo'd id would delete nothing
      // and report success.
      const res = await adminAuth.rpc("admin_set_product_marketing_consents", {
        p_product_id: "00000000-0000-0000-0000-0000000006ee",
        p_consent_types: [],
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.message).toContain("does not exist");
    });
  });

  // -------------------------------------------------------------------------
  // A product's ask is exactly as visible as the product
  // -------------------------------------------------------------------------

  describe("product_marketing_consents readability", () => {
    beforeAll(async () => {
      const seeded = await admin.from("product_marketing_consents").insert([
        { product_id: PRODUCT_PUBLISHED, consent_type: LYNX },
        { product_id: PRODUCT_CANCELLED, consent_type: LYNX },
      ]);
      if (seeded.error) {
        throw new Error(`seeding asks failed: ${seeded.error.message}`);
      }
    });

    afterAll(async () => {
      await admin
        .from("product_marketing_consents")
        .delete()
        .in("product_id", ALL_TEST_PRODUCTS);
    });

    it("tells a stranger that a published product carries the ask", async () => {
      // The shop reason this policy is `TO anon` at all: a product page is read
      // by people with no account, and it has to be able to say what signing up
      // would ask them.
      const res = await anon
        .from("product_marketing_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_PUBLISHED);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ consent_type: LYNX }]);
    });

    it("tells the same stranger nothing about a product they cannot read", async () => {
      const res = await anon
        .from("product_marketing_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_CANCELLED);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    });

    it("follows a signed-in customer's own product view", async () => {
      const published = await customer
        .from("product_marketing_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_PUBLISHED);
      expect(published.error).toBeNull();
      expect(published.data).toEqual([{ consent_type: LYNX }]);

      // A customer with no participation on the cancelled product reads it no
      // better than an anonymous visitor does — the predicate is about the
      // product, not about being signed in.
      const cancelled = await customer
        .from("product_marketing_consents")
        .select("consent_type")
        .eq("product_id", PRODUCT_CANCELLED);
      expect(cancelled.error).toBeNull();
      expect(cancelled.data).toEqual([]);
    });

    it("shows an admin both, because can_read_product's first arm is theirs", async () => {
      const res = await adminAuth
        .from("product_marketing_consents")
        .select("product_id")
        .in("product_id", ALL_TEST_PRODUCTS);
      expect(res.error).toBeNull();
      expect(new Set((res.data ?? []).map((r) => r.product_id))).toEqual(
        new Set(ALL_TEST_PRODUCTS),
      );
    });
  });
});
