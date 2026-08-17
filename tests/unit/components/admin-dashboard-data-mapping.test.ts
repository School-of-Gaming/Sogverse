import { describe, it, expect } from "vitest";
import { buildAdminDashboardData } from "@/components/admin/dashboard/build-admin-dashboard-data";
import type {
  AdminDashboardAttentionProduct,
  AdminDashboardScheduleProduct,
  AdminDashboardSnapshot,
} from "@/types";

/**
 * The snapshot → page mapping, which is where every calendar decision on the
 * admin dashboard is actually made: which weeks can be stepped through, which
 * occurrences survive a holiday, which weekday a session lands on for the person
 * reading it, and what collapses into one line of the coming-up feed.
 *
 * The clock is pinned to a known Monday so a week's arithmetic has a fixed
 * answer, and the zones are chosen for what they disagree about: Helsinki and
 * New York change their clocks a week apart, which is the only way a
 * DST-crossing week is visible at all.
 */

const HELSINKI = "Europe/Helsinki";
const NEW_YORK = "America/New_York";
const LOS_ANGELES = "America/Los_Angeles";

/** Monday 17 August 2026, mid-morning in Helsinki. */
const NOW = new Date("2026-08-17T09:20:00+03:00");
const TODAY = "2026-08-17";

function scheduleProduct(
  overrides: Partial<AdminDashboardScheduleProduct> & { id: string },
): AdminDashboardScheduleProduct {
  return {
    product_type: "consumer_club",
    translations: [{ locale: "en", name: `Product ${overrides.id}` }],
    timezone: HELSINKI,
    start_date: "2026-08-10",
    end_date: null,
    seat_count: 12,
    active_count: 9,
    waitlist_count: 0,
    schedule_slots: [
      { weekday: 0, start_time: "17:00", duration_minutes: 90 },
    ],
    holidays: [],
    ...overrides,
  };
}

