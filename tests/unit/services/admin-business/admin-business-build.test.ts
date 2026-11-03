import { describe, expect, it } from "vitest";
import {
  buildBusinessOverview,
  mergeSpans,
  type BusinessFacts,
  type BusinessPaymentRow,
  type BusinessProductRow,
  type BusinessSeatRow,
  type BusinessSubscriptionRow,
} from "@/services/admin-business/admin-business.build";

// Tuesday 3 November 2026, 12:00 in Helsinki. Last month ended at
// 2026-10-31T22:00Z, Helsinki midnight in winter time.
const NOW = new Date("2026-11-03T10:00:00Z");
const MONTHS = [
  "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01",
  "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01",
];

const PRODUCTS: BusinessProductRow[] = [
  { id: "club", product_type: "consumer_club", billing_mode: "paid", start_date: "2025-01-01", end_date: null, timezone: "Europe/Helsinki" },
  { id: "club2", product_type: "consumer_club", billing_mode: "paid", start_date: "2025-01-01", end_date: null, timezone: "Europe/Helsinki" },
  { id: "camp", product_type: "camp", billing_mode: "paid", start_date: "2026-06-01", end_date: "2026-07-10", timezone: "Europe/Helsinki" },
  { id: "muni", product_type: "municipality_club", billing_mode: "external_contract", start_date: "2026-08-01", end_date: "2026-12-15", timezone: "Europe/Helsinki" },
  { id: "free", product_type: "camp", billing_mode: "free", start_date: "2026-01-01", end_date: "2026-12-01", timezone: "Europe/Helsinki" },
];

function seat(id: string, customer: string, product: string, start: string, ended: string | null = null, participant = `${customer}-kid`): BusinessSeatRow {
  return { id, customer_id: customer, participant_id: participant, product_id: product, signed_up_at: start, ended_at: ended };
}

function sub(customer: string, seatId: string, created: string, status: string, ended: string | null = null, currency = "eur"): BusinessSubscriptionRow {
  return { customer_id: customer, participation_id: seatId, currency, status, created_at: created, ended_at: ended };
}

function payment(customer: string, cents: number, at: string, product: string | null, purpose: BusinessPaymentRow["purpose"] = "subscription_invoice", currency = "eur"): BusinessPaymentRow {
  return { customer_id: customer, amount_cents: cents, currency, purpose, product_id: product, created_at: at };
}

function facts(overrides: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    families: [],
    products: PRODUCTS,
    seats: [],
    subscriptions: [],
    prices: [
      { product_id: "club", currency: "eur", price_cents: 4900 },
      { product_id: "club2", currency: "eur", price_cents: 3900 },
    ],
    payments: [],
    municipalityMonths: MONTHS.map((month) => ({ month, totalCents: 0, clubsWithoutFee: 0 })),
    geduMonths: MONTHS.map((month) => ({ month, paidGeduIds: [] })),
    ...overrides,
  };
}

const family = (id: string, created = "2025-01-01T10:00:00Z") => ({ id, created_at: created });

