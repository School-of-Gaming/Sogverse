import { describe, it, expect } from "vitest";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  earlierBoundary,
  endDateToCutoff,
  enumerateRowOccurrences,
  getCurrentInProgressOccurrence,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import { isVoiceWindowOpen } from "@/lib/voice-window";

/**
 * Forward occurrence enumeration and the voice window around it — the
 * behaviours every family and gedu surface derives its Join button and its
 * session list from.
 *
 * These cases were written against the per-occurrence dashboard adapter that
 * used to sit on top of these helpers. That adapter is gone; the helpers are
 * not, and each case below pins a branch that is still live and still the only
 * thing standing between a family and a session card that does not exist. They
 * are re-pointed at the helpers directly rather than at any one caller, because
 * the guarantee belongs to the shared arithmetic — the family roll-up, the
 * family feed, the gedu roll-up and the voice-window resolver all inherit it,
 * and a test aimed at one of them would leave the other three unpinned.
 *
 * Three of the five are regressions with a real incident behind them, recorded
 * in the case comments. The other two pin boundaries that are load-bearing
 * precisely because nothing else in the suite reaches them.
 */

const HELSINKI = "Europe/Helsinki";
const WINDOW_CLOSE_MS = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

/**
 * The Mon/Wed/Fri 10:00–13:00 camp both date-boundary regressions were found
 * on. Its shape is the point: the slot weekday matches the day the phantom
 * appeared on, so a walk that ignores the product's own dates has something
 * plausible to emit rather than nothing.
 */
const CAMP_SLOTS = [
  { weekday: 0, startTime: "10:00", durationMinutes: 180 }, // Mon
  { weekday: 2, startTime: "10:00", durationMinutes: 180 }, // Wed
  { weekday: 4, startTime: "10:00", durationMinutes: 180 }, // Fri
];

describe("a product's own dates bound the occurrence walk", () => {
  it("emits nothing before start_date, even mid-slot on a matching weekday", () => {
    // Regression: a camp ran Mon/Wed/Fri 10:00–13:00 Europe/Helsinki from
    // 2026-05-26. Opening the dashboard on Fri 2026-05-15 produced an "in
    // progress" card for today's 10:00 slot, because the prev-week look-back
    // ignored start_date: stepping back a week from Fri 11:30 lands on Fri
    // 10:30, whose next Friday slot is *today* at 10:00 — inside its window.
    //
    // The source guards this twice over, and deliberately: an early return
    // when the product has not opened, and an `afterStart` check on the
    // occurrence the look-back found. They are redundant by construction, so
    // breaking either one alone leaves this case passing — the other still
    // catches it. Breaking both together fails here, which is what the pair
    // is actually pinned by. Read that as defence in depth in the source, not
    // as slack in this test.
    //
    // The forward cursor is the separate, non-redundant half: it has to be
    // pinned to just before start_date rather than to `now`, or the walk
    // begins in the wrong week and the first emitted session is wrong.
    const startBoundary = startDateToCutoff("2026-05-26", HELSINKI);
    const endBoundary = endDateToCutoff("2026-06-25", HELSINKI);
    // Fri 2026-05-15, 11:30 Helsinki — squarely inside the *would-be*
    // 10:00–13:00 window if start_date were not honoured.
    const now = new Date("2026-05-15T08:30:00Z");

    const occurrences = enumerateRowOccurrences({
      slots: CAMP_SLOTS,
      timezone: HELSINKI,
      now,
      startBoundary,
      endBoundary,
      cap: 5,
      windowCloseMs: WINDOW_CLOSE_MS,
    });

    // May 26 is a Tuesday, so the camp's first real session is Wed May 27 at
    // 10:00 Helsinki — 07:00Z, the clocks having gone to EEST.
    expect(occurrences[0]?.start.toISOString()).toBe("2026-05-27T07:00:00.000Z");
    expect(
      occurrences.every((o) => o.start.getTime() >= startBoundary!.getTime()),
    ).toBe(true);
    // And the specific claim the incident was about: nothing is in progress
    // before the product has opened.
    expect(
      getCurrentInProgressOccurrence({
        slot: CAMP_SLOTS[2],
        timezone: HELSINKI,
        now,
        startBoundary,
        endBoundary,
        windowCloseMs: WINDOW_CLOSE_MS,
      }),
    ).toBeNull();
  });

  it("emits nothing after end_date, even mid-slot on a matching weekday", () => {
    // The symmetric regression, and the one the gedu roll-up's own end-date
    // case never reaches: it takes a `now` past the end with the slot weekday
    // matching *today*, which is the only way to enter the in-progress
    // branch's `beforeEnd` clause at all.
    const startBoundary = startDateToCutoff("2026-06-22", HELSINKI);
    const endBoundary = endDateToCutoff("2026-07-01", HELSINKI);
    // Fri 2026-07-03, 11:00 Helsinki — inside the would-be window, two days
    // after the camp's last legitimate session on Wed Jul 1.
    const now = new Date("2026-07-03T08:00:00Z");

    expect(
      enumerateRowOccurrences({
        slots: CAMP_SLOTS,
        timezone: HELSINKI,
        now,
        startBoundary,
        endBoundary,
        cap: 5,
        windowCloseMs: WINDOW_CLOSE_MS,
      }),
    ).toEqual([]);

    expect(
      getCurrentInProgressOccurrence({
        slot: CAMP_SLOTS[2],
        timezone: HELSINKI,
        now,
        startBoundary,
        endBoundary,
        windowCloseMs: WINDOW_CLOSE_MS,
      }),
    ).toBeNull();
  });
});

