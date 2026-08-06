import {
  formatProductSchedule,
  scheduleCardLines,
} from "@/components/public/products/format-product-schedule";
import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { runEndedOn, runLiveness, type RunLiveness } from "@/lib/product-run";
import {
  earlierBoundary,
  endDateToCutoff,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
  startDateToCutoff,
  undatedPastFloor,
} from "@/lib/session-occurrence";
import type { FamilyMember } from "@/services/family";
import type {
  MyUpcomingSessionRow,
  MyWaitlistRow,
} from "@/services/participations";
import type { ProductType } from "@/types";
import type { SessionCancellation } from "@/components/parent/session-card-badge";

/**
 * One **enrollment** — a family's participation in one product — rolled up to
 * the single card the parent and gamer dashboards both render.
 *
 * The family dashboards used to enumerate *occurrences*: a weekly club emitted
 * eight near-identical rows, a camp one per scheduled day, and a family with two
 * children met a screen of cards that mostly said the same thing twice. The
 * question a parent actually opens the page with is shorter — what is each of my
 * children signed up for, when does it run, and is anything wrong — so the unit
 * of the page is the enrollment, exactly as the gedu dashboard's unit is the
 * assignment.
 *
 * The summary is deliberately **flat and pre-derived**: the next session, the
 * schedule in words, and the three exceptional states (a waitlist place, a
 * failing card, a cancelled subscription) all arrive resolved. Nothing here
 * queries, and nothing here formats — a fixture and a live data shell can
 * produce the same shape, which is what lets one page body serve a preview scene
 * and the real route.
 */
export interface FamilyEnrollmentSummary {
  /** Stable key, and what a payment-problem badge routes its portal session by. */
  participationId: string;
  /** Translated product name — the card's title. */
  productName: string;
  productType: ProductType;
  /**
   * Start of the soonest session still worth showing, or `null` when there is
   * none: a waitlisted enrollment with no placement, or a run whose schedule has
   * been exhausted.
   */
  nextSessionStart: Date | null;
  /** End of that session. `null` exactly when `nextSessionStart` is. */
  nextSessionEnd: Date | null;
  /**
   * Whether this product has a voice room at all — true only for a remote one.
   * An in-person enrollment renders **no** Join affordance rather than a locked
   * one: a locked button promises it will open, and a camp in a library has no
   * room behind it that ever will.
   */
  hasVoiceRoom: boolean;
  /** Where the Join navigates. `"#"` keeps it inert. */
  voiceHref: string;
  /**
   * The venue an in-person enrollment runs at, `null` for a remote one. The
   * in-person counterpart of the Join button — the same question (where is this
   * happening) answered the other way a product can answer it.
   */
  siteName: string | null;
  /** Where a click anywhere on the card navigates — the product's own page. */
  openHref: string;
  /** The product's last day as a bare `YYYY-MM-DD`, or `null` when open-ended. */
  endDate: string | null;
  /** The zone `endDate` is a date **in** — the product's own. */
  timezone: string;
  /**
   * 1-based place in line when this enrollment is waitlisted, `null` when the
   * gamer holds a seat. A waitlisted enrollment is a card in the same list as
   * every other — the family is *in* something, they are just waiting on a seat
   * — so it is a state of this summary rather than a separate band.
   */
  waitlistPosition: number | null;
  /**
   * The seat is bought and paid for and nobody has been put in a group yet
   * (`group_id IS NULL`) — the state between a purchase landing and an admin
   * placing the child with a Gedu, which can take a day.
   *
   * A first-class state rather than a variation on running, because *nothing*
   * behind this enrollment exists yet: no group means no voice room, no feed
   * and no page, so the card carries no Join, no link and no chevron — the
   * same inertness a waitlist place has, arrived at for the same reason. It is
   * distinct from a waitlist place in the one way that matters to the family:
   * the seat is theirs, and the schedule on the card is one they will actually
   * be attending.
   *
   * Never true at the same time as `waitlistPosition !== null`: a waitlisted
   * row has no seat to be unplaced in.
   */
  awaiting: boolean;
  /** The subscription behind this enrollment is `past_due`. */
  paymentProblem: boolean;
  /** Set when the parent has cancelled this club's subscription. */
  cancellation: SessionCancellation | null;
  /**
   * The product's schedule in words ("Mondays 16:30–18:00"), from the shared
   * product-schedule formatter, so a family reads the same sentence the public
   * product page shows them. Empty when the product has no slots yet.
   */
  scheduleLines: readonly string[];
}