describe("the headline", () => {
  it("counts a family as paying only while a paid seat is held, and a seat ends with its product's run", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a"), family("b"), family("c")],
        seats: [
          seat("a1", "a", "club", "2026-09-01T10:00:00Z"),
          // Ended mid-month: paying at the end of October, not now.
          seat("b1", "b", "club", "2026-09-01T10:00:00Z", "2026-11-02T10:00:00Z"),
          // A finished camp's seat is still active, but nobody is in it.
          seat("c1", "c", "camp", "2026-06-01T10:00:00Z"),
        ],
      }),
      NOW,
    );
    expect(overview.headline.payingFamilies).toEqual({ now: 1, endOfLastMonth: 2 });
  });

  it("prices live EUR subscriptions at their seat's product and counts the rest outside", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a"), family("b"), family("c"), family("d")],
        seats: [
          seat("a1", "a", "club", "2026-09-01T10:00:00Z"),
          seat("b1", "b", "club2", "2026-09-01T10:00:00Z", "2026-11-02T10:00:00Z"),
          seat("c1", "c", "club", "2026-09-01T10:00:00Z"),
          seat("d1", "d", "club", "2026-09-01T10:00:00Z"),
        ],
        subscriptions: [
          sub("a", "a1", "2026-09-01T10:00:00Z", "past_due"),
          sub("b", "b1", "2026-09-01T10:00:00Z", "cancelled", "2026-11-02T10:00:00Z"),
          sub("c", "c1", "2026-09-01T10:00:00Z", "active", null, "gbp"),
          // Stripe gave up on it; the seat lives on, the money does not.
          sub("d", "d1", "2026-09-01T10:00:00Z", "cancelled"),
        ],
      }),
      NOW,
    );
    expect(overview.headline.monthlyRecurringRevenueCents).toEqual({ now: 4900, endOfLastMonth: 8800 });
    expect(overview.headline.liveSubscriptions).toEqual({ now: 2, endOfLastMonth: 3 });
    expect(overview.headline.subscriptionsOutsideRevenue).toBe(1);
  });

  it("counts distinct gamers, never the parent's own seat, and the municipality ones apart", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a"), family("b")],
        seats: [
          seat("a1", "a", "club", "2026-09-01T10:00:00Z", null, "kid1"),
          seat("a2", "a", "muni", "2026-09-01T10:00:00Z", null, "kid1"),
          seat("a3", "a", "muni", "2026-11-02T10:00:00Z", null, "kid2"),
          seat("b1", "b", "club", "2026-09-01T10:00:00Z", null, "b"),
        ],
      }),
      NOW,
    );
    expect(overview.headline.gamersInSeat).toEqual({ now: 2, endOfLastMonth: 1 });
    expect(overview.headline.gamersInMunicipalitySeat).toEqual({ now: 2, endOfLastMonth: 1 });
  });

  it("measures sign-up to first seat over the 90 days before each instant", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [
          family("old", "2026-01-01T10:00:00Z"),
          family("a", "2026-10-01T10:00:00Z"),
          family("b", "2026-10-15T10:00:00Z"),
          family("c", "2026-11-02T10:00:00Z"),
        ],
        seats: [
          seat("o1", "old", "club", "2026-10-02T10:00:00Z"),
          seat("a1", "a", "free", "2026-11-01T10:00:00Z"),
          seat("b1", "b", "muni", "2026-10-20T10:00:00Z"),
        ],
      }),
      NOW,
    );
    expect(overview.headline.signupToSeat.now).toEqual({ registered: 3, seated: 2 });
    expect(overview.headline.signupToSeat.endOfLastMonth).toEqual({ registered: 2, seated: 1 });
  });
});

describe("families by engagement", () => {
  it("puts every family in the first slice it matches, and the slices sum to the total", () => {
    const overview = buildBusinessOverview(
      facts({
        families: ["sub", "paid", "muni", "mixed", "never", "waitlistOnly"].map((id) => family(id)),
        seats: [
          seat("s1", "sub", "club", "2026-09-01T10:00:00Z"),
          seat("p1", "paid", "camp", "2026-06-01T10:00:00Z"),
          seat("m1", "muni", "muni", "2026-09-01T10:00:00Z"),
          seat("x1", "mixed", "muni", "2026-09-01T10:00:00Z"),
          seat("x2", "mixed", "free", "2026-09-01T10:00:00Z"),
        ],
        subscriptions: [sub("sub", "s1", "2026-09-01T10:00:00Z", "active")],
        payments: [
          payment("sub", 4900, "2026-09-01T10:00:00Z", "club"),
          payment("paid", 19900, "2026-06-01T10:00:00Z", "camp", "single_payment"),
        ],
      }),
      NOW,
    );
    expect(overview.engagement.slices).toEqual([
      { slice: "subscriber", families: 1 },
      { slice: "paidBefore", families: 1 },
      { slice: "municipalityOnly", families: 1 },
      { slice: "freeOnly", families: 1 },
      { slice: "neverEnrolled", families: 2 },
    ]);
    expect(overview.engagement.totalFamilies).toBe(6);
  });
});

