import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import { promoteFromWaitlistRpcResult } from "@/services/participations/participations.contracts";
import {
  claimedSeatOfferExpiries,
  respondSeatOfferRpcResult,
  sendSeatOfferRpcResult,
} from "@/services/participations/seat-offer.contracts";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";
import { adminDashboardSnapshot } from "@/services/admin-dashboard/admin-dashboard.contracts";

/**
 * The seat offer (migration 00207, carried forward by 00208 and 00209): the
 * three service-role RPCs, the two CHECK constraints behind them, and the two
 * readers they changed.
 *
 * Product UUIDs 670-67a (see the product-helpers allocation registry). Six
 * differently-shaped products rather than one that gets reconfigured, because
 * every refusal here is about a shape — a paid product, a product with two
 * groups, a product with none, a cancelled one — and a case proving a refusal
 * must not be reachable only while some earlier case has left the fixture in
 * the right state.
 *
 * The three RPCs are granted to `service_role` alone, so every call in this
 * file goes through the admin client. That is not the spine's business — it
 * classifies what `authenticated` can reach, and none of these are — but it is
 * why nothing here signs in to call them.
 */

const P_CLUB = "00000000-0000-0000-0000-000000000670";
const GROUP_CLUB = "00000000-0000-0000-0000-000000000671";
const P_PAID = "00000000-0000-0000-0000-000000000672";
const GROUP_PAID = "00000000-0000-0000-0000-000000000673";
const P_TWO_GROUPS = "00000000-0000-0000-0000-000000000674";
const GROUP_TWO_A = "00000000-0000-0000-0000-000000000675";
const GROUP_TWO_B = "00000000-0000-0000-0000-000000000676";
const P_NO_GROUPS = "00000000-0000-0000-0000-000000000677";
const P_DASHBOARD = "00000000-0000-0000-0000-000000000678";
const P_CANCELLED = "00000000-0000-0000-0000-000000000679";
const GROUP_CANCELLED = "00000000-0000-0000-0000-00000000067a";

const ALL_PRODUCTS = [
  P_CLUB,
  P_PAID,
  P_TWO_GROUPS,
  P_NO_GROUPS,
  P_DASHBOARD,
  P_CANCELLED,
];

/** An instant well inside the window, and one well outside it. */
const LIVE_AT = () => new Date(Date.now() - 60_000);
const LAPSED_AT = () => new Date(Date.now() - SEAT_OFFER_WINDOW_MS - 60_000);
/**
 * Five minutes short of the deadline — the window's *far* edge, from inside.
 *
 * `LAPSED_AT` alone only proves the SQL window is no longer than the TypeScript
 * constant. This one proves it is no shorter, and the pair is what actually
 * holds the two literals in lockstep: between them the interval in the three
 * functions is bracketed to `SEAT_OFFER_WINDOW_MS` within five minutes, so a
 * migration that moved `interval '5 days'` to four days or six without moving
 * the constant fails here rather than in somebody's inbox.
 */
const ALMOST_LAPSED_AT = () =>
  new Date(Date.now() - SEAT_OFFER_WINDOW_MS + 5 * 60_000);

