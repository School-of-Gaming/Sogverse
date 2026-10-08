import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  substitutionNotificationSnapshot,
  type SubstitutionNotificationSnapshot,
} from "@/lib/substitution-notifications/snapshot.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * Substitution requests announce their changes: the triggers that file a request
 * in the notification outbox, the lease the sync route works it under, the daily
 * close-out, and the snapshot the sync renders from.
 *
 * The kick itself cannot be seen from here: it reads its URL and secret from
 * Vault, which is empty on every local stack and in CI, so it returns before
 * queueing anything. What these cases prove about it is that every write that
 * reaches it still succeeds.
 *
 * Every account is minted, never the seeded gedu: discord-links.test.ts wipes
 * the seeded accounts' links, and the snapshot's candidate list is asserted per
 * gedu, so a seeded gedu who happens to be eligible changes nothing here.
 *
 * Layout: PRODUCT (remote consumer club in English, UTC, a slot on every
 * weekday, so any date in its term is a real session) with GROUP, where the
 * absent gedu REQUESTER is the primary. The other gedus differ in one fact
 * each:
 * - ELIGIBLE passes the pool's four tests and is the only account on its
 *   Discord id;
 * - SHADOWED passes them too, but its Discord id is linked more recently to
 *   ACTING, which therefore acts for it;
 * - ACTING passes them and holds that shared Discord id;
 * - NO_LANGUAGE has listed no spoken language, so fails one test;
 * - UNQUALIFIED lacks the consumer_products qualification, so fails another;
 * - UNCERTIFIED is not certified, and is never a candidate.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000840";
const GROUP = "00000000-0000-0000-0000-000000000841";

/** An id no request may ever hold. */
const NO_SUCH_REQUEST = "00000000-0000-0000-0000-000000000842";

const FORBIDDEN = "42501";

/** Discord ids no other suite uses (discord-links holds 9000…, discord-substitution 9100…). */
const DISCORD_ELIGIBLE = "920000000000000001";
const DISCORD_SHARED = "920000000000000002";

type Outbox = Database["public"]["Tables"]["substitution_notification_outbox"]["Row"];

/** A UTC calendar date `offset` days from now; the product's zone is UTC. */
function utcDate(offset: number): string {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  return day.toISOString().slice(0, 10);
}