function attentionProduct(
  overrides: Partial<AdminDashboardAttentionProduct> & { id: string },
): AdminDashboardAttentionProduct {
  return {
    product_type: "consumer_club",
    translations: [{ locale: "en", name: `Product ${overrides.id}` }],
    unassigned_count: 0,
    groups_without_gedu: [],
    waitlist: null,
    missing_gedu_fee: false,
    missing_municipality_fee: false,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<AdminDashboardSnapshot> = {},
): AdminDashboardSnapshot {
  return {
    users: [
      { role: "admin", total: 4, verified: 4, certified: null },
      { role: "gedu", total: 19, verified: 17, certified: 12 },
      { role: "gamer", total: 342, verified: null, certified: null },
      { role: "customer", total: 214, verified: 191, certified: null },
    ],
    certification_queue: [],
    attention_products: [],
    schedule_products: [],
    ...overrides,
  };
}

function build(
  input: AdminDashboardSnapshot,
  viewerTimeZone = HELSINKI,
  now = NOW,
) {
  return buildAdminDashboardData({
    snapshot: input,
    locale: "en",
    viewerTimeZone,
    now,
  });
}

function week(data: ReturnType<typeof build>, weekStart: string) {
  const found = data.weeks.find((entry) => entry.weekStart === weekStart);
  if (found === undefined) {
    throw new Error(`No week ${weekStart} in [${data.weeks.map((w) => w.weekStart).join(", ")}]`);
  }
  return found;
}

describe("the users strip", () => {
  it("reads in the platform's own order, whatever order the RPC aggregated in", () => {
    const data = build(snapshot());
    expect(data.users.map((stat) => stat.role)).toEqual([
      "customer",
      "gamer",
      "gedu",
      "admin",
    ]);
  });
});

describe("the week window", () => {
  const data = build(snapshot());

  it("opens on the week containing today", () => {
    expect(data.weeks[data.currentWeekIndex].weekStart).toBe("2026-08-17");
  });

  it("offers only weeks lying wholly inside the snapshot's own window", () => {
    // The RPC sends [today - 30 days, today + 4 months); the holidays it sends
    // are bounded the same way, so a half-covered week would render a break as
    // a session.
    expect(data.weeks[0].weekStart).toBe("2026-07-20");
    expect(data.weeks[data.weeks.length - 1].weekStart).toBe("2026-12-07");
  });

  it("steps a whole number of weeks with no gaps", () => {
    for (let index = 1; index < data.weeks.length; index += 1) {
      const previous = new Date(`${data.weeks[index - 1].weekStart}T00:00:00Z`);
      const current = new Date(`${data.weeks[index].weekStart}T00:00:00Z`);
      expect(current.getTime() - previous.getTime()).toBe(7 * 86_400_000);
    }
  });
});

describe("resolving a week's sessions", () => {
  it("places a weekly slot on its own weekday, every week of the term", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "club",
            start_date: "2026-08-10",
            end_date: "2026-09-07",
            schedule_slots: [
              { weekday: 0, start_time: "17:00", duration_minutes: 90 },
            ],
          }),
        ],
      }),
    );

    expect(week(data, "2026-08-17").chips).toMatchObject([
      { weekday: 0, startTime: "17:00", durationMinutes: 90 },
    ]);
    // The term's last day is a Monday and is included...
    expect(week(data, "2026-09-07").chips).toHaveLength(1);
    // ...and the Monday after it is not.
    expect(week(data, "2026-09-14").chips).toHaveLength(0);
  });

  it("resolves nothing before a term starts", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({ id: "club", start_date: "2026-09-07" }),
        ],
      }),
    );

    expect(week(data, "2026-08-17").chips).toHaveLength(0);
    expect(week(data, "2026-09-07").chips).toHaveLength(1);
  });

  it("resolves nothing for a product with no first day", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({ id: "club", start_date: null }),
        ],
      }),
    );

    expect(data.weeks.every((entry) => entry.chips.length === 0)).toBe(true);
  });

  it("drops a session that falls on a holiday and says the product is paused", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "kerho",
            translations: [{ locale: "en", name: "Pelikerho Leppävaara" }],
            holidays: ["2026-10-12"],
          }),
        ],
      }),
    );

    const holidayWeek = week(data, "2026-10-12");
    expect(holidayWeek.chips).toHaveLength(0);
    expect(holidayWeek.onBreak).toEqual(["Pelikerho Leppävaara"]);

    const ordinaryWeek = week(data, "2026-10-05");
    expect(ordinaryWeek.chips).toHaveLength(1);
    expect(ordinaryWeek.onBreak).toEqual([]);
  });

  it("does not call a product paused when only one of its two sessions is a holiday", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "kerho",
            schedule_slots: [
              { weekday: 0, start_time: "17:00", duration_minutes: 90 },
              { weekday: 2, start_time: "17:00", duration_minutes: 90 },
            ],
            holidays: ["2026-10-12"],
          }),
        ],
      }),
    );

    const holidayWeek = week(data, "2026-10-12");
    // Monday is gone, Wednesday still ran — so the club met that week.
    expect(holidayWeek.chips).toMatchObject([{ weekday: 2 }]);
    expect(holidayWeek.onBreak).toEqual([]);
  });

  it("marks a chip when its product is in the attention queue, and only then", () => {
    const data = build(
      snapshot({
        attention_products: [
          attentionProduct({ id: "flagged", unassigned_count: 3 }),
        ],
        schedule_products: [
          scheduleProduct({ id: "flagged" }),
          scheduleProduct({ id: "healthy" }),
        ],
      }),
    );

    const chips = week(data, "2026-08-17").chips;
    expect(
      Object.fromEntries(
        chips.map((chip) => [chip.productId, chip.needsAttention]),
      ),
    ).toEqual({ flagged: true, healthy: false });
  });
});

