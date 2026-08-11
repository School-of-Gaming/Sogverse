import { describe, expect, it } from "vitest";
import {
  rollUpFamilyEnrollments,
  rollUpGamerEnrollments,
  sortFamilyEnrollments,
  toFamilyEnrollments,
  type FamilyEnrollmentSummary,
} from "@/components/family/enrollment-rollup";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { FamilyMember } from "@/services/family";
import type {
  MyUpcomingSessionRow,
  MyWaitlistRow,
} from "@/services/participations";
import type { ProductTranslation } from "@/types";

/**
 * The order of a child's cards is the order their week actually runs, and it is
 * the one thing about the family dashboards a reader cannot recover for
 * themselves: the cards carry a schedule sentence, not a rank. So what is
 * pinned here is the banding — what is happening before what is waiting before
 * what is over — and the soonest-session ordering inside the running band, which
 * is the rule the top of the page is built on.
 *
 * Every case is expressed as ids in, ids out, so a fixture says only what the
 * sort is allowed to read: the next session, the end date, and the name that
 * breaks a tie.
 *
 * The second half of the file covers the mapping that *produces* those
 * summaries out of the two service reads: which row becomes which state, and
 * where a cancelled membership stops.
 */

const TZ = "Europe/Helsinki";

/** Mid-afternoon on a Wednesday, well clear of any local midnight. */
const NOW = new Date("2026-02-11T13:00:00Z");

/** Minutes from `NOW`, as an instant. */
function fromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

/**
 * One enrollment, named by its id, carrying only what the sort reads. Sessions
 * are given as minutes from `NOW` so a case reads as "an hour out" rather than
 * as a timestamp somebody has to date-check.
 */
function enrollment(
  id: string,
  fields: {
    startsInMinutes?: number;
    endDate?: string;
    productName?: string;
  } = {},
): FamilyEnrollmentSummary {
  const start =
    fields.startsInMinutes === undefined
      ? null
      : fromNow(fields.startsInMinutes);
  return {
    participationId: id,
    productName: fields.productName ?? id,
    productType: "consumer_club",
    nextSessionStart: start,
    nextSessionEnd: start === null ? null : new Date(start.getTime() + 5_400_000),
    hasVoiceRoom: true,
    voiceHref: "#",
    siteName: null,
    openHref: "#",
    endDate: fields.endDate ?? null,
    timezone: TZ,
    waitlistPosition: null,
    awaiting: false,
    paymentProblem: false,
    cancellation: null,
    scheduleLines: [],
  };
}

function sortedIds(
  enrollments: readonly FamilyEnrollmentSummary[],
  locale: SupportedLocale = "en",
): string[] {
  return sortFamilyEnrollments(enrollments, NOW, locale).map(
    (e) => e.participationId,
  );
}

/** One card of each band, deliberately built in the wrong order. */
const RUNNING = enrollment("running", { startsInMinutes: 60 });
const WAITING = enrollment("waiting");
const FINISHED = enrollment("finished", { endDate: "2026-01-31" });

describe("sortFamilyEnrollments — bands", () => {
  const cases: { name: string; input: FamilyEnrollmentSummary[] }[] = [
    { name: "already in order", input: [RUNNING, WAITING, FINISHED] },
    { name: "exactly reversed", input: [FINISHED, WAITING, RUNNING] },
    { name: "finished first", input: [FINISHED, RUNNING, WAITING] },
    { name: "waiting first", input: [WAITING, FINISHED, RUNNING] },
  ];

  it.each(cases)(
    "puts running before waiting before finished ($name)",
    ({ input }) => {
      expect(sortedIds(input)).toEqual(["running", "waiting", "finished"]);
    },
  );

  // A run with an end date still ahead of it is not finished, whatever its
  // schedule looks like — the band is a fact about the date, not about whether
  // anything is left on the calendar.
  it("keeps a dated run that has not ended yet out of the finished band", () => {
    const dated = enrollment("dated", {
      startsInMinutes: 120,
      endDate: "2026-06-30",
    });
    expect(sortedIds([WAITING, dated])).toEqual(["dated", "waiting"]);
  });

  // The endedness test needs both halves: a product whose last day has passed
  // but which still has a session on the books is somebody's data problem, and
  // the card that says "this is happening" has to win over the one that says
  // "this is over".
  it("treats a past end date with a session still ahead as running", () => {
    const contradictory = enrollment("contradictory", {
      startsInMinutes: 30,
      endDate: "2026-01-31",
    });
    expect(sortedIds([FINISHED, contradictory])).toEqual([
      "contradictory",
      "finished",
    ]);
  });
});

