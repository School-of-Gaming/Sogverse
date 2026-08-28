import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
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

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
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

  /** Every acceptance recorded against one product, in slug order. */
  async function acceptancesFor(productId: string) {
    const { data, error } = await admin
      .from("consent_acceptances")
      .select("customer_id, participant_id, document_slug, document_version")
      .eq("product_id", productId)
      .order("participant_id")
      .order("document_slug");
    if (error) throw new Error(`reading acceptances failed: ${error.message}`);
    return data;
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
          document_slug: PRIVACY,
          document_version: PRIVACY_VERSION,
        },
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
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

    it("records the acceptances on the call that takes the place in line", async () => {
      const res = await join([TERMS, PRIVACY]);
      expect(res.error).toBeNull();

      const rows = await acceptancesFor(PRODUCT_WAITLIST_REQUIRES);
      expect(rows).toEqual([
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
          document_slug: PRIVACY,
          document_version: PRIVACY_VERSION,
        },
        {
          customer_id: TEST_IDS.CUSTOMER,
          participant_id: TEST_IDS.GAMER,
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