describe("revenue by month", () => {
  it("buckets payments by Helsinki month and by the product they paid for", () => {
    const overview = buildBusinessOverview(
      facts({
        payments: [
          payment("a", 4900, "2026-09-15T10:00:00Z", "club"),
          // 00:30 on 1 October in Helsinki.
          payment("a", 4900, "2026-09-30T21:30:00Z", "club"),
          payment("b", 19900, "2026-10-05T10:00:00Z", "camp", "single_payment"),
          payment("c", 1000, "2026-10-06T10:00:00Z", null),
          // Refunded by hand, never bought anything.
          payment("d", 19900, "2026-10-07T10:00:00Z", "camp", "reservation_duplicate"),
          payment("e", 4000, "2026-10-08T10:00:00Z", "club", "subscription_invoice", "gbp"),
        ],
        municipalityMonths: MONTHS.map((month) => ({
          month,
          totalCents: month === "2026-10-01" ? 65000 : 0,
          clubsWithoutFee: month === "2026-10-01" ? 1 : 0,
        })),
      }),
      NOW,
    );
    const byMonth = new Map(overview.revenue.months.map((m) => [m.month, m]));
    expect(overview.revenue.paymentsBeginMonth).toBe("2026-09-01");
    expect(byMonth.get("2026-08-01")).toEqual({
      month: "2026-08-01",
      subscriptionCents: null,
      campsAndEventsCents: null,
      unattributedCents: null,
      municipalityCents: 0,
      municipalityClubsWithoutFee: 0,
    });
    expect(byMonth.get("2026-09-01")?.subscriptionCents).toBe(4900);
    expect(byMonth.get("2026-10-01")).toEqual({
      month: "2026-10-01",
      subscriptionCents: 4900,
      campsAndEventsCents: 19900,
      unattributedCents: 1000,
      municipalityCents: 65000,
      municipalityClubsWithoutFee: 1,
    });
    expect(overview.revenue.nonEurPayments).toBe(1);
    expect(overview.revenue.months.map((m) => m.month)).toEqual(MONTHS);
  });

  it("throws rather than draw a month the municipality build did not answer", () => {
    expect(() => buildBusinessOverview(facts({ municipalityMonths: [] }), NOW)).toThrow(
      /municipality/,
    );
  });
});