describe("sortFamilyEnrollments — inside a band", () => {
  // The whole point of the running band: tonight's club is above next Monday's,
  // however they arrived.
  it("orders the running band by soonest session", () => {
    const input = [
      enrollment("next-week", { startsInMinutes: 60 * 24 * 7 }),
      enrollment("tonight", { startsInMinutes: 180 }),
      enrollment("tomorrow", { startsInMinutes: 60 * 24 }),
      enrollment("in-an-hour", { startsInMinutes: 60 }),
    ];
    expect(sortedIds(input)).toEqual([
      "in-an-hour",
      "tonight",
      "tomorrow",
      "next-week",
    ]);
  });

  // Two clubs on the same evening have no ordering of their own, so the name is
  // the tiebreak — stable, and the same on every render.
  it("falls back to the product name when two sessions start together", () => {
    const input = [
      enrollment("beta", { startsInMinutes: 90, productName: "Roblox Club" }),
      enrollment("alpha", { startsInMinutes: 90, productName: "Minecraft Club" }),
    ];
    expect(sortedIds(input)).toEqual(["alpha", "beta"]);
  });

  // Product names are user-visible text in the viewer's language, so the
  // tiebreak has to collate the way that viewer's alphabet does. Ä is a letter
  // of its own at the end of the Finnish alphabet, not a decorated A, and the
  // runtime default gets that wrong for every non-Finnish server that renders
  // a Finnish family's first paint.
  it("collates the name tiebreak in the viewer's locale, not the runtime's", () => {
    const input = [
      enrollment("umlaut", { startsInMinutes: 90, productName: "Ämpäri Club" }),
      enrollment("bee", { startsInMinutes: 90, productName: "Bomb Club" }),
    ];
    expect(sortedIds(input, "fi")).toEqual(["bee", "umlaut"]);
    expect(sortedIds(input, "en")).toEqual(["umlaut", "bee"]);
  });

  // Inside the finished band the most recent run leads: a camp that ended last
  // week is what a parent is looking for, not one from two years ago.
  it("orders the finished band most-recently-ended first", () => {
    const input = [
      enrollment("last-year", { endDate: "2025-06-30" }),
      enrollment("last-week", { endDate: "2026-02-06" }),
      enrollment("last-month", { endDate: "2026-01-10" }),
    ];
    expect(sortedIds(input)).toEqual(["last-week", "last-month", "last-year"]);
  });
});

// ---------------------------------------------------------------------------
// Service rows → summaries
// ---------------------------------------------------------------------------

/**
 * The mapping's fixtures are deliberately scheduled in **UTC**, so a slot's
 * weekday and clock face are the same numbers the assertions read back and no
 * case needs a zone conversion done in the reader's head. The one thing that is
 * not about clock arithmetic — that a cancelled membership stops where the
 * money stopped — is expressed as instants, which are zoneless anyway.
 */

const PRODUCT_TZ = "UTC";
const AINO = "4c66fc68-a0e9-42de-8245-563c7edf8314";
const OTSO = "13ab5d23-716f-4ecb-8958-67acbd3820e6";
const PARENT = "9c39bfb5-67de-4bed-832d-ecb629c5298f";
const GROUP = "33333333-3333-3333-3333-333333333333";

/** Friday 17:00-18:30 UTC — the first one after NOW is Fri 2026-02-13. */
const FRIDAY_SLOT = { weekday: 4, startTime: "17:00", durationMinutes: 90 };
const FIRST_FRIDAY = "2026-02-13T17:00:00.000Z";
const THIRD_FRIDAY = "2026-02-27T17:00:00.000Z";
/** The last one *before* NOW — what a used-up paid window falls back to. */
const PREVIOUS_FRIDAY = "2026-02-06T17:00:00.000Z";

