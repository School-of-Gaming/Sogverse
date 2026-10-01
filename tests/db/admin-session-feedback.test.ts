import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  adminFeedbackRpcResult,
  type AdminFeedbackRpcResult,
} from "@/services/session-feedback/admin-feedback.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * `get_admin_session_feedback` — the admin feedback page's read: every gamer's
 * answer in a range of session days, and every recorded online session as the
 * response rate's denominator.
 *
 * The non-admin refusal is the authorization spine's; this file proves what an
 * admin gets back, parsed through the contract schema the page parses with.
 *
 * Layout: one remote club in Europe/Helsinki (UTC+2 in early March), one group.
 * The seeded GEDU is its primary and a minted ASSISTANT its assistant; a minted
 * SUB holds no seat and substitutes for GEDU on DAY_2 only.
 *
 *   DAY_1 — the session starts at 00:02 local, so its window opened the evening
 *           before in UTC: the day has to be read from the start, in the
 *           product's zone. GAMER answered; GAMER_2 left an emptied row and
 *           CUSTOMER (not a gamer) a full one, and neither may travel. Marked
 *           present: GAMER, GAMER_2 and CUSTOMER — two gamers.
 *   DAY_2 — GEDU is away and SUB stands in. GAMER left a note and no rating;
 *           GAMER_2 left a note of only newlines and tabs, which is as empty as
 *           a blank one and may not travel. Marked present: GAMER; GAMER_2
 *           marked absent.
 *   DAY_3 — a recorded session nobody was marked present at.
 *   DAY_0 — a recorded session outside the range.
 *
 * The dates sit in 2025 so nothing another file writes into the shared tables
 * lands on them, and every assertion is narrowed to this file's group anyway.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000fb1";
const GROUP = "00000000-0000-0000-0000-000000000fb2";
const TIMEZONE = "Europe/Helsinki";

const DAY_0 = "2025-03-09";
const DAY_1 = "2025-03-11";
const DAY_2 = "2025-03-12";
const DAY_3 = "2025-03-13";

const WINDOW = VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES;

/** DAY_1's session starts at 00:02 Helsinki = 22:02 UTC the evening before. */
const DAY_1_STARTS = "2025-03-10T22:02:00Z";
const DAY_1_OPENS = new Date(Date.parse(DAY_1_STARTS) - WINDOW * 60_000).toISOString();
const DAY_2_STARTS = "2025-03-12T15:00:00Z";
const DAY_2_OPENS = new Date(Date.parse(DAY_2_STARTS) - WINDOW * 60_000).toISOString();
const DAY_3_STARTS = "2025-03-13T15:00:00Z";
const DAY_0_STARTS = "2025-03-09T15:00:00Z";

function hourAfter(iso: string): string {
  return new Date(Date.parse(iso) + 3_600_000).toISOString();
}