describe("substitution notifications", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  const ids = {
    requester: "",
    eligible: "",
    shadowed: "",
    acting: "",
    noLanguage: "",
    unqualified: "",
    uncertified: "",
  };
  let geduEmail = "";

  async function mint(
    label: string,
    options: { certified: boolean; languages: Array<"en" | "fi">; qualified: boolean },
  ): Promise<string> {
    const email = `sub-notify-${label}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Notify", last_name: label },
    });
    expect(error).toBeNull();
    const id = data.user?.id ?? "";
    expect(id).toBeTruthy();
    await admin
      .from("profiles")
      .update({ role: "gedu", spoken_languages: options.languages, locale: "fi" })
      .eq("id", id);
    await admin.from("customer_profiles").delete().eq("user_id", id);
    await admin.from("gedu_profiles").insert({ user_id: id, certified: options.certified });
    if (options.qualified) {
      const { error: qualificationError } = await admin
        .from("gedu_qualifications")
        .insert({ gedu_id: id, qualification: "consumer_products" });
      expect(qualificationError).toBeNull();
    }
    if (label === "eligible") geduEmail = email;
    return id;
  }

  async function link(profileId: string, discordUserId: string, linkedAt: Date) {
    const { error } = await admin.from("discord_links").upsert({
      profile_id: profileId,
      discord_user_id: discordUserId,
      discord_username: "notify",
      linked_at: linkedAt.toISOString(),
    });
    expect(error).toBeNull();
  }

  async function file(
    requestedBy: string,
    sessionDate: string,
    status: "open" | "withdrawn" = "open",
  ): Promise<string> {
    const { data, error } = await admin
      .from("session_substitution_requests")
      .insert({
        group_id: GROUP,
        session_date: sessionDate,
        requested_by: requestedBy,
        role: "primary",
        reason: "sick",
        reason_note: "a private note",
        status,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id ?? "";
  }

  async function outbox(requestId: string): Promise<Outbox | null> {
    const { data, error } = await admin
      .from("substitution_notification_outbox")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function clearOutbox(requestIds: string[]) {
    const { error } = await admin
      .from("substitution_notification_outbox")
      .delete()
      .in("request_id", requestIds);
    expect(error).toBeNull();
  }

  async function claim(limit: number, requestIds: string[] | null) {
    const { data, error } = await admin.rpc("claim_substitution_notification_jobs", {
      p_limit: limit,
      ...(requestIds ? { p_request_ids: requestIds } : {}),
    });
    expect(error).toBeNull();
    return data ?? [];
  }

  async function finish(requestId: string, seq: number, failure?: string) {
    const { data, error } = await admin.rpc("finish_substitution_notification_job", {
      p_request_id: requestId,
      p_seq: seq,
      ...(failure === undefined ? {} : { p_error: failure }),
    });
    expect(error).toBeNull();
    return data;
  }

  async function snapshot(requestId: string): Promise<SubstitutionNotificationSnapshot> {
    const { data, error } = await admin.rpc("get_substitution_notification_snapshot", {
      p_request_id: requestId,
    });
    expect(error).toBeNull();
    return substitutionNotificationSnapshot.parse(data);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();

    ids.requester = await mint("requester", { certified: true, languages: ["en"], qualified: true });
    ids.eligible = await mint("eligible", { certified: true, languages: ["en"], qualified: true });
    ids.shadowed = await mint("shadowed", { certified: true, languages: ["en"], qualified: true });
    ids.acting = await mint("acting", { certified: true, languages: ["en"], qualified: true });
    ids.noLanguage = await mint("nolanguage", { certified: true, languages: [], qualified: true });
    ids.unqualified = await mint("unqualified", { certified: true, languages: ["en"], qualified: false });
    ids.uncertified = await mint("uncertified", { certified: false, languages: ["en"], qualified: true });
    geduAuth = await createAuthenticatedClient(geduEmail, "testpassword123");

    await deleteTestProducts(admin, [PRODUCT]);
    const { error: productError } = await admin.from("products").insert({
      id: PRODUCT,
      product_type: "consumer_club",
      billing_mode: "free",
      topic: "minecraft_java",
      spoken_language_code: "en",
      is_remote: true,
      location_id: null,
      timezone: "UTC",
      registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      is_visible: true,
      created_by: TEST_IDS.ADMIN,
      start_date: utcDate(-30),
      end_date: utcDate(60),
      min_age: 8,
      max_age: 18,
      seat_count: null,
      primary_gedu_fee_cents: 4500,
    });
    expect(productError).toBeNull();
    await admin.from("product_translations").insert({
      product_id: PRODUCT,
      locale: "en",
      name: "Notification Club",
      short_description: "x",
    });
    await admin.from("schedule_slots").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        product_id: PRODUCT,
        weekday,
        start_time: "10:00",
        duration_minutes: 60,
      })),
    );
    await admin.from("product_groups").insert({ id: GROUP, product_id: PRODUCT, name: "Notify Cohort" });
    const { error: assignmentError } = await admin.from("gedu_group_assignments").insert({
      group_id: GROUP,
      gedu_id: ids.requester,
      product_id: PRODUCT,
      role: "primary",
    });
    expect(assignmentError).toBeNull();

    await link(ids.eligible, DISCORD_ELIGIBLE, new Date());
    await link(ids.shadowed, DISCORD_SHARED, new Date(Date.now() - 60_000));
    await link(ids.acting, DISCORD_SHARED, new Date());
  });

  beforeEach(async () => {
    // The requests' outbox rows, answers and message records cascade with them.
    await admin.from("session_substitution_requests").delete().eq("group_id", GROUP);
    await admin.from("session_cancellations").delete().eq("group_id", GROUP);
  });

  afterAll(async () => {
    await admin.from("session_substitution_requests").delete().eq("group_id", GROUP);
    await admin.from("session_cancellations").delete().eq("group_id", GROUP);
    await admin.from("gedu_group_assignments").delete().eq("group_id", GROUP);
    await deleteTestProducts(admin, [PRODUCT]);
    for (const id of Object.values(ids)) {
      if (id) await admin.auth.admin.deleteUser(id);
    }
  });

  describe("the triggers file the request in the outbox", () => {
    it("on filing, and bump its seq on every later change to the request", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      expect(await outbox(requestId)).toMatchObject({ seq: 1, attempts: 0, leased_until: null });

      const { error } = await admin
        .from("session_substitution_requests")
        .update({ reason_note: "reworded" })
        .eq("id", requestId);
      expect(error).toBeNull();
      expect((await outbox(requestId))?.seq).toBe(2);
    });

    it("on a gedu's answer being given, changed and removed", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await clearOutbox([requestId]);

      const { error: offerError } = await admin
        .from("session_substitution_offers")
        .insert({ request_id: requestId, gedu_id: ids.eligible });
      expect(offerError).toBeNull();
      expect((await outbox(requestId))?.seq).toBe(1);

      const { error: declineError } = await admin
        .from("session_substitution_offers")
        .update({ response: "decline" })
        .eq("request_id", requestId);
      expect(declineError).toBeNull();
      expect((await outbox(requestId))?.seq).toBe(2);

      const { error: deleteError } = await admin
        .from("session_substitution_offers")
        .delete()
        .eq("request_id", requestId);
      expect(deleteError).toBeNull();
      expect((await outbox(requestId))?.seq).toBe(3);
    });

    it("through the web's own write, the offer RPC", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await clearOutbox([requestId]);
      const { error } = await geduAuth.rpc("offer_session_substitution", {
        p_request_id: requestId,
      });
      expect(error).toBeNull();
      expect((await outbox(requestId))?.seq).toBe(1);
    });

    it("for every non-withdrawn request on a session cancelled or restored, in one write", async () => {
      const date = utcDate(5);
      const open = await file(ids.requester, date);
      const second = await file(ids.noLanguage, date);
      const withdrawn = await file(ids.unqualified, date, "withdrawn");
      const elsewhere = await file(ids.requester, utcDate(6));
      await clearOutbox([open, second, withdrawn, elsewhere]);

      // One statement enqueues two requests: the kick runs once for the
      // transaction and, with Vault empty, does nothing — the write succeeds.
      const { error: cancelError } = await admin.from("session_cancellations").insert({
        group_id: GROUP,
        session_date: date,
        cancelled_by: TEST_IDS.ADMIN,
      });
      expect(cancelError).toBeNull();
      expect((await outbox(open))?.seq).toBe(1);
      expect((await outbox(second))?.seq).toBe(1);
      expect(await outbox(withdrawn)).toBeNull();
      expect(await outbox(elsewhere)).toBeNull();

      const { error: restoreError } = await admin
        .from("session_cancellations")
        .delete()
        .eq("group_id", GROUP)
        .eq("session_date", date);
      expect(restoreError).toBeNull();
      expect((await outbox(open))?.seq).toBe(2);
      expect((await outbox(second))?.seq).toBe(2);
      expect(await outbox(withdrawn)).toBeNull();
    });

    it("re-arms a row on enqueue: due now, attempts reset, an infinite stop lifted", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin
        .from("substitution_notification_outbox")
        .update({ attempts: 12, next_attempt_at: "infinity", last_error: "boom" })
        .eq("request_id", requestId);

      await admin
        .from("session_substitution_requests")
        .update({ reason_note: "again" })
        .eq("id", requestId);
      const row = await outbox(requestId);
      expect(row).toMatchObject({ seq: 2, attempts: 0 });
      expect(new Date(row?.next_attempt_at ?? "").getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
    });

    it("deleting a request deletes its row with it, and its answers' triggers do not get in the way", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin.from("session_substitution_offers").insert({ request_id: requestId, gedu_id: ids.eligible });
      const { error } = await admin.from("session_substitution_requests").delete().eq("id", requestId);
      expect(error).toBeNull();
      expect(await outbox(requestId)).toBeNull();
    });
  });

  describe("the lease", () => {
    it("claims a due row once, counting the attempt, until its lease runs out", async () => {
      const requestId = await file(ids.requester, utcDate(3));

      const first = await claim(10, [requestId]);
      expect(first).toEqual([{ request_id: requestId, seq: 1 }]);
      const leased = await outbox(requestId);
      expect(leased?.attempts).toBe(1);
      const leaseMs = new Date(leased?.leased_until ?? "").getTime() - Date.now();
      expect(leaseMs).toBeGreaterThan(60_000);
      expect(leaseMs).toBeLessThanOrEqual(125_000);

      expect(await claim(10, [requestId])).toEqual([]);

      // A sync that died holding the lease: once it lapses, the row is back.
      await admin
        .from("substitution_notification_outbox")
        .update({ leased_until: new Date(Date.now() - 1_000).toISOString() })
        .eq("request_id", requestId);
      expect(await claim(10, [requestId])).toEqual([{ request_id: requestId, seq: 1 }]);
      expect((await outbox(requestId))?.attempts).toBe(2);
    });

    it("leaves a row whose next attempt is still to come", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin
        .from("substitution_notification_outbox")
        .update({ next_attempt_at: new Date(Date.now() + 60_000).toISOString() })
        .eq("request_id", requestId);
      expect(await claim(10, [requestId])).toEqual([]);
    });

    it("narrows to the requests named, and takes no more than the limit", async () => {
      const a = await file(ids.requester, utcDate(3));
      const b = await file(ids.requester, utcDate(4));
      const c = await file(ids.requester, utcDate(5));

      expect(await claim(10, [b])).toEqual([{ request_id: b, seq: 1 }]);

      const limited = await claim(1, [a, c]);
      expect(limited).toHaveLength(1);
      const rest = await claim(10, [a, c]);
      expect(rest).toHaveLength(1);
      expect([...limited, ...rest].map((row) => row.request_id).sort()).toEqual([a, c].sort());
    });

    it("with no names, takes every due row (ours among them)", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const claimed = await claim(1000, null);
      expect(claimed.map((row) => row.request_id)).toContain(requestId);
      // Hand back whatever else it took, so no row of another suite stays leased.
      await admin
        .from("substitution_notification_outbox")
        .update({ leased_until: null })
        .in(
          "request_id",
          claimed.map((row) => row.request_id),
        );
    });

    it("lets two syncs claiming at once share the rows between them, never both taking one", async () => {
      const a = await file(ids.requester, utcDate(3));
      const b = await file(ids.requester, utcDate(4));
      const [first, second] = await Promise.all([claim(1, [a, b]), claim(1, [a, b])]);
      const claimed = [...first, ...second].map((row) => row.request_id);
      expect(claimed.sort()).toEqual([a, b].sort());
    });
  });

  describe("finishing a sync", () => {
    it("deletes the row when nothing changed while it ran", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const [job] = await claim(10, [requestId]);
      expect(await finish(requestId, job.seq)).toBe(false);
      expect(await outbox(requestId)).toBeNull();
    });

    it("hands the row back, due, and asks for another run when the request changed meanwhile", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const [job] = await claim(10, [requestId]);
      await admin
        .from("session_substitution_requests")
        .update({ reason_note: "changed mid-sync" })
        .eq("id", requestId);

      expect(await finish(requestId, job.seq)).toBe(true);
      expect(await outbox(requestId)).toMatchObject({ seq: 2, leased_until: null });
      expect(await claim(10, [requestId])).toEqual([{ request_id: requestId, seq: 2 }]);
    });

    it("answers false for a request deleted while it ran", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const [job] = await claim(10, [requestId]);
      await admin.from("session_substitution_requests").delete().eq("id", requestId);
      expect(await finish(requestId, job.seq)).toBe(false);
    });

    it("on failure, records the error and backs off 2^attempts minutes", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const [job] = await claim(10, [requestId]);
      const before = Date.now();
      expect(await finish(requestId, job.seq, "discord said no")).toBe(false);

      const row = await outbox(requestId);
      expect(row).toMatchObject({ seq: 1, attempts: 1, leased_until: null, last_error: "discord said no" });
      const delayMs = new Date(row?.next_attempt_at ?? "").getTime() - before;
      expect(delayMs).toBeGreaterThan(110_000);
      expect(delayMs).toBeLessThan(130_000);
      expect(await claim(10, [requestId])).toEqual([]);
    });

    it("caps the backoff at an hour", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin.from("substitution_notification_outbox").update({ attempts: 7 }).eq("request_id", requestId);
      const [job] = await claim(10, [requestId]);
      const before = Date.now();
      await finish(requestId, job.seq, "still down");

      const row = await outbox(requestId);
      expect(row?.attempts).toBe(8);
      const delayMs = new Date(row?.next_attempt_at ?? "").getTime() - before;
      expect(delayMs).toBeGreaterThan(59 * 60_000);
      expect(delayMs).toBeLessThan(61 * 60_000);
    });

    it("stops scheduling after the 12th attempt, and keeps the row", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin.from("substitution_notification_outbox").update({ attempts: 11 }).eq("request_id", requestId);
      const [job] = await claim(10, [requestId]);
      await finish(requestId, job.seq, "gave up");

      const row = await outbox(requestId);
      expect(row).toMatchObject({ attempts: 12, next_attempt_at: "infinity", last_error: "gave up" });
      expect(await claim(10, [requestId])).toEqual([]);
    });
  });

  describe("the daily close-out", () => {
    it("files announced requests still open on yesterday's date, and nothing else", async () => {
      const passed = await file(ids.requester, utcDate(-1));
      const unannounced = await file(ids.noLanguage, utcDate(-1));
      const today = await file(ids.requester, utcDate(0));
      const older = await file(ids.requester, utcDate(-2));
      const withdrawn = await file(ids.unqualified, utcDate(-1), "withdrawn");
      const all = [passed, unannounced, today, older, withdrawn];
      const { error: announceError } = await admin.from("substitution_notifications").insert(
        [passed, today, older, withdrawn].map((requestId) => ({
          request_id: requestId,
          announced_at: new Date().toISOString(),
        })),
      );
      expect(announceError).toBeNull();
      await clearOutbox(all);

      const { data: count, error } = await admin.rpc("enqueue_passed_substitution_notifications");
      expect(error).toBeNull();
      expect(count).toBeGreaterThanOrEqual(1);
      expect((await outbox(passed))?.seq).toBe(1);
      for (const requestId of [unannounced, today, older, withdrawn]) {
        expect(await outbox(requestId)).toBeNull();
      }
    });
  });

  describe("the snapshot", () => {
    it("is null for a request that does not exist", async () => {
      const { data, error } = await admin.rpc("get_substitution_notification_snapshot", {
        p_request_id: NO_SUCH_REQUEST,
      });
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("describes an open request, its session and every gedu it concerns", async () => {
      const date = utcDate(3);
      const requestId = await file(ids.requester, date);
      const { error: answerError } = await admin.from("session_substitution_offers").insert([
        { request_id: requestId, gedu_id: ids.eligible, response: "offer" },
        // An answer from a gedu who no longer passes the tests stays listed.
        { request_id: requestId, gedu_id: ids.noLanguage, response: "decline" },
      ]);
      expect(answerError).toBeNull();
      // A DM sent to a gedu who has since stopped passing them stays listed too.
      const { error: dmError } = await admin.from("substitution_notification_dms").insert({
        request_id: requestId,
        gedu_id: ids.unqualified,
        discord_user_id: "920000000000000099",
        channel_id: "1",
        message_id: "2",
        rendered_hash: "abc",
      });
      expect(dmError).toBeNull();

      const shot = await snapshot(requestId);
      expect(shot.request).toMatchObject({
        id: requestId,
        status: "open",
        group_id: GROUP,
        group_name: "Notify Cohort",
        session_date: date,
        role: "primary",
        fee_cents: 4500,
        reason: "sick",
        reason_note: "a private note",
        requester: { id: ids.requester, first_name: "Notify", last_name: "requester" },
        substitute: null,
        approver: null,
        approved_at: null,
      });
      expect(shot.product.id).toBe(PRODUCT);
      expect(shot.product.is_remote).toBe(true);
      expect(shot.required_qualifications).toEqual(["consumer_products"]);
      expect(shot.is_cancelled).toBe(false);
      expect(shot.product_today).toBe(utcDate(0));
      expect(shot.notification).toBeNull();
      expect(shot.dms).toEqual([
        expect.objectContaining({ gedu_id: ids.unqualified, message_id: "2", delivery_error: null }),
      ]);

      const byId = new Map(shot.candidates.map((candidate) => [candidate.gedu_id, candidate]));
      expect(byId.get(ids.eligible)).toMatchObject({
        eligible: true,
        locale: "fi",
        last_name: "eligible",
        discord_user_id: DISCORD_ELIGIBLE,
        response: "offer",
      });
      expect(byId.get(ids.eligible)?.offer_id).toEqual(expect.any(String));
      expect(byId.get(ids.eligible)?.responded_at).toEqual(expect.any(String));
      // The shared Discord id acts for the account linked to it last.
      expect(byId.get(ids.acting)).toMatchObject({
        eligible: true,
        discord_user_id: DISCORD_SHARED,
        response: null,
        offer_id: null,
        responded_at: null,
      });
      expect(byId.get(ids.shadowed)).toMatchObject({ eligible: true, discord_user_id: null });
      expect(byId.get(ids.noLanguage)).toMatchObject({ eligible: false, response: "decline" });
      expect(byId.get(ids.unqualified)).toMatchObject({ eligible: false, response: null });
      // Neither the absent gedu nor an uncertified one, with nothing to show.
      expect(byId.has(ids.requester)).toBe(false);
      expect(byId.has(ids.uncertified)).toBe(false);
    });

    it("carries the announcement once there is one", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      await admin.from("substitution_notifications").insert({
        request_id: requestId,
        announced_at: new Date().toISOString(),
        slack_channel_id: "C1",
        slack_message_ts: "123.456",
      });
      const shot = await snapshot(requestId);
      expect(shot.notification).toMatchObject({
        request_id: requestId,
        slack_channel_id: "C1",
        slack_message_ts: "123.456",
        slack_rendered_hash: null,
      });
    });

    it("names the sub and the approver on a substituted request", async () => {
      const requestId = await file(ids.requester, utcDate(3));
      const { error } = await admin
        .from("session_substitution_requests")
        .update({
          status: "substituted",
          substitute_id: ids.eligible,
          approved_by: TEST_IDS.ADMIN,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      expect(error).toBeNull();

      const shot = await snapshot(requestId);
      expect(shot.request.status).toBe("substituted");
      if (shot.request.status !== "substituted") return;
      expect(shot.request.substitute.id).toBe(ids.eligible);
      expect(shot.request.approver.id).toBe(TEST_IDS.ADMIN);
    });

    it("says when the session is cancelled, and takes everyone off the eligible list", async () => {
      const date = utcDate(4);
      const requestId = await file(ids.requester, date);
      await admin.from("session_cancellations").insert({
        group_id: GROUP,
        session_date: date,
        cancelled_by: TEST_IDS.ADMIN,
      });
      const shot = await snapshot(requestId);
      expect(shot.is_cancelled).toBe(true);
      expect(shot.candidates.some((candidate) => candidate.eligible)).toBe(false);
    });
  });

  describe("nobody but the service role reaches any of it", () => {
    const tables = [
      "substitution_notification_outbox",
      "substitution_notifications",
      "substitution_notification_dms",
    ] as const;

    it("the tables are closed to anon and to a signed-in gedu", async () => {
      for (const client of [anon, geduAuth]) {
        for (const table of tables) {
          const { error } = await client.from(table).select("*");
          expect(error?.code, `${table}`).toBe(FORBIDDEN);
        }
      }
    });

    it("the service-role functions are closed to anon and to a signed-in gedu", async () => {
      for (const client of [anon, geduAuth]) {
        const snapshotCall = await client.rpc("get_substitution_notification_snapshot", {
          p_request_id: NO_SUCH_REQUEST,
        });
        expect(snapshotCall.error?.code).toBe(FORBIDDEN);
        const claimCall = await client.rpc("claim_substitution_notification_jobs", { p_limit: 1 });
        expect(claimCall.error?.code).toBe(FORBIDDEN);
        const finishCall = await client.rpc("finish_substitution_notification_job", {
          p_request_id: NO_SUCH_REQUEST,
          p_seq: 1,
        });
        expect(finishCall.error?.code).toBe(FORBIDDEN);
        const closeOutCall = await client.rpc("enqueue_passed_substitution_notifications");
        expect(closeOutCall.error?.code).toBe(FORBIDDEN);
      }
    });

    it("the enqueue and the kicks are closed to the service role too", async () => {
      for (const client of [anon, geduAuth, admin]) {
        const enqueue = await client.rpc("enqueue_substitution_notification", {
          p_request_id: NO_SUCH_REQUEST,
        });
        expect(enqueue.error?.code).toBe(FORBIDDEN);
        const kick = await client.rpc("kick_substitution_notification_sync");
        expect(kick.error?.code).toBe(FORBIDDEN);
        const kickIfDue = await client.rpc("kick_substitution_notification_sync_if_due");
        expect(kickIfDue.error?.code).toBe(FORBIDDEN);
      }
    });
  });
});