function translations(name: string): ProductTranslation[] {
  return [
    {
      locale: "en",
      name,
      short_description: "",
      long_description: null,
      product_id: "p",
      created_at: "",
      updated_at: "",
    },
  ];
}

function sessionRow(
  overrides: Partial<Omit<MyUpcomingSessionRow, "product">> & {
    product?: Partial<MyUpcomingSessionRow["product"]>;
  } = {},
): MyUpcomingSessionRow {
  const { product, ...rest } = overrides;
  return {
    participationId: "participation-1",
    gamer: { id: AINO, firstName: "Aino" },
    product: {
      id: "product-1",
      type: "consumer_club",
      timezone: PRODUCT_TZ,
      startDate: null,
      endDate: null,
      isRemote: true,
      site: null,
      translations: translations("Minecraft Explorers Club"),
      ...(product ?? {}),
    },
    groupId: overrides.groupId === undefined ? GROUP : overrides.groupId,
    slots: [FRIDAY_SLOT],
    paymentProblem: false,
    subscriptionEndsAt: null,
    ...rest,
  };
}

function waitlistRow(
  overrides: Partial<Omit<MyWaitlistRow, "product">> & {
    product?: Partial<MyWaitlistRow["product"]>;
  } = {},
): MyWaitlistRow {
  const { product, ...rest } = overrides;
  return {
    participationId: "waitlist-1",
    gamer: { id: AINO, firstName: "Aino" },
    product: {
      type: "consumer_club",
      timezone: PRODUCT_TZ,
      startDate: null,
      endDate: null,
      isRemote: true,
      translations: translations("Fortnite Creative Club"),
      ...(product ?? {}),
    },
    slots: [FRIDAY_SLOT],
    position: 3,
    ...rest,
  };
}

function mapOne(
  args: {
    sessionRows?: MyUpcomingSessionRow[];
    waitlistRows?: MyWaitlistRow[];
    openHref?: (e: { participationId: string }) => string;
  } = {},
): FamilyEnrollmentSummary {
  const entries = toFamilyEnrollments({
    sessionRows: args.sessionRows ?? [],
    waitlistRows: args.waitlistRows ?? [],
    now: NOW,
    locale: "en",
    timeZone: "UTC",
    openHref: args.openHref,
  });
  expect(entries).toHaveLength(1);
  return entries[0].enrollment;
}

describe("toFamilyEnrollments — a seat", () => {
  it("names the next occurrence and points the Join at the group's room", () => {
    const summary = mapOne({ sessionRows: [sessionRow()] });
    expect(summary.nextSessionStart?.toISOString()).toBe(FIRST_FRIDAY);
    expect(summary.nextSessionEnd?.toISOString()).toBe(
      "2026-02-13T18:30:00.000Z",
    );
    expect(summary.hasVoiceRoom).toBe(true);
    expect(summary.voiceHref).toContain(GROUP);
    expect(summary.awaiting).toBe(false);
    expect(summary.waitlistPosition).toBeNull();
  });

  it("states the product's cadence in words", () => {
    expect(mapOne({ sessionRows: [sessionRow()] }).scheduleLines).toEqual([
      "Friday · 17:00–18:30",
    ]);
  });

  // The card opens a page that does not exist yet, so the mapping asks its
  // caller rather than inventing a route — and answers "#" when nobody does.
  it("resolves the open href through the seam, defaulting to inert", () => {
    expect(mapOne({ sessionRows: [sessionRow()] }).openHref).toBe("#");
    expect(
      mapOne({
        sessionRows: [sessionRow()],
        openHref: (e) => `/parent/clubs/${e.participationId}`,
      }).openHref,
    ).toBe("/parent/clubs/participation-1");
  });

  it("names the venue on an in-person product and never on a remote one", () => {
    const site = { name: "Kirjasto Oodi", name_i18n: null };
    expect(
      mapOne({
        sessionRows: [sessionRow({ product: { isRemote: false, site } })],
      }).siteName,
    ).toBe("Kirjasto Oodi");
    // A remote product has no building; a card claiming both would be saying
    // the family meets in two places.
    expect(
      mapOne({ sessionRows: [sessionRow({ product: { isRemote: true, site } })] })
        .siteName,
    ).toBeNull();
  });

  it("resolves the venue name into the viewer's locale", () => {
    const entries = toFamilyEnrollments({
      sessionRows: [
        sessionRow({
          product: {
            isRemote: false,
            site: { name: "Helsinki", name_i18n: { sv: "Helsingfors" } },
          },
        }),
      ],
      waitlistRows: [],
      now: NOW,
      locale: "sv",
      timeZone: "UTC",
    });
    expect(entries[0].enrollment.siteName).toBe("Helsingfors");
  });
});

