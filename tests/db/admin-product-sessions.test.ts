import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { adminProductSessions } from "@/services/admin-sessions/admin-sessions.contracts";
import {
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * The admin session surface (00200): one product-keyed read of its own, and the
 * five session writers that now admit an admin beside the assigned gedu.
 *
 * **What this file exists to pin is a privilege boundary that moved.** Before
 * 00200 the only way an admin could read a session report was to create a
 * second gedu account, assign it to the group, and leave it there — so the
 * question this file answers is whether the honest version of that grants
 * exactly what the dishonest one did and nothing more. Three claims:
 *
 *   1. **An admin reads and writes the record without teaching anything.** The
 *      admin here is assigned to no group on either fixture product, which is
 *      the whole point: every pass below is by ROLE, never by assignment.
 *   2. **Nobody else gained anything.** The read is admin-only — a gedu is
 *      refused it too, because it answers a question about a product rather
 *      than about their group, and they have their own RPC for theirs. The
 *      writers still refuse a customer and a gamer on their first statement.
 *   3. **An admin is exempt from the assignment check and from NOTHING ELSE.**
 *      The roster target check, the roll-call boundary, the writable-date rule
 *      and both of the claim's refusals bind an admin exactly as they bind a
 *      gedu. Those are rules about the integrity of the record, not about who
 *      is looking at it, and a role that could write past them would be able to
 *      produce rows no UI can and no reader can interpret.
 *
 * Layout. PRODUCT is in-person (so the site half of the document is populated
 * and `set_site_notes` has a building to be authorized against) and runs a slot
 * every day of the week, so any calendar date inside the run is a legal session
 * date and the tests can say "yesterday" without hunting for a weekday. It
 * carries TWO groups, because the read's reason for existing is that it hands
 * back every group on the product at once. DECOY_PRODUCT carries a third group
 * that must never appear in PRODUCT's document.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000640";
const GROUP_A = "00000000-0000-0000-0000-000000000641";
const GROUP_B = "00000000-0000-0000-0000-000000000642";
const DECOY_PRODUCT = "00000000-0000-0000-0000-000000000643";
const DECOY_GROUP = "00000000-0000-0000-0000-000000000644";

/**
 * This file's OWN site, created under the seeded municipality rather than
 * reusing the seeded `Test School`.
 *
 * `site_details` and `site_staff_details` are keyed by location and shared by
 * every product at that building, so two db test files writing notes on the
 * seeded site would race — vitest runs files in separate workers, and the gedu
 * feed's suite writes and deletes exactly those rows. A site nobody else knows
 * about makes the site-notes assertions here independent of what else CI is
 * running.
 */
const SITE = "00000000-0000-0000-0000-000000000645";

const ALL_PRODUCTS = [PRODUCT, DECOY_PRODUCT];

/**
 * The slot both fixture products run on, seven days a week.
 *
 * **Late in the day on purpose**, for the reason the gedu feed's fixtures give:
 * a 23:00 start with a one-hour duration means today's session ends at
 * tomorrow's midnight and so has not *finished* at any hour CI might run, while
 * yesterday's always has.
 *
 * What that slot does **not** give is a session that has not *started*: from
 * 23:00 UTC onwards today's is under way and its register is legitimately open.
 * So the roll-call boundary is asked of TOMORROW, which is ahead of its own
 * start whatever the clock says.
 */
const SLOT_START = "23:00";
const SLOT_MINUTES = 60;

/** `YYYY-MM-DD`, `offset` days from today. Both products run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const YESTERDAY = dayOffset(-1);
const TOMORROW = dayOffset(1);

describe("admin product sessions", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.from("locations").delete().eq("id", SITE);
    await admin.from("locations").insert({
      id: SITE,
      name: "Admin Sessions Hall",
      type: "site",
      parent_id: TEST_IDS.LOCATION_MUNICIPALITY,
      country_code: "FI",
    });

    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, {
        id,
        seatCount: null,
        startDate: dayOffset(-30),
      });
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Admin sessions fixture",
        short_description: "Seeded by admin-product-sessions.test.ts",
      });
      for (let weekday = 0; weekday < 7; weekday++) {
        await createScheduleSlot(admin, id, {
          weekday,
          startTime: SLOT_START,
          durationMinutes: SLOT_MINUTES,
        });
      }
    }

    // In person, so the document carries a site and the site-notes writer has a
    // building to be authorized against.
    await admin
      .from("products")
      .update({ is_remote: false, location_id: SITE })
      .eq("id", PRODUCT);

    await admin.from("product_groups").insert([
      { id: GROUP_A, product_id: PRODUCT, name: "Cohort A" },
      { id: GROUP_B, product_id: PRODUCT, name: "Cohort B" },
      { id: DECOY_GROUP, product_id: DECOY_PRODUCT, name: "Cohort Elsewhere" },
    ]);

    // Deliberately NO gedu_group_assignments row for anybody. Every admin pass
    // below is therefore a pass by role: if the assignment half were still
    // being asked, none of these calls could succeed.
    await admin.from("participations").insert([
      {
        product_id: PRODUCT,
        group_id: GROUP_A,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: DECOY_PRODUCT,
        group_id: DECOY_GROUP,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.from("site_details").delete().eq("location_id", SITE);
    await admin.from("site_staff_details").delete().eq("location_id", SITE);
    // Last, and only after the rows that reference it are gone.
    await admin.from("locations").delete().eq("id", SITE);
  });

  /** Wipe the materialized rows so each block starts from "nothing recorded". */
  beforeEach(async () => {
    await admin
      .from("group_sessions")
      .delete()
      .in("group_id", [GROUP_A, GROUP_B, DECOY_GROUP]);
  });

  /** The document, parsed through the very schema the service parses it with. */
  async function readDocument() {
    const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
      p_product_id: PRODUCT,
    });
    expect(error).toBeNull();
    return adminProductSessions.parse(data);
  }

  // -------------------------------------------------------------------------
  // 1. The read
  // -------------------------------------------------------------------------

  describe("get_admin_product_sessions", () => {
    it("answers an admin with a document its own contract accepts", async () => {
      // The parse IS the assertion. The RPC returns JSONB, which the type
      // generator can only see as `Json`, so this schema is the only thing
      // standing between a renamed key in SQL and `undefined` three components
      // later on the page.
      const document = await readDocument();

      expect(document.product.id).toBe(PRODUCT);
      expect(document.product.timezone).toBe("UTC");
      expect(document.product.is_remote).toBe(false);
      expect(document.product.schedule_slots).toHaveLength(7);
    });

    it("carries EVERY group on the product, and only this product's", async () => {
      const document = await readDocument();

      expect(document.groups.map((group) => group.id).sort()).toEqual(
        [GROUP_A, GROUP_B].sort(),
      );
      // The decoy is the point: a document that simply returned every group in
      // the database would pass the assertion above.
      expect(
        document.groups.some((group) => group.id === DECOY_GROUP),
      ).toBe(false);
    });

    it("carries the site and its two notes on an in-person product", async () => {
      await adminAuth.rpc("set_site_notes", {
        p_location_id: SITE,
        p_public_note: "Side door, ring the bell.",
        p_gedu_note: "Key is behind the desk.",
      });

      const document = await readDocument();

      expect(document.site).not.toBeNull();
      expect(document.site?.location_id).toBe(SITE);
      expect(document.site?.public_note).toBe("Side door, ring the bell.");
      expect(document.site?.gedu_note).toBe("Key is behind the desk.");
    });

    it("carries no site at all on a remote product", async () => {
      const { data, error } = await adminAuth.rpc(
        "get_admin_product_sessions",
        { p_product_id: DECOY_PRODUCT },
      );
      expect(error).toBeNull();

      // Not "a site with null fields": a remote product has no building, and
      // the panel keys its whole existence on this being null.
      expect(adminProductSessions.parse(data).site).toBeNull();
    });

    it("carries each group's register roster", async () => {
      const document = await readDocument();
      const groupA = document.groups.find((group) => group.id === GROUP_A);

      expect(groupA?.roster).toEqual([
        expect.objectContaining({ participant_id: TEST_IDS.GAMER }),
      ]);
      // Group B has nobody in it, which is a real state and must come back as
      // an empty list rather than as a missing key.
      expect(
        document.groups.find((group) => group.id === GROUP_B)?.roster,
      ).toEqual([]);
    });

    it("carries a session's report, staff note, attendance and last editor", async () => {
      await adminAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_report: "We finished the castle.",
        p_gedu_note: "Watch the shouting.",
      });
      await adminAuth.rpc("record_attendance", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "present",
      });

      const document = await readDocument();
      const session = document.groups
        .find((group) => group.id === GROUP_A)
        ?.sessions.find((row) => row.session_date === YESTERDAY);

      expect(session?.report).toBe("We finished the castle.");
      expect(session?.gedu_note).toBe("Watch the shouting.");
      expect(session?.attendance).toEqual({ [TEST_IDS.GAMER]: "present" });
      // The admin who wrote it is named as the session's last editor, exactly
      // as a gedu would be. That is what the attribution chip on the card
      // renders, and it is the truth.
      expect(session?.updated_by).toBe(TEST_IDS.ADMIN);
      expect(session?.updated_by_first_name).not.toBeNull();
      expect(session?.report_emailed_at).toBeNull();
    });

    it("refuses every non-admin caller", async () => {
      // The gedu is in here on purpose. This read answers a question about a
      // PRODUCT — every group on it — which is not a question a gedu's own
      // workspace asks. The widening runs one way only: 00204 let an admin read
      // get_gedu_group_feed, so the admin page can render one group through the
      // gedu page's body, but nothing lets a gedu read across a whole product.
      for (const client of [geduAuth, customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_admin_product_sessions", {
          p_product_id: PRODUCT,
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("is not reachable without a session at all", async () => {
      const { error } = await anon.rpc("get_admin_product_sessions", {
        p_product_id: PRODUCT,
      });
      // No grant to `anon` — refused at the privilege layer, before the body,
      // so the assertion is on the refusal rather than on the guard's code.
      expect(error).not.toBeNull();
    });

    it("refuses a product that does not exist, rather than answering empty", async () => {
      // Shaped so it cannot exist rather than merely being unlikely: an
      // all-f UUID is not something any fixture or real row can hold.
      const { error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      });
      expect(error?.code).toBe("P0002");
    });
  });

  // -------------------------------------------------------------------------
  // 2. The widened writers admit an admin — by role, with no assignment
  // -------------------------------------------------------------------------

  describe("the widened writers", () => {
    it("lets an admin write a session's report and staff note", async () => {
      const { error } = await adminAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_report: "Admin wrote this up.",
        p_gedu_note: "",
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("group_sessions")
        .select("report, updated_by")
        .eq("group_id", GROUP_A)
        .eq("session_date", YESTERDAY)
        .single();
      expect(data?.report).toBe("Admin wrote this up.");
      expect(data?.updated_by).toBe(TEST_IDS.ADMIN);
    });

    it("lets an admin take and clear the register", async () => {
      const marked = await adminAuth.rpc("record_attendance", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "absent",
      });
      expect(marked.error).toBeNull();

      // The empty string is how "unmarked" travels — generated RPC argument
      // types make every text parameter non-null — and it must DELETE the row
      // rather than store a blank.
      const cleared = await adminAuth.rpc("record_attendance", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "",
      });
      expect(cleared.error).toBeNull();

      const document = await readDocument();
      expect(
        document.groups
          .find((group) => group.id === GROUP_A)
          ?.sessions.find((row) => row.session_date === YESTERDAY)?.attendance,
      ).toEqual({});
    });

    it("lets an admin write a group's standing notes", async () => {
      const { error } = await adminAuth.rpc("set_group_notes", {
        p_group_id: GROUP_B,
        p_public_note: "Bring headphones.",
        p_gedu_note: "Two siblings in here.",
      });
      expect(error).toBeNull();

      const document = await readDocument();
      const groupB = document.groups.find((group) => group.id === GROUP_B);
      expect(groupB?.public_note).toBe("Bring headphones.");
      expect(groupB?.gedu_note).toBe("Two siblings in here.");
    });

    it("lets an admin write the site's notes without touching the address", async () => {
      await admin
        .from("site_details")
        .upsert(
          { location_id: SITE, address: "1 Test Street" },
          { onConflict: "location_id" },
        );

      const { error } = await adminAuth.rpc("set_site_notes", {
        p_location_id: SITE,
        p_public_note: "Parking is round the back.",
        p_gedu_note: "",
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("site_details")
        .select("address, notes")
        .eq("location_id", SITE)
        .single();
      // The address is not a parameter and is never written. It belongs to the
      // location record; a notes path that carried it is how one page's stale
      // copy used to revert somebody's correction.
      expect(data?.address).toBe("1 Test Street");
      expect(data?.notes).toBe("Parking is round the back.");
    });

    it("lets an admin claim the send of a report", async () => {
      await adminAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_report: "Ready to go out.",
        p_gedu_note: "",
      });

      const { data, error } = await adminAuth.rpc(
        "claim_group_session_report_email",
        { p_group_id: GROUP_A, p_session_date: YESTERDAY },
      );
      expect(error).toBeNull();
      expect(data).not.toBeNull();

      const { data: row } = await admin
        .from("group_sessions")
        .select("report_emailed_at, report_emailed_by")
        .eq("group_id", GROUP_A)
        .eq("session_date", YESTERDAY)
        .single();
      expect(row?.report_emailed_at).not.toBeNull();
      expect(row?.report_emailed_by).toBe(TEST_IDS.ADMIN);
    });

    it("still refuses a customer and a gamer on every one of them", async () => {
      for (const client of [customerAuth, gamerAuth]) {
        const notes = await client.rpc("set_group_session_notes", {
          p_group_id: GROUP_A,
          p_session_date: YESTERDAY,
          p_report: "nope",
          p_gedu_note: "",
        });
        expect(notes.error?.code).toBe("42501");

        const mark = await client.rpc("record_attendance", {
          p_group_id: GROUP_A,
          p_session_date: YESTERDAY,
          p_participant_id: TEST_IDS.GAMER,
          p_status: "present",
        });
        expect(mark.error?.code).toBe("42501");

        const groupNotes = await client.rpc("set_group_notes", {
          p_group_id: GROUP_A,
          p_public_note: "nope",
          p_gedu_note: "",
        });
        expect(groupNotes.error?.code).toBe("42501");

        const siteNotes = await client.rpc("set_site_notes", {
          p_location_id: SITE,
          p_public_note: "nope",
          p_gedu_note: "",
        });
        expect(siteNotes.error?.code).toBe("42501");

        const claim = await client.rpc("claim_group_session_report_email", {
          p_group_id: GROUP_A,
          p_session_date: YESTERDAY,
        });
        expect(claim.error?.code).toBe("42501");
      }
    });

    it("still refuses a gedu the groups they do not teach", async () => {
      // The widening did not relax the gedu path. Nobody is assigned to these
      // fixtures, so the seeded gedu teaches neither group and must be refused
      // exactly as they were before.
      const { error } = await geduAuth.rpc("set_group_notes", {
        p_group_id: GROUP_A,
        p_public_note: "nope",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("42501");
    });
  });

  // -------------------------------------------------------------------------
  // 3. An admin is exempt from the assignment check and from nothing else
  // -------------------------------------------------------------------------

  describe("the rules an admin is still bound by", () => {
    it("refuses an admin a mark aimed at somebody not on the roster", async () => {
      // GAMER_2 holds a seat on the DECOY product, so they exist and are
      // enrolled somewhere — which is what makes this the target check rather
      // than a missing-row lookup.
      const { error } = await adminAuth.rpc("record_attendance", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER_2,
        p_status: "present",
      });
      expect(error?.code).toBe("42501");
    });

    it("refuses an admin the register before the session has started", async () => {
      // Tomorrow's occurrence, because today's 23:00 one has genuinely started
      // once the clock passes 23:00 UTC — and a register that is open is not
      // the boundary this case is about. Tomorrow's is ahead of its own start
      // at every hour CI could run.
      const { error } = await adminAuth.rpc("record_attendance", {
        p_group_id: GROUP_A,
        p_session_date: TOMORROW,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(error?.code).toBe("23514");
    });

    it("refuses an admin a date the schedule never projected", async () => {
      // Before the product's own start date, so no occurrence exists on it
      // however many weekday slots the product runs.
      const { error } = await adminAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: dayOffset(-400),
        p_report: "nope",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("23514");
    });

    it("refuses an admin a send with no report behind it", async () => {
      const { error } = await adminAuth.rpc(
        "claim_group_session_report_email",
        { p_group_id: GROUP_A, p_session_date: YESTERDAY },
      );
      expect(error?.code).toBe(SESSION_REPORT_NO_REPORT_SQLSTATE);
    });

    it("refuses an admin a second send of the same report", async () => {
      await adminAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
        p_report: "Only going out once.",
        p_gedu_note: "",
      });
      const first = await adminAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
      });
      expect(first.error).toBeNull();

      const second = await adminAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_A,
        p_session_date: YESTERDAY,
      });
      expect(second.error?.code).toBe(SESSION_REPORT_ALREADY_SENT_SQLSTATE);
    });
  });
});
