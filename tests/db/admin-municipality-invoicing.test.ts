import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";
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
 *   - a club that recorded NOTHING but was running across the month is in it
 *     too, with an empty session array — that is the second half of the
 *     candidate union, and it is the club the CFO most needs to see
 *   - the municipality is resolved by walking UP from the club's own location:
 *     the fixture club sits in a *site*, and the answer has to be the
 *     municipality that site hangs off
 *   - the walk is ancestor-or-**self**: an online club pointing straight at a
 *     municipality reports that municipality as both its location and its
 *     invoicing target
 *   - a schedule slot's `start_time` arrives as a bare `HH:MM` wall clock, which
 *     is what the client contract parses and what the projection reads
 *   - a club whose sessions and term both fall outside the month is absent
 *   - a club whose location chain reaches NO municipality takes the whole read
 *     down, naming the product: an invoice is per municipality, so such a club
 *     cannot be billed to anybody and is a data error to repair rather than a
 *     shape any page has to render (migration 00253)
 *   - the club carries the WHOLE Fennoa customer it is invoiced to, or null
 *     where nobody has named a buyer — and a null there does NOT refuse the
 *     month, unlike a null municipality, because only that club's own file is
 *     blocked by it (migration 00259)
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
 * Product UUIDs 7f7, 7f8, 7f9 and 7fa-7fd (see the allocation registry in
 * product-helpers.ts).
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
/**
 * The club that was running right across the month and recorded nothing at all:
 * no group, no session row, no schedule slot.
 *
 * It pins the *second* half of the candidate union — a term overlapping the
 * month — which nothing else in this file reaches, because every
 * other club here is carried in by a stored row. It is also the club this page
 * exists for: one that was supposed to run and wrote nothing up is the thing a
 * CFO has to see before invoicing, and dropping it would be invisible.
 */
const P_NO_SESSIONS = "00000000-0000-0000-0000-0000000007f7";
/**
 * The online club whose own location IS a municipality, which is why the walk is
 * ancestor-or-*self*: there is nothing above it to climb to, and a walk that
 * insisted on a parent would invoice nobody for it.
 */
const P_AT_MUNICIPALITY = "00000000-0000-0000-0000-0000000007f8";
/**
 * The club that cannot be invoiced: its own location is a *site* hanging
 * directly off the seeded region, with no municipality anywhere in the chain.
 *
 * It is created and torn down inside its own test rather than seeded with the
 * rest, because its whole effect is to make the RPC refuse — present during the
 * shared read, it would take every other assertion in this file down with it,
 * which is exactly the blast radius the refusal is supposed to have.
 */
const P_NO_MUNICIPALITY = "00000000-0000-0000-0000-0000000007f9";
/** A site parented straight to the region, so the walk finds no municipality. */
const L_REGION_SITE = "00000000-0000-0000-0000-0000000002f9";
/**
 * The Fennoa customer the in-month club is invoiced to (00259).
 *
 * The customer coverage lives in this file rather than beside the table's own,
 * because this file is the only one that may call the invoicing RPC at all: the
 * orphan case above seeds a club with no municipality, and the function refuses
 * every call while that club stands — so a second file reading the same month
 * in a parallel worker would fail for a reason that is not a bug.
 *
 * Its number is a value no other file uses, because `fennoa_customer_no` is the
 * one UNIQUE text column in this schema two files could collide on.
 */
const INVOICE_CUSTOMER = "00000000-0000-0000-0000-00000000080c";
const INVOICE_CUSTOMER_NUMBER = "F980C";

/**
 * The clubs the shared document is read over. The orphan club is deliberately
 * NOT among them: it makes the RPC refuse, so seeding it here would fail every
 * other assertion in this file — which is the refusal's blast radius working as
 * designed, and the reason it gets a test of its own.
 */
