import { describe, it, expect } from "vitest";

import { expandUpcomingSessions } from "@/lib/upcoming-sessions";
import type { MyUpcomingSessionRow } from "@/services/participations";

// All test data is deliberately scheduled in UTC where possible — that way
// the wall-clock weekday/start_time === UTC, and the assertions read as the
// same string we wrote. The DST test uses Europe/Helsinki specifically to
// exercise the timezone-aware path.

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const GAMER_ID = "22222222-2222-2222-2222-222222222222";
const GROUP_ID = "33333333-3333-3333-3333-333333333333";

function makeRow(overrides: Partial<MyUpcomingSessionRow> = {}): MyUpcomingSessionRow {
  return {
    gamer: { id: GAMER_ID, firstName: "Alex" },
    product: {
      id: PRODUCT_ID,
      type: "consumer_club",
      timezone: "UTC",
      startDate: null,
      endDate: null,
      padletUrl: "https://padlet.example/foo",
      isRemote: true,
      translations: [
        {
          locale: "en",
          name: "Minecraft Club",
          short_description: "",
          long_description: null,
          product_id: PRODUCT_ID,
          created_at: "",
          updated_at: "",
        },
      ],
      ...(overrides.product ?? {}),
    },
    groupId: overrides.groupId === undefined ? GROUP_ID : overrides.groupId,
    slots: overrides.slots ?? [
      { weekday: 2, startTime: "15:00", durationMinutes: 120 }, // Wed 15:00 UTC
    ],
    paymentProblem: false,
    subscriptionEndsAt: null,
    ...overrides,
  };
}