describe("seat offers", () => {
  let admin: SupabaseClient<Database>;
  let adminUser: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminUser = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // The offerable shape: no charge, capped, waitlist on, exactly one group.
    await createTestProduct(admin, {
      id: P_CLUB,
      billingMode: "free",
      seatCount: 1,
      waitlistEnabled: true,
    });
    await createTestProduct(admin, {
      id: P_PAID,
      billingMode: "paid",
      seatCount: 1,
      waitlistEnabled: true,
    });
    await createTestProduct(admin, {
      id: P_TWO_GROUPS,
      billingMode: "free",
      seatCount: 1,
      waitlistEnabled: true,
    });
    await createTestProduct(admin, {
      id: P_NO_GROUPS,
      billingMode: "free",
      seatCount: 1,
      waitlistEnabled: true,
    });
    // Capped, queued, group-less, and with its gedu fee set, so the waitlist
    // flag is the only attention issue it can raise.
    await createTestProduct(admin, {
      id: P_DASHBOARD,
      billingMode: "free",
      seatCount: 2,
      waitlistEnabled: true,
    });
    const fee = await admin
      .from("products")
      .update({ primary_gedu_fee_cents: 5000 })
      .eq("id", P_DASHBOARD);
    expect(fee.error).toBeNull();

    // The offerable shape in every respect EXCEPT that the product has been
    // cancelled — free, capped, waitlist on, exactly one group. Everything the
    // answer re-resolves therefore still says yes, which is what makes the
    // refusal below about the product's standing and nothing else.
    await createTestProduct(admin, {
      id: P_CANCELLED,
      billingMode: "free",
      seatCount: 1,
      waitlistEnabled: true,
      status: "cancelled",
    });

    const groups = await admin.from("product_groups").insert([
      { id: GROUP_CLUB, product_id: P_CLUB, name: "Club group" },
      { id: GROUP_PAID, product_id: P_PAID, name: "Paid group" },
      { id: GROUP_TWO_A, product_id: P_TWO_GROUPS, name: "Two A" },
      { id: GROUP_TWO_B, product_id: P_TWO_GROUPS, name: "Two B" },
      {
        id: GROUP_CANCELLED,
        product_id: P_CANCELLED,
        name: "Cancelled club group",
      },
    ]);
    expect(groups.error).toBeNull();
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  afterEach(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
  });

  // -------------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------------

  /** A waitlisted row on `productId`, returned by id. */
  async function queue(
    productId: string,
    participantId: string = TEST_IDS.GAMER,
  ): Promise<string> {
    const res = await admin
      .from("participations")
      .insert({
        product_id: productId,
        participant_id: participantId,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(res.error).toBeNull();
    return res.data!.id;
  }

  /**
   * Stamp an offer directly, for the cases whose whole point is a state
   * `send_seat_offer` will not produce — a lapsed offer, or an offer on a
   * product it would refuse.
   */
  async function stamp(
    participationId: string,
    sentAt: Date,
    notifiedAt: string | null = null,
  ): Promise<string> {
    const res = await admin
      .from("participations")
      .update({
        seat_offer_sent_at: sentAt.toISOString(),
        seat_offer_expiry_notified_at: notifiedAt,
      })
      .eq("id", participationId)
      .select("seat_offer_sent_at")
      .single();
    expect(res.error).toBeNull();
    return res.data!.seat_offer_sent_at!;
  }

  /**
   * Put a queued row at a known place in the line. `queue` stamps `now()`, so
   * two rows inserted back to back can tie; the one case that asserts an
   * ordering sets both positions explicitly rather than trusting insertion
   * order to have separated them.
   */
  async function setQueuePosition(
    participationId: string,
    waitlistedAt: Date,
  ): Promise<void> {
    const res = await admin
      .from("participations")
      .update({ waitlisted_at: waitlistedAt.toISOString() })
      .eq("id", participationId);
    expect(res.error).toBeNull();
  }

  async function readRow(participationId: string) {
    const res = await admin
      .from("participations")
      .select("status, group_id, waitlisted_at, seat_offer_sent_at, seat_offer_expiry_notified_at")
      .eq("id", participationId)
      .maybeSingle();
    expect(res.error).toBeNull();
    return res.data;
  }

  // -------------------------------------------------------------------------
  // send_seat_offer
  // -------------------------------------------------------------------------

  it("stamps the row and reports the stamp it actually wrote", async () => {
    const participation = await queue(P_CLUB);

    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error).toBeNull();

    const parsed = sendSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("offered");
    if (parsed.kind !== "offered") throw new Error("unreachable");
    expect(parsed.idempotent).toBe(false);
    expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);
    expect(parsed.participant_id).toBe(TEST_IDS.GAMER);

    const row = await readRow(participation);
    expect(row!.seat_offer_sent_at).toBe(parsed.sent_at);
    expect(row!.status).toBe("waitlisted");
  });

  /**
   * The token is signed over this instant and compared back through a
   * JavaScript Date, which cannot hold microseconds. A raw `now()` stamp would
   * mint links that can never be redeemed, and the failure would look like
   * "accept does nothing" rather than like a precision bug.
   */
  it("stamps at millisecond precision, so a JavaScript Date can reproduce it", async () => {
    const participation = await queue(P_CLUB);
    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    const parsed = sendSeatOfferRpcResult.parse(res.data);
    if (parsed.kind !== "offered") throw new Error("unreachable");

    const roundTripped = new Date(parsed.sent_at).toISOString();
    const respond = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: roundTripped,
      p_accept: true,
    });
    expect(respond.error).toBeNull();
    // `stale` here would mean the round trip lost precision.
    expect(respondSeatOfferRpcResult.parse(respond.data).kind).toBe("accepted");
  });

  it("reports a replay without moving the deadline", async () => {
    const participation = await queue(P_CLUB);
    const first = sendSeatOfferRpcResult.parse(
      (await admin.rpc("send_seat_offer", { p_participation_id: participation }))
        .data,
    );
    if (first.kind !== "offered") throw new Error("unreachable");

    const second = sendSeatOfferRpcResult.parse(
      (await admin.rpc("send_seat_offer", { p_participation_id: participation }))
        .data,
    );
    expect(second.kind).toBe("offered");
    if (second.kind !== "offered") throw new Error("unreachable");
    expect(second.idempotent).toBe(true);
    // A family reading a date in their inbox must not have it moved by an
    // admin pressing the button twice.
    expect(second.sent_at).toBe(first.sent_at);
  });

  it("refuses a product that charges the family", async () => {
    const participation = await queue(P_PAID);
    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error?.code).toBe("23514");
    expect(res.error?.message).toContain("no-charge");
  });

  it("refuses a product with more than one group", async () => {
    const participation = await queue(P_TWO_GROUPS);
    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error?.code).toBe("23514");
    expect(res.error?.message).toContain("groups");
  });

  it("refuses a product with no groups at all", async () => {
    const participation = await queue(P_NO_GROUPS);
    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error?.code).toBe("23514");
  });

  it("reports a noop for a row that has already taken a seat", async () => {
    const participation = await queue(P_CLUB);
    await admin
      .from("participations")
      .update({ status: "active", waitlisted_at: null })
      .eq("id", participation);

    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error).toBeNull();
    const parsed = sendSeatOfferRpcResult.parse(res.data);
    expect(parsed).toEqual({ kind: "noop", status: "active" });
  });

  it("raises for a participation that does not exist", async () => {
    const res = await admin.rpc("send_seat_offer", {
      // A shape no fixture can hold: all-f is outside every allocated range.
      p_participation_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(res.error?.code).toBe("P0002");
  });

  /**
   * The family did not answer, the seat is still open, and asking again is the
   * whole point. The old notification stamp goes with it, so a second silence
   * notifies staff a second time.
   */
  it("re-offers an expired offer with a fresh stamp and clears the old notice", async () => {
    const participation = await queue(P_CLUB);
    const old = await stamp(participation, LAPSED_AT(), new Date().toISOString());

    const res = await admin.rpc("send_seat_offer", {
      p_participation_id: participation,
    });
    expect(res.error).toBeNull();
    const parsed = sendSeatOfferRpcResult.parse(res.data);
    if (parsed.kind !== "offered") throw new Error("unreachable");
    expect(parsed.idempotent).toBe(false);
    expect(parsed.sent_at).not.toBe(old);

    const row = await readRow(participation);
    expect(row!.seat_offer_expiry_notified_at).toBeNull();
  });

  // -------------------------------------------------------------------------
  // respond_seat_offer — accept
  // -------------------------------------------------------------------------

  it("accepting activates the seat and places it in the single group", async () => {
    const participation = await queue(P_CLUB);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    const parsed = respondSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("accepted");
    if (parsed.kind !== "accepted") throw new Error("unreachable");
    expect(parsed.group_id).toBe(GROUP_CLUB);

    const row = await readRow(participation);
    expect(row).toMatchObject({
      status: "active",
      group_id: GROUP_CLUB,
      waitlisted_at: null,
      seat_offer_sent_at: null,
      seat_offer_expiry_notified_at: null,
    });
  });

  /**
   * The deliberate capacity override, and it has a stronger claim behind it
   * than the drag-promote one: this seat was offered by name and accepted. A
   * product that refilled while the family was deciding goes one over rather
   * than taking back an invitation.
   */
  it("honours an accepted offer on a product that has since filled up", async () => {
    // seat_count is 1, and this takes it.
    const seated = await queue(P_CLUB, TEST_IDS.GAMER_2);
    await admin
      .from("participations")
      .update({ status: "active", waitlisted_at: null, group_id: GROUP_CLUB })
      .eq("id", seated);

    const participation = await queue(P_CLUB, TEST_IDS.GAMER);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data).kind).toBe("accepted");
    expect((await readRow(participation))!.status).toBe("active");
  });

  /**
   * The placement question is resolved again at answer time, not trusted from
   * send time. If it is no longer unambiguous the seat is still granted and
   * lands unassigned — a placement question is ours, and not a reason to
   * withdraw an invitation a family has just accepted.
   */
  it("still seats the family when the product no longer has exactly one group", async () => {
    const participation = await queue(P_TWO_GROUPS);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    const parsed = respondSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("accepted");
    if (parsed.kind !== "accepted") throw new Error("unreachable");
    expect(parsed.group_id).toBeNull();
    expect(await readRow(participation)).toMatchObject({
      status: "active",
      group_id: null,
    });
  });

  // -------------------------------------------------------------------------
  // respond_seat_offer — decline, and the ways an answer is refused
  // -------------------------------------------------------------------------

  it("declining deletes the row and hands back what the staff mail names", async () => {
    const participation = await queue(P_CLUB);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: false,
    });
    expect(res.error).toBeNull();
    const parsed = respondSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("declined");
    if (parsed.kind !== "declined") throw new Error("unreachable");
    // Read before the delete, because they cannot be read after it.
    expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);
    expect(parsed.participant_id).toBe(TEST_IDS.GAMER);
    expect(parsed.product_id).toBe(P_CLUB);

    expect(await readRow(participation)).toBeNull();
  });

  /**
   * The compare-and-swap, and the whole of this feature's replay protection.
   * A used link, a stale tab and a superseded offer all fail here.
   */
  it("refuses an answer whose stamp does not match the row", async () => {
    const participation = await queue(P_CLUB);
    await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: new Date(Date.now() - 30_000).toISOString(),
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data)).toEqual({ kind: "stale" });
    // Nothing moved.
    expect((await readRow(participation))!.status).toBe("waitlisted");
  });

  it("refuses an answer on a row carrying no offer", async () => {
    const participation = await queue(P_CLUB);

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: new Date().toISOString(),
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data)).toEqual({ kind: "stale" });
  });

  /**
   * The window is enforced here as well as in the token, because the in-app
   * path carries no token at all — and since 00208 it binds ACCEPT and nothing
   * else, which is why this case names the answer it is refusing.
   *
   * The stamp surviving is the load-bearing half. It is what the emailed link
   * is signed over, so leaving it in place is what keeps the late decline below
   * answerable and what lets the landing page tell a lapsed offer apart from a
   * spent one.
   */
  it("refuses an ACCEPT after the window has closed, and moves nothing", async () => {
    const participation = await queue(P_CLUB);
    const sentAt = await stamp(participation, LAPSED_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    const parsed = respondSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("expired");

    const row = (await readRow(participation))!;
    expect(row.status).toBe("waitlisted");
    expect(row.seat_offer_sent_at).toBe(sentAt);
  });

  /**
   * The other direction through the same closed window, and the whole of
   * 00208. The deadline exists to stop a seat being CLAIMED after we have
   * offered it elsewhere; none of that reasoning reaches a family telling us
   * they cannot come, and that is the one answer that frees a row. So a decline
   * lands for as long as the participation exists, however late it is.
   */
  it("honours a DECLINE after the window has closed, and deletes the row", async () => {
    const participation = await queue(P_CLUB);
    const sentAt = await stamp(participation, LAPSED_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: false,
    });
    expect(res.error).toBeNull();
    const parsed = respondSeatOfferRpcResult.parse(res.data);
    expect(parsed.kind).toBe("declined");
    if (parsed.kind !== "declined") throw new Error("unreachable");
    // Same four identifiers as an in-window decline: the staff mail's builder
    // does not know which kind of decline it is looking at, and must not have
    // to.
    expect(parsed.customer_id).toBe(TEST_IDS.CUSTOMER);
    expect(parsed.participant_id).toBe(TEST_IDS.GAMER);
    expect(parsed.product_id).toBe(P_CLUB);

    expect(await readRow(participation)).toBeNull();
  });

  /**
   * `within_window` tells the two declines apart, and the pair is asserted in
   * one case because the flag means nothing alone: an in-window no is news an
   * admin is waiting for, a late one is not necessarily. The family reads the
   * same thank-you either way, which is why this never crosses the public wire
   * — it exists for the route and for no other reader.
   *
   * Neither row here has been swept, so `already_notified` is false on both:
   * the flag is the OTHER half of the mail decision (00209) and is asserted on
   * its own below.
   */
  it("reports whether a decline beat the deadline", async () => {
    const inTime = await queue(P_CLUB, TEST_IDS.GAMER);
    const inTimeSentAt = await stamp(inTime, LIVE_AT());
    const late = await queue(P_DASHBOARD, TEST_IDS.GAMER_2);
    const lateSentAt = await stamp(late, LAPSED_AT());

    const first = await admin.rpc("respond_seat_offer", {
      p_participation_id: inTime,
      p_offer_sent_at: inTimeSentAt,
      p_accept: false,
    });
    expect(first.error).toBeNull();
    const inTimeParsed = respondSeatOfferRpcResult.parse(first.data);
    if (inTimeParsed.kind !== "declined") throw new Error("unreachable");
    expect(inTimeParsed.within_window).toBe(true);
    expect(inTimeParsed.already_notified).toBe(false);

    const second = await admin.rpc("respond_seat_offer", {
      p_participation_id: late,
      p_offer_sent_at: lateSentAt,
      p_accept: false,
    });
    expect(second.error).toBeNull();
    const lateParsed = respondSeatOfferRpcResult.parse(second.data);
    if (lateParsed.kind !== "declined") throw new Error("unreachable");
    expect(lateParsed.within_window).toBe(false);
    expect(lateParsed.already_notified).toBe(false);
  });

  /**
   * The hole 00209 closes, seen from the database.
   *
   * Expiry here is OBSERVED, not scheduled: the no-response mail goes out the
   * first time somebody opens a page that would care. So "late" is no evidence
   * at all that staff were told — if nobody looked between the fifth day and
   * the family's answer, nobody was told, and the DELETE below removes the only
   * column that could ever have said so. `already_notified` is that column,
   * read before the row goes.
   *
   * Both halves in one case, because either alone passes while the rule is half
   * implemented: a body that hardcoded `false` would satisfy the unswept row,
   * and one that hardcoded `true` would satisfy the swept one.
   */
  it("reports whether staff had already been told, reading it before the delete", async () => {
    const unswept = await queue(P_CLUB, TEST_IDS.GAMER);
    const unsweptSentAt = await stamp(unswept, LAPSED_AT());
    const swept = await queue(P_DASHBOARD, TEST_IDS.GAMER_2);
    const sweptSentAt = await stamp(
      swept,
      LAPSED_AT(),
      new Date().toISOString(),
    );

    const first = await admin.rpc("respond_seat_offer", {
      p_participation_id: unswept,
      p_offer_sent_at: unsweptSentAt,
      p_accept: false,
    });
    expect(first.error).toBeNull();
    const unsweptParsed = respondSeatOfferRpcResult.parse(first.data);
    if (unsweptParsed.kind !== "declined") throw new Error("unreachable");
    // Nobody has heard about this offer at all. The route mails on this.
    expect(unsweptParsed.already_notified).toBe(false);
    expect(await readRow(unswept)).toBeNull();

    const second = await admin.rpc("respond_seat_offer", {
      p_participation_id: swept,
      p_offer_sent_at: sweptSentAt,
      p_accept: false,
    });
    expect(second.error).toBeNull();
    const sweptParsed = respondSeatOfferRpcResult.parse(second.data);
    if (sweptParsed.kind !== "declined") throw new Error("unreachable");
    // Staff already have a mail about this one, so the route stays quiet — and
    // the flag survived the delete that took the stamp behind it.
    expect(sweptParsed.already_notified).toBe(true);
    expect(await readRow(swept)).toBeNull();
  });

  /**
   * The other side of the same window, and the reason both cases exist. The
   * refusal above says the offer is dead five days and a minute after it was
   * sent; this one says it is alive five minutes before that, which is what
   * makes a shortened SQL interval fail rather than pass quietly.
   */
  it("still honours an answer five minutes before the window closes", async () => {
    const participation = await queue(P_CLUB);
    const sentAt = await stamp(participation, ALMOST_LAPSED_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data).kind).toBe("accepted");
    expect((await readRow(participation))!.status).toBe("active");
  });

  /**
   * The boundary of the grandfathering, and the one fact an honoured invite
   * always requires: the product it names still exists and still stands.
   *
   * Everything else the answer could re-read is deliberately not re-read — a
   * product flipped to paid mid-window still honours the free seat, and a
   * product that gained a second group still seats the family, unassigned. The
   * product itself is not one of those terms. This fixture is offerable in
   * every other respect (free, capped, exactly one group, a live stamp well
   * inside the window), so `stale` here can only be the cancellation.
   *
   * `stale` rather than a kind of its own, and it is the one `stale` that stays
   * generic all the way out to the reader: every other one resolves to `used`
   * when the route re-reads the row, and only a row still holding this exact
   * live offer resolves to the generic `invalid`. A distinguishable answer
   * would let an unauthenticated caller ask which products have been cancelled.
   */
  it("refuses an answer on a product that has been cancelled, and moves nothing", async () => {
    const participation = await queue(P_CANCELLED);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data)).toEqual({ kind: "stale" });

    // The row is exactly as it was: still queueing, still carrying its offer.
    expect(await readRow(participation)).toMatchObject({
      status: "waitlisted",
      group_id: null,
      seat_offer_sent_at: sentAt,
    });
  });

  /**
   * Declining is refused on the same terms, and the point is the DELETE: an
   * answer the product no longer supports must not spend the family's place in
   * a queue either. Accept and decline reach the guard before they diverge.
   */
  it("refuses a decline on a cancelled product without deleting the row", async () => {
    const participation = await queue(P_CANCELLED);
    const sentAt = await stamp(participation, LIVE_AT());

    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: participation,
      p_offer_sent_at: sentAt,
      p_accept: false,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data)).toEqual({ kind: "stale" });
    expect(await readRow(participation)).toMatchObject({
      status: "waitlisted",
    });
  });

  it("answers not_found for a participation that does not exist", async () => {
    const res = await admin.rpc("respond_seat_offer", {
      p_participation_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      p_offer_sent_at: new Date().toISOString(),
      p_accept: true,
    });
    expect(res.error).toBeNull();
    expect(respondSeatOfferRpcResult.parse(res.data)).toEqual({
      kind: "not_found",
    });
  });

  // -------------------------------------------------------------------------
  // claim_expired_seat_offer_notifications
  // -------------------------------------------------------------------------

  it("claims the lapsed, un-notified offers and marks them in the same statement", async () => {
    const lapsed = await queue(P_CLUB, TEST_IDS.GAMER);
    await stamp(lapsed, LAPSED_AT());
    const live = await queue(P_DASHBOARD, TEST_IDS.GAMER_2);
    await stamp(live, LIVE_AT());

    const first = await admin.rpc("claim_expired_seat_offer_notifications");
    expect(first.error).toBeNull();
    const claimed = claimedSeatOfferExpiries.parse(first.data);
    const ids = claimed.map((row) => row.participation_id);
    expect(ids).toContain(lapsed);
    // A live offer is not something anybody has failed to answer yet.
    expect(ids).not.toContain(live);

    const row = claimed.find((entry) => entry.participation_id === lapsed)!;
    expect(row.customer_id).toBe(TEST_IDS.CUSTOMER);
    expect(row.product_id).toBe(P_CLUB);
    expect((await readRow(lapsed))!.seat_offer_expiry_notified_at).not.toBeNull();

    // The second call is what makes the mail exactly-once: the claim and the
    // mark are one statement, so a concurrent sweep sees nothing left.
    const second = await admin.rpc("claim_expired_seat_offer_notifications");
    expect(second.error).toBeNull();
    expect(
      claimedSeatOfferExpiries.parse(second.data).map((r) => r.participation_id),
    ).not.toContain(lapsed);
  });

  /**
   * The unscoped mode, stated as its own case rather than left implied by the
   * one above: an omitted argument claims across products, which is what an
   * admin's sweep-on-mount is for.
   */
  it("claims across every product when no participation is named", async () => {
    const here = await queue(P_CLUB, TEST_IDS.GAMER);
    await stamp(here, LAPSED_AT());
    const elsewhere = await queue(P_DASHBOARD, TEST_IDS.GAMER);
    await stamp(elsewhere, LAPSED_AT());

    const res = await admin.rpc("claim_expired_seat_offer_notifications");
    expect(res.error).toBeNull();
    const ids = claimedSeatOfferExpiries
      .parse(res.data)
      .map((row) => row.participation_id);
    expect(ids).toContain(here);
    expect(ids).toContain(elsewhere);
  });

  /**
   * The scoped mode, and the security boundary behind it. A family-triggered
   * observation arrives on a credential naming exactly one participation — an
   * emailed link whose signature never expires, or a session that has just
   * proved ownership of that row — so it may claim that row and nothing else. A
   * global claim behind a link that never stops validating is a permanent,
   * unthrottled trigger for a platform-wide write.
   */
  it("claims only the named row, leaving another product's lapsed offer alone", async () => {
    const named = await queue(P_CLUB, TEST_IDS.GAMER);
    await stamp(named, LAPSED_AT());
    const stranger = await queue(P_DASHBOARD, TEST_IDS.GAMER);
    await stamp(stranger, LAPSED_AT());

    const res = await admin.rpc("claim_expired_seat_offer_notifications", {
      p_participation_id: named,
    });
    expect(res.error).toBeNull();
    const claimed = claimedSeatOfferExpiries.parse(res.data);
    expect(claimed.map((row) => row.participation_id)).toEqual([named]);

    expect((await readRow(named))!.seat_offer_expiry_notified_at).not.toBeNull();
    // The other family's offer is still un-notified, waiting for somebody
    // entitled to observe the whole platform.
    expect(
      (await readRow(stranger))!.seat_offer_expiry_notified_at,
    ).toBeNull();
  });

  /**
   * Silence costs the place in line, and the claim is where it is spent
   * (00208). Asserted as a REORDERING against a family who was behind, because
   * that is the only form the cost has: a lone row's `waitlisted_at` moving
   * proves a write happened, while the pair proves the queue can now make
   * progress past a family who stopped reading their mail. Without it the same
   * silent family is asked first again on the next seat, and everybody behind
   * waits another full window for an answer that never comes.
   *
   * The two offer stamps are checked as survivors in the same case, because
   * they are what the cost is NOT allowed to take with it: the offer stamp is
   * what the emailed link compares against, so clearing it here would make the
   * late decline unanswerable and would leave the landing page unable to tell a
   * lapsed link from a spent one.
   */
  it("moves a silent family behind the one that was queued after them", async () => {
    const silent = await queue(P_CLUB, TEST_IDS.GAMER);
    const behind = await queue(P_CLUB, TEST_IDS.GAMER_2);
    // Explicit positions rather than insertion order: `queue` stamps `now()`
    // for both, and two rows written in the same millisecond would make the
    // starting order the thing under test rather than the assumption.
    await setQueuePosition(silent, new Date(Date.now() - 7_200_000));
    await setQueuePosition(behind, new Date(Date.now() - 3_600_000));

    const sentAt = await stamp(silent, LAPSED_AT());

    const silentBefore = (await readRow(silent))!.waitlisted_at!;
    const behindBefore = (await readRow(behind))!.waitlisted_at!;
    expect(new Date(silentBefore).getTime()).toBeLessThan(
      new Date(behindBefore).getTime(),
    );

    const res = await admin.rpc("claim_expired_seat_offer_notifications", {
      p_participation_id: silent,
    });
    expect(res.error).toBeNull();
    expect(
      claimedSeatOfferExpiries.parse(res.data).map((row) => row.participation_id),
    ).toEqual([silent]);

    const after = (await readRow(silent))!;
    const other = (await readRow(behind))!;
    // The whole point: the order has flipped.
    expect(new Date(after.waitlisted_at!).getTime()).toBeGreaterThan(
      new Date(other.waitlisted_at!).getTime(),
    );
    // And only the claimed row moved — the claim's scope governs this write
    // exactly as it governs the notification mark.
    expect(other.waitlisted_at).toBe(behindBefore);

    // Still queued, still holding the offer it was invited on, and now marked
    // as reported.
    expect(after.status).toBe("waitlisted");
    expect(after.seat_offer_sent_at).toBe(sentAt);
    expect(after.seat_offer_expiry_notified_at).not.toBeNull();
  });

  /**
   * Scoping narrows the set; it does not relax the predicate. A row named by a
   * caller whose offer is still live is not something anybody has failed to
   * answer, so there is nothing to claim.
   */
  it("claims nothing when the named row has not lapsed", async () => {
    const live = await queue(P_CLUB, TEST_IDS.GAMER);
    await stamp(live, LIVE_AT());

    const res = await admin.rpc("claim_expired_seat_offer_notifications", {
      p_participation_id: live,
    });
    expect(res.error).toBeNull();
    expect(claimedSeatOfferExpiries.parse(res.data)).toEqual([]);
    expect((await readRow(live))!.seat_offer_expiry_notified_at).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The constraints, and the transitions that have to respect them
  // -------------------------------------------------------------------------

  it("refuses an offer stamp on anything but a waitlisted row", async () => {
    const participation = await queue(P_CLUB);
    await admin
      .from("participations")
      .update({ status: "active", waitlisted_at: null, group_id: GROUP_CLUB })
      .eq("id", participation);

    const res = await admin
      .from("participations")
      .update({ seat_offer_sent_at: new Date().toISOString() })
      .eq("id", participation);
    expect(res.error?.code).toBe("23514");
  });

  it("refuses a notification stamp with no offer behind it", async () => {
    const participation = await queue(P_CLUB);
    const res = await admin
      .from("participations")
      .update({ seat_offer_expiry_notified_at: new Date().toISOString() })
      .eq("id", participation);
    expect(res.error?.code).toBe("23514");
  });

  /**
   * An admin dragging an invited row into a group is honouring that offer by
   * hand, so the offer ends — and the clear is not optional: the CHECK above
   * would refuse the promotion outright if the stamp were left behind.
   */
  it("promote_from_waitlist clears the offer it is honouring", async () => {
    const participation = await queue(P_CLUB);
    await stamp(participation, LIVE_AT(), null);

    const res = await adminUser.rpc("promote_from_waitlist", {
      p_participation_id: participation,
      p_group_id: GROUP_CLUB,
    });
    expect(res.error).toBeNull();
    expect(promoteFromWaitlistRpcResult.parse(res.data).kind).toBe("promoted");

    expect(await readRow(participation)).toMatchObject({
      status: "active",
      seat_offer_sent_at: null,
      seat_offer_expiry_notified_at: null,
    });
  });

  // -------------------------------------------------------------------------
  // The two readers this migration changed
  // -------------------------------------------------------------------------

  it("the groups snapshot carries the offer stamps on the waitlist arm", async () => {
    const offered = await queue(P_CLUB, TEST_IDS.GAMER);
    const sentAt = await stamp(offered, LIVE_AT());
    const unoffered = await queue(P_CLUB, TEST_IDS.GAMER_2);

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: P_CLUB,
    });
    expect(res.error).toBeNull();

    const snapshot = productGroupsSnapshot.parse(res.data);
    const withOffer = snapshot.waitlist.find((p) => p.id === offered)!;
    const without = snapshot.waitlist.find((p) => p.id === unoffered)!;
    expect(withOffer.seat_offer_sent_at).toBe(sentAt);
    expect(withOffer.seat_offer_expiry_notified_at).toBeNull();
    // Null rather than absent: the schema requires the key on every arm, which
    // is what keeps the three shapes one shape.
    expect(without.seat_offer_sent_at).toBeNull();
  });

  it("an active chip carries the offer keys as nulls, so all three arms are one shape", async () => {
    const seated = await queue(P_CLUB);
    await admin
      .from("participations")
      .update({ status: "active", waitlisted_at: null, group_id: GROUP_CLUB })
      .eq("id", seated);

    const res = await adminUser.rpc("get_product_groups_with_details", {
      p_product_id: P_CLUB,
    });
    const snapshot = productGroupsSnapshot.parse(res.data);
    const chip = snapshot.groups
      .flatMap((group) => group.participations)
      .find((p) => p.id === seated)!;
    expect(chip.seat_offer_sent_at).toBeNull();
    expect(chip.seat_offer_expiry_notified_at).toBeNull();
  });

  /**
   * The attention queue asks whether there is something for an admin to DO. A
   * queue beside open seats is a job; a queue beside open seats that have all
   * been offered is a wait. The flag comes back on its own when an offer
   * lapses, which is the whole reason the count is derived rather than stored.
   */
  it("the dashboard stops flagging a waitlist once every open seat is offered", async () => {
    const first = await queue(P_DASHBOARD, TEST_IDS.GAMER);
    const second = await queue(P_DASHBOARD, TEST_IDS.GAMER_2);

    async function waitlistItem() {
      const res = await adminUser.rpc("get_admin_dashboard");
      expect(res.error).toBeNull();
      const snapshot = adminDashboardSnapshot.parse(res.data);
      return snapshot.attention_products.find((p) => p.id === P_DASHBOARD);
    }

    // Two open seats, two queueing, nobody asked.
    expect((await waitlistItem())?.waitlist).toMatchObject({
      waitlist_count: 2,
      open_seats: 2,
      live_offer_count: 0,
    });

    // One asked: one seat still needs an admin.
    await stamp(first, LIVE_AT());
    expect((await waitlistItem())?.waitlist).toMatchObject({
      open_seats: 2,
      live_offer_count: 1,
    });

    // Both asked: nothing to do, and the waitlist flag was this product's only
    // issue, so it leaves the list entirely.
    await stamp(second, LIVE_AT());
    expect(await waitlistItem()).toBeUndefined();

    // The first offer lapses and the job comes back.
    await stamp(first, LAPSED_AT());
    expect((await waitlistItem())?.waitlist).toMatchObject({
      open_seats: 2,
      live_offer_count: 1,
    });
  });
});