const SEEDED_PRODUCTS = [
  P_IN_MONTH,
  P_OUT_OF_MONTH,
  P_NO_SESSIONS,
  P_AT_MUNICIPALITY,
];
/** Everything this file may leave behind, seeded or not. */
const ALL_PRODUCTS = [...SEEDED_PRODUCTS, P_NO_MUNICIPALITY];
/** The clubs that meet in the seeded school, one level under the municipality. */
const IN_PERSON_PRODUCTS = [P_IN_MONTH, P_OUT_OF_MONTH, P_NO_SESSIONS];

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
    // All four are created online against the municipality — the only location
    // an online municipality club may carry — and three of them are then moved
    // in person into the site, because an in-person product's location must be a
    // site. That second step is most of what this file is about: those clubs' own
    // location is the school, and the municipality has to be found above it. The
    // fourth stays online where it was created, on the municipality itself.
    for (const id of SEEDED_PRODUCTS) {
      const outside = id === P_OUT_OF_MONTH;
      await createTestProduct(admin, {
        id,
        productType: "municipality_club",
        billingMode: "external_contract",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        startDate: outside ? "2026-06-01" : "2026-01-12",
        endDate: outside ? "2026-07-31" : "2026-05-29",
        seatCount: null,
        waitlistEnabled: false,
      });
    }

    // Every club but the online one moves into the school. The online one keeps
    // the location it was created with — the municipality itself — which is the
    // only location an online municipality club may carry, and is the fixture
    // behind the ancestor-or-self case.
    const inPerson = await admin
      .from("products")
      .update({ is_remote: false, location_id: TEST_IDS.LOCATION_SITE })
      .in("id", IN_PERSON_PRODUCTS);
    expect(inPerson.error).toBeNull();

    // One slot on the club that recorded a session, so the document carries a
    // non-empty schedule somewhere. The zero-session club keeps none, which is
    // what makes the empty-array case below a real empty case.
    await createScheduleSlot(admin, P_IN_MONTH, {
      weekday: 2,
      startTime: "16:00",
    });

    const fee = await admin
      .from("products")
      .update({ municipality_fee_cents: 8750 })
      .eq("id", P_IN_MONTH);
    expect(fee.error).toBeNull();

    // One club gets a Fennoa customer and the rest do not, which is what makes
    // "the document carries the whole row" and "null where nobody has said who
    // pays" two facts about the same read rather than one fixture each.
    await admin.from("invoice_customers").delete().eq("id", INVOICE_CUSTOMER);
    await admin
      .from("invoice_customers")
      .delete()
      .eq("fennoa_customer_no", INVOICE_CUSTOMER_NUMBER);
    const buyer = await admin.from("invoice_customers").insert({
      id: INVOICE_CUSTOMER,
      fennoa_customer_no: INVOICE_CUSTOMER_NUMBER,
      invoice_name: "Invoicing fixture library services",
      street: "Kirjastokuja 5",
      postal_code: "33101",
      city: "Tampere",
      your_reference: "KIRJ-2026-77",
    });
    expect(buyer.error).toBeNull();

    const linked = await admin
      .from("products")
      .update({ invoice_customer_id: INVOICE_CUSTOMER })
      .eq("id", P_IN_MONTH);
    expect(linked.error).toBeNull();

    // Names live in product_translations, and the RPC ships the whole array —
    // so every fixture needs at least one.
    const names = await admin.from("product_translations").insert(
      SEEDED_PRODUCTS.map((id) => ({
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
    // Products first: the invoice-customer foreign key is ON DELETE RESTRICT,
    // so a customer a club still points at cannot go.
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.from("locations").delete().eq("id", L_REGION_SITE);
    await admin.from("invoice_customers").delete().eq("id", INVOICE_CUSTOMER);
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
    expect(club?.municipality.id).toBe(TEST_IDS.LOCATION_MUNICIPALITY);
  });

  it("carries a club that recorded nothing but ran all month", () => {
    // The second half of the candidate union, and the only fixture here that
    // reaches it: no group, no row, nothing but a term. A read that
    // kept only the clubs with stored rows would hide exactly the club a CFO has
    // to look at before invoicing, and the omission would look like a quiet month.
    const club = invoiced(P_NO_SESSIONS);
    expect(club).toBeDefined();
    expect(club?.sessions).toEqual([]);
    expect(club?.municipality.id).toBe(TEST_IDS.LOCATION_MUNICIPALITY);
  });

  it("reports a club sitting on the municipality itself as its own answer", () => {
    // Ancestor-or-*self*. An online club points at the municipality directly, so
    // the location and the invoicing target are one row; a walk that climbed
    // before it looked would run off the top of the tree and find nothing.
    const club = invoiced(P_AT_MUNICIPALITY);
    expect(club?.location?.id).toBe(TEST_IDS.LOCATION_MUNICIPALITY);
    expect(club?.location?.type).toBe("municipality");
    expect(club?.municipality.id).toBe(club?.location?.id);
  });

  it("ships a schedule slot's start time as a bare HH:MM wall clock", () => {
    // `schedule_slots.start_time` is a `time`, which Postgres would render as
    // `16:00:00`. The client parses `HH:MM` and shows it as a clock face, so the
    // trailing seconds are the RPC's job to drop and this is where that is held.
    expect(invoiced(P_IN_MONTH)?.schedule_slots).toEqual([
      { weekday: 2, start_time: "16:00", duration_minutes: 60 },
    ]);
  });

  it("omits a club whose sessions and term both fall outside the month", () => {
    expect(invoiced(P_OUT_OF_MONTH)).toBeUndefined();
  });

  it("refuses a month holding a club with no municipality at all", async () => {
    // The schema forces a municipality club to carry a location and stops there:
    // nothing makes that location's ancestor chain reach a municipality. So this
    // is the one state the document could still have carried a null for, and the
    // boundary refuses it — an invoice is per municipality, and a club nobody can
    // be billed for is a location to repair rather than a row to render outside
    // every total on the page.
    await admin.from("locations").delete().eq("id", L_REGION_SITE);
    const site = await admin.from("locations").insert({
      id: L_REGION_SITE,
      name: "Invoicing fixture hall with no municipality",
      type: "site",
      parent_id: TEST_IDS.LOCATION_REGION,
      country_code: "FI",
    });
    expect(site.error).toBeNull();

    try {
      await createTestProduct(admin, {
        id: P_NO_MUNICIPALITY,
        productType: "municipality_club",
        billingMode: "external_contract",
        locationId: TEST_IDS.LOCATION_MUNICIPALITY,
        startDate: "2026-01-12",
        endDate: "2026-05-29",
        seatCount: null,
        waitlistEnabled: false,
      });
      // In person into the orphan hall, the same two-step the fixtures above
      // take: an in-person product's location must be a site.
      const moved = await admin
        .from("products")
        .update({ is_remote: false, location_id: L_REGION_SITE })
        .eq("id", P_NO_MUNICIPALITY);
      expect(moved.error).toBeNull();

      const { data, error } = await adminUser.rpc(
        "get_admin_municipality_invoicing",
        { p_month_start: MONTH_START },
      );
      expect(data).toBeNull();
      expect(error?.code).toBe("23514");
      // The message names the club, because repointing its location is the whole
      // of the repair and a refusal that did not say which club would send
      // somebody through every club in the month.
      expect(error?.message).toContain(P_NO_MUNICIPALITY);
    } finally {
      // Torn down here rather than in `afterAll`, so a later file reading this
      // month does not inherit a database the RPC refuses to answer for.
      await deleteTestProducts(admin, [P_NO_MUNICIPALITY]);
      await admin.from("locations").delete().eq("id", L_REGION_SITE);
    }
  });

  it("carries the whole Fennoa customer against the club it invoices", () => {
    // The WHOLE row rather than an id, because what reads it next is a
    // serializer building a Finvoice file: the number Fennoa matches the buyer
    // on, the invoice name and the postal address the import demands all have
    // to be in the document. It parses as part of the snapshot parse above, so
    // what is asserted here is the values.
    expect(invoiced(P_IN_MONTH)?.invoice_customer).toEqual({
      id: INVOICE_CUSTOMER,
      fennoa_customer_no: INVOICE_CUSTOMER_NUMBER,
      invoice_name: "Invoicing fixture library services",
      street: "Kirjastokuja 5",
      postal_code: "33101",
      city: "Tampere",
      country_code: "FI",
      your_reference: "KIRJ-2026-77",
      invoice_text: null,
    });
  });

  it("carries null for a club nobody has named a buyer for, and still answers", () => {
    // The asymmetry with a missing municipality, which refuses the whole read.
    // A club with no customer renders on the page in full and only its own file
    // is blocked, so refusing the month would take every other club's file down
    // with it — and that this very document exists is the proof.
    expect(invoiced(P_NO_SESSIONS)?.invoice_customer).toBeNull();
    expect(invoiced(P_AT_MUNICIPALITY)?.invoice_customer).toBeNull();
  });

  it("ships every array, never a null", () => {
    const club = invoiced(P_NO_SESSIONS);
    // This club has no slots and no rows, so both arrays are the empty case —
    // the one where a `jsonb_agg` over nothing would have produced null and
    // broken the parse.
    expect(club?.schedule_slots).toEqual([]);
    expect(club?.sessions).toEqual([]);
  });
});