/**
 * The last day of a finished run, or `null` while it is still going.
 *
 * The same question the gedu dashboard asks of an assignment, asked of an
 * enrollment: the underlying test is a zone-aware "is this product's final
 * calendar day behind us, with nothing left on the schedule", which is a fact
 * about the product and not about who is looking at it. Wrapped rather than
 * imported at each call site so a family surface names the family concept.
 */
export function enrollmentEndedOn(
  enrollment: Pick<
    FamilyEnrollmentSummary,
    "endDate" | "timezone" | "nextSessionStart"
  >,
  now: Date,
): string | null {
  return runEndedOn(enrollment, now);
}

/**
 * Whether this enrollment's next session is running, and whether its room is
 * open, as of one instant — asked together off one clock so the card's gradient,
 * its Live badge and its Join button can never disagree.
 */
export function enrollmentLiveness(
  enrollment: Pick<
    FamilyEnrollmentSummary,
    "nextSessionStart" | "nextSessionEnd" | "hasVoiceRoom"
  >,
  now: Date,
): RunLiveness {
  return runLiveness(enrollment, now);
}

/**
 * The three bands a card can be in, in the order a family reads them.
 *
 * 0. **Running** — a seat held and a session ahead. What the page is for.
 * 1. **Waiting** — a waitlist place, or a run whose schedule has been used up
 *    without the product having formally ended. Nothing to turn up to yet, but
 *    nothing over either.
 * 2. **Finished** — the run's last day is behind us.
 */
function bandOf(endedOn: string | null, nextSessionStart: Date | null): number {
  if (endedOn !== null) return 2;
  if (nextSessionStart === null) return 1;
  return 0;
}

/**
 * Sort one gamer's enrollments the way that gamer's week actually runs:
 * **soonest session first, with every finished run beneath every live one.**
 *
 * A finished run is demoted rather than dropped. Its reports and its record are
 * still worth reaching, and a camp that ended last week is the first thing a
 * parent goes looking for when they want the photos — but it contributes nothing
 * to "what is happening this week", which is the question the top of the list
 * has to answer. Inside the finished band the order is most-recently-ended
 * first: the bare `YYYY-MM-DD` dates compare chronologically as strings, so this
 * needs no parsing.
 *
 * Waitlist places sit between the two. They are not a fact about this week (no
 * session to turn up to) and they are emphatically not history — a seat could
 * open tomorrow — so they land after everything scheduled and before everything
 * over.
 *
 * The final tiebreak compares product *names*, which are user-visible text in
 * the viewer's language, so the collation has to be the viewer's too — hence
 * the required `locale`. Left to the runtime default, a Finnish parent's list
 * would file "Ämpäri Club" before "Bomb Club" instead of after "Zelda Club",
 * and the ordering would differ between their phone and the server that
 * rendered their first paint. Required rather than defaulted: a fallback here
 * would be the runtime collation wearing a disguise.
 */
export function sortFamilyEnrollments(
  enrollments: readonly FamilyEnrollmentSummary[],
  now: Date,
  locale: SupportedLocale,
): FamilyEnrollmentSummary[] {
  // Endedness is resolved once per enrollment and carried through the sort
  // rather than recomputed inside the comparator: it is a zone-aware date parse,
  // and a comparator would run it O(n log n) times to answer the same question
  // about the same instant every time.
  const ranked = enrollments.map((enrollment) => {
    const endedOn = enrollmentEndedOn(enrollment, now);
    return {
      enrollment,
      endedOn,
      band: bandOf(endedOn, enrollment.nextSessionStart),
    };
  });

  ranked.sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    if (a.band === 0) {
      const aStart = a.enrollment.nextSessionStart;
      const bStart = b.enrollment.nextSessionStart;
      // Band 0 is defined by both being non-null; the guards keep that a fact
      // the compiler agrees with rather than one a comment asserts.
      if (aStart !== null && bStart !== null && aStart.getTime() !== bStart.getTime()) {
        return aStart.getTime() - bStart.getTime();
      }
    }
    if (a.band === 2 && a.endedOn !== null && b.endedOn !== null) {
      if (a.endedOn !== b.endedOn) return a.endedOn < b.endedOn ? 1 : -1;
    }
    return a.enrollment.productName.localeCompare(
      b.enrollment.productName,
      locale,
    );
  });

  return ranked.map((entry) => entry.enrollment);
}

