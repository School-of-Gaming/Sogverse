import { describe, it, expect } from "vitest";
import {
  buildAdminDashboardData,
  buildCertificationQueue,
  viewerZoneAbbrev,
} from "@/components/admin/dashboard/build-admin-dashboard-data";
import type {
  AdminDashboardAttentionProduct,
  AdminDashboardScheduleProduct,
  AdminDashboardSnapshot,
} from "@/types";

/**
 * The snapshot → page mapping, which is where every calendar decision on the
 * admin dashboard is actually made: which weeks can be stepped through, which
 * weekday a session lands on for the person reading it, and what collapses into
 * one line of the coming-up feed.
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
    empty_groups_without_gedu: [],
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
    // The RPC sends [today - 30 days, today + 4 months), less a day at each end
    // (see the straddle case below), so a half-covered week is never offered.
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

  it("drops a boundary week the viewer's calendar reaches and the product's does not", () => {
    // 00:30 on Thursday the 20th in Helsinki is still 14:30 on Wednesday the
    // 19th in Los Angeles. The offered window is measured from the viewer's
    // Wednesday and so opens on Monday 20 July — but every product window is
    // measured from today in the *product's* zone, exactly as the RPC measures
    // it, so this club's own window opens on Tuesday 21 July and its Monday
    // session was never sent. Offering that week would show an empty Monday for
    // a club that met.
    const now = new Date("2026-08-20T00:30:00+03:00");
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({ id: "club", start_date: "2026-06-01" }),
        ],
      }),
      LOS_ANGELES,
      now,
    );

    expect(data.weeks.some((entry) => entry.weekStart === "2026-07-20")).toBe(
      false,
    );
    expect(data.weeks[0].weekStart).toBe("2026-07-27");
    // And the first week that *is* offered is fully covered.
    expect(week(data, "2026-07-27").chips).toHaveLength(1);
  });

  it("takes the far edge's day off before the months, not after the clamp", () => {
    // 01:00 on 1 March in Helsinki is still 15:00 on 28 February in Los
    // Angeles, so a product authored there walks to `2026-02-28 + 4 months` =
    // 28 June (exclusive) — the month clamp landing on the short month's last
    // day. Shrinking the viewer's edge *after* its own `+ 4 months` asks the
    // clamp a different question (1 July, less a day, is 30 June) and offers
    // the week of 22 June, whose 28th the data does not cover. Taking the day
    // off `today` first makes both sides ask 28 February.
    const now = new Date("2026-03-01T01:00:00+02:00");
    const data = build(
      snapshot({
        schedule_products: [
          scheduleProduct({
            id: "club",
            timezone: LOS_ANGELES,
            start_date: "2026-01-05",
            end_date: "2026-12-14",
          }),
        ],
      }),
      HELSINKI,
      now,
    );

    expect(data.weeks.some((entry) => entry.weekStart === "2026-06-22")).toBe(
      false,
    );
    expect(data.weeks[data.weeks.length - 1].weekStart).toBe("2026-06-15");
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
    // Resolved against the live clock rather than the day-granular half, so a
    // DST transition is reflected the moment it happens rather than at the
    // following midnight — which is why it is asked for separately here too.
    const products = [scheduleProduct({ id: "club" })];
    expect(viewerZoneAbbrev(products, HELSINKI, "en", NOW)).toBeNull();
    expect(viewerZoneAbbrev(products, NEW_YORK, "en", NOW)).not.toBeNull();
  });

  it("follows the viewer's own DST transition within the day it happens", () => {
    // Helsinki goes to EEST at 03:00 on 29 March 2026. Both instants are the
    // same calendar day for the viewer, so a day-sampled clock would have given
    // one answer for both.
    const products = [scheduleProduct({ id: "club", timezone: NEW_YORK })];
    expect(
      viewerZoneAbbrev(
        products,
        HELSINKI,
        "en",
        new Date("2026-03-29T00:30:00+02:00"),
      ),
    ).toBe("GMT+2");
    expect(
      viewerZoneAbbrev(
        products,
        HELSINKI,
        "en",
        new Date("2026-03-29T12:00:00+03:00"),
      ),
    ).toBe("GMT+3");
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
            empty_groups_without_gedu: [{ id: "g3", name: "Tiistai C" }],
            waitlist: { waitlist_count: 3, open_seats: 1, live_offer_count: 0 },
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
      { kind: "waitlist-open-seats", values: { waiting: 3, open: 1, offers: 0 } },
      // Below the waitlist line and above the fee: an empty unstaffed group is
      // a loose end rather than a child nobody is looking after, and this is
      // where the queue says so.
      { kind: "empty-group-without-gedu", values: { group: "Tiistai C" } },
      { kind: "missing-gedu-fee" },
    ]);
    // The ids are asserted whole rather than counted, because a count only
    // proves they differ — it does not pin *how*. Each is product, kind and,
    // where a kind can repeat on one card, the group it is about; that last
    // part is what keeps three group lines from sharing a React key, and the
    // kind infix is what keeps a populated and an empty group line legible as
    // two different lines wherever an id is read back.
    expect(data.products[0].issues.map((issue) => issue.id)).toEqual([
      "club-unassigned-gamers",
      "club-group-without-gedu-g1",
      "club-group-without-gedu-g2",
      "club-waitlist-open-seats",
      "club-empty-group-without-gedu-g3",
      "club-missing-gedu-fee",
    ]);
  });

  it("keeps an empty unstaffed group out of the populated group's line", () => {
    // The two arrays are disjoint on the wire, and the mapping reads each one
    // exactly once. A pass that folded them together would produce the right
    // number of lines with the wrong ranks and the wrong tint — the one failure
    // mode a count of issues would not catch.
    const data = build(
      snapshot({
        attention_products: [
          attentionProduct({
            id: "club",
            empty_groups_without_gedu: [{ id: "g1", name: "Ryhmä" }],
          }),
        ],
      }),
    );

    expect(
      data.products[0].issues.map(({ id: _id, ...issue }) => issue),
    ).toEqual([
      { kind: "empty-group-without-gedu", values: { group: "Ryhmä" } },
    ]);
  });

  it("carries the live seat-offer count into the waitlist fact", () => {
    // The RPC only lists a product whose open seats exceed its live offers, so
    // this is the shape the card has to explain: four queued, two seats free,
    // one family already asked — and therefore one offer still to send. The
    // count would be silently droppable without this case, and the line would
    // go back to reading as though nobody had been asked at all.
    const data = build(
      snapshot({
        attention_products: [
          attentionProduct({
            id: "club",
            waitlist: { waitlist_count: 4, open_seats: 2, live_offer_count: 1 },
          }),
        ],
      }),
    );

    expect(
      data.products[0].issues.map(({ id: _id, ...issue }) => issue),
    ).toEqual([
      { kind: "waitlist-open-seats", values: { waiting: 4, open: 2, offers: 1 } },
    ]);
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

/**
 * Built against the *ticking* clock rather than the day-granular half — a wait
 * has to age while the page sits open — so it is asked for on its own here,
 * exactly as the shell asks for it.
 */