describe("toFamilyEnrollments — an unplaced seat", () => {
  // The whole point of the state: the seat is real and the schedule is real,
  // but there is no group, so there is nothing to join and nothing to open.
  it("is awaiting, with a schedule, an inert room and no page", () => {
    const summary = mapOne({ sessionRows: [sessionRow({ groupId: null })] });
    expect(summary.awaiting).toBe(true);
    expect(summary.nextSessionStart?.toISOString()).toBe(FIRST_FRIDAY);
    expect(summary.scheduleLines).not.toEqual([]);
    expect(summary.voiceHref).toBe("#");
    expect(summary.openHref).toBe("#");
  });

  it("keeps the open href inert even when the caller offers one", () => {
    expect(
      mapOne({
        sessionRows: [sessionRow({ groupId: null })],
        openHref: () => "/parent/clubs/anything",
      }).openHref,
    ).toBe("#");
  });
});

describe("toFamilyEnrollments — a place in line", () => {
  it("carries the position and the schedule, and nothing a seat would", () => {
    const summary = mapOne({ waitlistRows: [waitlistRow()] });
    expect(summary.waitlistPosition).toBe(3);
    expect(summary.scheduleLines).toEqual(["Friday · 17:00–18:30"]);
    // No occurrence of this product is theirs to turn up to.
    expect(summary.nextSessionStart).toBeNull();
    expect(summary.nextSessionEnd).toBeNull();
    expect(summary.awaiting).toBe(false);
    expect(summary.openHref).toBe("#");
    expect(summary.voiceHref).toBe("#");
    expect(summary.paymentProblem).toBe(false);
    expect(summary.cancellation).toBeNull();
  });

  it("still says whether the product has a room at all", () => {
    expect(
      mapOne({ waitlistRows: [waitlistRow({ product: { isRemote: false } })] })
        .hasVoiceRoom,
    ).toBe(false);
  });
});