// ---------------------------------------------------------------------------
// Service rows → summaries
// ---------------------------------------------------------------------------

/**
 * **The roll-up runs client-side, not in the data shell**, and that is a
 * constraint rather than a convenience.
 *
 * Two of the fields it produces are functions of things a server cannot know
 * once and be done with. `scheduleLines` is rendered in the *viewer's* zone and
 * locale, and `nextSessionStart` has to advance as sessions start and finish —
 * a summary built once at request time would go on naming a session the family
 * is already sitting in. So the server prefetches the **rows**, and a client
 * hook runs this mapping over them against the shared 30-second clock.
 *
 * What is emphatically *not* produced here is anything about whether a room is
 * open right now. Liveness is derived per tick from `useNow()` and the shared
 * voice-window arithmetic, by the card itself; a summary carrying an `isOpen`
 * boolean gives one card two clocks, which is a bug this codebase has already
 * fixed once on the gedu side.
 */
export interface FamilyRollUpArgs {
  /** `status='active'` rows — placed and unplaced alike. */
  sessionRows: readonly MyUpcomingSessionRow[];
  /** `status='waitlisted'` rows, each with its live place in line. */
  waitlistRows: readonly MyWaitlistRow[];
  /** The instant every derivation is anchored to — the shared clock's tick. */
  now: Date;
  /** Viewer's UI locale, for the product name and the venue name. */
  locale: SupportedLocale;
  /** Viewer's IANA zone — the schedule sentence is stated in it. */
  timeZone: string;
  /**
   * Where a card's stretched link goes, per enrollment.
   *
   * A seam rather than a computed href: the family product page does not exist
   * yet, and a mapping that named a route before there was one behind it would
   * be manufacturing a link that 404s. Everything unresolved collapses to `"#"`,
   * which the card already renders as a real anchor that goes nowhere. The
   * shell that adds the routes fills this in; nothing else about the mapping
   * changes when it does.
   *
   * Never consulted for a waitlist place or an unplaced seat — neither has a
   * page behind it, and the card refuses to be a link at all in both states.
   */
  openHref?: (enrollment: {
    participationId: string;
    productType: ProductType;
  }) => string;
}

/** One enrollment, with the child it belongs to — the grouping's raw material. */
export interface FamilyEnrollmentEntry {
  gamerId: string;
  enrollment: FamilyEnrollmentSummary;
}

/** One child's section of a family dashboard: who they are, and what they are in. */
export interface FamilyGamerEnrollments {
  /**
   * The gamer's profile id. It seeds the identicon, so it has to be the real
   * UUID — the pattern is derived from the id's hex bytes.
   */
  id: string;
  firstName: string;
  /** Already sorted: running, then waiting, then finished. */
  enrollments: readonly FamilyEnrollmentSummary[];
}

/**
 * Every enrollment the two reads describe, as flat summaries tagged with whose
 * they are — **one list, not two bands**.
 *
 * The unification is the point. A family holding a seat and a family holding a
 * place in line are both *in* something; splitting the page by our own `status`
 * column asked a parent to learn the distinction before they could read their
 * own dashboard. The two reads stay separate because their failure semantics
 * differ, and they meet here, once, in memory.
 *
 * Order is not meaningful — `sortFamilyEnrollments` decides that, per child.
 */
export function toFamilyEnrollments(
  args: FamilyRollUpArgs,
): FamilyEnrollmentEntry[] {
  return [
    ...args.sessionRows.map((row) => ({
      gamerId: row.gamer.id,
      enrollment: sessionSummary(row, args),
    })),
    ...args.waitlistRows.map((row) => ({
      gamerId: row.gamer.id,
      enrollment: waitlistSummary(row, args),
    })),
  ];
}