describe("the certification queue", () => {
  it("names the wait relative to the page's own clock, and only the wait", () => {
    const queue = buildCertificationQueue(
      [
        {
          id: "38763617-b031-49af-9fd4-3320e7509019",
          first_name: "Venla",
          last_name: "Salminen",
          created_at: "2026-08-15T09:20:00+03:00",
          // One candidate has signed the current contract and one has not, so
          // the fixture pair covers both standings a queue card can show.
          contract_accepted_at: "2026-08-16T10:00:00+03:00",
          criminal_record_check_at: null,
        },
        {
          id: "4889fea4-0602-438f-adfe-2cef72d485ff",
          first_name: "Helmi",
          last_name: "Koskinen",
          created_at: "2026-06-17T09:20:00+03:00",
          contract_accepted_at: null,
          criminal_record_check_at: null,
        },
      ],
      "en",
      NOW,
      HELSINKI,
    );

    // The relative phrase and nothing else: `Intl` formats it per locale, and
    // the sentence around it ("registered …") is the card's translated copy.
    expect(queue[0]).toMatchObject({
      name: "Venla Salminen",
      registeredAgo: "2 days ago",
    });
    expect(queue[1].registeredAgo).toBe("2 months ago");
  });

  it("leaves an unnamed account's name null rather than inventing a stand-in", () => {
    const queue = buildCertificationQueue(
      [
        {
          id: "e979b9eb-39a2-4b71-9aa1-3d991969dadc",
          first_name: "",
          last_name: "   ",
          created_at: "2026-08-15T09:20:00+03:00",
          contract_accepted_at: null,
          criminal_record_check_at: null,
        },
      ],
      "en",
      NOW,
      HELSINKI,
    );

    expect(queue[0].name).toBeNull();
  });

  it("dates an acceptance in the viewer's zone, and says nothing where there is none", () => {
    // 00:40 on the 16th in Helsinki is still 17:40 on the 15th in Los Angeles.
    // An acceptance is an instant, so it converts — a queue that rendered the
    // stored date as itself would put a signature on the wrong day for every
    // reader west of the product.
    const candidates = [
      {
        id: "38763617-b031-49af-9fd4-3320e7509019",
        first_name: "Venla",
        last_name: "Salminen",
        created_at: "2026-08-15T09:20:00+03:00",
        contract_accepted_at: "2026-08-16T00:40:00+03:00",
        criminal_record_check_at: null,
      },
      {
        id: "4889fea4-0602-438f-adfe-2cef72d485ff",
        first_name: "Helmi",
        last_name: "Koskinen",
        created_at: "2026-06-17T09:20:00+03:00",
        contract_accepted_at: null,
        criminal_record_check_at: null,
      },
    ];

    const helsinki = buildCertificationQueue(candidates, "en", NOW, HELSINKI);
    expect(helsinki[0].contractAcceptedOn).toBe("Aug 16, 2026");
    // Never signed, and "signed a version that has since been superseded", are
    // the same null on the wire and the same silence here: the question is
    // standing under the terms in force today.
    expect(helsinki[1].contractAcceptedOn).toBeNull();

    const losAngeles = buildCertificationQueue(
      candidates,
      "en",
      NOW,
      LOS_ANGELES,
    );
    expect(losAngeles[0].contractAcceptedOn).toBe("Aug 15, 2026");
  });

  it("dates a criminal record check in the viewer's zone, independently of the contract", () => {
    // The same midnight-straddling instant as above, on the other standing —
    // and the two candidates disagree with each other on both counts, which is
    // what would catch a mapping that read one field into the other.
    const candidates = [
      {
        id: "38763617-b031-49af-9fd4-3320e7509019",
        first_name: "Venla",
        last_name: "Salminen",
        created_at: "2026-08-15T09:20:00+03:00",
        contract_accepted_at: null,
        criminal_record_check_at: "2026-08-16T00:40:00+03:00",
      },
      {
        id: "4889fea4-0602-438f-adfe-2cef72d485ff",
        first_name: "Helmi",
        last_name: "Koskinen",
        created_at: "2026-06-17T09:20:00+03:00",
        contract_accepted_at: "2026-08-16T00:40:00+03:00",
        criminal_record_check_at: null,
      },
    ];

    const helsinki = buildCertificationQueue(candidates, "en", NOW, HELSINKI);
    expect(helsinki[0].criminalRecordCheckOn).toBe("Aug 16, 2026");
    expect(helsinki[0].contractAcceptedOn).toBeNull();
    // No check recorded, and one recorded as unacceptable, are the same false
    // in the column and so the same null on the wire: both mean the check has
    // not been satisfied, and the queue does not pretend to tell them apart.
    expect(helsinki[1].criminalRecordCheckOn).toBeNull();

    const losAngeles = buildCertificationQueue(
      candidates,
      "en",
      NOW,
      LOS_ANGELES,
    );
    expect(losAngeles[0].criminalRecordCheckOn).toBe("Aug 15, 2026");
  });
});

describe("an empty platform", () => {
  it("still offers a full week window, with nothing in it", () => {
    const data = build(snapshot());

    expect(data.products).toEqual([]);
    expect(buildCertificationQueue([], "en", NOW, HELSINKI)).toEqual([]);
    expect(data.comingUp).toEqual([]);
    expect(data.weeks.length).toBeGreaterThan(0);
    expect(data.weeks.every((entry) => entry.chips.length === 0)).toBe(true);
    expect(data.weeks[data.currentWeekIndex].weekStart).toBe("2026-08-17");
  });
});
