import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  adminProductSessions,
  cancelSessionResult,
} from "@/services/admin-sessions/admin-sessions.contracts";
import {
  geduAssignmentSummaries,
  geduGroupFeed,
  SESSION_CANCELLED_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import { municipalityInvoicingSnapshot } from "@/services/municipality-invoicing/municipality-invoicing.contracts";
import { adminSubstitutionRequests } from "@/services/session-substitution/session-substitution.contracts";
import { myAssignedProductRows } from "@/services/assignments/assignments.contracts";
import { mySessionCancellations } from "@/services/participations/participations.contracts";
import { adminDashboardSnapshot } from "@/services/admin-dashboard/admin-dashboard.contracts";
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
 *   1. **The admin's word wins over the record.** Cancelling a date that
 *      already holds a record succeeds and deletes nothing; the record is
 *      frozen — every write on a cancelled date is refused, the report mail
 *      included — and hidden from every reader that treats a row as "the
 *      session ran", until the session is restored, which brings it back.
 *   2. **The reason is admin-only.** The admin documents carry it; a gedu's
 *      feed carries the date with the detail nulled, and a family's carries the
 *      date and nothing else.
 *   3. **A cancellation is in effect on a projected date or over a record.** A
 *      cancelled record stays cancelled on every surface when a slot is removed
 *      or the term narrowed; a cancellation with neither a projection nor a
 *      record is inert and surfaces nowhere, and moving the schedule back makes
 *      it apply again.
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
    await admin
      .from("group_sessions")
      .delete()
      .in("group_id", [GROUP, CLUB_GROUP]);
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

  /** The partner API's read: GROUP's cancelled dates in effect. */
  async function cancellationsInEffect(): Promise<string[]> {
    const { data, error } = await admin.rpc("get_session_cancellations_in_effect", {
      p_group_ids: [GROUP],
    });
    expect(error).toBeNull();
    return (data ?? []).map((row) => row.session_date);
  }

  /**
   * The two schedule edits that stop the schedule projecting YESTERDAY for
   * PRODUCT (and CLUB_DATE for CLUB), each with the edit that puts it back.
   */
  const UNPROJECTIONS = [
    {
      name: "its weekday's slot is removed",
      async apply(product: string, date: string) {
        const { error } = await admin
          .from("schedule_slots")
          .delete()
          .eq("product_id", product)
          .eq("weekday", weekdayOf(date));
        expect(error).toBeNull();
      },
      async undo(product: string, date: string) {
        await createScheduleSlot(admin, product, {
          weekday: weekdayOf(date),
          startTime: product === CLUB ? "14:00" : "23:00",
          durationMinutes: 60,
        });
      },
    },
    {
      name: "the term is narrowed to end before it",
      async apply(product: string, date: string) {
        const end = new Date(`${date}T12:00:00Z`);
        end.setUTCDate(end.getUTCDate() - 1);
        const { error } = await admin
          .from("products")
          .update({ end_date: end.toISOString().slice(0, 10) })
          .eq("id", product);
        expect(error).toBeNull();
      },
      async undo(product: string) {
        const { error } = await admin
          .from("products")
          .update({ end_date: product === CLUB ? "2031-05-30" : null })
          .eq("id", product);
        expect(error).toBeNull();
      },
    },
  ] as const;

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

  it("cancels a date that already has a record, keeping it frozen and hidden until a restore", async () => {
    const notes = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_report: "We built a castle.",
      p_gedu_note: "Quiet group.",
    });
    expect(notes.error).toBeNull();
    const mark = await geduAuth.rpc("record_attendance", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_participant_id: TEST_IDS.GAMER,
      p_status: "present",
    });
    expect(mark.error).toBeNull();
    const photo = await geduAuth.rpc("add_group_session_image", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_width: 800,
      p_height: 600,
      p_max_images: 8,
    });
    expect(photo.error).toBeNull();
    const imageId = photo.data;
    if (imageId === null) throw new Error("the photo was not attached");

    // A written-up, unmailed past session is owed until it is mailed.
    const owedBefore = await attentionCount();

    // The admin's word wins: the cancel lands, and nothing is deleted.
    expect((await cancel(YESTERDAY, "Venue flooded")).error).toBeNull();
    const kept = await admin
      .from("group_sessions")
      .select("report, gedu_note")
      .eq("group_id", GROUP)
      .eq("session_date", YESTERDAY);
    expect(kept.data).toEqual([
      { report: "We built a castle.", gedu_note: "Quiet group." },
    ]);

    // Frozen: every write on the date is refused, an admin's included.
    for (const client of [geduAuth, adminAuth]) {
      const refusedNotes = await client.rpc("set_group_session_notes", {
        p_group_id: GROUP,
        p_session_date: YESTERDAY,
        p_report: "Should not land",
        p_gedu_note: "",
      });
      expect(refusedNotes.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
      const refusedMark = await client.rpc("record_attendance", {
        p_group_id: GROUP,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "absent",
      });
      expect(refusedMark.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
    }
    const refusedPhoto = await geduAuth.rpc("add_group_session_image", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
      p_width: 800,
      p_height: 600,
      p_max_images: 8,
    });
    expect(refusedPhoto.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
    const refusedRemovalCheck = await geduAuth.rpc(
      "assert_can_delete_session_image",
      { p_image_id: imageId },
    );
    expect(refusedRemovalCheck.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
    const refusedRemoval = await geduAuth.rpc("delete_group_session_image", {
      p_image_id: imageId,
    });
    expect(refusedRemoval.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);

    // The report is never mailed, and the claim stamps nothing.
    const claim = await geduAuth.rpc("claim_group_session_report_email", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
    });
    expect(claim.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
    const unstamped = await admin
      .from("group_sessions")
      .select("report_emailed_at")
      .eq("group_id", GROUP)
      .eq("session_date", YESTERDAY)
      .single();
    expect(unstamped.data?.report_emailed_at).toBeNull();

    // Hidden: the family is told the session is off and handed nothing of the
    // record; the staff document keeps the row, and the feed draws the
    // cancellation over it.
    const family = await familyFeed();
    expect(family.sessions.map((s) => s.session_date)).not.toContain(YESTERDAY);
    expect(family.cancellations).toEqual([{ session_date: YESTERDAY }]);
    const staff = await geduFeedAs(geduAuth);
    expect(staff.sessions.map((s) => s.session_date)).toContain(YESTERDAY);
    expect(staff.cancellations.map((c) => c.session_date)).toEqual([YESTERDAY]);

    // Not owed: nothing ran, so nothing is asked for.
    expect(await attentionCount()).toBe(owedBefore - 1);

    // Restored, it all comes back as it was, and reopens.
    const restored = await adminAuth.rpc("restore_session", {
      p_group_id: GROUP,
      p_session_date: YESTERDAY,
    });
    expect(restored.data).toBe(true);
    const back = await familyFeed();
    expect(back.sessions.find((s) => s.session_date === YESTERDAY)).toMatchObject({
      report: "We built a castle.",
      attendance: "present",
      images: [expect.objectContaining({ id: imageId })],
    });
    expect(back.cancellations).toEqual([]);
    expect(await attentionCount()).toBe(owedBefore);
    const removed = await geduAuth.rpc("delete_group_session_image", {
      p_image_id: imageId,
    });
    expect(removed.error).toBeNull();
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
      expect(await cancellationsInEffect()).toEqual([]);
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

  it("hands the invoicing page the month's cancelled pairs and every group of the club, and never a cancelled record", async () => {
    // The group wrote the date up, then an admin cancelled it: the row is
    // kept, and never reaches the bill.
    const notes = await adminAuth.rpc("set_group_session_notes", {
      p_group_id: CLUB_GROUP,
      p_session_date: CLUB_DATE,
      p_report: "Built a bridge.",
      p_gedu_note: "",
    });
    expect(notes.error).toBeNull();

    const cancelled = await adminAuth.rpc("cancel_session", {
      p_group_id: CLUB_GROUP,
      p_session_date: CLUB_DATE,
    });
    expect(cancelled.error).toBeNull();

    async function clubDocument() {
      const { data, error } = await adminAuth.rpc("get_admin_municipality_invoicing", {
        p_month_start: CLUB_MONTH,
      });
      expect(error).toBeNull();
      return municipalityInvoicingSnapshot
        .parse(data)
        .clubs.find((c) => c.id === CLUB);
    }

    const club = await clubDocument();
    expect(club?.cancelled_sessions).toEqual([
      { group_id: CLUB_GROUP, session_date: CLUB_DATE },
    ]);
    expect(club?.sessions).toEqual([]);
    // The silent group appears in neither list above, and is still named: a
    // date only one group cancelled is not cancelled for the club.
    expect(club?.group_ids).toEqual([CLUB_GROUP, CLUB_SILENT_GROUP]);

    // Restored, the recorded session is back on the bill.
    await adminAuth.rpc("restore_session", {
      p_group_id: CLUB_GROUP,
      p_session_date: CLUB_DATE,
    });
    const restored = await clubDocument();
    expect(restored?.sessions).toEqual([
      { group_id: CLUB_GROUP, session_date: CLUB_DATE },
    ]);
    expect(restored?.cancelled_sessions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // a cancelled record stays cancelled through a schedule edit
  // -------------------------------------------------------------------------

  for (const unprojection of UNPROJECTIONS) {
    it(`keeps a cancelled record cancelled everywhere when ${unprojection.name}, and a restore brings it back as history`, async () => {
      const notes = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP,
        p_session_date: YESTERDAY,
        p_report: "We built a castle.",
        p_gedu_note: "",
      });
      expect(notes.error).toBeNull();
      const photo = await geduAuth.rpc("add_group_session_image", {
        p_group_id: GROUP,
        p_session_date: YESTERDAY,
        p_width: 800,
        p_height: 600,
        p_max_images: 8,
      });
      expect(photo.error).toBeNull();
      const imageId = photo.data;
      if (imageId === null) throw new Error("the photo was not attached");
      expect((await cancel(YESTERDAY, "Venue flooded")).error).toBeNull();

      await unprojection.apply(PRODUCT, YESTERDAY);
      try {
        // The family still gets no report, and is told the date is off.
        const family = await familyFeed();
        expect(family.sessions.map((s) => s.session_date)).not.toContain(YESTERDAY);
        expect(family.cancellations).toEqual([{ session_date: YESTERDAY }]);

        // The staff feed keeps the row and still names the cancellation, so
        // the card draws it cancelled; the admin page lists it to restore.
        const staff = await geduFeedAs(geduAuth);
        expect(staff.sessions.map((s) => s.session_date)).toContain(YESTERDAY);
        expect(staff.cancellations.map((c) => c.session_date)).toEqual([YESTERDAY]);
        expect((await adminDocumentGroup()).cancellations).toEqual([
          expect.objectContaining({ session_date: YESTERDAY, reason: "Venue flooded" }),
        ]);
        expect(await cancellationsInEffect()).toEqual([YESTERDAY]);

        // Still frozen. The writes that do not ask the schedule are refused
        // by the cancellation itself; the ones that do are refused already.
        const refusedRemovalCheck = await geduAuth.rpc(
          "assert_can_delete_session_image",
          { p_image_id: imageId },
        );
        expect(refusedRemovalCheck.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
        const refusedRemoval = await geduAuth.rpc("delete_group_session_image", {
          p_image_id: imageId,
        });
        expect(refusedRemoval.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
        const claim = await geduAuth.rpc("claim_group_session_report_email", {
          p_group_id: GROUP,
          p_session_date: YESTERDAY,
        });
        expect(claim.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);
        const refusedNotes = await geduAuth.rpc("set_group_session_notes", {
          p_group_id: GROUP,
          p_session_date: YESTERDAY,
          p_report: "Should not land",
          p_gedu_note: "",
        });
        expect(refusedNotes.error).not.toBeNull();

        // Still cancellable: an admin can re-word it where it stands.
        const reworded = await cancel(YESTERDAY, "Venue closed");
        expect(reworded.error).toBeNull();

        // Not owed while cancelled; owed again as history once restored.
        const owedCancelled = await attentionCount();
        const restored = await adminAuth.rpc("restore_session", {
          p_group_id: GROUP,
          p_session_date: YESTERDAY,
        });
        expect(restored.data).toBe(true);
        expect(await attentionCount()).toBe(owedCancelled + 1);

        const back = await familyFeed();
        expect(back.sessions.find((s) => s.session_date === YESTERDAY)).toMatchObject({
          report: "We built a castle.",
        });
        expect(back.cancellations).toEqual([]);
        expect((await geduFeedAs(geduAuth)).cancellations).toEqual([]);
        expect(await cancellationsInEffect()).toEqual([]);
      } finally {
        await unprojection.undo(PRODUCT, YESTERDAY);
      }
    });

    it(`keeps a cancelled record off the invoice when ${unprojection.name}`, async () => {
      const notes = await adminAuth.rpc("set_group_session_notes", {
        p_group_id: CLUB_GROUP,
        p_session_date: CLUB_DATE,
        p_report: "Built a bridge.",
        p_gedu_note: "",
      });
      expect(notes.error).toBeNull();
      const cancelled = await adminAuth.rpc("cancel_session", {
        p_group_id: CLUB_GROUP,
        p_session_date: CLUB_DATE,
      });
      expect(cancelled.error).toBeNull();

      async function clubDocument() {
        const { data, error } = await adminAuth.rpc("get_admin_municipality_invoicing", {
          p_month_start: CLUB_MONTH,
        });
        expect(error).toBeNull();
        return municipalityInvoicingSnapshot
          .parse(data)
          .clubs.find((c) => c.id === CLUB);
      }

      await unprojection.apply(CLUB, CLUB_DATE);
      try {
        const club = await clubDocument();
        expect(club?.sessions).toEqual([]);
        expect(club?.cancelled_sessions).toEqual([
          { group_id: CLUB_GROUP, session_date: CLUB_DATE },
        ]);

        // Restored, it is a recorded session the schedule no longer projects,
        // and records beat projections: it bills.
        await adminAuth.rpc("restore_session", {
          p_group_id: CLUB_GROUP,
          p_session_date: CLUB_DATE,
        });
        const restored = await clubDocument();
        expect(restored?.sessions).toEqual([
          { group_id: CLUB_GROUP, session_date: CLUB_DATE },
        ]);
        expect(restored?.cancelled_sessions).toEqual([]);
      } finally {
        await unprojection.undo(CLUB, CLUB_DATE);
      }
    });
  }

  // -------------------------------------------------------------------------
  // the My SOG cards' reads
  // -------------------------------------------------------------------------

  it("hands the gedu's seat its group's upcoming cancelled dates, from yesterday on", async () => {
    for (const date of [LAST_WEEK, YESTERDAY, TOMORROW, IN_THREE_DAYS]) {
      expect((await cancel(date, "Holiday")).error).toBeNull();
    }

    const { data, error } = await geduAuth.rpc("get_my_assigned_products");
    expect(error).toBeNull();
    const seat = myAssignedProductRows
      .parse(data)
      .find((row) => row.group_id === GROUP && row.kind === "assignment");
    // The day before today is kept, for a session still running past local
    // midnight; anything earlier is no card's business.
    expect(seat?.cancelled_dates).toEqual([YESTERDAY, TOMORROW, IN_THREE_DAYS]);
  });

  it("drops an inert cancellation from the gedu's seat", async () => {
    expect((await cancel(IN_THREE_DAYS)).error).toBeNull();
    const weekday = weekdayOf(IN_THREE_DAYS);
    const removed = await admin
      .from("schedule_slots")
      .delete()
      .eq("product_id", PRODUCT)
      .eq("weekday", weekday);
    expect(removed.error).toBeNull();

    try {
      const { data, error } = await geduAuth.rpc("get_my_assigned_products");
      expect(error).toBeNull();
      const seat = myAssignedProductRows
        .parse(data)
        .find((row) => row.group_id === GROUP && row.kind === "assignment");
      expect(seat?.cancelled_dates).toEqual([]);
    } finally {
      await createScheduleSlot(admin, PRODUCT, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }
  });

  it("keeps a substitution card's date cancelled after it leaves the upcoming window", async () => {
    // The card stands for days after its date, and `cancelled_dates` starts
    // the day before today, so the substitution row asks of its own date. The
    // seeded gedu's certification belongs to another file, so the sub is a
    // certified gedu minted here.
    const email = "cancellation-sub@test.local";
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Cancel", last_name: "Sub" },
      });
    expect(createError).toBeNull();
    const subId = created.user?.id ?? "";
    expect(subId).toBeTruthy();

    try {
      await admin.from("profiles").update({ role: "gedu" }).eq("id", subId);
      await admin.from("customer_profiles").delete().eq("user_id", subId);
      await admin
        .from("gedu_profiles")
        .insert({ user_id: subId, certified: true });

      const SIX_DAYS_AGO = dayOffset(-6);
      const seeded = await admin.from("session_substitution_requests").insert(
        [LAST_WEEK, SIX_DAYS_AGO].map((date) => ({
          group_id: GROUP,
          session_date: date,
          requested_by: TEST_IDS.GEDU,
          role: "primary" as const,
          reason: "other" as const,
          status: "substituted" as const,
          substitute_id: subId,
          approved_by: TEST_IDS.ADMIN,
          approved_at: new Date().toISOString(),
        })),
      );
      expect(seeded.error).toBeNull();
      expect((await cancel(LAST_WEEK, "Holiday")).error).toBeNull();

      const subAuth = await createAuthenticatedClient(email, "testpassword123");
      const { data, error } = await subAuth.rpc("get_my_assigned_products");
      expect(error).toBeNull();
      const cards = myAssignedProductRows
        .parse(data)
        .filter((row) => row.group_id === GROUP && row.kind === "substitution");
      expect(
        cards
          .map((row) => [row.substitution_date, row.substitution_cancelled])
          .sort(),
      ).toEqual([
        [LAST_WEEK, true],
        [SIX_DAYS_AGO, false],
      ]);
      // Out of the window the next-session reads use, and cancelled all the same.
      expect(cards.every((row) => !row.cancelled_dates.includes(LAST_WEEK))).toBe(
        true,
      );
    } finally {
      await admin
        .from("session_substitution_requests")
        .delete()
        .eq("substitute_id", subId);
      await admin.auth.admin.deleteUser(subId);
    }
  });

  it("hands a family its own seats' upcoming cancelled dates and nothing more", async () => {
    for (const date of [LAST_WEEK, TOMORROW]) {
      expect((await cancel(date, "Holiday")).error).toBeNull();
    }

    const customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    const strangerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    // The child in the seat and the parent who pays for it get the same
    // answer; the strict parse fails if a reason or an author rides along.
    for (const client of [gamerAuth, customerAuth]) {
      const { data, error } = await client.rpc("get_my_session_cancellations");
      expect(error).toBeNull();
      expect(
        mySessionCancellations
          .parse(data)
          .filter((row) => row.participation_id === PARTICIPATION),
      ).toEqual([{ participation_id: PARTICIPATION, session_date: TOMORROW }]);
    }

    const stranger = await strangerAuth.rpc("get_my_session_cancellations");
    expect(stranger.error).toBeNull();
    expect(
      mySessionCancellations
        .parse(stranger.data)
        .filter((row) => row.participation_id === PARTICIPATION),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // the admin dashboard's schedule
  // -------------------------------------------------------------------------

  async function dashboardScheduleProduct(productId: string) {
    const { data, error } = await adminAuth.rpc("get_admin_dashboard");
    expect(error).toBeNull();
    const product = adminDashboardSnapshot
      .parse(data)
      .schedule_products.find((entry) => entry.id === productId);
    if (product === undefined) {
      throw new Error(`${productId} missing from the dashboard's schedule set`);
    }
    return product;
  }

  it("hands the admin dashboard every cancelled pair in its window, past as well as future", async () => {
    for (const date of [LAST_WEEK, TOMORROW, IN_THREE_DAYS]) {
      expect((await cancel(date)).error).toBeNull();
    }

    const product = await dashboardScheduleProduct(PRODUCT);
    expect(product.group_ids).toEqual([GROUP]);
    // Unlike the My SOG reads, the dashboard's window reaches thirty days
    // back, so last week's cancellation is carried too.
    expect(product.cancelled_sessions).toEqual([
      { group_id: GROUP, session_date: LAST_WEEK },
      { group_id: GROUP, session_date: TOMORROW },
      { group_id: GROUP, session_date: IN_THREE_DAYS },
    ]);
  });

  it("hands the admin dashboard every group of a product, including one nothing else names", async () => {
    // The silent group has no member, no gedu and no cancellation; the page
    // still needs it to know a date one group cancelled is not every group's.
    const club = await dashboardScheduleProduct(CLUB);
    expect(club.group_ids).toEqual([CLUB_GROUP, CLUB_SILENT_GROUP]);
    expect(club.cancelled_sessions).toEqual([]);
  });

  it("drops an inert cancellation from the admin dashboard", async () => {
    expect((await cancel(IN_THREE_DAYS)).error).toBeNull();
    const weekday = weekdayOf(IN_THREE_DAYS);
    const removed = await admin
      .from("schedule_slots")
      .delete()
      .eq("product_id", PRODUCT)
      .eq("weekday", weekday);
    expect(removed.error).toBeNull();

    try {
      expect(
        (await dashboardScheduleProduct(PRODUCT)).cancelled_sessions,
      ).toEqual([]);
    } finally {
      await createScheduleSlot(admin, PRODUCT, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }

    expect(
      (await dashboardScheduleProduct(PRODUCT)).cancelled_sessions,
    ).toEqual([{ group_id: GROUP, session_date: IN_THREE_DAYS }]);
  });

  it("keeps the shared window helper private", async () => {
    const { error } = await gamerAuth.rpc("group_upcoming_cancelled_dates", {
      p_group_id: GROUP,
    });
    expect(error?.code).toBe("42501");
  });

  it("keeps the partner API's cancellation read to the service role", async () => {
    const { error } = await adminAuth.rpc("get_session_cancellations_in_effect", {
      p_group_ids: [GROUP],
    });
    expect(error?.code).toBe("42501");
  });
});