describe("toFamilyEnrollments — a cancelled membership", () => {
  // The settled decision: nothing renders past the paid window. The walk is
  // bounded by the access instant, so the last covered session is the last
  // thing the card can name.
  it("marks the final covered session as the last", () => {
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-20T00:00:00Z") }),
      ],
    });
    expect(summary.nextSessionStart?.toISOString()).toBe(FIRST_FRIDAY);
    expect(summary.cancellation?.lastSessionStart?.toISOString()).toBe(
      FIRST_FRIDAY,
    );
    expect(summary.cancellation?.isLastSession).toBe(true);
  });

  it("names the last session without claiming this one is it", () => {
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-28T00:00:00Z") }),
      ],
    });
    expect(summary.nextSessionStart?.toISOString()).toBe(FIRST_FRIDAY);
    expect(summary.cancellation?.lastSessionStart?.toISOString()).toBe(
      THIRD_FRIDAY,
    );
    expect(summary.cancellation?.isLastSession).toBe(false);
  });

  // A session the family is no longer entitled to must not float their card to
  // the top of the page, so the clamp has to bite on the next session too.
  it("lists nothing to come once the paid window is used up", () => {
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-12T00:00:00Z") }),
      ],
    });
    expect(summary.nextSessionStart).toBeNull();
  });

  /**
   * The stretch between the final session and the period end — several days on
   * a monthly sub, and exactly when a parent is most likely to be checking.
   *
   * The membership is still winding down, so the card still says so. What it
   * does **not** do any more is name a date: see the regression pair below for
   * why naming one here was a bug rather than a feature.
   */
  it("keeps the not-renewing mark after the last session has run", () => {
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-12T00:00:00Z") }),
      ],
    });
    expect(summary.cancellation).not.toBeNull();
    expect(summary.cancellation?.accessUntil.toISOString()).toBe(
      "2026-02-12T00:00:00.000Z",
    );
    // Nothing is still to come, so no card can be "the last one".
    expect(summary.cancellation?.isLastSession).toBe(false);
  });

  it("stops at the product's own last day when that comes first", () => {
    const summary = mapOne({
      sessionRows: [
        sessionRow({
          product: { endDate: "2026-02-13" },
          subscriptionEndsAt: new Date("2026-06-30T00:00:00Z"),
        }),
      ],
    });
    expect(summary.cancellation?.lastSessionStart?.toISOString()).toBe(
      FIRST_FRIDAY,
    );
    expect(summary.cancellation?.isLastSession).toBe(true);
  });

  /*
   * ---------------------------------------------------------------------
   * The card must never name a date it only projected.
   * ---------------------------------------------------------------------
   *
   * This pair is easy to misread as a missing feature, so here is the whole
   * scenario in full.
   *
   * A club runs on Mondays. Halfway through the term an admin moves it to
   * Wednesdays. The stored session rows for the Mondays that already ran are
   * still there — they are records of evenings that happened — but the
   * product's `schedule_slots` now say Wednesday, and **Wednesday is all the
   * dashboard read knows**: it fetches the product's current schedule and no
   * session rows at all.
   *
   * Now a parent cancels, and the paid window has no session left in it. To
   * name "the last session" the roll-up would have to walk the schedule
   * *backwards* — and that walk runs over Wednesdays, so it would confidently
   * produce a Wednesday on which nothing ever happened. Meanwhile the club
   * page, which loads the group's stored history through the feed RPC, names
   * the real Monday. Two surfaces, one enrollment, two different dates, and the
   * wrong one on the surface a parent looks at most.
   *
   * So the roll-up stops guessing: with nothing left in the window it emits a
   * cancellation carrying `lastSessionStart: null`, and the card drops to copy
   * that names no session and states when access ends instead — a fact the
   * subscription row holds outright.
   *
   * **This is a deliberate information downgrade, not an unfinished feature.**
   * The card gives up a date it could only have invented. Giving it a truthful
   * one means giving it the stored history — a second read the dashboard does
   * not do and should not start doing for one line of copy. The club page is
   * where the real answer lives, and the card links to it.
   *
   * The forward case is untouched and is asserted alongside, because the fix
   * must not cost the common case its date: a projection *forwards* names a
   * session that is genuinely still scheduled, which is a promise about the
   * future rather than a claim about the past, and the club page agrees with it.
   */
  it("names no date once the paid window has no session left to project", () => {
    // Access ends 12 Feb; the schedule's remaining occurrences are all after
    // it, so the forward walk comes back empty.
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-12T00:00:00Z") }),
      ],
    });

    // Still winding down, and still says so.
    expect(summary.cancellation).not.toBeNull();
    // But names no session: the only candidate would be a backward projection
    // off the current schedule, which a mid-term schedule change makes a
    // fabrication. PREVIOUS_FRIDAY is exactly the date the old code emitted.
    expect(summary.cancellation?.lastSessionStart).toBeNull();
    expect(summary.cancellation?.lastSessionStart?.toISOString()).not.toBe(
      PREVIOUS_FRIDAY,
    );
    // The access instant is a fact off the subscription row, so it survives —
    // it is what the date-less copy renders instead.
    expect(summary.cancellation?.accessUntil.toISOString()).toBe(
      "2026-02-12T00:00:00.000Z",
    );
  });

  it("still names the date when a session is genuinely still to come", () => {
    // Access ends 20 Feb, which leaves FIRST_FRIDAY inside the window. The
    // forward walk finds it, so the card may name it — and does.
    const summary = mapOne({
      sessionRows: [
        sessionRow({ subscriptionEndsAt: new Date("2026-02-20T00:00:00Z") }),
      ],
    });

    expect(summary.cancellation?.lastSessionStart?.toISOString()).toBe(
      FIRST_FRIDAY,
    );
    expect(summary.cancellation?.isLastSession).toBe(true);
  });
});