describe("families by month", () => {
  const stopsByMonth = (overview: ReturnType<typeof buildBusinessOverview>) =>
    new Map(overview.families.map((m) => [m.month, m.stoppedPaying]));
  const totalStops = (overview: ReturnType<typeof buildBusinessOverview>) =>
    overview.families.reduce((n, m) => n + m.stoppedPaying, 0);

  it("counts sign-ups and first seats by Helsinki month", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a", "2026-03-10T10:00:00Z"), family("b", "2026-04-02T10:00:00Z")],
        seats: [
          seat("a1", "a", "club", "2026-03-15T10:00:00Z"),
          seat("a2", "a", "club2", "2026-04-01T10:00:00Z"),
          seat("b1", "b", "free", "2026-04-05T10:00:00Z"),
        ],
      }),
      NOW,
    );
    const byMonth = new Map(overview.families.map((m) => [m.month, m]));
    expect(byMonth.get("2026-03-01")).toMatchObject({ signups: 1, firstSeats: 1 });
    expect(byMonth.get("2026-04-01")).toMatchObject({ signups: 1, firstSeats: 1 });
  });

  it("never counts a camp ending as a stop", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        seats: [seat("a1", "a", "camp", "2026-07-01T10:00:00Z", "2026-07-10T10:00:00Z")],
      }),
      NOW,
    );
    expect(totalStops(overview)).toBe(0);
  });

  it("counts a stop when a family's last subscription ends", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        seats: [seat("a1", "a", "club", "2026-03-15T10:00:00Z", "2026-05-10T10:00:00Z")],
        subscriptions: [sub("a", "a1", "2026-03-15T10:00:00Z", "cancelled", "2026-05-10T10:00:00Z")],
      }),
      NOW,
    );
    expect(stopsByMonth(overview).get("2026-05-01")).toBe(1);
    expect(totalStops(overview)).toBe(1);
  });

  it("does not count one of two subscriptions ending while the other is live", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        seats: [
          seat("a1", "a", "club", "2026-03-15T10:00:00Z", "2026-05-10T10:00:00Z"),
          seat("a2", "a", "club2", "2026-04-01T10:00:00Z"),
        ],
        subscriptions: [
          sub("a", "a1", "2026-03-15T10:00:00Z", "cancelled", "2026-05-10T10:00:00Z"),
          sub("a", "a2", "2026-04-01T10:00:00Z", "active"),
        ],
      }),
      NOW,
    );
    expect(totalStops(overview)).toBe(0);
  });

  it("counts a family that subscribes again and cancels again twice, each in its month", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        seats: [
          seat("a1", "a", "club", "2026-03-15T10:00:00Z", "2026-05-10T10:00:00Z"),
          seat("a2", "a", "club", "2026-07-01T10:00:00Z", "2026-09-05T10:00:00Z"),
        ],
        subscriptions: [
          sub("a", "a1", "2026-03-15T10:00:00Z", "cancelled", "2026-05-10T10:00:00Z"),
          sub("a", "a2", "2026-07-01T10:00:00Z", "cancelled", "2026-09-05T10:00:00Z"),
        ],
      }),
      NOW,
    );
    const byMonth = stopsByMonth(overview);
    expect(byMonth.get("2026-05-01")).toBe(1);
    expect(byMonth.get("2026-09-01")).toBe(1);
    expect(totalStops(overview)).toBe(2);
  });

  it("dates a stop by its Helsinki month", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        // 00:30 on 1 October in Helsinki, still September in UTC.
        seats: [seat("a1", "a", "club", "2026-03-15T10:00:00Z", "2026-09-30T21:30:00Z")],
        subscriptions: [sub("a", "a1", "2026-03-15T10:00:00Z", "cancelled", "2026-09-30T21:30:00Z")],
      }),
      NOW,
    );
    const byMonth = stopsByMonth(overview);
    expect(byMonth.get("2026-09-01")).toBe(0);
    expect(byMonth.get("2026-10-01")).toBe(1);
  });

  it("merges touching and open-ended spans", () => {
    expect(
      mergeSpans([
        { start: 5, end: 8 },
        { start: 1, end: 5 },
        { start: 10, end: null },
        { start: 12, end: 20 },
      ]),
    ).toEqual([
      { start: 1, end: 8 },
      { start: 10, end: null },
    ]);
  });
});

describe("gedu capacity by month", () => {
  it("counts paid gedus against seats held in the month, from the first month any gedu was paid", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        seats: [
          seat("a1", "a", "club", "2026-09-20T10:00:00Z", "2026-10-03T10:00:00Z"),
          seat("a2", "a", "muni", "2026-10-15T10:00:00Z", null, "kid2"),
        ],
        geduMonths: MONTHS.map((month) => ({
          month,
          paidGeduIds: month === "2026-10-01" ? ["g1", "g2"] : [],
        })),
      }),
      NOW,
    );
    const byMonth = new Map(overview.gedus.months.map((m) => [m.month, m]));
    expect(overview.gedus.recordsBeginMonth).toBe("2026-10-01");
    expect(byMonth.get("2026-09-01")).toEqual({
      month: "2026-09-01",
      teachingGedus: null,
      seatsFilled: 1,
      seatsPerTeachingGedu: null,
    });
    expect(byMonth.get("2026-10-01")).toEqual({
      month: "2026-10-01",
      teachingGedus: 2,
      seatsFilled: 2,
      seatsPerTeachingGedu: 1,
    });
    expect(byMonth.get("2026-11-01")).toEqual({
      month: "2026-11-01",
      teachingGedus: 0,
      seatsFilled: 1,
      seatsPerTeachingGedu: null,
    });
  });
});