describe("re-grouping into the viewer's week", () => {
  it("moves a Helsinki Monday morning onto the viewer's Sunday evening", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "club",
            schedule_slots: [
              { weekday: 0, start_time: "09:00", duration_minutes: 90 },
            ],
          }),
        ],
      }),
      LOS_ANGELES,
    );

    // 09:00 Helsinki (UTC+3 in August) is 23:00 the previous day in Los
    // Angeles (UTC-7) — a different weekday, in a different week.
    expect(week(data, "2026-08-10").chips).toMatchObject([
      { weekday: 6, startTime: "23:00" },
    ]);
    expect(week(data, "2026-08-17").chips).toMatchObject([
      { weekday: 6, startTime: "23:00" },
    ]);
  });

  it("keeps the authored wall clock when the viewer reads in the authoring zone", () => {
    const data = build(
      snapshot({
        schedule_products: [scheduleProduct({ id: "club" })],
      }),
      HELSINKI,
    );

    expect(week(data, "2026-08-17").chips).toMatchObject([
      { weekday: 0, startTime: "17:00" },
    ]);
  });

  it("follows each zone's own DST transition across the week they disagree on", () => {
    // The EU falls back on 25 October 2026, the US on 1 November. In the week
    // between, Helsinki is UTC+2 and New York is UTC-4 — six hours apart rather
    // than the usual seven — so the same 17:00 slot reads an hour later.
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "club",
            end_date: "2026-11-30",
            schedule_slots: [
              { weekday: 0, start_time: "17:00", duration_minutes: 90 },
            ],
          }),
        ],
      }),
      NEW_YORK,
    );

    expect(week(data, "2026-10-19").chips).toMatchObject([
      { weekday: 0, startTime: "10:00" },
    ]);
    expect(week(data, "2026-10-26").chips).toMatchObject([
      { weekday: 0, startTime: "11:00" },
    ]);
    // Once New York follows a week later, the seven-hour gap is back.
    expect(week(data, "2026-11-02").chips).toMatchObject([
      { weekday: 0, startTime: "10:00" },
    ]);
  });

  it("names the viewer's zone only when something actually converted", () => {
    const helsinkiOnly = snapshot({
      schedule_products: [scheduleProduct({ id: "club" })],
    });
    expect(build(helsinkiOnly, HELSINKI).timeZoneAbbrev).toBeNull();
    expect(build(helsinkiOnly, NEW_YORK).timeZoneAbbrev).not.toBeNull();
  });
});

describe("the coming-up feed", () => {
  it("collapses same-date, same-type milestones into one cohort", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "a",
            product_type: "municipality_club",
            start_date: "2026-09-07",
            end_date: "2026-11-27",
          }),
          scheduleProduct({
            id: "b",
            product_type: "municipality_club",
            start_date: "2026-09-07",
            end_date: "2026-11-27",
          }),
          scheduleProduct({
            id: "c",
            product_type: "municipality_club",
            start_date: "2026-09-07",
            end_date: "2026-11-27",
          }),
        ],
      }),
    );

    const startDay = data.comingUp.find((day) => day.date === "2026-09-07");
    expect(startDay?.cohorts).toHaveLength(1);
    expect(startDay?.cohorts[0]).toMatchObject({
      kind: "starts",
      productType: "municipality_club",
    });
    expect(startDay?.cohorts[0].items.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);

    const endDay = data.comingUp.find((day) => day.date === "2026-11-27");
    expect(endDay?.cohorts[0]).toMatchObject({ kind: "ends" });
    expect(endDay?.cohorts[0].items).toHaveLength(3);
  });

  it("keeps different product types in separate cohorts, in the page's order", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "camp",
            product_type: "camp",
            start_date: "2026-09-07",
            end_date: "2026-09-11",
          }),
          scheduleProduct({
            id: "club",
            product_type: "consumer_club",
            start_date: "2026-09-07",
            end_date: "2026-12-01",
          }),
        ],
      }),
    );

    const day = data.comingUp.find((entry) => entry.date === "2026-09-07");
    expect(day?.cohorts.map((cohort) => cohort.productType)).toEqual([
      "consumer_club",
      "camp",
    ]);
  });

  it("calls a single-date product a run rather than a start", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "lan",
            product_type: "event",
            start_date: "2026-08-19",
            end_date: "2026-08-19",
          }),
        ],
      }),
    );

    expect(data.comingUp).toHaveLength(1);
    expect(data.comingUp[0]).toMatchObject({ date: "2026-08-19" });
    expect(data.comingUp[0].cohorts[0].kind).toBe("runs");
  });

  it("says nothing about a milestone already past, or beyond the horizon", () => {
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "already-running",
            start_date: "2026-08-10",
            end_date: "2027-05-30",
          }),
          scheduleProduct({
            id: "starts-today",
            start_date: TODAY,
            end_date: "2027-05-30",
          }),
        ],
      }),
    );

    // The horizon is the rest of this month plus three more — to 1 December —
    // so neither term's end appears, and only today's start does.
    expect(data.comingUp).toHaveLength(1);
    expect(data.comingUp[0].cohorts[0].items.map((item) => item.id)).toEqual([
      "starts-today",
    ]);
  });
});