describe("rollUpFamilyEnrollments — the page's shape", () => {
  const FAMILY: FamilyMember[] = [
    { id: PARENT, role: "customer", first_name: "Sanna" },
    { id: OTSO, role: "gamer", first_name: "Otso" },
    { id: AINO, role: "gamer", first_name: "Aino" },
  ];

  function rollUp(
    rows: {
      sessionRows?: MyUpcomingSessionRow[];
      waitlistRows?: MyWaitlistRow[];
    },
    locale: SupportedLocale = "en",
  ) {
    return rollUpFamilyEnrollments({
      family: FAMILY,
      sessionRows: rows.sessionRows ?? [],
      waitlistRows: rows.waitlistRows ?? [],
      now: NOW,
      locale,
      timeZone: "UTC",
    });
  }

  // The family read hands back the reader as well as their children. With
  // nothing of their own booked they are not a section — the page is about the
  // children, and a standing empty heading with the reader's face would say
  // otherwise every week.
  it("leaves a seatless parent out and orders the children by first name", () => {
    const { gamers, self } = rollUp({});
    expect(gamers.map((g) => g.firstName)).toEqual(["Aino", "Otso"]);
    expect(self).toBeNull();
  });

  // The sections are the page's skeleton, and a Finnish family's Ämmi belongs
  // after Zeno rather than before Bea. The runtime default would put her first
  // — and would put her in a different place on the server than in the browser
  // the moment the two disagree, moving every section under the reader on
  // hydration.
  it("collates the children in the viewer's locale, not the runtime's", () => {
    const family: FamilyMember[] = [
      { id: PARENT, role: "customer", first_name: "Sanna" },
      { id: AINO, role: "gamer", first_name: "Ämmi" },
      { id: OTSO, role: "gamer", first_name: "Bea" },
    ];
    const names = (locale: SupportedLocale) =>
      rollUpFamilyEnrollments({
        family,
        sessionRows: [],
        waitlistRows: [],
        now: NOW,
        locale,
        timeZone: "UTC",
      }).gamers.map((g) => g.firstName);

    expect(names("fi")).toEqual(["Bea", "Ämmi"]);
    expect(names("en")).toEqual(["Ämmi", "Bea"]);
  });

  // Two children in one family may share a first name, and neither the server
  // prefetch nor the client refetch imposes an order on the rows it hands back
  // — so with no tiebreak the two sections would sit in whatever order Postgres
  // chose that time, and could swap on hydration. The id is arbitrary as an
  // ordering; being the *same* arbitrary order on both sides is the point.
  it("breaks a shared first name on the id, whatever order the rows arrive in", () => {
    const twins = (order: FamilyMember[]) =>
      rollUpFamilyEnrollments({
        family: order,
        sessionRows: [],
        waitlistRows: [],
        now: NOW,
        locale: "en",
        timeZone: "UTC",
      }).gamers.map((g) => g.id);

    const first: FamilyMember = { id: AINO, role: "gamer", first_name: "Aino" };
    const second: FamilyMember = { id: OTSO, role: "gamer", first_name: "Aino" };

    // OTSO's id collates ahead of AINO's, so it leads either way round.
    expect(twins([first, second])).toEqual([OTSO, AINO]);
    expect(twins([second, first])).toEqual([OTSO, AINO]);
  });

  it("gives a child with nothing booked an empty section rather than none", () => {
    const { gamers } = rollUp({ sessionRows: [sessionRow()] });
    expect(gamers.map((g) => g.enrollments.length)).toEqual([1, 0]);
  });

  // The unification: a seat and a place in line are one list, sorted together.
  it("puts a seat and a waitlist place in one list, running first", () => {
    const [aino] = rollUp({
      waitlistRows: [waitlistRow()],
      sessionRows: [sessionRow()],
    }).gamers;
    expect(aino.enrollments.map((e) => e.participationId)).toEqual([
      "participation-1",
      "waitlist-1",
    ]);
  });

  it("files each row under the child it belongs to", () => {
    const { gamers } = rollUp({
      sessionRows: [
        sessionRow(),
        sessionRow({
          participationId: "participation-2",
          gamer: { id: OTSO, firstName: "Otso" },
        }),
      ],
    });
    expect(gamers[0].enrollments.map((e) => e.participationId)).toEqual([
      "participation-1",
    ]);
    expect(gamers[1].enrollments.map((e) => e.participationId)).toEqual([
      "participation-2",
    ]);
  });
});