/**
 * The parent dashboard's whole shape: one section per child, in the order the
 * sections appear, each carrying that child's sorted cards.
 *
 * **The family read includes the reader**, and one linked parent may see
 * another, so the list is filtered to `role === 'gamer'` before anything else
 * happens — a parent is not a section on their own dashboard, and the identicon
 * heading would be their own face.
 *
 * Children are ordered by **first name**, collated in the viewer's own locale.
 * There is no meaningful order in the data — no birth order is recorded and a
 * purchase order would reshuffle the page every time a club was bought — and
 * the one thing a parent scrolling for a particular child needs is that the
 * sections are where they were yesterday. Which is also why the collation is
 * not the runtime's: a Finnish family's Ämmi belongs after Zeno, and a sort
 * that agreed with that on the server and disagreed on the phone would move
 * the sections under the reader on hydration.
 *
 * **The id breaks a tie, because a first name does not have to be unique.** Two
 * children in one family can share one, and neither read that feeds this — the
 * server's RLS-scoped `profiles` select nor the client's family query — imposes
 * an order of its own. With the comparator returning 0 the two sections would
 * come out in whatever order Postgres happened to hand the rows back, which is
 * free to differ between the prefetch and the client refetch: the same
 * hydration-time shuffle the locale pinning above exists to prevent, reached
 * from the other side. The id is arbitrary as an ordering, and that is fine —
 * what it buys is that it is the *same* arbitrary order every time.
 *
 * A child with nothing booked still gets a section: their absence from the rows
 * is exactly the empty state the page renders for them.
 */
export function rollUpFamilyEnrollments(
  args: FamilyRollUpArgs & { family: readonly FamilyMember[] },
): FamilyGamerEnrollments[] {
  const byGamer = new Map<string, FamilyEnrollmentSummary[]>();
  for (const { gamerId, enrollment } of toFamilyEnrollments(args)) {
    const bucket = byGamer.get(gamerId);
    if (bucket) bucket.push(enrollment);
    else byGamer.set(gamerId, [enrollment]);
  }

  return args.family
    .filter((member) => member.role === "gamer")
    .sort(
      (a, b) =>
        a.first_name.localeCompare(b.first_name, args.locale) ||
        a.id.localeCompare(b.id),
    )
    .map((member) => ({
      id: member.id,
      firstName: member.first_name,
      // A row whose gamer is not in the family list is dropped rather than
      // rendered under a heading nobody can name. RLS makes that impossible in
      // practice — both reads are scoped to the same account the family read is
      // — so this is a shape guarantee, not a filter with a job.
      enrollments: sortFamilyEnrollments(
        byGamer.get(member.id) ?? [],
        args.now,
        args.locale,
      ),
    }));
}

/**
 * The same mapping for a child's own dashboard, which has exactly one person on
 * it and therefore no grouping to do — just this gamer's cards, sorted.
 *
 * It filters by id rather than trusting the reads to be self-scoped, because
 * the family read a gamer gets back carries their siblings too, and the day
 * somebody prefetches the sessions rows with the wrong audience is the day a
 * child's dashboard would quietly show their brother's club.
 */
export function rollUpGamerEnrollments(
  args: FamilyRollUpArgs & { gamerId: string },
): FamilyEnrollmentSummary[] {
  return sortFamilyEnrollments(
    toFamilyEnrollments(args)
      .filter((entry) => entry.gamerId === args.gamerId)
      .map((entry) => entry.enrollment),
    args.now,
    args.locale,
  );
}

/**
 * **The last session a cancelled enrollment's paid window still covers.** This
 * is the canonical statement of that rule, and both family surfaces implement
 * it — the dashboard card through this function, the club page over the feed it
 * has already built (see the family product page's own note).
 *
 * The rule, in one sentence: **the furthest-out session inside the paid window
 * if any are still to come, and otherwise the most recent one that already
 * ran.** `null` only when the window covers no session at all.
 *
 * **Why it does not stop at "still to come".** A membership that has had its
 * last session but has days of paid access left is still winding down, and the
 * plan is explicit that such an enrollment must be *visibly marked as not
 * renewing*. Reading the mark off the forward walk alone made the card fall
 * silent for the several days between the final session and the period end —
 * the exact stretch during which a parent is most likely to be checking. So the
 * walk falls back rather than the state disappearing, and the card names the
 * session that *was* the last one, which its copy already reads correctly for.
 *
 * **And why the two surfaces cannot simply share one call.** They hold
 * different raw material — the card has schedule rows and walks them, the page
 * has a built, already-clamped feed and reads the top of it — and forcing one
 * signature over both would mean the page re-deriving occurrences it is already
 * holding, which is a second source of truth for what the page renders. What
 * they share is this rule, stated here, referenced there.
 *
 * The backward walk is asked for **one occurrence per slot**, because the only
 * question is which is newest; it runs only for a cancelled enrollment whose
 * forward walk came back empty, so it costs nothing in the ordinary case.
 */
