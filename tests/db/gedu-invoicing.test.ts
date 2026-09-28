import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";
import {
  geduInvoicingSnapshot,
  type GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing/gedu-invoicing.contracts";

/**
 * `get_admin_gedu_invoicing` and `get_my_gedu_invoicing`
 * (`supabase/schema/functions/`) — one calendar month of the raw facts a gedu's
 * invoice is computed from, the admin read for every gedu and the gedu's own
 * read for the caller alone, both parsed through the `geduInvoicingSnapshot`
 * contract the service parses through in the browser.
 *
 * What a schema cannot see, and this file holds:
 *   - both reads refuse every role but their own, and anon; the month has to be
 *     a month
 *   - an assigned gedu carries the group with their assignment role
 *   - a sub carries the substituted session with the role recorded on the
 *     request (the absent gedu's), and the absent gedu carries the absence —
 *     the two halves the derivation needs
 *   - a cancelled date in effect is carried as cancelled and never as a
 *     stored session, even when a row is stored on it
 *   - a date outside the month is in neither list
 *   - each side of a substitution names the other: the sub's seat names the
 *     absent gedu, the absent gedu's absence names the sub, and an open
 *     absence names nobody
 *   - no substitution reason, category or note ever reaches the document
 *
 * **Every assertion is scoped to this file's own fixtures**: the seeded gedu is
 * shared with other files running in parallel, so claims about them are made
 * only through this file's own groups. The month is a fixed historical one, so
 * nothing here moves with the clock.
 *
 * Product UUIDs 820-824 (see the allocation registry in product-helpers.ts).
 */

const MONTH_START = "2026-03-01";
/** Wednesdays, matching the weekly slot below. */
const RAN = "2026-03-04";
const CANCELLED = "2026-03-11";
const SUBSTITUTED = "2026-03-18";
/** A Wednesday in the next month: stored, absent-from, and outside the window. */
const OUTSIDE = "2026-04-01";

/** A consumer club taught by the seeded gedu, where the substitution happens. */
const CONSUMER = "00000000-0000-0000-0000-000000000820";
const GROUP_CONSUMER = "00000000-0000-0000-0000-000000000821";
/** A municipality club the minted sub is assigned to as an assistant. */
const MUNI = "00000000-0000-0000-0000-000000000822";
const GROUP_MUNI = "00000000-0000-0000-0000-000000000823";
/** A club nobody in this file teaches, so it must appear in no document. */
const UNTAUGHT = "00000000-0000-0000-0000-000000000824";
const ALL_PRODUCTS = [CONSUMER, MUNI, UNTAUGHT];

const REASON_NOTE = "Gedu invoicing fixture: private reason note";

/**
 * Why anybody was away never reaches the document: no reason, category or note
 * key anywhere in the raw RPC output (the contract parse would strip one), and
 * not the fixture's reason values.
 */
function expectNoReason(doc: unknown) {
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        walk(child);
      }
    }
  };
  walk(doc);
  expect([...keys].filter((key) => /reason|category|note/.test(key))).toEqual([]);
  const text = JSON.stringify(doc);
  expect(text).not.toContain(REASON_NOTE);
  expect(text).not.toContain("sick");
}

function sessionWindow(date: string) {
  return {
    starts_at: `${date}T14:00:00Z`,
    ends_at: `${date}T15:00:00Z`,
  };
}

function baseProduct(id: string) {
  return {
    id,
    product_type: "consumer_club" as const,
    billing_mode: "free" as const,
    topic: "minecraft_java" as const,
    spoken_language_code: "en" as const,
    is_remote: true,
    location_id: null,
    timezone: "UTC",
    registration_opens_at: "2025-12-01T00:00:00Z",
    is_visible: true,
    created_by: TEST_IDS.ADMIN,
    start_date: "2026-01-07",
    end_date: "2026-06-24",
    min_age: 8,
    max_age: 18,
    seat_count: null,
  };
}

