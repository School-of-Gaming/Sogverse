import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  adminProductSessions,
  cancelSessionResult,
  SESSION_HAS_RECORD_SQLSTATE,
} from "@/services/admin-sessions/admin-sessions.contracts";
import {
  geduAssignmentSummaries,
  geduGroupFeed,
  SESSION_CANCELLED_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import { municipalityInvoicingSnapshot } from "@/services/municipality-invoicing/municipality-invoicing.contracts";
import { adminSubstitutionRequests } from "@/services/session-substitution/session-substitution.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Admin session cancellation: `cancel_session` / `restore_session`, and every
 * reader and writer that has to respect a cancelled date.
 *
 * Three claims, in order:
 *
 *   1. **A cancellation and a stored session record never coexist.** Cancelling
 *      a date that has a record is refused, and every write that would
 *      materialize a record on a cancelled date is refused — until the session
 *      is restored, which reopens them.
 *   2. **The reason is admin-only.** The admin documents carry it; a gedu's
 *      feed carries the date with the detail nulled, and a family's carries the
 *      date and nothing else.
 *   3. **A cancellation only subtracts from projected dates.** Once the schedule
 *      stops projecting a cancelled date, nothing surfaces it; moving the
 *      schedule back makes it apply again.
 *
 * Layout. PRODUCT runs a 23:00 UTC hour every day of the week, so any date in
 * the run is a session date and "yesterday" has finished whatever the clock
 * says. It started thirty days ago and never ends. The seeded gedu is assigned
 * to its one group and the seeded gamer holds a seat there. CLUB is a
 * municipality club in a month far from anything any other file seeds, so the
 * invoicing read over that month sees this file's rows alone; it has two
 * groups, one of which never meets or cancels.
 */

const PRODUCT = "00000000-0000-0000-0000-00000000ca01";
const GROUP = "00000000-0000-0000-0000-00000000ca02";
const PARTICIPATION = "00000000-0000-0000-0000-00000000ca03";
const CLUB = "00000000-0000-0000-0000-00000000ca04";
const CLUB_GROUP = "00000000-0000-0000-0000-00000000ca05";
/** The club's second group, which neither meets nor cancels in the month. */
const CLUB_SILENT_GROUP = "00000000-0000-0000-0000-00000000ca06";
const ALL_PRODUCTS = [PRODUCT, CLUB];

const CLUB_MONTH = "2031-02-01";
/** A Wednesday; the club runs Wednesdays (weekday 2). */
const CLUB_DATE = "2031-02-12";

/** `YYYY-MM-DD`, `offset` days from today. PRODUCT runs in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday, matching `schedule_slots.weekday`. */
function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const YESTERDAY = dayOffset(-1);
const TOMORROW = dayOffset(1);
const IN_TWO_DAYS = dayOffset(2);
const IN_THREE_DAYS = dayOffset(3);
const LAST_WEEK = dayOffset(-7);

describe("session cancellation", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

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
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    await createTestProduct(admin, {
      id: PRODUCT,
      seatCount: null,
      startDate: dayOffset(-30),
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, PRODUCT, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }

    await createTestProduct(admin, {
      id: CLUB,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      startDate: "2031-01-06",
      endDate: "2031-05-30",
      seatCount: null,
      waitlistEnabled: false,
    });
    await createScheduleSlot(admin, CLUB, { weekday: 2, startTime: "14:00" });

    const groups = await admin.from("product_groups").insert([
      { id: GROUP, product_id: PRODUCT, name: "Cancellation cohort" },
      { id: CLUB_GROUP, product_id: CLUB, name: "Cancellation club cohort" },
      {
        id: CLUB_SILENT_GROUP,
        product_id: CLUB,
        name: "Cancellation club silent cohort",
      },
    ]);
    expect(groups.error).toBeNull();

    const seat = await admin.from("participations").insert({
      id: PARTICIPATION,
      product_id: PRODUCT,
      group_id: GROUP,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    expect(seat.error).toBeNull();

    const assignment = await admin.from("gedu_group_assignments").insert({
      product_id: PRODUCT,
      group_id: GROUP,
      gedu_id: TEST_IDS.GEDU,
      role: "primary",
    });
    expect(assignment.error).toBeNull();
  });

  afterAll(async () => {
    await admin
      .from("session_substitution_requests")
      .delete()
      .eq("group_id", GROUP);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  beforeEach(async () => {
    await admin
      .from("session_cancellations")
      .delete()
      .in("group_id", [GROUP, CLUB_GROUP]);
    await admin.from("group_sessions").delete().eq("group_id", GROUP);
  });

  async function cancel(date: string, reason: string | null = null) {
    return adminAuth.rpc("cancel_session", {
      p_group_id: GROUP,
      p_session_date: date,
      p_reason: reason ?? undefined,
    });
  }

  async function adminDocumentGroup() {
    const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
      p_product_id: PRODUCT,
    });
    expect(error).toBeNull();
    const group = adminProductSessions
      .parse(data)
      .groups.find((g) => g.id === GROUP);
    if (group === undefined) throw new Error("fixture group missing");
    return group;
  }

  async function geduFeedAs(client: SupabaseClient<Database>) {
    const { data, error } = await client.rpc("get_gedu_group_feed", {
      p_group_id: GROUP,
    });
    expect(error).toBeNull();
    return geduGroupFeed.parse(data);
  }

  async function familyFeed() {
    const { data, error } = await gamerAuth.rpc("get_my_family_product_feed", {
      p_participation_id: PARTICIPATION,
    });
    expect(error).toBeNull();
    return familyProductFeed.parse(data);
  }

  async function attentionCount(): Promise<number> {
    const { data, error } = await geduAuth.rpc(
      "get_my_gedu_assignment_summaries",
      {},
    );
    expect(error).toBeNull();
    const row = geduAssignmentSummaries
      .parse(data)
      .find((summary) => summary.group_id === GROUP && summary.kind === "assignment");
    if (row === undefined) throw new Error("fixture assignment missing");
    return row.attention_count;
  }

  // -------------------------------------------------------------------------
  // cancel / restore
  // -------------------------------------------------------------------------

  it("refuses a gedu and a family member on the first statement", async () => {
    for (const client of [geduAuth, gamerAuth]) {
      const { error } = await client.rpc("cancel_session", {
        p_group_id: GROUP,
        p_session_date: TOMORROW,
      });
      expect(error?.code).toBe("42501");
    }
  });

  it("cancels a session with a reason, and a second cancel re-words it", async () => {
    const first = await cancel(TOMORROW, "  Venue closed  ");
    expect(first.error).toBeNull();
    const parsed = cancelSessionResult.parse(first.data);
    expect(parsed).toMatchObject({
      group_id: GROUP,
      session_date: TOMORROW,
      reason: "Venue closed",
      cancelled_by: TEST_IDS.ADMIN,
    });
    expect(parsed.cancelled_by_first_name).not.toBeNull();
    expect(parsed.cancelled_at).not.toBeNull();

    const second = await cancel(TOMORROW, "   ");
    expect(second.error).toBeNull();
    expect(cancelSessionResult.parse(second.data).reason).toBeNull();

    const rows = await admin
      .from("session_cancellations")
      .select("session_date")
      .eq("group_id", GROUP);
    expect(rows.data).toHaveLength(1);
  });

  it("cancels a past session as readily as a future one", async () => {
    const { error } = await cancel(LAST_WEEK);
    expect(error).toBeNull();
  });

  it("refuses a date the schedule does not project", async () => {
    // Before the product's start date: no session was ever scheduled there.
    const { error } = await cancel(dayOffset(-60));
    expect(error?.code).toBe("23514");
  });

  it("refuses a date that already has a stored session record", async () => {
    const notes = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_report: "We built a castle.",
      p_gedu_note: "",
    });
    expect(notes.error).toBeNull();

    const { error } = await cancel(YESTERDAY);
    expect(error?.code).toBe(SESSION_HAS_RECORD_SQLSTATE);

    const rows = await admin
      .from("session_cancellations")
      .select("session_date")
      .eq("group_id", GROUP);
    expect(rows.data).toEqual([]);
  });

  it("refuses every session write on a cancelled date until it is restored", async () => {
    expect((await cancel(YESTERDAY)).error).toBeNull();

    const notes = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_report: "Should not land",
      p_gedu_note: "",
    });
    expect(notes.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);

    // Binds an admin exactly as it binds a gedu.
    const mark = await adminAuth.rpc("record_attendance", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_participant_id: TEST_IDS.GAMER,
      p_status: "present",
    });
    expect(mark.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);

    const stored = await admin
      .from("group_sessions")
      .select("id")
      .eq("group_id", GROUP)
      .eq("session_date", YESTERDAY);
    expect(stored.data).toEqual([]);

    const restored = await adminAuth.rpc("restore_session", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
    });
    expect(restored.error).toBeNull();
    expect(restored.data).toBe(true);

    const again = await adminAuth.rpc("restore_session", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
    });
    expect(again.data).toBe(false);

    const reopened = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_report: "It happened after all.",
      p_gedu_note: "",
    });
    expect(reopened.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // substitutions
  // -------------------------------------------------------------------------

  it("refuses a substitution request on a cancelled date, and drops existing ones from the admin queue", async () => {
    expect((await cancel(TOMORROW)).error).toBeNull();
    const refused = await geduAuth.rpc("request_session_substitution", {
      p_group_id: GROUP,
      p_session_date: TOMORROW,
      p_reason: "other",
    });
    expect(refused.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);

    // A request filed BEFORE the cancellation is kept, but leaves the queue.
    const filed = await geduAuth.rpc("request_session_substitution", {
      p_group_id: GROUP,
      p_session_date: IN_TWO_DAYS,
      p_reason: "other",
    });
    expect(filed.error).toBeNull();

    const queued = async () => {
      const { data, error } = await adminAuth.rpc("get_admin_substitution_requests");
      expect(error).toBeNull();
      return adminSubstitutionRequests.parse(data).filter(
        (row) => row.group_id === GROUP && row.session_date === IN_TWO_DAYS,
      );
    };
    expect(await queued()).toHaveLength(1);

    expect((await cancel(IN_TWO_DAYS)).error).toBeNull();
    expect(await queued()).toHaveLength(0);

    await adminAuth.rpc("restore_session", {
      p_group_id: GROUP,
      p_session_date: IN_TWO_DAYS,
    });
    expect(await queued()).toHaveLength(1);

    await admin.from("session_substitution_requests").delete().eq("group_id", GROUP);
  });

  // -------------------------------------------------------------------------
  // the reads
  // -------------------------------------------------------------------------

  it("carries the reason to an admin and only the date to a gedu and a family", async () => {
    expect((await cancel(TOMORROW, "Holiday")).error).toBeNull();

    const adminGroup = await adminDocumentGroup();
    expect(adminGroup.cancellations).toEqual([
      expect.objectContaining({
        session_date: TOMORROW,
        reason: "Holiday",
        cancelled_by: TEST_IDS.ADMIN,
      }),
    ]);

    const asAdmin = await geduFeedAs(adminAuth);
    expect(asAdmin.cancellations[0]?.reason).toBe("Holiday");

    const asGedu = await geduFeedAs(geduAuth);
    expect(asGedu.cancellations).toEqual([
      {
        session_date: TOMORROW,
        reason: null,
        cancelled_at: null,
        cancelled_by: null,
        cancelled_by_first_name: null,
      },
    ]);

    // The family contract is strict: a reason riding here fails the parse.
    const family = await familyFeed();
    expect(family.cancellations).toEqual([{ session_date: TOMORROW }]);
  });

  it("does not count a cancelled past session as owed", async () => {
    const before = await attentionCount();
    expect((await cancel(YESTERDAY)).error).toBeNull();
    expect(await attentionCount()).toBe(before - 1);
  });

  it("treats a cancellation the schedule no longer projects as inert, and re-applies it when the schedule moves back", async () => {
    expect((await cancel(IN_THREE_DAYS)).error).toBeNull();
    const weekday = weekdayOf(IN_THREE_DAYS);

    const removed = await admin
      .from("schedule_slots")
      .delete()
      .eq("product_id", PRODUCT)
      .eq("weekday", weekday);
    expect(removed.error).toBeNull();

    try {
      expect((await adminDocumentGroup()).cancellations).toEqual([]);
      expect((await geduFeedAs(geduAuth)).cancellations).toEqual([]);
      expect((await familyFeed()).cancellations).toEqual([]);
      // The row itself is kept, not swept.
      const kept = await admin
        .from("session_cancellations")
        .select("session_date")
        .eq("group_id", GROUP);
      expect(kept.data).toEqual([{ session_date: IN_THREE_DAYS }]);
    } finally {
      await createScheduleSlot(admin, PRODUCT, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }

    expect(
      (await adminDocumentGroup()).cancellations.map((c) => c.session_date),
    ).toEqual([IN_THREE_DAYS]);
  });

  it("hands the invoicing page the month's cancelled pairs and every group of the club", async () => {
    const cancelled = await adminAuth.rpc("cancel_session", {
      p_group_id: CLUB_GROUP,
      p_session_date: CLUB_DATE,
    });
    expect(cancelled.error).toBeNull();

    const { data, error } = await adminAuth.rpc("get_admin_municipality_invoicing", {
      p_month_start: CLUB_MONTH,
    });
    expect(error).toBeNull();
    const club = municipalityInvoicingSnapshot
      .parse(data)
      .clubs.find((c) => c.id === CLUB);
    expect(club?.cancelled_sessions).toEqual([
      { group_id: CLUB_GROUP, session_date: CLUB_DATE },
    ]);
    expect(club?.sessions).toEqual([]);
    // The silent group appears in neither list above, and is still named: a
    // date only one group cancelled is not cancelled for the club.
    expect(club?.group_ids).toEqual([CLUB_GROUP, CLUB_SILENT_GROUP]);
  });
});