function lastCoveredSession(args: {
  /** The forward walk's occurrences, already bounded by the paid window. */
  remaining: readonly { start: Date }[];
  slots: readonly { weekday: number; startTime: string; durationMinutes: number }[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  /** The instant paid access ends. */
  accessUntil: Date;
  now: Date;
}): Date | null {
  const { remaining, slots, timezone, startDate, endDate, accessUntil, now } =
    args;

  if (remaining.length > 0) return remaining[remaining.length - 1].start;
  if (slots.length === 0) return null;

  const startBoundary = startDateToCutoff(startDate, timezone);
  const past = enumeratePastRowOccurrences({
    slots: slots.map((slot) => ({ ...slot })),
    timezone,
    now,
    floor: startBoundary ?? undatedPastFloor(now),
    endBoundary: earlierBoundary(
      endDateToCutoff(endDate, timezone),
      accessUntil,
    ),
    maxOccurrences: 1,
  });

  // Ascending across each slot and then concatenated, so the newest is a max
  // rather than the last element — two slots on different weekdays interleave.
  let newest: Date | null = null;
  for (const occurrence of past) {
    if (occurrence.start.getTime() > accessUntil.getTime()) continue;
    if (newest === null || occurrence.start.getTime() > newest.getTime()) {
      newest = occurrence.start;
    }
  }
  return newest;
}

/**
 * An `status='active'` row — a seat the family holds, placed or not.
 *
 * **Everything the card shows stops at the paid window.** When a parent has
 * cancelled, the occurrence walk is bounded by whichever comes first, the
 * product's own last day or the instant paid access ends, so the next session
 * the card names is one the family can actually attend and the sort cannot
 * float a cancelled club above a live one on the strength of a session nobody
 * is entitled to.
 */
function sessionSummary(
  row: MyUpcomingSessionRow,
  { now, locale, timeZone, openHref }: FamilyRollUpArgs,
): FamilyEnrollmentSummary {
  const { product } = row;
  const awaiting = row.groupId === null;
  const hasVoiceRoom = product.isRemote;
  const subEnd = row.subscriptionEndsAt;

  const occurrences = enumerateRowOccurrences({
    slots: row.slots,
    timezone: product.timezone,
    now,
    startBoundary: startDateToCutoff(product.startDate, product.timezone),
    endBoundary: earlierBoundary(
      endDateToCutoff(product.endDate, product.timezone),
      subEnd,
    ),
    // One occurrence is all a card states — except on a cancelled membership,
    // where the *last* covered session has to be identified as the last, and
    // that cannot be known without walking to the end of the window. The walk
    // is finite either way: a cancelled sub always supplies a terminal instant,
    // so the uncapped branch is bounded by the boundary above.
    cap: subEnd === null ? 1 : Infinity,
    windowCloseMs: VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000,
  });
  // Guarded on the length rather than on the element, because indexed access is
  // typed as always-present here — an `?? null` would read as a check the
  // compiler has already refused to make.
  const empty = occurrences.length === 0;
  const next = empty ? null : occurrences[0];
  const lastCovered =
    subEnd === null
      ? null
      : lastCoveredSession({
          remaining: occurrences,
          slots: row.slots,
          timezone: product.timezone,
          startDate: product.startDate,
          endDate: product.endDate,
          accessUntil: subEnd,
          now,
        });

  return {
    participationId: row.participationId,
    productName: resolveTranslation(product.translations, locale)?.name ?? "",
    productType: product.type,
    nextSessionStart: next === null ? null : next.start,
    nextSessionEnd: next === null ? null : next.end,
    hasVoiceRoom,
    // The room is keyed by group, so an unplaced seat has no destination —
    // the same inert `"#"` an in-person product gets, and for the same reason:
    // there is nothing to navigate to. The card renders no Join in either case.
    voiceHref:
      hasVoiceRoom && row.groupId !== null
        ? ROUTES.voice.groupSession(row.groupId)
        : "#",
    // Never carried by a remote product, whatever the row says: a product with
    // a voice room has no building, and a card showing both would be claiming
    // the family meets in two places. The read already gates this, so this is
    // belt and braces on a claim the card makes visually.
    siteName:
      hasVoiceRoom || product.site === null
        ? null
        : localizedLocationName(product.site, locale),
    // Nothing to open behind an unplaced seat: no group means no feed and no
    // page, which is the same reason the card drops its chevron and its anchor.
    openHref:
      awaiting || openHref === undefined
        ? "#"
        : openHref({
            participationId: row.participationId,
            productType: product.type,
          }),
    endDate: product.endDate,
    timezone: product.timezone,
    waitlistPosition: null,
    awaiting,
    paymentProblem: row.paymentProblem,
    // Emitted whenever the subscription is winding down and the window covers
    // any session at all — the mark is not dropped just because the last one
    // has already run. `null` only on a healthy sub, or on an enrollment with
    // no occurrences whatsoever to point at.
    cancellation:
      subEnd === null || lastCovered === null
        ? null
        : {
            accessUntil: subEnd,
            lastSessionStart: lastCovered,
            // "This *is* the last one" — a claim about the session the card is
            // otherwise pointing at, so it needs one still to come and it needs
            // to be the only one left.
            isLastSession: occurrences.length === 1,
          },
    scheduleLines: scheduleLinesFor(
      {
        type: product.type,
        startDate: product.startDate,
        endDate: product.endDate,
        timezone: product.timezone,
        slots: row.slots,
      },
      { locale, timeZone, now },
    ),
  };
}

/**
 * A `status='waitlisted'` row — a place in line, stated as a card in the same
 * list as every seat.
 *
 * It carries **no next session**, because no occurrence of this product is
 * theirs to turn up to; the schedule sentence still renders, because that is a
 * fact about the product and it is exactly what a family weighing up whether to
 * stay in the queue wants to read. And it links nowhere: `openHref` is not even
 * consulted, since there is no page behind a queue position.
 */
function waitlistSummary(
  row: MyWaitlistRow,
  { now, locale, timeZone }: FamilyRollUpArgs,
): FamilyEnrollmentSummary {
  const { product } = row;
  return {
    participationId: row.participationId,
    productName: resolveTranslation(product.translations, locale)?.name ?? "",
    productType: product.type,
    nextSessionStart: null,
    nextSessionEnd: null,
    hasVoiceRoom: product.isRemote,
    voiceHref: "#",
    siteName: null,
    openHref: "#",
    endDate: product.endDate,
    timezone: product.timezone,
    waitlistPosition: row.position,
    awaiting: false,
    // Both are facts about a subscription, and a queue position is not one:
    // nothing has been charged for a place in line, so there is nothing to be
    // past due on and nothing to wind down.
    paymentProblem: false,
    cancellation: null,
    scheduleLines: scheduleLinesFor(
      {
        type: product.type,
        startDate: product.startDate,
        endDate: product.endDate,
        timezone: product.timezone,
        slots: row.slots,
      },
      { locale, timeZone, now },
    ),
  };
}

/**
 * The product's cadence in words, through the same formatter the public browse
 * cards and the gedu dashboard use — so a family reads the identical sentence
 * wherever they meet the product, in their own zone.
 *
 * Deliberately blind to the enrollment: a cancelled membership does not change
 * what day the club runs on, and neither does a place in line.
 */
function scheduleLinesFor(
  product: {
    type: ProductType;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
    slots: readonly { weekday: number; startTime: string; durationMinutes: number }[];
  },
  { locale, timeZone, now }: { locale: SupportedLocale; timeZone: string; now: Date },
): string[] {
  return scheduleCardLines(
    formatProductSchedule({
      product: {
        product_type: product.type,
        start_date: product.startDate,
        end_date: product.endDate,
        timezone: product.timezone,
        schedule_slots: product.slots.map((slot) => ({
          weekday: slot.weekday,
          start_time: slot.startTime,
          duration_minutes: slot.durationMinutes,
        })),
      },
      locale,
      timeZone,
      now,
    }),
  );
}
