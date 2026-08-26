import { describe, expect, it } from "vitest";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import {
  seatOfferRemaining,
  seatOfferState,
} from "@/lib/seat-offer-state";

/**
 * The one piece of arithmetic two surfaces share.
 *
 * The admin's waitlist card and the family's own card both derive an offer's
 * standing from a single stored stamp, and a millisecond of disagreement
 * between them is a family reading "three days left" on a seat the panel beside
 * it already calls expired. Nothing here touches a clock of its own: `now` is
 * an argument, which is what makes the two ends reproducible and what keeps the
 * server render and the first client render from disagreeing.
 */

const SENT = "2026-08-20T09:00:00.000Z";
const SENT_MS = Date.parse(SENT);
const DEADLINE_MS = SENT_MS + SEAT_OFFER_WINDOW_MS;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("seatOfferState", () => {
  it("reads no stamp as no offer", () => {
    expect(seatOfferState(null, new Date(SENT_MS))).toEqual({ kind: "none" });
  });

  it("reads an unparseable stamp as no offer rather than an invalid date", () => {
    // A `timestamptz` column cannot realistically produce this, and the point
    // is what happens if it somehow does: the alternative to answering `none`
    // is a NaN deadline formatted into a parent's card.
    expect(seatOfferState("not a date", new Date(SENT_MS))).toEqual({
      kind: "none",
    });
  });

  it("puts the deadline exactly one window past the stamp", () => {
    const state = seatOfferState(SENT, new Date(SENT_MS));
    expect(state.kind).toBe("live");
    if (state.kind !== "live") return;
    expect(state.deadline.getTime()).toBe(DEADLINE_MS);
    expect(state.sentAt.getTime()).toBe(SENT_MS);
    expect(state.remainingMs).toBe(SEAT_OFFER_WINDOW_MS);
  });

  it("is live a millisecond before the deadline and expired on it", () => {
    // The boundary instant belongs to the expired side, matching the database's
    // `sent_at + interval '5 days' > now()`. If the two ever disagreed here, a
    // family would meet Accept buttons the RPC was about to refuse.
    expect(seatOfferState(SENT, new Date(DEADLINE_MS - 1)).kind).toBe("live");
    expect(seatOfferState(SENT, new Date(DEADLINE_MS)).kind).toBe("expired");
    expect(seatOfferState(SENT, new Date(DEADLINE_MS + 1)).kind).toBe("expired");
  });

  it("keeps the deadline on an expired offer, so it can still be stated", () => {
    const state = seatOfferState(SENT, new Date(DEADLINE_MS + DAY));
    expect(state.kind).toBe("expired");
    if (state.kind !== "expired") return;
    expect(state.deadline.getTime()).toBe(DEADLINE_MS);
  });
});

describe("seatOfferRemaining", () => {
  /**
   * The buckets exist so the number does not tick: the shared render clock
   * advances every thirty seconds, and a value that repainted on that beat
   * would be a change on data's own schedule in a row of drag handles.
   */

  it("floors days rather than rounding them", () => {
    // Fifty-nine hours is two days and change. Rounding would promise three,
    // which is a day the deadline does not have.
    expect(seatOfferRemaining(59 * HOUR)).toEqual({ unit: "days", value: 2 });
    expect(seatOfferRemaining(5 * DAY)).toEqual({ unit: "days", value: 5 });
  });

  it("switches to hours below a day, and floors those too", () => {
    expect(seatOfferRemaining(DAY)).toEqual({ unit: "days", value: 1 });
    expect(seatOfferRemaining(DAY - 1)).toEqual({ unit: "hours", value: 23 });
    expect(seatOfferRemaining(90 * 60 * 1000)).toEqual({
      unit: "hours",
      value: 1,
    });
  });

  it("stops counting inside the last hour", () => {
    // A wordless warning rather than a minute count: nobody is watching this
    // in real time, and minutes would tick.
    expect(seatOfferRemaining(HOUR)).toEqual({ unit: "hours", value: 1 });
    expect(seatOfferRemaining(HOUR - 1)).toEqual({ unit: "lastHour" });
    expect(seatOfferRemaining(1)).toEqual({ unit: "lastHour" });
  });
});
