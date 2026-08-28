import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  accessTokenFor,
  callRpcRaw,
  callServiceRoleRpcResult,
  createAdminTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { createParticipationRpcResult } from "@/services/participations/participations.contracts";

/**
 * Product-required consents (00210): the enrolment conditions a parent must
 * agree to before a seat — or a place in line — is theirs.
 *
 * Both enrolment doors are covered here, and they are covered together on
 * purpose: `create_participation` and `join_waitlist` reach the same gate
 * through the same helper, and a suite that exercised only one of them would
 * pass while the other silently let an unconsented family in.
 *
 * Two claims are worth stating up front because they are what the assertions
 * are actually about:
 *
 *   * The PAID shape records consent even though it writes no participation.
 *     The parent agreed at checkout; the seat arrives later from the webhook.
 *   * Acceptance is PER ENROLMENT, so a second child produces a second set of
 *     rows rather than inheriting the first child's agreement.
 *
 * Two later migrations are covered here as well, and both change what the gate
 * is for rather than merely extending it:
 *
 *   * 00211 — an array holding a NULL element is refused. Under 00210 that one
 *     value passed the gate for every required document AND had the platform
 *     write acceptance rows claiming agreements nobody had given, reachable by
 *     any signed-in customer through join_product_waitlist.
 *   * 00212 — `admin_enroll_participant` is the THIRD enrolment door, and it
 *     neither prompts nor refuses: it supplies the product's required slugs
 *     itself and stamps `accepted_by` with the acting admin while leaving
 *     `customer_id` the family's.
 *
 * Product UUIDs in the 680-683 sub-range (see product-helpers allocation
 * registry).
 */

const PRODUCT_FREE_REQUIRES = "00000000-0000-0000-0000-000000000680";
const PRODUCT_PAID_REQUIRES = "00000000-0000-0000-0000-000000000681";
const PRODUCT_REQUIRES_NOTHING = "00000000-0000-0000-0000-000000000682";
const PRODUCT_WAITLIST_REQUIRES = "00000000-0000-0000-0000-000000000683";

const ALL_TEST_PRODUCTS = [
  PRODUCT_FREE_REQUIRES,
  PRODUCT_PAID_REQUIRES,
  PRODUCT_REQUIRES_NOTHING,
  PRODUCT_WAITLIST_REQUIRES,
];

const TERMS = "roblox-programme-terms";
const PRIVACY = "roblox-privacy-policy";

/**
 * The versions 00210 seeded, which are the "Last updated" dates the two live
 * pages carry. They differ, and that difference is the point: an acceptance
 * names the version of the text the parent actually read, per document, so a
 * suite asserting one shared version would pass against a bug that recorded
 * the wrong document's revision.
 */
const TERMS_VERSION = "2026-07-31";
const PRIVACY_VERSION = "2026-08-03";

/** PostgreSQL SQLSTATE for check_violation, which the consent gate raises. */
const CHECK_VIOLATION = "23514";