describe("a seat's span starts no earlier than its product", () => {
  // A camp booked in early October, running 5-8 November in Helsinki; its
  // first day begins at 2026-11-04T22:00Z, winter time.
  const LATER_CAMP: BusinessProductRow = { id: "autumn", product_type: "camp", billing_mode: "paid", start_date: "2026-11-05", end_date: "2026-11-08", timezone: "Europe/Helsinki" };
  // A club whose term starts on 1 December 2026, booked in October.
  const LATER_CLUB: BusinessProductRow = { id: "spring", product_type: "consumer_club", billing_mode: "paid", start_date: "2026-12-01", end_date: null, timezone: "Europe/Helsinki" };
  const products = [...PRODUCTS, LATER_CAMP, LATER_CLUB];

  it("holds a pre-booked camp's seat for nobody before its first day", () => {
    const overview = buildBusinessOverview(
      facts({
        products,
        families: [family("a")],
        seats: [seat("a1", "a", "autumn", "2026-10-05T10:00:00Z")],
      }),
      NOW,
    );
    expect(overview.headline.gamersInSeat).toEqual({ now: 0, endOfLastMonth: 0 });
    expect(overview.headline.payingFamilies).toEqual({ now: 0, endOfLastMonth: 0 });
    // October, the month it was booked in, staffed nobody for it.
    const byMonth = new Map(overview.gedus.months.map((m) => [m.month, m.seatsFilled]));
    expect(byMonth.get("2026-10-01")).toBe(0);
  });

  it("holds it from midnight of its first day in the product's zone", () => {
    const at = (iso: string) =>
      buildBusinessOverview(
        facts({
          products,
          families: [family("a")],
          seats: [seat("a1", "a", "autumn", "2026-10-05T10:00:00Z")],
        }),
        new Date(iso),
      ).headline.gamersInSeat.now;
    // 23:59 on 4 November in Helsinki, then 00:00 on 5 November.
    expect(at("2026-11-04T21:59:00Z")).toBe(0);
    expect(at("2026-11-04T22:00:00Z")).toBe(1);
  });

  it("starts a seat booked after its product began at the booking", () => {
    const overview = buildBusinessOverview(
      facts({
        families: [family("a")],
        // The club began in 2025; booked on 2 November, after last month ended.
        seats: [seat("a1", "a", "club", "2026-11-02T10:00:00Z")],
      }),
      NOW,
    );
    expect(overview.headline.gamersInSeat).toEqual({ now: 1, endOfLastMonth: 0 });
    const byMonth = new Map(overview.gedus.months.map((m) => [m.month, m.seatsFilled]));
    expect(byMonth.get("2026-10-01")).toBe(0);
    expect(byMonth.get("2026-11-01")).toBe(1);
  });

  it("counts a club seat from its term's start, and its family's first seat from the booking", () => {
    const overview = buildBusinessOverview(
      facts({
        products,
        families: [family("a", "2026-10-01T10:00:00Z")],
        seats: [seat("a1", "a", "spring", "2026-10-10T10:00:00Z")],
      }),
      NOW,
    );
    expect(overview.headline.payingFamilies.now).toBe(0);
    expect(overview.gedus.months.every((m) => m.seatsFilled === 0)).toBe(true);
    const firstSeats = new Map(overview.families.map((m) => [m.month, m.firstSeats]));
    expect(firstSeats.get("2026-10-01")).toBe(1);
    expect(overview.headline.signupToSeat.now).toEqual({ registered: 1, seated: 1 });
  });

  it("gives a seat that ended before its product began no span at all", () => {
    const overview = buildBusinessOverview(
      facts({
        products,
        families: [family("a")],
        seats: [seat("a1", "a", "autumn", "2026-01-10T10:00:00Z", "2026-03-01T10:00:00Z")],
      }),
      NOW,
    );
    expect(overview.families.every((m) => m.firstSeats === 0)).toBe(true);
    expect(overview.engagement.slices.find((s) => s.slice === "neverEnrolled")?.families).toBe(1);
  });
});
