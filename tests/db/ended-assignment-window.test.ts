import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { myAssignedProductRows } from "@/services/assignments/assignments.contracts";
import {
  geduAssignmentSummaries,
  geduGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createScheduleSlot, createTestProduct, deleteTestProducts } from "./product-helpers";
import { seedAssignment, seedAssignments } from "./assignment-helpers";

/**
 * An ended gedu is treated like a substitute: per session they were expected at
 * inside an ended period, the group stays theirs until that session's
 * substitute window closes — 24 hours after its report is mailed, else 15
 * product-local days after the date — and their card stands while any such
 * window is open. Voice and chat stay current-only.
 *
 * PRODUCT is a UTC club meeting 10:00–11:00 every day from 30 days ago to
 * yesterday, so every date used here is a finished, planned session and no
 * session of today's can race the clock. Each case places a period around the
 * exact sessions it is about: a period from 09:00 one day to 09:00 the next
 * holds that one day's session and no other. The group has one member who
 * joined at the start, so every session owes its register, report and mail.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000af0";
const GROUP = "00000000-0000-0000-0000-000000000af1";
const GROUP_2 = "00000000-0000-0000-0000-000000000af2";
const PARTICIPATION = "00000000-0000-0000-0000-000000000af3";
const GROUPS = [GROUP, GROUP_2];

const GEDU = TEST_IDS.GEDU;
const FORBIDDEN = "42501";

/** A UTC calendar date `offset` days from today, UTC-pinned end to end. */
function utcDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  )
    .toISOString()
    .slice(0, 10);
}

/** 09:00 UTC on the day `offset` days from today: an hour before that day's session. */
function nineAm(offset: number): string {
  return `${utcDate(offset)}T09:00:00.000Z`;
}