describe("product required consents (00210)", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  /**
   * A signed-in admin, for the comp-enrolment door (00212). It has to be a real
   * session rather than the service-role client: `admin_enroll_participant`
   * guards on the caller's live role AND stamps the acceptance with
   * `auth.uid()`, and a service-role connection has neither.
   */
  let adminAuth: SupabaseClient<Database>;
  /** The same two callers as raw PostgREST tokens, for the NULL-element cases. */
  let customerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerToken = await accessTokenFor(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    adminToken = await accessTokenFor(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);

    // Seat counts well above what any case here enrolls: the seat cap is a gate
    // that sits ABOVE the consent gate, so a product that could fill up would
    // start answering `full` to cases asserting a consent refusal.
    await createTestProduct(admin, {
      id: PRODUCT_FREE_REQUIRES,
      billingMode: "free",
      seatCount: 10,
    });
    await createTestProduct(admin, {
      id: PRODUCT_PAID_REQUIRES,
      billingMode: "paid",
      seatCount: 10,
    });
    await createTestProduct(admin, {
      id: PRODUCT_REQUIRES_NOTHING,
      billingMode: "free",
      seatCount: 10,
    });
    await createTestProduct(admin, {
      id: PRODUCT_WAITLIST_REQUIRES,
      billingMode: "free",
      seatCount: 10,
      waitlistEnabled: true,
    });

    const { error } = await admin.from("product_required_consents").insert([
      { product_id: PRODUCT_FREE_REQUIRES, document_slug: TERMS },
      { product_id: PRODUCT_FREE_REQUIRES, document_slug: PRIVACY },
      { product_id: PRODUCT_PAID_REQUIRES, document_slug: TERMS },
      { product_id: PRODUCT_PAID_REQUIRES, document_slug: PRIVACY },
      { product_id: PRODUCT_WAITLIST_REQUIRES, document_slug: TERMS },
      { product_id: PRODUCT_WAITLIST_REQUIRES, document_slug: PRIVACY },
    ]);
    if (error) throw new Error(`seeding requirements failed: ${error.message}`);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterEach(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
    await admin
      .from("consent_acceptances")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
  });

  /**
   * Every acceptance recorded against one product, in slug order.
   *
   * `accepted_by` (00212) is selected alongside `customer_id` everywhere rather
   * than only in the admin cases: the claim that a family's own click is
   * attributed to the family is exactly as worth pinning as the claim that an
   * admin's is attributed to the admin, and a suite that read the column only
   * where it differs would pass against a writer that always wrote the admin.
   */
  async function acceptancesFor(productId: string) {
    const { data, error } = await admin
      .from("consent_acceptances")
      .select(
        "customer_id, participant_id, accepted_by, document_slug, document_version",
      )
      .eq("product_id", productId)
      .order("participant_id")
      .order("document_slug");
    if (error) throw new Error(`reading acceptances failed: ${error.message}`);
    return data;
  }

  /** How many participation rows the product carries right now. */
  async function participationCount(productId: string) {
    const { count } = await admin
      .from("participations")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    return count;
  }

  function enroll(
    productId: string,
    participantId: string,
    purchaseShape: string,
    consented?: string[],
  ) {
    return admin.rpc("create_participation", {
      p_product_id: productId,
      p_participant_id: participantId,
      p_customer_id: TEST_IDS.CUSTOMER,
      p_purchase_shape: purchaseShape,
      p_currency: "eur",
      ...(consented === undefined
        ? {}
        : { p_consented_documents: consented }),
    });
  }

  // -------------------------------------------------------------------------
  // The seat path
  // -------------------------------------------------------------------------

  describe("create_participation", () => {
    it("refuses an enrolment that agrees to nothing, naming both documents", async () => {
      const res = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free");

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain(TERMS);
      expect(res.error?.message).toContain(PRIVACY);

      // The refusal is the whole transaction: no seat, and no half-written
      // consent for the document that was covered.
      const { count } = await admin
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("product_id", PRODUCT_FREE_REQUIRES);
      expect(count).toBe(0);
      expect(await acceptancesFor(PRODUCT_FREE_REQUIRES)).toEqual([]);
    });

    it("refuses a PARTIAL set, naming only the document still missing", async () => {
      const res = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free", [
        TERMS,
      ]);

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain(PRIVACY);
      expect(res.error?.message).not.toContain(TERMS);
    });

    it("refuses an empty array exactly as it refuses an omission", async () => {
      const res = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free", []);

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain(TERMS);
      expect(res.error?.message).toContain(PRIVACY);
    });

    // -----------------------------------------------------------------------
    // The NULL element (00211)
    // -----------------------------------------------------------------------
    //
    // These two go through raw PostgREST rather than the typed client, and that
    // is not a convenience: `string[]` cannot express an array with a NULL in
    // it, and casting around the generated type would be the suppression the
    // code-style rule warns about. A hand-built body is what a real attacker
    // sends anyway.
    //
    // The bug they pin: 00210 tested membership with `NOT (r = ANY (array))`,
    // which is three-valued — an array holding a NULL and matching nothing
    // answers SQL NULL, `NOT NULL` is NULL, the WHERE keeps no row, and the gate
    // concludes every required document was agreed to. `ARRAY[NULL]` alone was
    // therefore enough to enrol unconsented AND to have the platform write
    // acceptance rows saying the parent had agreed.

    it("refuses an array whose only element is NULL, writing nothing", async () => {
      const res = await callServiceRoleRpcResult("create_participation", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_participant_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
        p_consented_documents: [null],
      });

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(res.message).toContain("NULL");

      // The half that made this a security defect rather than a bad error
      // message: without the fix the enrolment SUCCEEDED and two acceptance
      // rows were written for documents nobody had been shown.
      expect(await participationCount(PRODUCT_FREE_REQUIRES)).toBe(0);
      expect(await acceptancesFor(PRODUCT_FREE_REQUIRES)).toEqual([]);
    });

    it("refuses a NULL smuggled in beside a real slug", async () => {
      // The shape a caller would actually send: agree to the one document you
      // are willing to agree to, and let the NULL cover the other. Under 00210
      // this recorded acceptance of BOTH.
      const res = await callServiceRoleRpcResult("create_participation", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_participant_id: TEST_IDS.GAMER,
        p_customer_id: TEST_IDS.CUSTOMER,
        p_purchase_shape: "free",
        p_currency: "eur",
        p_consented_documents: [TERMS, null],
      });

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(await participationCount(PRODUCT_FREE_REQUIRES)).toBe(0);
      expect(await acceptancesFor(PRODUCT_FREE_REQUIRES)).toEqual([]);
    });

    it("records one acceptance per required document, at that document's CURRENT version", async () => {
      const res = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free", [
        TERMS,
        PRIVACY,
      ]);
      expect(res.error).toBeNull();
      expect(createParticipationRpcResult.parse(res.data).kind).toBe(
        "free_active",
      );

      const rows = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      expect(rows).toEqual([
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          // The parent ticked the boxes themselves, so the two columns hold one
          // id (00212). That coincidence is the whole point of having both:
          // it is what an admin-written row is told apart from.
          accepted_by: TEST_IDS.CUSTOMER,
          document_slug: PRIVACY,
          document_version: PRIVACY_VERSION,
        },
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          accepted_by: TEST_IDS.CUSTOMER,
          document_slug: TERMS,
          document_version: TERMS_VERSION,
        },
      ]);
    });

    it("records nothing extra for a document the product does not require", async () => {
      // A slug the whitelist has never heard of, shaped so it cannot ever be
      // seeded by accident: the real ones are lowercase kebab-case names of
      // published documents.
      const res = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free", [
        TERMS,
        PRIVACY,
        "NOT-A-DOCUMENT-THIS-PLATFORM-PUBLISHES",
      ]);
      expect(res.error).toBeNull();

      const rows = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.document_slug).sort()).toEqual(
        [PRIVACY, TERMS].sort(),
      );
    });

    it("records acceptances on the PAID shape, which writes no participation row", async () => {
      const res = await enroll(
        PRODUCT_PAID_REQUIRES,
        TEST_IDS.GAMER,
        "subscription_monthly",
        [TERMS, PRIVACY],
      );
      expect(res.error).toBeNull();
      expect(createParticipationRpcResult.parse(res.data).kind).toBe(
        "validated",
      );

      // The seat genuinely does not exist yet — it arrives from the Stripe
      // webhook — and the consent record is here anyway, because the parent
      // agreed here.
      const { count } = await admin
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("product_id", PRODUCT_PAID_REQUIRES);
      expect(count).toBe(0);

      const rows = await acceptancesFor(PRODUCT_PAID_REQUIRES);
      expect(rows).toHaveLength(2);
    });

    it("refuses the PAID shape without consent, before any Checkout could be created", async () => {
      const res = await enroll(
        PRODUCT_PAID_REQUIRES,
        TEST_IDS.GAMER,
        "subscription_monthly",
      );
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await acceptancesFor(PRODUCT_PAID_REQUIRES)).toEqual([]);
    });

    it("records a FRESH set per enrolment — a second child does not inherit the first's agreement", async () => {
      const first = await enroll(
        PRODUCT_FREE_REQUIRES,
        TEST_IDS.GAMER,
        "free",
        [TERMS, PRIVACY],
      );
      expect(first.error).toBeNull();

      // The same parent, the same product, a different child: the consent has
      // to be given (and recorded) again.
      const missing = await enroll(
        PRODUCT_FREE_REQUIRES,
        TEST_IDS.GAMER_2,
        "free",
      );
      expect(missing.error?.code).toBe(CHECK_VIOLATION);

      const second = await enroll(
        PRODUCT_FREE_REQUIRES,
        TEST_IDS.GAMER_2,
        "free",
        [TERMS, PRIVACY],
      );
      expect(second.error).toBeNull();

      const rows = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((r) => r.participant_id))).toEqual(
        new Set([TEST_IDS.GAMER, TEST_IDS.GAMER_2]),
      );
    });

    it("enrolls unchanged on a product that requires nothing, with the argument omitted", async () => {
      const res = await enroll(
        PRODUCT_REQUIRES_NOTHING,
        TEST_IDS.GAMER,
        "free",
      );
      expect(res.error).toBeNull();
      expect(createParticipationRpcResult.parse(res.data).kind).toBe(
        "free_active",
      );
      expect(await acceptancesFor(PRODUCT_REQUIRES_NOTHING)).toEqual([]);
    });

    it("records nothing on a product that requires nothing, even when slugs are sent", async () => {
      const res = await enroll(
        PRODUCT_REQUIRES_NOTHING,
        TEST_IDS.GAMER,
        "free",
        [TERMS, PRIVACY],
      );
      expect(res.error).toBeNull();
      expect(await acceptancesFor(PRODUCT_REQUIRES_NOTHING)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // The queue path
  // -------------------------------------------------------------------------

  describe("join_product_waitlist", () => {
    function join(consented?: string[]) {
      return customer.rpc("join_product_waitlist", {
        p_product_id: PRODUCT_WAITLIST_REQUIRES,
        p_participant_id: TEST_IDS.GAMER,
        ...(consented === undefined
          ? {}
          : { p_consented_documents: consented }),
      });
    }

    it("refuses a queue join that agrees to nothing", async () => {
      const res = await join();

      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain(TERMS);
      expect(res.error?.message).toContain(PRIVACY);

      const { count } = await admin
        .from("participations")
        .select("id", { count: "exact", head: true })
        .eq("product_id", PRODUCT_WAITLIST_REQUIRES);
      expect(count).toBe(0);
      expect(await acceptancesFor(PRODUCT_WAITLIST_REQUIRES)).toEqual([]);
    });

    it("refuses a NULL element on the queue path too, and it is the reachable one", async () => {
      // This is the door that made the 00211 bug a live security defect rather
      // than a theoretical one: `join_product_waitlist` is granted directly to
      // `authenticated` and passes its array straight through, so any signed-in
      // customer could send it. `create_participation` is service-role only and
      // sits behind a route. Same gate, same fix, and this is the half a real
      // caller can reach.
      const res = await callRpcRaw(customerToken, "join_product_waitlist", {
        p_product_id: PRODUCT_WAITLIST_REQUIRES,
        p_participant_id: TEST_IDS.GAMER,
        p_consented_documents: [TERMS, null],
      });

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(await participationCount(PRODUCT_WAITLIST_REQUIRES)).toBe(0);
      expect(await acceptancesFor(PRODUCT_WAITLIST_REQUIRES)).toEqual([]);
    });

    it("records the acceptances on the call that takes the place in line", async () => {
      const res = await join([TERMS, PRIVACY]);
      expect(res.error).toBeNull();

      const rows = await acceptancesFor(PRODUCT_WAITLIST_REQUIRES);
      expect(rows).toEqual([
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          accepted_by: TEST_IDS.CUSTOMER,
          document_slug: PRIVACY,
          document_version: PRIVACY_VERSION,
        },
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          accepted_by: TEST_IDS.CUSTOMER,
          document_slug: TERMS,
          document_version: TERMS_VERSION,
        },
      ]);
    });

    it("records nothing on a replay — one enrolment agreed once", async () => {
      const first = await join([TERMS, PRIVACY]);
      expect(first.error).toBeNull();

      // The stale-tab resubmit the `idempotent` flag exists to name. It returns
      // the same place in line and must not write a second agreement to it.
      const replay = await join([TERMS, PRIVACY]);
      expect(replay.error).toBeNull();

      expect(await acceptancesFor(PRODUCT_WAITLIST_REQUIRES)).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // The admin writer
  // -------------------------------------------------------------------------

  describe("set_product_required_consents", () => {
    afterEach(async () => {
      // Restore the fixture's requirement set — the replacement cases below
      // rewrite it, and every case above depends on it holding both documents.
      await admin
        .from("product_required_consents")
        .delete()
        .eq("product_id", PRODUCT_REQUIRES_NOTHING);
      await admin
        .from("product_required_consents")
        .delete()
        .eq("product_id", PRODUCT_FREE_REQUIRES);
      await admin.from("product_required_consents").insert([
        { product_id: PRODUCT_FREE_REQUIRES, document_slug: TERMS },
        { product_id: PRODUCT_FREE_REQUIRES, document_slug: PRIVACY },
      ]);
    });

    async function requirementsFor(productId: string) {
      const { data } = await admin
        .from("product_required_consents")
        .select("document_slug")
        .eq("product_id", productId)
        .order("document_slug");
      return (data ?? []).map((r) => r.document_slug);
    }

    it("refuses a caller who is not an admin", async () => {
      const res = await customer.rpc("set_product_required_consents", {
        p_product_id: PRODUCT_REQUIRES_NOTHING,
        p_slugs: [TERMS],
      });
      // The canonical forbidden SQLSTATE every guard primitive raises.
      expect(res.error?.code).toBe("42501");
      expect(await requirementsFor(PRODUCT_REQUIRES_NOTHING)).toEqual([]);
    });

    it("replaces the set rather than merging into it", async () => {
      const res = await admin.rpc("set_product_required_consents", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_slugs: [PRIVACY],
      });
      expect(res.error).toBeNull();
      expect(await requirementsFor(PRODUCT_FREE_REQUIRES)).toEqual([PRIVACY]);
    });

    it("clears the set when handed nothing", async () => {
      const res = await admin.rpc("set_product_required_consents", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_slugs: [],
      });
      expect(res.error).toBeNull();
      expect(await requirementsFor(PRODUCT_FREE_REQUIRES)).toEqual([]);
    });

    it("refuses a NULL element and leaves the existing set intact", async () => {
      // The same three-valued `ANY` construct 00211 fixed in the consent gate
      // sat in this function's replacing DELETE, where a NULL element made the
      // predicate match nothing: the wipe-and-replace quietly degraded into a
      // merge before the INSERT died on the NOT NULL. So the assertion that
      // matters is not the refusal — 00210 refused too, for the wrong reason —
      // it is that the product still requires exactly what it did before.
      const res = await callRpcRaw(adminToken, "set_product_required_consents", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_slugs: [PRIVACY, null],
      });

      expect(res.code).toBe(CHECK_VIOLATION);
      expect(res.message).toContain("NULL");
      expect(await requirementsFor(PRODUCT_FREE_REQUIRES)).toEqual(
        [PRIVACY, TERMS].sort(),
      );
    });

    it("refuses a document the platform has never published", async () => {
      const res = await admin.rpc("set_product_required_consents", {
        p_product_id: PRODUCT_REQUIRES_NOTHING,
        p_slugs: ["NOT-A-DOCUMENT-THIS-PLATFORM-PUBLISHES"],
      });
      // foreign_key_violation — the only validation this needs, since the
      // whitelist is what decides a slug exists.
      expect(res.error?.code).toBe("23503");
    });
  });

  // -------------------------------------------------------------------------
  // Which version an enrolment records
  // -------------------------------------------------------------------------

  describe("version resolution", () => {
    /**
     * A revision published "later" than the two seeded ones. Shaped so it can
     * never collide with a real published version: the live labels are the
     * "Last updated" dates the documents carry, and there will be no document
     * revised on the last day of the year 9999.
     */
    const NEXT_TERMS_VERSION = "9999-12-31";

    afterEach(async () => {
      // Acceptances first: they carry a composite FK into
      // consent_document_versions, so the version row cannot go while a row
      // still names it. This hook runs before the file-level one (inner hooks
      // run first), which is why it repeats the acceptance delete rather than
      // relying on it.
      await admin
        .from("consent_acceptances")
        .delete()
        .in("product_id", ALL_TEST_PRODUCTS);
      await admin
        .from("consent_document_versions")
        .delete()
        .eq("document_slug", TERMS)
        .eq("version", NEXT_TERMS_VERSION);
    });

    it("records the version current AT ENROLMENT, so a republished document reaches the next family with no product edit", async () => {
      const before = await enroll(
        PRODUCT_FREE_REQUIRES,
        TEST_IDS.GAMER,
        "free",
        [TERMS, PRIVACY],
      );
      expect(before.error).toBeNull();

      const first = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      expect(
        first.find((r) => r.document_slug === TERMS)?.document_version,
      ).toBe(TERMS_VERSION);

      // Publishing a revision is ONE insert and touches no product: that is the
      // whole reason product_required_consents points at a document rather than
      // at a version.
      const { error: publishError } = await admin
        .from("consent_document_versions")
        .insert({ document_slug: TERMS, version: NEXT_TERMS_VERSION });
      expect(publishError).toBeNull();

      // A different child, because the already-enrolled gate would refuse the
      // first one and this case is about the SECOND enrolment's version.
      const after = await enroll(
        PRODUCT_FREE_REQUIRES,
        TEST_IDS.GAMER_2,
        "free",
        [TERMS, PRIVACY],
      );
      expect(after.error).toBeNull();

      const rows = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      const second = rows.filter(
        (r) => r.participant_id === TEST_IDS.GAMER_2,
      );
      expect(
        second.find((r) => r.document_slug === TERMS)?.document_version,
      ).toBe(NEXT_TERMS_VERSION);

      // Per SLUG, not per enrolment: the privacy policy was not republished, so
      // the same enrolment still names its own unchanged version. A resolver
      // that read "the newest version of anything" would fail here.
      expect(
        second.find((r) => r.document_slug === PRIVACY)?.document_version,
      ).toBe(PRIVACY_VERSION);

      // And the first family's record is untouched — which is the point of
      // storing a version rather than a boolean.
      expect(
        rows
          .filter((r) => r.participant_id === TEST_IDS.GAMER)
          .find((r) => r.document_slug === TERMS)?.document_version,
      ).toBe(TERMS_VERSION);
    });
  });

  // -------------------------------------------------------------------------
  // The third door: admin comp-enrolment (00212)
  // -------------------------------------------------------------------------

  describe("admin_enroll_participant", () => {
    it("records the required consents on the family's behalf, attributed to the admin", async () => {
      const res = await adminAuth.rpc("admin_enroll_participant", {
        p_product_id: PRODUCT_FREE_REQUIRES,
        p_participant_id: TEST_IDS.GAMER,
      });
      // Not refused, not prompted: admins are trusted, and the Add button
      // behaves on a consent-requiring product exactly as it does anywhere
      // else. The RPC takes no consent argument at all.
      expect(res.error).toBeNull();
      expect(await participationCount(PRODUCT_FREE_REQUIRES)).toBe(1);

      const rows = await acceptancesFor(PRODUCT_FREE_REQUIRES);
      expect(rows).toEqual([
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          // The two columns diverge here, and this is the only place they can:
          // the agreement still binds the family, and the act was the admin's.
          accepted_by: TEST_IDS.ADMIN,
          document_slug: PRIVACY,
          document_version: PRIVACY_VERSION,
        },
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          accepted_by: TEST_IDS.ADMIN,
          document_slug: TERMS,
          document_version: TERMS_VERSION,
        },
      ]);
    });

    it("still writes no acceptance on a product that requires nothing", async () => {
      const res = await adminAuth.rpc("admin_enroll_participant", {
        p_product_id: PRODUCT_REQUIRES_NOTHING,
        p_participant_id: TEST_IDS.GAMER,
      });
      expect(res.error).toBeNull();
      expect(await participationCount(PRODUCT_REQUIRES_NOTHING)).toBe(1);
      expect(await acceptancesFor(PRODUCT_REQUIRES_NOTHING)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Read scoping
  // -------------------------------------------------------------------------

  describe("who can read what", () => {
    it("lets a customer read their own acceptances and nobody else's", async () => {
      const mine = await enroll(PRODUCT_FREE_REQUIRES, TEST_IDS.GAMER, "free", [
        TERMS,
        PRIVACY,
      ]);
      expect(mine.error).toBeNull();

      // A second family's agreement on the same product, written with the
      // service-role client so it exists without the customer under test ever
      // touching it.
      const { error: otherError } = await admin
        .from("consent_acceptances")
        .insert({
          customer_id: TEST_IDS.CUSTOMER_2,
          participant_id: TEST_IDS.CUSTOMER_2,
          accepted_by: TEST_IDS.CUSTOMER_2,
          product_id: PRODUCT_FREE_REQUIRES,
          document_slug: TERMS,
          document_version: TERMS_VERSION,
        });
      expect(otherError).toBeNull();

      const { data, error } = await customer
        .from("consent_acceptances")
        .select("customer_id")
        .eq("product_id", PRODUCT_FREE_REQUIRES);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(new Set((data ?? []).map((r) => r.customer_id))).toEqual(
        new Set([TEST_IDS.CUSTOMER]),
      );
    });

    it("holds no write grant for authenticated on any of the four tables", async () => {
      // The tables are readable and that is all: every row is written by a
      // migration or by a guarded function, so a direct write must be refused
      // by the missing grant rather than by a policy that could be edited.
      const insert = await customer
        .from("consent_acceptances")
        .insert({
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          accepted_by: TEST_IDS.CUSTOMER,
          product_id: PRODUCT_FREE_REQUIRES,
          document_slug: TERMS,
          document_version: TERMS_VERSION,
        });
      expect(insert.error).not.toBeNull();

      const requirement = await customer
        .from("product_required_consents")
        .insert({ product_id: PRODUCT_REQUIRES_NOTHING, document_slug: TERMS });
      expect(requirement.error).not.toBeNull();

      const document = await customer
        .from("consent_documents")
        .insert({ slug: "a-document-nobody-may-invent" });
      expect(document.error).not.toBeNull();

      const version = await customer
        .from("consent_document_versions")
        .insert({ document_slug: TERMS, version: "9999-12-31" });
      expect(version.error).not.toBeNull();
    });
  });
});