describe("expandUpcomingSessions", () => {
  it("returns [] when there are no rows", () => {
    expect(expandUpcomingSessions([], new Date("2026-02-25T12:00:00Z"), "en")).toEqual([]);
  });

  it("skips rows with zero slots", () => {
    const row = makeRow({ slots: [] });
    expect(
      expandUpcomingSessions([row], new Date("2026-02-25T12:00:00Z"), "en"),
    ).toEqual([]);
  });

  it("caps an open-ended product at 8 occurrences across all its slots", () => {
    const row = makeRow({
      slots: [
        { weekday: 1, startTime: "15:00", durationMinutes: 60 }, // Tue
        { weekday: 3, startTime: "15:00", durationMinutes: 60 }, // Thu
      ],
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"), // Wed morning
      "en",
    );
    expect(out).toHaveLength(8);
    // 8 sessions of Tue+Thu starting Thu 2026-02-26 = 4 calendar weeks.
    // First is the immediate Thu, last is the Tue 4 weeks past the first Tue.
    expect(out[0].sessionStart.toISOString()).toBe("2026-02-26T15:00:00.000Z");
    expect(out[7].sessionStart.toISOString()).toBe("2026-03-24T15:00:00.000Z");
  });

  it("for end-dated products, emits all occurrences up to and including end_date", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "camp",
        timezone: "UTC",
        startDate: null,
        endDate: "2026-03-08", // inclusive — a session ON 2026-03-08 must land
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Spring Camp",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 6, startTime: "10:00", durationMinutes: 60 }], // Sun
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"), // Wed
      "en",
    );
    // Sundays in range: 2026-03-01, 2026-03-08 (inclusive)
    expect(out.map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-03-01T10:00:00.000Z",
      "2026-03-08T10:00:00.000Z",
    ]);
  });

  it("does not cap end-dated products at 8 — emits more when the range is long enough", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "UTC",
        startDate: null,
        endDate: "2026-05-31", // ~13 weeks past now
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Long Run",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    // Wednesdays 2026-02-25 (today, 15:00) through 2026-05-27 inclusive = 14
    // weeks. With end_date set we must exceed the 8-cap that applies only to
    // open-ended products.
    expect(out.length).toBeGreaterThan(8);
  });

  it("merges and sorts sessions across multiple participations", () => {
    const rowA = makeRow({
      gamer: { id: GAMER_ID, firstName: "Alex" },
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed 15:00
    });
    const rowB = makeRow({
      gamer: { id: "33333333-3333-3333-3333-333333333333", firstName: "Bobby" },
      slots: [{ weekday: 3, startTime: "10:00", durationMinutes: 60 }], // Thu 10:00
    });
    const out = expandUpcomingSessions(
      [rowA, rowB],
      new Date("2026-02-23T08:00:00Z"), // Monday
      "en",
    );
    expect(out.slice(0, 4).map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z", // Wed (Alex)
      "2026-02-26T10:00:00.000Z", // Thu (Bobby)
      "2026-03-04T15:00:00.000Z", // Wed+1
      "2026-03-05T10:00:00.000Z", // Thu+1
    ]);
  });

  it("keeps an in-progress session at the top of the list (window still open)", () => {
    const row = makeRow({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed 15:00-16:00
    });
    // `now` lands at 15:30 — the session that started at 15:00 is still
    // running, voice window is still open, and it should sort ahead of next
    // week's same-weekday occurrence.
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T15:30:00Z"),
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-02-25T15:00:00.000Z");
    expect(out[0].voiceIsOpen).toBe(true);
  });

  it("drops a session whose voice window has already closed", () => {
    const row = makeRow({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // ends 16:00
    });
    // SESSION_WINDOW_AFTER_MINUTES = 5, so the window closes at 16:05. Sit
    // at 16:10 and the in-progress entry must be gone.
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T16:10:00Z"),
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-03-04T15:00:00.000Z");
  });

  it("flips voiceIsOpen on the SESSION_WINDOW_BEFORE boundary", () => {
    const row = makeRow({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }],
    });
    // Window opens at 14:55. At 14:54:30 the soonest session is still locked,
    // at 14:55:00 it must report open.
    const closed = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T14:54:30Z"),
      "en",
    );
    const open = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T14:55:00Z"),
      "en",
    );
    expect(closed[0].voiceIsOpen).toBe(false);
    expect(open[0].voiceIsOpen).toBe(true);
  });

  it("resolves the product name against the requested locale, falling back to en", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "UTC",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Minecraft Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
          {
            locale: "fi",
            name: "Minecraft-kerho",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    });
    const now = new Date("2026-02-25T08:00:00Z");
    expect(expandUpcomingSessions([row], now, "fi")[0].productName).toBe(
      "Minecraft-kerho",
    );
    expect(expandUpcomingSessions([row], now, "sv")[0].productName).toBe(
      "Minecraft Club",
    );
  });

  it("wires voiceHref to the shared group voice route keyed on groupId for remote products", () => {
    const row = makeRow();
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out[0].voiceHref).toBe(`/voice/group/${GROUP_ID}`);
  });

  it("leaves voiceHref as '#' for unassigned participations (groupId null)", () => {
    // Per redesign §4.10, unassigned participations don't get voice access.
    // The button stays inert and the card relies on the (always-false)
    // voiceIsOpen check to render the locked state honestly.
    const row = makeRow({ groupId: null });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out[0].voiceHref).toBe("#");
  });

  it("propagates paymentProblem to every emitted occurrence", () => {
    const now = new Date("2026-02-25T08:00:00Z");
    const flagged = expandUpcomingSessions(
      [makeRow({ paymentProblem: true })],
      now,
      "en",
    );
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((s) => s.paymentProblem === true)).toBe(true);

    const healthy = expandUpcomingSessions([makeRow()], now, "en");
    expect(healthy.every((s) => s.paymentProblem === false)).toBe(true);
  });

  it("flags unassigned participations as awaiting; assigned ones are not", () => {
    const unassigned = expandUpcomingSessions(
      [makeRow({ groupId: null })],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    const assigned = expandUpcomingSessions(
      [makeRow()], // groupId defaults to GROUP_ID
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(unassigned.every((s) => s.awaiting)).toBe(true);
    expect(assigned.every((s) => s.awaiting)).toBe(false);
  });

  it("reports the window open for an in-progress awaiting session", () => {
    // `voiceIsOpen` tracks the window, not join-ability: an unplaced gamer's
    // session still goes live on schedule (the card keeps its live styling),
    // so the flag is true mid-session. Join-gating lives in the button,
    // which swaps the CTA for a disabled "matching" state when `awaiting`.
    const row = makeRow({
      groupId: null,
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }],
    });
    // 15:30 UTC is mid-session.
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T15:30:00Z"),
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-02-25T15:00:00.000Z");
    expect(out[0].awaiting).toBe(true);
    expect(out[0].voiceIsOpen).toBe(true);
  });

  it("leaves voiceHref as '#' for in-person products (no voice room)", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "UTC",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: false,
        translations: [
          {
            locale: "en",
            name: "In-person Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out[0].voiceHref).toBe("#");
  });

  it("falls back to '#' for the reports link when the product has no Padlet URL", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "UTC",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Padlet-less Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out[0].reportsHref).toBe("#");
  });

  it("does not emit phantom sessions before start_date for a camp whose slot weekday matches today", () => {
    // Regression: Kyle's Tech Camp ran Mon/Wed/Fri 10:00–13:00 Europe/Helsinki
    // with start_date 2026-05-26. Viewing the parent dashboard on Fri
    // 2026-05-15 produced an "in progress" card for today's 10:00 slot
    // because the prev-week look-back ignored start_date.
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "camp",
        timezone: "Europe/Helsinki",
        startDate: "2026-05-26",
        endDate: "2026-06-25",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Kyle's Tech Camp",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [
        { weekday: 0, startTime: "10:00", durationMinutes: 180 }, // Mon
        { weekday: 2, startTime: "10:00", durationMinutes: 180 }, // Wed
        { weekday: 4, startTime: "10:00", durationMinutes: 180 }, // Fri
      ],
    });
    // Fri 2026-05-15 at 11:30 Helsinki local — well within the *would-be*
    // 10:00–13:00 voice window if start_date weren't being honoured.
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-05-15T08:30:00Z"),
      "en",
    );
    // First emitted session must be the actual camp opener (Tue May 26 isn't
    // a Mon/Wed/Fri, so the first matching slot is Wed May 27 at 10:00
    // Helsinki = 07:00Z during EEST).
    expect(out[0].sessionStart.toISOString()).toBe("2026-05-27T07:00:00.000Z");
    expect(out[0].voiceIsOpen).toBe(false);
  });

  it("does not emit phantom sessions after end_date for a camp whose slot weekday matches today", () => {
    // Regression: symmetric to the start_date case above. Tech Camp runs
    // Mon/Wed/Fri 10:00–13:00 Europe/Helsinki with end_date 2026-07-01 (Wed),
    // so the camp's last legitimate session was on the end_date itself.
    // Viewing the parent dashboard on Fri 2026-07-03 at 11:00 Helsinki used
    // to surface a phantom "in progress" card for today's 10:00 slot because
    // the prev-week look-back ignored end_date — the slot weekday matches
    // today and the voice window is still notionally open.
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "camp",
        timezone: "Europe/Helsinki",
        startDate: "2026-06-22",
        endDate: "2026-07-01",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Kyle's Tech Camp",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [
        { weekday: 0, startTime: "10:00", durationMinutes: 180 }, // Mon
        { weekday: 2, startTime: "10:00", durationMinutes: 180 }, // Wed
        { weekday: 4, startTime: "10:00", durationMinutes: 180 }, // Fri
      ],
    });
    // Fri 2026-07-03 at 11:00 Helsinki (EEST, UTC+3) = 08:00Z — squarely
    // inside the *would-be* 10:00–13:00 window if end_date weren't gated.
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-07-03T08:00:00Z"),
      "en",
    );
    expect(out).toEqual([]);
  });

  it("emits today's in-progress session on the DST-transition Wednesday", () => {
    // Regression: Europe/Helsinki goes EET (UTC+2) → EEST (UTC+3) on Sun
    // 2026-03-29. For a Wed 17:00 Helsinki slot, the wall-clock-to-UTC
    // offset on Wed Apr 1 differs from Wed Mar 25 by one hour. The
    // prev-week look-back used to back-step by 7×24h in UTC, which on this
    // week lands an hour past last Wednesday's slot start in local time —
    // so `getNextSessionStart` returns Mar 25's already-finished session
    // and the in-window check fails. Result: today's in-progress session
    // vanished from the dashboard for the duration of its voice window.
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "Europe/Helsinki",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Helsinki Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 2, startTime: "17:00", durationMinutes: 60 }],
    });
    // Wed 2026-04-01 14:30Z = 17:30 EEST local — 30 min into today's
    // 17:00–18:00 slot. Voice window is open (closes 18:05 local).
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-04-01T14:30:00Z"),
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-04-01T14:00:00.000Z");
    expect(out[0].voiceIsOpen).toBe(true);
  });

  it("respects the product's wall-clock timezone across DST", () => {
    // Europe/Helsinki goes EET → EEST on 2026-03-29 (UTC+2 → UTC+3).
    // Wednesday 17:00 *local* maps to:
    //   2026-03-25 17:00 EET  = 2026-03-25T15:00Z
    //   2026-04-01 17:00 EEST = 2026-04-01T14:00Z
    // A naïve UTC-based "+7 days" would emit 15:00Z both weeks — which would
    // mean 18:00 local in the second week. Verify date-fns-tz handled it.
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "Europe/Helsinki",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Helsinki Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 2, startTime: "17:00", durationMinutes: 60 }], // Wed 17:00 local
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-03-24T00:00:00Z"), // Tue, before both occurrences
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-03-25T15:00:00.000Z");
    expect(out[1].sessionStart.toISOString()).toBe("2026-04-01T14:00:00.000Z");
  });

  // --- Cancelled-subscription clamping (subscriptionEndsAt) ----------------

  it("clamps a canceling open-ended club to its subscription end, hiding later sessions", () => {
    // Open-ended weekly Wed club whose sub is canceling, paid through Mar 11.
    // Without the clamp this emits the usual 8; with it, only the occurrences
    // on or before the paid-through instant survive.
    const row = makeRow({
      subscriptionEndsAt: new Date("2026-03-11T23:59:59Z"),
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"), // Wed morning
      "en",
    );
    expect(out.map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z",
      "2026-03-04T15:00:00.000Z",
      "2026-03-11T15:00:00.000Z",
    ]);
  });

  it("lifts the 8-cap for a canceling open-ended club, emitting every session in the paid window", () => {
    // Two slots over ~5 weeks of remaining access = 10 occurrences. An
    // open-ended club is normally capped at 8, but a canceling sub gives a
    // real terminal date, so the parent should see all 10 (everything they
    // still paid for), not a truncated 8.
    const row = makeRow({
      subscriptionEndsAt: new Date("2026-03-31T23:59:59Z"),
      slots: [
        { weekday: 1, startTime: "15:00", durationMinutes: 60 }, // Tue
        { weekday: 3, startTime: "15:00", durationMinutes: 60 }, // Thu
      ],
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.length).toBeGreaterThan(8);
    expect(
      out.every(
        (s) => s.sessionStart.getTime() <= new Date("2026-03-31T23:59:59Z").getTime(),
      ),
    ).toBe(true);
  });

  it("clamps to the product end_date when it falls before the subscription end", () => {
    // Camp ends Mar 4; sub paid through Mar 31. The earlier bound (the camp's
    // own end date) must win.
    const row = makeRow({
      subscriptionEndsAt: new Date("2026-03-31T23:59:59Z"),
      product: {
        id: PRODUCT_ID,
        type: "camp",
        timezone: "UTC",
        startDate: null,
        endDate: "2026-03-04",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Short Camp",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z",
      "2026-03-04T15:00:00.000Z",
    ]);
  });

  it("clamps to the subscription end when it falls before the product end_date", () => {
    // End-dated club runs through Mar 31, but the sub is canceling and paid
    // only through Mar 11. The earlier bound (the subscription) must win.
    const row = makeRow({
      subscriptionEndsAt: new Date("2026-03-11T23:59:59Z"),
      product: {
        id: PRODUCT_ID,
        type: "consumer_club",
        timezone: "UTC",
        startDate: null,
        endDate: "2026-03-31",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Dated Club",
            short_description: "",
            long_description: null,
            product_id: PRODUCT_ID,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed
    });
    const out = expandUpcomingSessions(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z",
      "2026-03-04T15:00:00.000Z",
      "2026-03-11T15:00:00.000Z",
    ]);
  });

  it("attaches cancellation info to every card of a canceling sub and flags exactly the final session", () => {
    const now = new Date("2026-02-25T08:00:00Z");
    const subEnd = new Date("2026-03-11T23:59:59Z");
    const out = expandUpcomingSessions(
      [makeRow({ subscriptionEndsAt: subEnd })],
      now,
      "en",
    );
    expect(out.length).toBeGreaterThan(1);

    // Single participation, globally sorted → the last card is the final
    // session. Every card shares the same accessUntil + lastSessionStart.
    const finalStart = out[out.length - 1].sessionStart;
    expect(out.every((s) => s.cancellation?.accessUntil === subEnd)).toBe(true);
    expect(
      out.every(
        (s) =>
          s.cancellation?.lastSessionStart.getTime() === finalStart.getTime(),
      ),
    ).toBe(true);

    // Exactly one card — the latest — is flagged as the last session.
    const flagged = out.filter((s) => s.cancellation?.isLastSession);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].sessionStart.getTime()).toBe(finalStart.getTime());
  });

  it("attaches no cancellation info for a healthy (non-canceling) sub", () => {
    const out = expandUpcomingSessions(
      [makeRow()],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.cancellation === null)).toBe(true);
  });
});