/** An instant `hours` from now. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

describe("an ended assignment keeps a substitute's window", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

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

    await deleteTestProducts(admin, [PRODUCT]);
    await createTestProduct(admin, {
      id: PRODUCT,
      billingMode: "free",
      seatCount: null,
      startDate: utcDate(-30),
      endDate: utcDate(-1),
    });
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      await createScheduleSlot(admin, PRODUCT, { weekday, startTime: "10:00" });
    }
    const groups = await admin.from("product_groups").insert([
      { id: GROUP, product_id: PRODUCT, name: "Ended One" },
      { id: GROUP_2, product_id: PRODUCT, name: "Ended Two" },
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
    // Joined at the start, so every session expected them. An UPDATE that
    // does not name group_id leaves the join-stamping trigger silent.
    const joined = await admin
      .from("participations")
      .update({ group_joined_at: `${utcDate(-30)}T00:00:00.000Z` })
      .eq("id", PARTICIPATION);
    expect(joined.error).toBeNull();
  });

  afterAll(async () => {
    await admin.from("chat_channels").delete().in("group_id", GROUPS);
    await deleteTestProducts(admin, [PRODUCT]);
  });

  /** Every case starts from an unstaffed product with nothing recorded. */
  beforeEach(async () => {
    for (const table of [
      "gedu_group_assignments",
      "session_substitution_requests",
      "session_cancellations",
      "group_sessions",
      "chat_channels",
    ] as const) {
      const { error } = await admin.from(table).delete().in("group_id", GROUPS);
      expect(error).toBeNull();
    }
  });

  /** One ended period on GROUP holding exactly the session `offset` days from today. */
  function endedOn(offset: number, group = GROUP) {
    return seedAssignment(admin, {
      groupId: group,
      geduId: GEDU,
      productId: PRODUCT,
      startedAt: nineAm(offset),
      endedAt: nineAm(offset + 1),
    });
  }

  /** A stored session `offset` days from today, with a report, mailed or not. */
  async function stored(offset: number, reportEmailedAt: string | null = null) {
    const date = utcDate(offset);
    const { error } = await admin.from("group_sessions").insert({
      group_id: GROUP,
      session_date: date,
      starts_at: `${date}T10:00:00.000Z`,
      ends_at: `${date}T11:00:00.000Z`,
      report: "We built a lighthouse.",
      report_emailed_at: reportEmailedAt,
    });
    expect(error).toBeNull();
  }

  async function workspaceOpen(group = GROUP): Promise<boolean> {
    const { error } = await geduAuth.rpc("set_group_notes", {
      p_group_id: group,
      p_public_note: "",
      p_gedu_note: "",
    });
    if (error === null) return true;
    expect(error.code).toBe(FORBIDDEN);
    return false;
  }

  async function groupVisible(group = GROUP): Promise<boolean> {
    const { data, error } = await geduAuth
      .from("product_groups")
      .select("id")
      .eq("id", group);
    expect(error).toBeNull();
    return (data ?? []).length === 1;
  }

  async function myRows() {
    const { data, error } = await geduAuth.rpc("get_my_assigned_products");
    expect(error).toBeNull();
    return myAssignedProductRows
      .parse(data)
      .filter((row) => GROUPS.includes(row.group_id));
  }

  async function mySummaries() {
    const { data, error } = await geduAuth.rpc("get_my_gedu_assignment_summaries", {});
    expect(error).toBeNull();
    return geduAssignmentSummaries
      .parse(data)
      .filter((summary) => GROUPS.includes(summary.group_id));
  }

  /** Which kinds of card the gedu has on each fixture group. */
  async function cards() {
    return (await myRows())
      .map((row) => `${row.kind}:${row.group_id === GROUP ? "one" : "two"}`)
      .sort();
  }

  // -------------------------------------------------------------------------
  // The window
  // -------------------------------------------------------------------------

  it("stays open for 15 days after an unsent session, then closes", async () => {
    await endedOn(-3);
    expect(await workspaceOpen()).toBe(true);
    expect(await groupVisible()).toBe(true);

    // The same shape, 20 days back: its 15 days ran out five days ago.
    const { error } = await admin
      .from("gedu_group_assignments")
      .delete()
      .eq("group_id", GROUP);
    expect(error).toBeNull();
    await endedOn(-20);
    expect(await workspaceOpen()).toBe(false);
    expect(await groupVisible()).toBe(false);
    expect(await cards()).toEqual([]);
  });

  it("closes 24 hours after the report is mailed", async () => {
    await endedOn(-3);
    await stored(-3, hoursFromNow(-1));
    expect(await workspaceOpen()).toBe(true);
    expect(await groupVisible()).toBe(true);

    const { error } = await admin
      .from("group_sessions")
      .update({ report_emailed_at: hoursFromNow(-25) })
      .eq("group_id", GROUP);
    expect(error).toBeNull();
    expect(await workspaceOpen()).toBe(false);
    expect(await groupVisible()).toBe(false);
    expect(await cards()).toEqual([]);
  });

  it("stays open until the latest window of all the gedu's sessions closes", async () => {
    // Two ended periods: the earlier session's report is unsent (open for 15
    // days from its date, so three more), the later one's was mailed two days
    // ago (closed). The group stays theirs on the earlier one.
    await seedAssignments(admin, [
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-12), endedAt: nineAm(-11) },
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-5), endedAt: nineAm(-4) },
    ]);
    await stored(-5, hoursFromNow(-48));

    expect(await workspaceOpen()).toBe(true);
    const [row] = await myRows();
    expect(row.kind).toBe("ended_assignment");
    expect(row.last_session_date).toBe(utcDate(-12));
    expect(row.upcoming_sessions).toEqual([]);
    expect(new Date(row.substitution_starts_at ?? 0).toISOString()).toBe(
      `${utcDate(-12)}T10:00:00.000Z`,
    );

    // With the later one still unsent too, the card is dated by it.
    const unsent = await admin
      .from("group_sessions")
      .update({ report_emailed_at: null })
      .eq("group_id", GROUP);
    expect(unsent.error).toBeNull();
    expect((await myRows())[0].last_session_date).toBe(utcDate(-5));

    // Once the earlier report is mailed a day ago as well, nothing is open.
    const mailedLater = await admin
      .from("group_sessions")
      .update({ report_emailed_at: hoursFromNow(-48) })
      .eq("group_id", GROUP);
    expect(mailedLater.error).toBeNull();
    const date = utcDate(-12);
    const mailedEarlier = await admin.from("group_sessions").insert({
      group_id: GROUP,
      session_date: date,
      starts_at: `${date}T10:00:00.000Z`,
      ends_at: `${date}T11:00:00.000Z`,
      report: "We built a moat.",
      report_emailed_at: hoursFromNow(-25),
    });
    expect(mailedEarlier.error).toBeNull();
    expect(await workspaceOpen()).toBe(false);
    expect(await cards()).toEqual([]);
  });

  it("does not count a date the gedu filed an absence for", async () => {
    await endedOn(-3);
    const { error } = await admin.from("session_substitution_requests").insert({
      group_id: GROUP,
      session_date: utcDate(-3),
      requested_by: GEDU,
      role: "primary",
      reason: "other",
      status: "open",
    });
    expect(error).toBeNull();

    expect(await workspaceOpen()).toBe(false);
    expect(await groupVisible()).toBe(false);
    expect(await cards()).toEqual([]);
  });

  it("does not count a cancelled date", async () => {
    await endedOn(-3);
    const { error } = await adminAuth.rpc("cancel_session", {
      p_group_id: GROUP,
      p_session_date: utcDate(-3),
    });
    expect(error).toBeNull();

    expect(await workspaceOpen()).toBe(false);
    expect(await cards()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The card
  // -------------------------------------------------------------------------

  it("draws an ended card with its owed count, and drops it when the window closes", async () => {
    await seedAssignment(admin, {
      groupId: GROUP,
      geduId: GEDU,
      productId: PRODUCT,
      startedAt: nineAm(-4),
      endedAt: nineAm(-2),
    });

    expect(await cards()).toEqual(["ended_assignment:one"]);
    const [summary] = await mySummaries();
    expect(summary.kind).toBe("ended_assignment");
    expect(summary.substitution_date).toBeNull();
    // The two sessions of the period, -4 and -3, and none of the group's other
    // twenty-eight: nothing was recorded on either.
    expect(summary.attention_count).toBe(2);

    // One of them mailed a day ago: it is out of reach, so out of the count.
    await stored(-3, hoursFromNow(-25));
    expect((await mySummaries())[0].attention_count).toBe(1);

    // Both: the card leaves My SOG.
    const date = utcDate(-4);
    const { error } = await admin.from("group_sessions").insert({
      group_id: GROUP,
      session_date: date,
      starts_at: `${date}T10:00:00.000Z`,
      ends_at: `${date}T11:00:00.000Z`,
      report: "We built a bridge.",
      report_emailed_at: hoursFromNow(-25),
    });
    expect(error).toBeNull();
    expect(await cards()).toEqual([]);
    expect(await mySummaries()).toEqual([]);
  });

  it("draws no ended card for a gedu still current on the group after a role change", async () => {
    await seedAssignments(admin, [
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, role: "primary", startedAt: nineAm(-4), endedAt: nineAm(-2) },
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, role: "assistant", startedAt: nineAm(-2) },
    ]);
    expect(await cards()).toEqual(["assignment:one"]);
    expect((await mySummaries()).map((s) => s.kind)).toEqual(["assignment"]);
  });

  it("draws no ended card for a gedu added back to the group after a gap", async () => {
    await seedAssignments(admin, [
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-6), endedAt: nineAm(-5) },
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-2) },
    ]);
    expect(await cards()).toEqual(["assignment:one"]);
  });

  it("draws an ended card beside the current one for a gedu moved to a sibling group", async () => {
    await seedAssignments(admin, [
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-4), endedAt: nineAm(-2) },
      { groupId: GROUP_2, geduId: GEDU, productId: PRODUCT, startedAt: nineAm(-2) },
    ]);
    expect(await cards()).toEqual(["assignment:two", "ended_assignment:one"]);
    expect(await workspaceOpen(GROUP)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // The owed count of a current period
  // -------------------------------------------------------------------------

  it("counts against a current period only the sessions inside it", async () => {
    // Added three days ago: the club's 27 earlier sessions are not this
    // gedu's work, and before this ruling every one of them was counted.
    await seedAssignment(admin, {
      groupId: GROUP,
      geduId: GEDU,
      productId: PRODUCT,
      startedAt: nineAm(-3),
    });
    const [summary] = await mySummaries();
    expect(summary.kind).toBe("assignment");
    expect(summary.attention_count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // The two date-scoped and current-only surfaces
  // -------------------------------------------------------------------------

  it("lets the gedu send the report of a windowed session, and refuses one whose window has closed", async () => {
    await seedAssignment(admin, {
      groupId: GROUP,
      geduId: GEDU,
      productId: PRODUCT,
      startedAt: nineAm(-20),
      endedAt: nineAm(-2),
    });
    await stored(-3);
    await stored(-20);

    const open = await geduAuth.rpc("claim_group_session_report_email", {
      p_group_id: GROUP,
      p_session_date: utcDate(-3),
    });
    expect(open.error).toBeNull();

    const closed = await geduAuth.rpc("claim_group_session_report_email", {
      p_group_id: GROUP,
      p_session_date: utcDate(-20),
    });
    expect(closed.error?.code).toBe(FORBIDDEN);
  });

  // -------------------------------------------------------------------------
  // The session writes, and the workspace document that offers them
  // -------------------------------------------------------------------------

  /**
   * A period from -20 to -2 that ended two days ago: its sessions run -20 to
   * -3. The session three days back is still in its window; the one twenty
   * days back closed five days ago; the one two days back fell after the
   * period, so it was never theirs.
   */
  function endedAcrossTheRun() {
    return seedAssignment(admin, {
      groupId: GROUP,
      geduId: GEDU,
      productId: PRODUCT,
      startedAt: nineAm(-20),
      endedAt: nineAm(-2),
    });
  }

  async function writesNotes(offset: number): Promise<boolean> {
    const { error } = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP,
      p_session_date: utcDate(offset),
      p_report: "We finished the castle.",
      p_gedu_note: "",
    });
    if (error === null) return true;
    expect(error.code).toBe(FORBIDDEN);
    return false;
  }

  async function marksAttendance(offset: number): Promise<boolean> {
    const { error } = await geduAuth.rpc("record_attendance", {
      p_group_id: GROUP,
      p_session_date: utcDate(offset),
      p_participant_id: TEST_IDS.GAMER,
      p_status: "present",
    });
    if (error === null) return true;
    expect(error.code).toBe(FORBIDDEN);
    return false;
  }

  async function addsPhoto(offset: number): Promise<boolean> {
    const { error } = await geduAuth.rpc("add_group_session_image", {
      p_group_id: GROUP,
      p_session_date: utcDate(offset),
      p_width: 800,
      p_height: 600,
      p_max_images: 6,
    });
    if (error === null) return true;
    expect(error.code).toBe(FORBIDDEN);
    return false;
  }

  /** A photo on the stored session `offset` days back, inserted as the owner. */
  async function storedPhoto(offset: number): Promise<string> {
    await stored(offset);
    const session = await admin
      .from("group_sessions")
      .select("id")
      .eq("group_id", GROUP)
      .eq("session_date", utcDate(offset))
      .single();
    expect(session.error).toBeNull();
    if (session.data === null) throw new Error("session not stored");
    const image = await admin
      .from("group_session_images")
      .insert({ session_id: session.data.id, width: 800, height: 600 })
      .select("id")
      .single();
    expect(image.error).toBeNull();
    if (image.data === null) throw new Error("photo not stored");
    return image.data.id;
  }

  it("writes a session still in its window, and no other session of the group", async () => {
    await endedAcrossTheRun();
    // The group is theirs — a substitute's seat — so the refusals below are
    // about the session, not about the workspace.
    expect(await workspaceOpen()).toBe(true);

    expect(await writesNotes(-3)).toBe(true);
    expect(await marksAttendance(-3)).toBe(true);
    expect(await addsPhoto(-3)).toBe(true);

    // Their own session, but its window closed five days ago.
    expect(await writesNotes(-20)).toBe(false);
    expect(await marksAttendance(-20)).toBe(false);
    expect(await addsPhoto(-20)).toBe(false);

    // A session after their period ended: never theirs.
    expect(await writesNotes(-2)).toBe(false);
    expect(await marksAttendance(-2)).toBe(false);
  });

  it("removes a photo only from a session still in its window", async () => {
    await endedAcrossTheRun();
    const open = await storedPhoto(-3);
    const closed = await storedPhoto(-20);

    for (const rpc of ["assert_can_delete_session_image", "delete_group_session_image"] as const) {
      const refused = await geduAuth.rpc(rpc, { p_image_id: closed });
      expect(refused.error?.code).toBe(FORBIDDEN);
    }
    const kept = await admin.from("group_session_images").select("id").eq("id", closed);
    expect(kept.data).toHaveLength(1);

    const allowed = await geduAuth.rpc("assert_can_delete_session_image", { p_image_id: open });
    expect(allowed.error).toBeNull();
    const removed = await geduAuth.rpc("delete_group_session_image", { p_image_id: open });
    expect(removed.error).toBeNull();
  });

  it("still lets a gedu current on the group write any of its sessions", async () => {
    // A role change two days ago: still on the group, so every session is
    // theirs, the ones before the change included.
    await seedAssignments(admin, [
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, role: "primary", startedAt: nineAm(-30), endedAt: nineAm(-2) },
      { groupId: GROUP, geduId: GEDU, productId: PRODUCT, role: "assistant", startedAt: nineAm(-2) },
    ]);
    expect(await writesNotes(-20)).toBe(true);
    expect(await writesNotes(-2)).toBe(true);
  });

  it("tells the workspace which sessions an ended gedu still holds", async () => {
    await endedAcrossTheRun();
    const { data, error } = await geduAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP });
    expect(error).toBeNull();
    const seat = geduGroupFeed.parse(data).viewer_temporary_seat;
    if (seat === null) throw new Error("an ended gedu holds the group temporarily");

    // No substitution: only the windowed dates are theirs to write.
    expect(seat.writes_every_session).toBe(false);
    expect(seat.session_dates).toContain(utcDate(-3));
    expect(seat.session_dates).toContain(utcDate(-10));
    // The closed window, the session after the period, and anything ahead.
    expect(seat.session_dates).not.toContain(utcDate(-20));
    expect(seat.session_dates).not.toContain(utcDate(-16));
    expect(seat.session_dates).not.toContain(utcDate(-2));
    // Product-local dates, oldest first, each once.
    expect([...seat.session_dates].sort()).toEqual(seat.session_dates);
    expect(new Set(seat.session_dates).size).toBe(seat.session_dates.length);

    // The admin reading the same document holds the group outright.
    const asAdmin = await adminAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP });
    expect(asAdmin.error).toBeNull();
    expect(geduGroupFeed.parse(asAdmin.data).viewer_temporary_seat).toBeNull();
  });

  it("keeps the ended gedu out of the voice room and the chat roster", async () => {
    await endedOn(-2);
    // The workspace is theirs, which is what makes the two refusals below mean
    // something.
    expect(await workspaceOpen()).toBe(true);

    const voice = await geduAuth.rpc("is_voice_group_member", { p_group_id: GROUP });
    expect(voice.error).toBeNull();
    expect(voice.data).toBe(false);

    const date = utcDate(-2);
    const channel = await admin
      .from("chat_channels")
      .insert({
        type: "group_session",
        group_id: GROUP,
        session_opens_at: `${date}T09:45:00.000Z`,
        session_ends_at: `${date}T11:15:00.000Z`,
      })
      .select("id")
      .single();
    expect(channel.error).toBeNull();
    if (channel.data === null) throw new Error("chat channel not created");
    const roster = await admin.rpc("chat_channel_roster_ids", {
      p_channel_id: channel.data.id,
    });
    expect(roster.error).toBeNull();
    expect(roster.data).not.toContain(GEDU);
  });
});
