import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  municipalityInvoicingSnapshot,
  type MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing/municipality-invoicing.contracts";

/**
 * `get_admin_municipality_invoicing` (migration 00252) — one calendar month of
 * municipality-club invoicing as a single JSONB document, parsed through the
 * `municipalityInvoicingSnapshot` contract the service parses through in the
 * browser. That parse is half the point of this file: the schema is the wire
 * contract's only definition, and CI is where it meets real Postgres.
 *
 * The other half is the rules a schema cannot see:
 *   - the month argument has to be a month, and a mid-month date is refused
 *   - a club with a stored session row inside the month is in the document,
 *     with that row, whatever else is true of it
 *   - the municipality is resolved by walking UP from the club's own location:
 *     the fixture club sits in a *site*, and the answer has to be the
 *     municipality that site hangs off
 *   - a club whose sessions and term both fall outside the month is absent
 *
 * **Every assertion is scoped to this file's own fixtures.** CI carries the
 * migrations' data *and* `seed.sql` *and* whatever other test files have seeded
 * in parallel, so "the document holds two clubs" is a claim about the whole
 * platform and would be false for reasons that are not bugs. The document is
 * read once, after seeding, and each test looks up its own club in it.
 *
 * The month is a **fixed** historical one rather than one derived from today:
 * every fact this file asserts is about which side of a month boundary a date
 * falls on, and a window that moves while the suite runs cannot state that.
 *
 * Product UUIDs 7fa-7fc (see the allocation registry in product-helpers.ts).
 */

/** The month under test. March 2026 — fixed, so nothing here moves with time. */
const MONTH_START = "2026-03-01";
/** A Wednesday inside that month. */
const IN_MONTH_DATE = "2026-03-04";
/** A Wednesday a month later, which must land outside the window. */
const OUT_OF_MONTH_DATE = "2026-04-01";

/**
 * The club with a session inside the month. It sits in a *site* (the seeded
 * Test School), so the municipality it reports has to come from walking up to
 * the school's parent rather than from the club's own location row.
 */
const P_IN_MONTH = "00000000-0000-0000-0000-0000000007fa";
const GROUP_IN_MONTH = "00000000-0000-0000-0000-0000000007fb";
/**
 * The club that is nowhere near the month: its term ran months later and its
 * one session row is in April. It exists to make "absent" a fact about the
 * month rather than about the fixture being empty.
 */
const P_OUT_OF_MONTH = "00000000-0000-0000-0000-0000000007fc";
const GROUP_OUT_OF_MONTH = "00000000-0000-0000-0000-0000000007fd";

const ALL_PRODUCTS = [P_IN_MONTH, P_OUT_OF_MONTH];

/** A session row's two timestamps, which the table requires and this file does not assert on. */
function sessionWindow(date: string) {
  return {
    starts_at: `${date}T14:00:00Z`,
    ends_at: `${date}T15:30:00Z`,
  };
}