describe("the attention queue", () => {
  it("carries each fact structurally, in priority order, dropping the ones that are fine", () => {
    const data = build(
      snapshot({
        attention_products: [
          attentionProduct({
            id: "club",
            translations: [{ locale: "en", name: "Minecraft-klubi Espoo" }],
            unassigned_count: 1,
            groups_without_gedu: [
              { id: "g1", name: "Tiistai A" },
              { id: "g2", name: "Tiistai B" },
            ],
            waitlist: { waitlist_count: 3, open_seats: 1 },
            missing_gedu_fee: true,
          }),
        ],
      }),
    );

    expect(data.products[0]).toMatchObject({
      productId: "club",
      name: "Minecraft-klubi Espoo",
      href: "/admin/consumer-clubs/club",
    });
    // Nothing is worded here: the mapping is pure, so an issue leaves as the
    // message key its `kind` names plus the values that key interpolates. The
    // sentences live in `messages/` and the cards do the joining.
    expect(
      data.products[0].issues.map(({ id: _id, ...issue }) => issue),
    ).toEqual([
      { kind: "unassigned-gamers", values: { count: 1 } },
      { kind: "group-without-gedu", values: { group: "Tiistai A" } },
      { kind: "group-without-gedu", values: { group: "Tiistai B" } },
      { kind: "waitlist-open-seats", values: { waiting: 3, open: 1 } },
      { kind: "missing-gedu-fee" },
    ]);
    // Two group lines on one card need two keys.
    expect(new Set(data.products[0].issues.map((issue) => issue.id)).size).toBe(
      5,
    );
  });

  it("prefers the viewer's locale for a product's name, falling back to English", () => {
    const data = build(
      snapshot({
        attention_products: [
          attentionProduct({
            id: "club",
            translations: [
              { locale: "en", name: "Minecraft Club Espoo" },
              { locale: "fi", name: "Minecraft-klubi Espoo" },
            ],
            missing_gedu_fee: true,
          }),
        ],
      }),
    );
    expect(data.products[0].name).toBe("Minecraft Club Espoo");

    const finnish = buildAdminDashboardData({
      snapshot: snapshot({
        attention_products: [
          attentionProduct({
            id: "club",
            translations: [
              { locale: "en", name: "Minecraft Club Espoo" },
              { locale: "fi", name: "Minecraft-klubi Espoo" },
            ],
            missing_gedu_fee: true,
          }),
        ],
      }),
      locale: "fi",
      viewerTimeZone: HELSINKI,
      now: NOW,
    });
    expect(finnish.products[0].name).toBe("Minecraft-klubi Espoo");
  });
});

describe("the certification queue", () => {
  it("names the wait relative to the page's own clock, and only the wait", () => {
    const data = build(
      snapshot({
        certification_queue: [
          {
            id: "38763617-b031-49af-9fd4-3320e7509019",
            first_name: "Venla",
            last_name: "Salminen",
            created_at: "2026-08-15T09:20:00+03:00",
          },
          {
            id: "4889fea4-0602-438f-adfe-2cef72d485ff",
            first_name: "Helmi",
            last_name: "Koskinen",
            created_at: "2026-06-17T09:20:00+03:00",
          },
        ],
      }),
    );

    // The relative phrase and nothing else: `Intl` formats it per locale, and
    // the sentence around it ("registered …") is the card's translated copy.
    expect(data.uncertifiedGedus[0]).toMatchObject({
      name: "Venla Salminen",
      registeredAgo: "2 days ago",
    });
    expect(data.uncertifiedGedus[1].registeredAgo).toBe("2 months ago");
  });

  it("leaves an unnamed account's name null rather than inventing a stand-in", () => {
    const data = build(
      snapshot({
        certification_queue: [
          {
            id: "e979b9eb-39a2-4b71-9aa1-3d991969dadc",
            first_name: "",
            last_name: "   ",
            created_at: "2026-08-15T09:20:00+03:00",
          },
        ],
      }),
    );

    expect(data.uncertifiedGedus[0].name).toBeNull();
  });
});

describe("an empty platform", () => {
  it("still offers a full week window, with nothing in it", () => {
    const data = build(snapshot());

    expect(data.products).toEqual([]);
    expect(data.uncertifiedGedus).toEqual([]);
    expect(data.comingUp).toEqual([]);
    expect(data.weeks.length).toBeGreaterThan(0);
    expect(data.weeks.every((entry) => entry.chips.length === 0)).toBe(true);
    expect(data.weeks[data.currentWeekIndex].weekStart).toBe("2026-08-17");
  });
});
