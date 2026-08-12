import { describe, expect, it } from "vitest";
import {
  firstChargeAnchor,
  productLocalStartInstant,
} from "@/lib/stripe/first-charge-anchor";

/**
 * The one decision behind deferred billing: when Stripe raises the first
 * invoice for a club bought before it starts.
 *
 * Three things are being pinned. The **conversion** — a bare `start_date`
 * becomes product-local midnight, which is an offset question and therefore a
 * DST-sensitive one — the **clamp**, which exists because Stripe rejects a
 * `billing_cycle_anchor` later than the buyer's next natural billing date and
 * is the reason an early buyer is charged before their club begins, and the
 * **floor**, which exists because the anchor is computed at session creation but
 * read at session completion, up to half an hour later.
 */

const HELSINKI = "Europe/Helsinki";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe("productLocalStartInstant", () => {
  it("resolves midnight in the product's zone, not the runtime's", () => {
    // Helsinki is UTC+2 in February, so local midnight is 22:00 the day before.
    expect(
      productLocalStartInstant("2027-02-10", HELSINKI).toISOString(),
    ).toBe("2027-02-09T22:00:00.000Z");
  });

  it("follows the zone across a DST transition rather than assuming an offset", () => {
    // Finland moves to UTC+3 on the last Sunday of March, so a start date on
    // either side of it converts to a different UTC hour. This is the whole
    // reason the conversion is a library call and not arithmetic: a fixed
    // "midnight minus two hours" would be an hour wrong all summer.
    expect(
      productLocalStartInstant("2027-03-27", HELSINKI).toISOString(),
    ).toBe("2027-03-26T22:00:00.000Z");
    expect(
      productLocalStartInstant("2027-03-29", HELSINKI).toISOString(),
    ).toBe("2027-03-28T21:00:00.000Z");
  });
});

describe("firstChargeAnchor", () => {
  it("anchors a near-future club at product-local midnight of its start date", () => {
    const now = new Date("2027-02-01T09:00:00Z");
    const anchor = firstChargeAnchor("2027-02-10", HELSINKI, now);
    expect(anchor?.toISOString()).toBe("2027-02-09T22:00:00.000Z");
  });

  it("clamps a far-future club to 28 days minus an hour from now", () => {
    // Stripe refuses an anchor past the next natural billing date (~a month),
    // so a parent buying eight weeks early is charged about four weeks from
    // today — before the club starts. Deliberate, and displayed honestly.
    const now = new Date("2027-02-01T09:00:00Z");
    const anchor = firstChargeAnchor("2027-04-01", HELSINKI, now);
    expect(anchor?.getTime()).toBe(now.getTime() + 28 * DAY_MS - HOUR_MS);
  });

  it("takes the earlier of the two, so the ceiling never pushes a charge later", () => {
    const now = new Date("2027-02-01T09:00:00Z");
    const ceiling = now.getTime() + 28 * DAY_MS - HOUR_MS;
    for (const startDate of ["2027-02-03", "2027-02-20", "2027-06-01"]) {
      const anchor = firstChargeAnchor(startDate, HELSINKI, now);
      expect(anchor).not.toBeNull();
      expect(anchor!.getTime(), startDate).toBeLessThanOrEqual(ceiling);
      expect(anchor!.getTime(), startDate).toBeLessThanOrEqual(
        productLocalStartInstant(startDate, HELSINKI).getTime(),
      );
    }
  });

  it("defers nothing for a club with no start date", () => {
    expect(firstChargeAnchor(null, HELSINKI, new Date("2027-02-01T09:00:00Z")))
      .toBeNull();
  });

  it("defers nothing for a club starting today or already running", () => {
    // "Today" is the launch-day club the old form pinned every consumer club
    // to, and it must keep charging at checkout, byte for byte as before. Local
    // midnight on 1 February has already passed by 09:00 UTC that day.
    const now = new Date("2027-02-01T09:00:00Z");
    expect(firstChargeAnchor("2027-02-01", HELSINKI, now)).toBeNull();
    expect(firstChargeAnchor("2026-09-01", HELSINKI, now)).toBeNull();
  });

  it("defers nothing for a start inside the one-hour floor", () => {
    // The anchor is computed when the Checkout Session is *created*, but the
    // subscription it parameterises is created when the session is completed —
    // up to half an hour later. An anchor half an hour out would therefore be in
    // the past by the time Stripe reads it, and rejected at the payment page
    // with the parent's card already in hand. Inside the floor we charge at
    // checkout instead, which for a club starting within the hour is also the
    // honest answer.
    const now = new Date("2027-01-31T21:30:00Z"); // 23:30 Helsinki, 31 Jan
    expect(firstChargeAnchor("2027-02-01", HELSINKI, now)).toBeNull();
  });

  it("defers for a start comfortably outside the floor", () => {
    // Six hours out: past the floor with room to spare, so the club's own start
    // instant is the anchor and nothing falls back to an immediate charge.
    const now = new Date("2027-01-31T16:00:00Z"); // 18:00 Helsinki, 31 Jan
    expect(firstChargeAnchor("2027-02-01", HELSINKI, now)?.toISOString()).toBe(
      "2027-01-31T22:00:00.000Z",
    );
  });

  it("anchors correctly for a start date on the far side of a DST change", () => {
    // Bought in the winter half, starting in the summer half: the anchor is the
    // real instant of local midnight on the start date, not "the same UTC hour
    // as today's midnight". Inside the clamp window, so the start date wins.
    const now = new Date("2027-03-20T09:00:00Z");
    expect(firstChargeAnchor("2027-03-29", HELSINKI, now)?.toISOString()).toBe(
      "2027-03-28T21:00:00.000Z",
    );
  });

  it("defers nothing for a stored date that is not a date", () => {
    expect(
      firstChargeAnchor("not-a-date", HELSINKI, new Date("2027-02-01T09:00:00Z")),
    ).toBeNull();
  });
});