describe("get_admin_municipality_invoicing", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let snapshot: MunicipalityInvoicingSnapshot;

  function invoiced(productId: string) {
    return snapshot.clubs.find((club) => club.id === productId);
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
    // Both are created online against the municipality (the only location an
    // online municipality club may carry) and then moved in person into the
    // site, because an in-person product's location must be a site. That second
    // step is what this file is about: the club's own location is the school,
    // and the municipality has to be found above it.
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, {
        id,
        productType: "municipality_club",
        billingMode: "external_contract",
        status: "running",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        startDate: id === P_IN_MONTH ? "2026-01-12" : "2026-06-01",
        endDate: id === P_IN_MONTH ? "2026-05-29" : "2026-07-31",
        seatCount: null,
        waitlistEnabled: false,
      });
    }

    const inPerson = await admin
      .from("products")
      .update({ is_remote: false, location_id: TEST_IDS.LOCATION_SITE })
      .in("id", ALL_PRODUCTS);
    expect(inPerson.error).toBeNull();

    const fee = await admin
      .from("products")
      .update({ municipality_fee_cents: 8750 })
      .eq("id", P_IN_MONTH);
    expect(fee.error).toBeNull();

    // Names live in product_translations, and the RPC ships the whole array —
    // so every fixture needs at least one.
    const names = await admin.from("product_translations").insert(
      ALL_PRODUCTS.map((id) => ({
        product_id: id,
        locale: "en",
        name: `Municipality invoicing fixture ${id.slice(-3)}`,
        short_description: "Fixture",
      })),
    );
    expect(names.error).toBeNull();

    // --- groups and their sessions ------------------------------------------
    const groups = await admin.from("product_groups").insert([
      { id: GROUP_IN_MONTH, product_id: P_IN_MONTH, name: "In-month group" },
      {
        id: GROUP_OUT_OF_MONTH,
        product_id: P_OUT_OF_MONTH,
        name: "Out-of-month group",
      },
    ]);
    expect(groups.error).toBeNull();

    const sessions = await admin.from("group_sessions").insert([
      {
        group_id: GROUP_IN_MONTH,
        session_date: IN_MONTH_DATE,
        ...sessionWindow(IN_MONTH_DATE),
      },
      {
        group_id: GROUP_OUT_OF_MONTH,
        session_date: OUT_OF_MONTH_DATE,
        ...sessionWindow(OUT_OF_MONTH_DATE),
      },
    ]);
    expect(sessions.error).toBeNull();

    // One read, after everything is in place. Through the admin's own session:
    // the service-role client has no profiles row, so assert_admin refuses it.
    const { data, error } = await adminUser.rpc(
      "get_admin_municipality_invoicing",
      { p_month_start: MONTH_START },
    );
    expect(error).toBeNull();
    snapshot = municipalityInvoicingSnapshot.parse(data);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  it("refuses a non-admin caller", async () => {
    const { error } = await customer.rpc("get_admin_municipality_invoicing", {
      p_month_start: MONTH_START,
    });
    expect(error?.code).toBe("42501");
  });

  it("refuses an argument that is not the first of a month", async () => {
    // A mid-month date would answer with a month-long span matching no calendar
    // month, and every total drawn from it would be wrong invisibly.
    const { error } = await adminUser.rpc("get_admin_municipality_invoicing", {
      p_month_start: "2026-03-15",
    });
    expect(error?.code).toBe("23514");
  });

  it("names the month it answered for", () => {
    expect(snapshot.month_start).toBe(MONTH_START);
  });

  it("carries a club that recorded a session in the month, with that session", () => {
    const club = invoiced(P_IN_MONTH);
    expect(club).toBeDefined();
    expect(club?.status).toBe("running");
    expect(club?.municipality_fee_cents).toBe(8750);
    expect(club?.start_date).toBe("2026-01-12");
    expect(club?.end_date).toBe("2026-05-29");
    expect(club?.sessions).toEqual([
      { group_id: GROUP_IN_MONTH, session_date: IN_MONTH_DATE },
    ]);
    expect(club?.product_translations).toEqual([
      {
        locale: "en",
        name: `Municipality invoicing fixture ${P_IN_MONTH.slice(-3)}`,
      },
    ]);
  });

  it("resolves the municipality by walking up from the club's own site", () => {
    // The club's location is the seeded Test School, whose parent is Helsinki.
    // A read that took the club's own location row as the municipality would
    // invoice a school; one that did not walk at all would find nothing.
    const club = invoiced(P_IN_MONTH);
    expect(club?.location?.id).toBe(TEST_IDS.LOCATION_SITE);
    expect(club?.location?.type).toBe("site");
    expect(club?.municipality?.id).toBe(TEST_IDS.LOCATION_MUNICIPALITY);
  });

  it("omits a club whose sessions and term both fall outside the month", () => {
    expect(invoiced(P_OUT_OF_MONTH)).toBeUndefined();
  });

  it("ships every array, never a null", () => {
    const club = invoiced(P_IN_MONTH);
    // No schedule slots were seeded, so this is the empty case — the one where
    // a `jsonb_agg` over nothing would have produced null and broken the parse.
    expect(club?.schedule_slots).toEqual([]);
  });
});