describe("a session stops being in progress when its window closes", () => {
  it("drops an occurrence whose voice window closed, and moves to the next", () => {
    // A Wednesday 15:00–16:00 slot, viewed at 16:10. The window closed at
    // 16:05, so the finished session must not be carried as in-progress — the
    // guard is `windowCloseMs`, and without it a family would sit looking at a
    // lit Join for a room that had already emptied.
    const slot = { weekday: 2, startTime: "15:00", durationMinutes: 60 };
    const now = new Date("2026-02-25T16:10:00Z");

    const occurrences = enumerateRowOccurrences({
      slots: [slot],
      timezone: "UTC",
      now,
      startBoundary: null,
      endBoundary: null,
      cap: 2,
      windowCloseMs: WINDOW_CLOSE_MS,
    });

    expect(occurrences[0]?.start.toISOString()).toBe("2026-03-04T15:00:00.000Z");
    expect(
      getCurrentInProgressOccurrence({
        slot,
        timezone: "UTC",
        now,
        startBoundary: null,
        endBoundary: null,
        windowCloseMs: WINDOW_CLOSE_MS,
      }),
    ).toBeNull();

    // The other side of the same boundary, so the case cannot pass by the walk
    // simply never reporting anything in progress: a minute before the window
    // closes, the finished session is still the one being pointed at.
    expect(
      getCurrentInProgressOccurrence({
        slot,
        timezone: "UTC",
        now: new Date("2026-02-25T16:04:00Z"),
        startBoundary: null,
        endBoundary: null,
        windowCloseMs: WINDOW_CLOSE_MS,
      })?.start.toISOString(),
    ).toBe("2026-02-25T15:00:00.000Z");
  });
});

describe("isVoiceWindowOpen pins both ends of the join window", () => {
  const start = new Date("2026-02-25T15:00:00Z");
  const end = new Date("2026-02-25T16:00:00Z");

  it("opens exactly on the lead-in and not a moment earlier", () => {
    // The lead-in is what lets a family arrive before the session rather than
    // exactly on it. Both sides are asserted because only the pair says
    // anything: a window that is always open passes the first alone.
    expect(isVoiceWindowOpen(start, end, new Date("2026-02-25T14:54:30Z"))).toBe(
      false,
    );
    expect(isVoiceWindowOpen(start, end, new Date("2026-02-25T14:55:00Z"))).toBe(
      true,
    );
  });

  it("closes exactly on the trailing grace and not a moment later", () => {
    // The grace is what keeps the room from shutting under a group that ran
    // over. It is a half-open interval: open at the lead-in instant, closed at
    // the grace instant.
    expect(isVoiceWindowOpen(start, end, new Date("2026-02-25T16:04:59Z"))).toBe(
      true,
    );
    expect(isVoiceWindowOpen(start, end, new Date("2026-02-25T16:05:00Z"))).toBe(
      false,
    );
  });
});

describe("earlierBoundary clamps a cancelled enrollment", () => {
  it("picks the subscription end when it falls before the product's own end", () => {
    // The cancellation clamp, and an acceptance criterion of the family
    // dashboards: a canceling club paid through Mar 11 must render nothing
    // past that, even though the product itself runs to Mar 31. The whole
    // guarantee is that the *earlier* bound wins, so both orders are asserted
    // — a helper that simply returned its first argument would satisfy one.
    const productEnd = endDateToCutoff("2026-03-31", "UTC")!;
    const subEnd = new Date("2026-03-11T23:59:59Z");

    expect(earlierBoundary(productEnd, subEnd)).toBe(subEnd);
    expect(earlierBoundary(subEnd, productEnd)).toBe(subEnd);
  });

  it("falls through to whichever bound exists, and to none when neither does", () => {
    const bound = new Date("2026-03-11T00:00:00Z");

    expect(earlierBoundary(null, bound)).toBe(bound);
    expect(earlierBoundary(bound, null)).toBe(bound);
    expect(earlierBoundary(null, null)).toBeNull();
  });

  it("stops the walk at the subscription end rather than the product end", () => {
    // The clamp where it actually bites: the same club, walked. Nothing past
    // the paid window may appear on a card, in the sort, or in the feed.
    const now = new Date("2026-02-25T08:00:00Z");
    const productEnd = endDateToCutoff("2026-03-31", "UTC");
    const subEnd = new Date("2026-03-11T23:59:59Z");

    const occurrences = enumerateRowOccurrences({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }],
      timezone: "UTC",
      now,
      startBoundary: null,
      endBoundary: earlierBoundary(productEnd, subEnd),
      cap: Infinity,
      windowCloseMs: WINDOW_CLOSE_MS,
    });

    expect(occurrences.map((o) => o.start.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z",
      "2026-03-04T15:00:00.000Z",
      "2026-03-11T15:00:00.000Z",
    ]);
  });
});