describe("get_admin_session_feedback", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let assistantId = "";
  let subId = "";

  async function read(from: string, to: string): Promise<AdminFeedbackRpcResult> {
    const { data, error } = await adminAuth.rpc("get_admin_session_feedback", {
      p_from: from,
      p_to: to,
      p_window_before_minutes: WINDOW,
    });
    expect(error).toBeNull();
    const parsed = adminFeedbackRpcResult.parse(data);
    return {
      responses: parsed.responses.filter((r) => r.groupId === GROUP),
      sessions: parsed.sessions.filter((s) => s.groupId === GROUP),
    };
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    // Unique per run: CI's database keeps whatever a previous run left behind.
    const stamp = Date.now();
    const accounts = [
      { email: `feedback-assistant-${stamp}@test.local`, first: "Aada", last: "Assistant" },
      { email: `feedback-sub-${stamp}@test.local`, first: "Saku", last: "Substitute" },
    ];
    const ids: string[] = [];
    for (const account of accounts) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: account.first, last_name: account.last },
      });
      expect(error).toBeNull();
      const id = created.user?.id ?? "";
      expect(id).toBeTruthy();
      ids.push(id);
      await admin.from("profiles").update({ role: "gedu" }).eq("id", id);
      await admin.from("customer_profiles").delete().eq("user_id", id);
      await admin.from("gedu_profiles").insert({ user_id: id, certified: true });
    }
    [assistantId, subId] = ids;

    await admin.from("gedu_group_assignments").delete().eq("group_id", GROUP);
    await deleteTestProducts(admin, [PRODUCT]);

    const product = await admin.from("products").insert({
      id: PRODUCT,
      topic: "minecraft_java",
      product_type: "consumer_club",
      billing_mode: "paid",
      seat_count: 10,
      start_date: "2025-01-01",
      registration_opens_at: "2024-12-01T00:00:00Z",
      timezone: TIMEZONE,
      is_remote: true,
      is_visible: false,
      for_gamers: true,
      min_age: 8,
      max_age: 18,
      spoken_language_code: "en",
      created_by: TEST_IDS.ADMIN,
    });
    if (product.error) throw new Error(`seed product failed: ${product.error.message}`);

    const names = await admin.from("product_translations").insert([
      { product_id: PRODUCT, locale: "en", name: "Feedback Club", short_description: "x" },
      { product_id: PRODUCT, locale: "fi", name: "Palautekerho", short_description: "x" },
    ]);
    if (names.error) throw new Error(`seed translations failed: ${names.error.message}`);

    const group = await admin
      .from("product_groups")
      .insert({ id: GROUP, product_id: PRODUCT, name: "Tuesday crew" });
    if (group.error) throw new Error(`seed group failed: ${group.error.message}`);

    const staff = await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP, product_id: PRODUCT, gedu_id: TEST_IDS.GEDU, role: "primary" },
      { group_id: GROUP, product_id: PRODUCT, gedu_id: assistantId, role: "assistant" },
    ]);
    if (staff.error) throw new Error(`seed assignments failed: ${staff.error.message}`);

    const sub = await admin.from("session_substitution_requests").insert({
      group_id: GROUP,
      session_date: DAY_2,
      requested_by: TEST_IDS.GEDU,
      role: "primary",
      reason: "other",
      status: "substituted",
      substitute_id: subId,
      approved_by: TEST_IDS.ADMIN,
      approved_at: "2025-03-01T00:00:00Z",
    });
    if (sub.error) throw new Error(`seed substitution failed: ${sub.error.message}`);

    const sessions = await admin
      .from("group_sessions")
      .insert([
        { group_id: GROUP, session_date: DAY_0, starts_at: DAY_0_STARTS, ends_at: hourAfter(DAY_0_STARTS) },
        { group_id: GROUP, session_date: DAY_1, starts_at: DAY_1_STARTS, ends_at: hourAfter(DAY_1_STARTS) },
        { group_id: GROUP, session_date: DAY_2, starts_at: DAY_2_STARTS, ends_at: hourAfter(DAY_2_STARTS) },
        { group_id: GROUP, session_date: DAY_3, starts_at: DAY_3_STARTS, ends_at: hourAfter(DAY_3_STARTS) },
      ])
      .select("id, session_date");
    if (sessions.error) throw new Error(`seed sessions failed: ${sessions.error.message}`);
    const sessionId = (day: string) =>
      sessions.data.find((s) => s.session_date === day)?.id ?? "";

    const attendance = await admin.from("session_attendance").insert([
      { session_id: sessionId(DAY_0), participant_id: TEST_IDS.GAMER, status: "present" },
      { session_id: sessionId(DAY_1), participant_id: TEST_IDS.GAMER, status: "present" },
      { session_id: sessionId(DAY_1), participant_id: TEST_IDS.GAMER_2, status: "present" },
      { session_id: sessionId(DAY_1), participant_id: TEST_IDS.CUSTOMER, status: "present" },
      { session_id: sessionId(DAY_2), participant_id: TEST_IDS.GAMER, status: "present" },
      { session_id: sessionId(DAY_2), participant_id: TEST_IDS.GAMER_2, status: "absent" },
    ]);
    if (attendance.error) throw new Error(`seed attendance failed: ${attendance.error.message}`);

    const feedback = await admin.from("session_feedback").insert([
      {
        group_id: GROUP,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: DAY_1_OPENS,
        answers: { learned: 5, fun: 4, retiredKey: 2 },
        note: "",
      },
      {
        group_id: GROUP,
        participant_id: TEST_IDS.GAMER_2,
        session_opens_at: DAY_1_OPENS,
        answers: {},
        note: "   ",
      },
      {
        group_id: GROUP,
        participant_id: TEST_IDS.CUSTOMER,
        session_opens_at: DAY_1_OPENS,
        answers: { fun: 3 },
        note: "a parent",
      },
      {
        group_id: GROUP,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: DAY_2_OPENS,
        answers: {},
        note: "the sub was fun",
      },
      {
        group_id: GROUP,
        participant_id: TEST_IDS.GAMER_2,
        session_opens_at: DAY_2_OPENS,
        answers: {},
        note: "\n\t ",
      },
    ]);
    if (feedback.error) throw new Error(`seed feedback failed: ${feedback.error.message}`);
  });

  afterAll(async () => {
    // Assignments hold ON DELETE RESTRICT onto profiles; everything else here
    // cascades with the product.
    await admin.from("gedu_group_assignments").delete().eq("group_id", GROUP);
    await deleteTestProducts(admin, [PRODUCT]);
    if (assistantId) await admin.auth.admin.deleteUser(assistantId);
    if (subId) await admin.auth.admin.deleteUser(subId);
  });

  it("reads the session day from the start in the product's zone, not the UTC opening", async () => {
    // DAY_1's window opened on 2025-03-10 in UTC; its session is on DAY_1.
    expect(DAY_1_OPENS.startsWith("2025-03-10")).toBe(true);

    const onDay1 = await read(DAY_1, DAY_1);
    expect(onDay1.responses).toHaveLength(1);
    expect(onDay1.responses[0].sessionDate).toBe(DAY_1);

    const dayBefore = await read("2025-03-10", "2025-03-10");
    expect(dayBefore.responses).toHaveLength(0);
  });

  it("returns gamers' non-empty answers only, with their group, product and respondent", async () => {
    const { responses } = await read("2025-03-10", DAY_3);

    // GAMER_2's two rows are absent: blank on DAY_1, newlines and tabs on DAY_2.
    expect(responses.map((r) => [r.sessionDate, r.respondent.id])).toEqual([
      [DAY_1, TEST_IDS.GAMER],
      [DAY_2, TEST_IDS.GAMER],
    ]);

    const [first, second] = responses;
    expect(first).toMatchObject({
      source: "gamer_online",
      groupId: GROUP,
      groupName: "Tuesday crew",
      productId: PRODUCT,
      productType: "consumer_club",
      isRemote: true,
      answers: { learned: 5, fun: 4, retiredKey: 2 },
      note: "",
    });
    expect(first.productTranslations).toEqual([
      { locale: "en", name: "Feedback Club" },
      { locale: "fi", name: "Palautekerho" },
    ]);
    expect(first.respondent.name.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(first.submittedAt))).toBe(false);

    // A note with no rating is a response.
    expect(second).toMatchObject({ answers: {}, note: "the sub was fun" });
  });

  it("names every gedu expected at the session, and a substitute in place of the absent one", async () => {
    const { responses, sessions } = await read(DAY_1, DAY_2);
    const day1 = responses.find((r) => r.sessionDate === DAY_1);
    const day2 = responses.find((r) => r.sessionDate === DAY_2);

    expect(day1?.gedus.map((g) => [g.id, g.role])).toEqual([
      [TEST_IDS.GEDU, "primary"],
      [assistantId, "assistant"],
    ]);
    expect(day2?.gedus.map((g) => [g.id, g.role])).toEqual([
      [assistantId, "assistant"],
      [subId, "substitute"],
    ]);
    expect(day2?.gedus.find((g) => g.id === subId)?.name).toBe("Saku Substitute");

    // The denominator carries the same staffing.
    expect(sessions.find((s) => s.sessionDate === DAY_2)?.gedus).toEqual(day2?.gedus);
  });

  it("counts every recorded online session in the range, with its gamers marked present", async () => {
    const { sessions } = await read("2025-03-10", DAY_3);

    expect(sessions.map((s) => [s.sessionDate, s.eligibleCount])).toEqual([
      [DAY_1, 2],
      [DAY_2, 1],
      [DAY_3, 0],
    ]);
    expect(sessions[0]).toMatchObject({
      source: "gamer_online",
      groupId: GROUP,
      productId: PRODUCT,
      isRemote: true,
    });
  });

  it("refuses a range that ends before it starts", async () => {
    const { error } = await adminAuth.rpc("get_admin_session_feedback", {
      p_from: DAY_3,
      p_to: DAY_1,
      p_window_before_minutes: WINDOW,
    });
    expect(error?.code).toBe("22023");
  });
});