describe("gedu invoicing", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;
  let geduUser: SupabaseClient<Database>;
  let subUser: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let subId: string;
  let adminDoc: GeduInvoicingSnapshot;
  let geduDoc: GeduInvoicingSnapshot;
  let subDoc: GeduInvoicingSnapshot;
  // The unparsed documents, for the checks a parse would hide.
  let raw: { admin: unknown; gedu: unknown; sub: unknown };

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    // The sub is minted rather than seeded, and unique per run, so whatever it
    // holds is this file's alone — which is what lets its own read be asserted
    // whole.
    const email = `gedu-invoicing-sub-${Date.now()}@test.local`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Sanni", last_name: "Sijainen" },
    });
    expect(error).toBeNull();
    subId = created.user?.id ?? "";
    expect(subId).toBeTruthy();
    await admin.from("profiles").update({ role: "gedu" }).eq("id", subId);
    await admin.from("customer_profiles").delete().eq("user_id", subId);
    await admin.from("gedu_profiles").insert({ user_id: subId, certified: true });
    subUser = await createAuthenticatedClient(email, "testpassword123");

    await deleteTestProducts(admin, ALL_PRODUCTS);
    const products = await admin.from("products").insert([
      {
        ...baseProduct(CONSUMER),
        primary_gedu_fee_cents: 5000,
        assistant_gedu_fee_cents: 3000,
      },
      {
        ...baseProduct(MUNI),
        product_type: "municipality_club" as const,
        billing_mode: "external_contract" as const,
        location_id: TEST_IDS.LOCATION_MUNICIPALITY,
        primary_gedu_fee_cents: 6000,
      },
      baseProduct(UNTAUGHT),
    ]);
    expect(products.error).toBeNull();

    const names = await admin.from("product_translations").insert(
      ALL_PRODUCTS.map((id) => ({
        product_id: id,
        locale: "en",
        name: `Gedu invoicing fixture ${id.slice(-3)}`,
        short_description: "Fixture",
      })),
    );
    expect(names.error).toBeNull();

    const slots = await admin.from("schedule_slots").insert(
      ALL_PRODUCTS.map((id) => ({
        product_id: id,
        weekday: 2,
        start_time: "14:00",
        duration_minutes: 60,
      })),
    );
    expect(slots.error).toBeNull();

    const groups = await admin.from("product_groups").insert([
      { id: GROUP_CONSUMER, product_id: CONSUMER, name: "Invoicing consumer group" },
      { id: GROUP_MUNI, product_id: MUNI, name: "Invoicing municipality group" },
    ]);
    expect(groups.error).toBeNull();

    const assignments = await admin.from("gedu_group_assignments").insert([
      {
        group_id: GROUP_CONSUMER,
        product_id: CONSUMER,
        gedu_id: TEST_IDS.GEDU,
        role: "primary",
      },
      {
        group_id: GROUP_MUNI,
        product_id: MUNI,
        gedu_id: subId,
        role: "assistant",
      },
    ]);
    expect(assignments.error).toBeNull();

    // Stored rows: one that ran, one a cancellation covers, the substituted
    // one, and one past the month's end.
    const sessions = await admin
      .from("group_sessions")
      .insert(
        [RAN, CANCELLED, SUBSTITUTED, OUTSIDE].map((date) => ({
          group_id: GROUP_CONSUMER,
          session_date: date,
          ...sessionWindow(date),
        })),
      );
    expect(sessions.error).toBeNull();

    const cancellation = await admin.from("session_cancellations").insert({
      group_id: GROUP_CONSUMER,
      session_date: CANCELLED,
      cancelled_by: TEST_IDS.ADMIN,
    });
    expect(cancellation.error).toBeNull();

    // The seeded gedu is out on the 18th and the minted sub stands in, in the
    // primary role the request records. An open absence on the 4th has nobody
    // seated yet, and a third past the month's end must not reach the document.
    const requests = await admin.from("session_substitution_requests").insert([
      {
        group_id: GROUP_CONSUMER,
        session_date: SUBSTITUTED,
        requested_by: TEST_IDS.GEDU,
        role: "primary",
        reason: "sick",
        reason_note: REASON_NOTE,
        status: "substituted",
        substitute_id: subId,
        approved_by: TEST_IDS.ADMIN,
        approved_at: "2026-03-10T09:00:00Z",
      },
      {
        group_id: GROUP_CONSUMER,
        session_date: RAN,
        requested_by: TEST_IDS.GEDU,
        role: "primary",
        reason: "other",
        reason_note: null,
        status: "open",
        substitute_id: null,
        approved_by: null,
        approved_at: null,
      },
      {
        group_id: GROUP_CONSUMER,
        session_date: OUTSIDE,
        requested_by: TEST_IDS.GEDU,
        role: "primary",
        reason: "other",
        // Spelled out: a bulk insert sends every row the union of the keys,
        // so a key left off here would arrive as an explicit null.
        reason_note: null,
        status: "open",
        substitute_id: null,
        approved_by: null,
        approved_at: null,
      },
    ]);
    expect(requests.error).toBeNull();

    const reads = await Promise.all([
      adminUser.rpc("get_admin_gedu_invoicing", { p_month_start: MONTH_START }),
      geduUser.rpc("get_my_gedu_invoicing", { p_month_start: MONTH_START }),
      subUser.rpc("get_my_gedu_invoicing", { p_month_start: MONTH_START }),
    ]);
    for (const read of reads) expect(read.error).toBeNull();
    adminDoc = geduInvoicingSnapshot.parse(reads[0].data);
    geduDoc = geduInvoicingSnapshot.parse(reads[1].data);
    subDoc = geduInvoicingSnapshot.parse(reads[2].data);
    raw = { admin: reads[0].data, gedu: reads[1].data, sub: reads[2].data };
  });

  afterAll(async () => {
    // Requests, cancellations, sessions and slots cascade with their group or
    // product; assignments hold RESTRICT onto the account, so they go first.
    await admin.from("gedu_group_assignments").delete().eq("gedu_id", subId);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.auth.admin.deleteUser(subId);
  });

  describe("authorization", () => {
    it("refuses a customer on both reads", async () => {
      for (const fn of ["get_admin_gedu_invoicing", "get_my_gedu_invoicing"] as const) {
        const { error } = await customer.rpc(fn, { p_month_start: MONTH_START });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses anon on both reads", async () => {
      const anon = createAnonTestClient();
      for (const fn of ["get_admin_gedu_invoicing", "get_my_gedu_invoicing"] as const) {
        const { error } = await anon.rpc(fn, { p_month_start: MONTH_START });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses a gedu the admin read, and an admin the gedu read", async () => {
      const asGedu = await geduUser.rpc("get_admin_gedu_invoicing", {
        p_month_start: MONTH_START,
      });
      expect(asGedu.error?.code).toBe("42501");
      const asAdmin = await adminUser.rpc("get_my_gedu_invoicing", {
        p_month_start: MONTH_START,
      });
      expect(asAdmin.error?.code).toBe("42501");
    });

    it("refuses an argument that is not the first of a month", async () => {
      const { error } = await geduUser.rpc("get_my_gedu_invoicing", {
        p_month_start: "2026-03-15",
      });
      expect(error?.code).toBe("23514");
    });
  });

  describe("the admin read", () => {
    it("names the month it answered for", () => {
      expect(adminDoc.month_start).toBe(MONTH_START);
    });

    it("carries the assigned gedu with their assignment role, and their absence", () => {
      const gedu = adminDoc.gedus.find((g) => g.id === TEST_IDS.GEDU);
      expect(
        gedu?.assignments.filter((a) => a.group_id === GROUP_CONSUMER),
      ).toEqual([{ group_id: GROUP_CONSUMER, role: "primary" }]);
      // Only the in-month absences: the one filed for April is outside.
      expect(
        gedu?.absences
          .filter((a) => a.group_id === GROUP_CONSUMER)
          .map(({ session_date, role, status }) => ({ session_date, role, status })),
      ).toEqual([
        { session_date: RAN, role: "primary", status: "open" },
        { session_date: SUBSTITUTED, role: "primary", status: "substituted" },
      ]);
    });

    it("carries the sub with the role recorded on the request", () => {
      const sub = adminDoc.gedus.find((g) => g.id === subId);
      expect(sub?.first_name).toBe("Sanni");
      expect(
        sub?.substitutions.map(({ group_id, session_date, role }) => ({
          group_id,
          session_date,
          role,
        })),
      ).toEqual([
        { group_id: GROUP_CONSUMER, session_date: SUBSTITUTED, role: "primary" },
      ]);
      expect(sub?.assignments).toEqual([
        { group_id: GROUP_MUNI, role: "assistant" },
      ]);
      expect(sub?.absences).toEqual([]);
    });

    it("carries a cancelled date as cancelled and never as a session that ran", () => {
      const group = adminDoc.groups.find((g) => g.id === GROUP_CONSUMER);
      expect(group?.product_id).toBe(CONSUMER);
      // The row stored on the cancelled date is not evidence, and April's row
      // is outside the month.
      expect(group?.sessions).toEqual([RAN, SUBSTITUTED]);
      expect(group?.cancelled_sessions).toEqual([CANCELLED]);
    });

    it("carries each product's fees, type, schedule and term", () => {
      const consumer = adminDoc.products.find((p) => p.id === CONSUMER);
      expect(consumer).toMatchObject({
        product_type: "consumer_club",
        timezone: "UTC",
        start_date: "2026-01-07",
        end_date: "2026-06-24",
        primary_gedu_fee_cents: 5000,
        assistant_gedu_fee_cents: 3000,
        schedule_slots: [{ weekday: 2, start_time: "14:00", duration_minutes: 60 }],
        location: null,
        municipality: null,
      });
      const muni = adminDoc.products.find((p) => p.id === MUNI);
      // An unset fee is null, never zero.
      expect(muni?.assistant_gedu_fee_cents).toBeNull();
      expect(muni?.product_type).toBe("municipality_club");
      expect(muni?.municipality?.id).toBe(TEST_IDS.LOCATION_MUNICIPALITY);
    });

    it("carries no product nobody holds a seat on", () => {
      expect(adminDoc.products.some((p) => p.id === UNTAUGHT)).toBe(false);
    });

    it("names both sides of a substitution to the admin", () => {
      const sub = adminDoc.gedus.find((g) => g.id === subId);
      expect(sub?.substitutions[0]?.absent_gedu.id).toBe(TEST_IDS.GEDU);
      const absence = adminDoc.gedus
        .find((g) => g.id === TEST_IDS.GEDU)
        ?.absences.find(
          (a) => a.group_id === GROUP_CONSUMER && a.session_date === SUBSTITUTED,
        );
      expect(absence?.substitute).toEqual({
        id: subId,
        first_name: "Sanni",
        last_name: "Sijainen",
      });
    });

    it("never carries a substitution reason", () => {
      expectNoReason(raw.admin);
    });
  });

  describe("a gedu's own read", () => {
    it("holds the caller alone", () => {
      expect(geduDoc.gedus.map((g) => g.id)).toEqual([TEST_IDS.GEDU]);
      expect(subDoc.gedus.map((g) => g.id)).toEqual([subId]);
    });

    it("carries the absent gedu's own absence and the sub's own seat", () => {
      expect(
        geduDoc.gedus[0].absences.some(
          (a) => a.group_id === GROUP_CONSUMER && a.session_date === SUBSTITUTED,
        ),
      ).toBe(true);
      expect(subDoc.gedus[0].substitutions).toHaveLength(1);
      expect(subDoc.gedus[0].substitutions[0]).toMatchObject({
        group_id: GROUP_CONSUMER,
        session_date: SUBSTITUTED,
        role: "primary",
      });
      // The substituted group rides along with its month of evidence, so the
      // sub's builder can tell the session ran.
      expect(subDoc.groups.find((g) => g.id === GROUP_CONSUMER)?.sessions).toEqual(
        [RAN, SUBSTITUTED],
      );
    });

    it("names the absent gedu on the sub's seat", async () => {
      // A seated sub is staff on the group, to whom the absent gedu is
      // disclosed, so the sub's own read says whom they covered for.
      const { data: absentGedu, error } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", TEST_IDS.GEDU)
        .single();
      expect(error).toBeNull();
      expect(subDoc.gedus[0].substitutions[0].absent_gedu).toEqual({
        id: TEST_IDS.GEDU,
        first_name: absentGedu?.first_name,
        last_name: absentGedu?.last_name,
      });
    });

    it("names the sub on the absent gedu's absence, and nobody on an open one", () => {
      const absences = geduDoc.gedus[0].absences.filter(
        (a) => a.group_id === GROUP_CONSUMER,
      );
      expect(absences.find((a) => a.session_date === SUBSTITUTED)?.substitute).toEqual({
        id: subId,
        first_name: "Sanni",
        last_name: "Sijainen",
      });
      const open = absences.find((a) => a.session_date === RAN);
      expect(open?.status).toBe("open");
      expect(open?.substitute).toBeNull();
    });

    it("carries no reason on either side", () => {
      expectNoReason(raw.sub);
      expectNoReason(raw.gedu);
    });

    it("does not show the sub another gedu's groups", () => {
      // The sub holds seats on the consumer group (one date) and the
      // municipality group; the seeded gedu's other groups are not theirs.
      expect(subDoc.groups.map((g) => g.id).sort()).toEqual(
        [GROUP_CONSUMER, GROUP_MUNI].sort(),
      );
    });
  });
});