/**
 * **The silent drop.**
 *
 * A product can be sold to a parent, so a participation row can be bucketed
 * under the reader's own id. The roll-up used to iterate only the family
 * members whose role was `gamer`, so that bucket matched nobody and vanished —
 * a seat the parent had paid for appeared on no surface at all, which is the
 * bug this whole step exists to close.
 *
 * The pair of assertions is what makes each case mean something: the seat has
 * to come back, and it has to come back **once**, in its own section rather
 * than folded under a child.
 */
describe("rollUpFamilyEnrollments — the parent's own seat", () => {
  const FAMILY: FamilyMember[] = [
    { id: PARENT, role: "customer", first_name: "Sanna" },
    { id: AINO, role: "gamer", first_name: "Aino" },
  ];

  function rollUp(rows: {
    sessionRows?: MyUpcomingSessionRow[];
    waitlistRows?: MyWaitlistRow[];
  }) {
    return rollUpFamilyEnrollments({
      family: FAMILY,
      sessionRows: rows.sessionRows ?? [],
      waitlistRows: rows.waitlistRows ?? [],
      now: NOW,
      locale: "en",
      timeZone: "UTC",
    });
  }

  /** A row whose participant is the parent — the shape 00173 made possible. */
  const selfSeat = sessionRow({
    participationId: "parents-evening",
    gamer: { id: PARENT, firstName: "Sanna" },
  });

  it("keeps the seat rather than dropping it", () => {
    const { self } = rollUp({ sessionRows: [selfSeat] });
    expect(self?.id).toBe(PARENT);
    expect(self?.firstName).toBe("Sanna");
    expect(self?.enrollments.map((e) => e.participationId)).toEqual([
      "parents-evening",
    ]);
  });

  it("keeps it out of every child's section", () => {
    const { gamers } = rollUp({ sessionRows: [selfSeat, sessionRow()] });
    expect(gamers.map((g) => g.id)).toEqual([AINO]);
    expect(gamers[0].enrollments.map((e) => e.participationId)).toEqual([
      "participation-1",
    ]);
  });

  it("sorts the parent's own cards by the same rules as a child's", () => {
    const { self } = rollUp({
      sessionRows: [selfSeat],
      waitlistRows: [
        waitlistRow({
          participationId: "parents-queue",
          gamer: { id: PARENT, firstName: "Sanna" },
        }),
      ],
    });
    // A seat with a session ahead sorts above a place in line, exactly as it
    // does under a child's heading.
    expect(self?.enrollments.map((e) => e.participationId)).toEqual([
      "parents-evening",
      "parents-queue",
    ]);
  });

  it("gives a waitlist place of their own a section too", () => {
    // The queue is a seat's equal on this page, so a parent whose *only*
    // enrollment is a place in line still gets a heading.
    const { self } = rollUp({
      waitlistRows: [
        waitlistRow({
          participationId: "parents-queue",
          gamer: { id: PARENT, firstName: "Sanna" },
        }),
      ],
    });
    expect(self?.enrollments.map((e) => e.participationId)).toEqual([
      "parents-queue",
    ]);
  });

  it("stays null for the parent of a family that only books for children", () => {
    // The common case, and the reason the section is conditional: a heading
    // with the reader's own face over nothing would tell them every week that
    // they had signed up for something and then failed to.
    expect(rollUp({ sessionRows: [sessionRow()] }).self).toBeNull();
  });
});

describe("rollUpGamerEnrollments — one child's own page", () => {
  it("returns only that child's cards, sorted", () => {
    const mine = rollUpGamerEnrollments({
      gamerId: AINO,
      sessionRows: [
        sessionRow(),
        sessionRow({
          participationId: "someone-elses",
          gamer: { id: OTSO, firstName: "Otso" },
        }),
      ],
      waitlistRows: [waitlistRow()],
      now: NOW,
      locale: "en",
      timeZone: "UTC",
    });
    expect(mine.map((e) => e.participationId)).toEqual([
      "participation-1",
      "waitlist-1",
    ]);
  });
});
