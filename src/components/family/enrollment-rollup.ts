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
  enumerateRowOccurrences,
  startDateToCutoff,
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
   *
   * **It *can* be true on a product that has already ended, and that
   * combination is accepted rather than overlooked.** It means an admin never
   * placed the child before the run finished. The card then sorts into the
   * finished band, stays inert and wears the awaiting tone, so the footer's
   * "matching with a Gedu" reads as a promise about a product that is over —
   * which is untidy, and was weighed and left alone: the state is an
   * administrative slip rather than something the product does, it is rare, and
   * every alternative costs a new card state and five locales' worth of copy to
   * describe a situation whose real fix is placing the child. The inertness in
   * particular is *not* a bug to correct — there is genuinely no page behind an
   * unplaced seat, ended or not, and the feed RPC would refuse it.
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

/**
 * One enrollment, with **whoever holds the seat** — the grouping's raw material.
 *
 * The id is the participant's, not a child's, and the distinction is the whole
 * reason this type was renamed: a product may be for parents, so the person in
 * the seat can be the account holder themselves. Everything downstream keys off
 * this id without caring which of the two it is.
 */
export interface FamilyEnrollmentEntry {
  participantId: string;
  enrollment: FamilyEnrollmentSummary;
}

/**
 * One person's section of a family dashboard: who they are, and what they are
 * in.
 *
 * **A person, not a child.** The parent's own enrollments come back in exactly
 * this shape, because a section is a heading with a face and a name over a list
 * of cards whichever of them it is about — what differs is only what the page
 * puts *beside* the heading and which audience the cards are rendered for, and
 * both of those are the page's business rather than this type's.
 */
export interface FamilyParticipantEnrollments {
  /**
   * The participant's profile id. It seeds the identicon, so it has to be the
   * real UUID — the pattern is derived from the id's hex bytes.
   */
  id: string;
  firstName: string;
  /** Already sorted: running, then waiting, then finished. */
  enrollments: readonly FamilyEnrollmentSummary[];
}

/**
 * The parent dashboard's whole cast: the children, and the reader themselves
 * when they hold a seat of their own.
 *
 * **Two fields rather than one list with a role flag on each entry**, because
 * the two are not interchangeable to the page that renders them: a child's
 * section carries a Manage link to their identity page and an empty-state card
 * when nothing is booked, and the reader's carries neither — it does not exist
 * at all unless there is something in it. Handing the body one list would make
 * every one of those a per-entry conditional on a flag, which is the shape that
 * lets a caller forget one.
 */
export interface FamilyDashboardEnrollments {
  /** One section per linked child, in the order the sections appear. */
  gamers: FamilyParticipantEnrollments[];
  /**
   * The reader's own seats, or `null` when they hold none — which is the
   * overwhelmingly common case and the reason the section is conditional.
   */
  self: FamilyParticipantEnrollments | null;
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
      participantId: row.participant.id,
      enrollment: sessionSummary(row, args),
    })),
    ...args.waitlistRows.map((row) => ({
      participantId: row.participant.id,
      enrollment: waitlistSummary(row, args),
    })),
  ];
}

/**
 * The parent dashboard's whole shape: one section per child, in the order the
 * sections appear, each carrying that child's sorted cards — **plus the
 * reader's own section when they hold a seat themselves.**
 *
 * **The family read includes the reader**, and one linked parent may see
 * another, so the child list is filtered to `role === 'gamer'` before anything
 * else happens. That filter used to be the end of it, and that was the bug: a
 * product may be for parents, so an enrollment can be bucketed under the
 * reader's own id, match no `gamer` member, and vanish — a seat paid for and
 * shown nowhere. The reader now gets their bucket back, **and only when it has
 * something in it**: a parent is not a standing section on their own dashboard,
 * because the page is about their children and a permanently empty heading
 * carrying their own face would say so wrongly.
 *
 * **The reader is the family list's only `customer` member — that is the real
 * invariant, and it is stronger than "at most one has a bucket".** Both
 * resolvers build the list as the reader plus their linked gamers (the RLS
 * profile policies expose exactly that; the admin-side resolver pins the
 * parent ids to the caller), so a co-parent is never in the list at all and
 * `find(role === "customer")` yields the reader or nothing. Separately, both
 * enrollment reads are scoped to `customer_id = auth.uid()`, so an adult
 * participant on any row here is the reader — belt to the invariant's braces,
 * written down because a future widening of the family list would land on
 * this reasoning first. There is deliberately no de-duplication in the other
 * direction either: the RLS select policies on participations are
 * role-partitioned, so no session can match both the customer arm and the
 * gamer arm and a seat cannot render twice.
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
): FamilyDashboardEnrollments {
  const byParticipant = new Map<string, FamilyEnrollmentSummary[]>();
  for (const { participantId, enrollment } of toFamilyEnrollments(args)) {
    const bucket = byParticipant.get(participantId);
    if (bucket) bucket.push(enrollment);
    else byParticipant.set(participantId, [enrollment]);
  }

  const sectionFor = (member: FamilyMember): FamilyParticipantEnrollments => ({
    id: member.id,
    firstName: member.first_name,
    // A row whose participant is not in the family list is dropped rather than
    // rendered under a heading nobody can name. RLS makes that impossible in
    // practice — both reads are scoped to the same account the family read is
    // — so this is a shape guarantee, not a filter with a job.
    enrollments: sortFamilyEnrollments(
      byParticipant.get(member.id) ?? [],
      args.now,
      args.locale,
    ),
  });

  const reader = args.family.find((member) => member.role === "customer");
  const readerSection = reader ? sectionFor(reader) : null;
  const self =
    readerSection && readerSection.enrollments.length > 0 ? readerSection : null;

  return {
    gamers: args.family
      .filter((member) => member.role === "gamer")
      .sort(
        (a, b) =>
          a.first_name.localeCompare(b.first_name, args.locale) ||
          a.id.localeCompare(b.id),
      )
      .map(sectionFor),
    self,
  };
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
      .filter((entry) => entry.participantId === args.gamerId)
      .map((entry) => entry.enrollment),
    args.now,
    args.locale,
  );
}

/**
 * The winding-down state a cancelled membership's card renders — and the part
 * that actually needed deciding, **whether the card may name a date at all.**
 *
 * **One rule for which session is last; a narrower rule for naming it.** The
 * rule itself is shared with the club page and unchanged: the last session a
 * paid window covers is the furthest-out one inside it if any are still to
 * come, and otherwise the most recent one that already ran. What differs is
 * that this surface may only *say* the answer when it comes from the forward
 * walk. The club page says it in both cases, because it reads a feed merged
 * from the group's stored rows and so has the better answer available.
 *
 * **"Better" rather than "certain", and the distinction is worth keeping
 * straight.** The page takes the newest entry of its feed, and that feed merges
 * stored rows over projected occurrences — so where a row exists the date it
 * names is that row's own snapshot of when the session actually ran, and where
 * none exists it is a projection off the current schedule, exactly the kind of
 * guess this card refuses to make. The page is therefore not immune to the
 * moved-club case; what it is immune to is *contradicting itself*, because the
 * date in the notice is read off the very list of sessions rendered beneath it.
 *
 * **Why the card must not answer the second case itself.** The dashboard read
 * fetches no session rows — only the product's *current* schedule — so the only
 * way to name a past session here is to project one backwards, and a projection
 * is not a record. Move a club from Mondays to Wednesdays mid-term and the
 * backward walk happily produces a Wednesday that never ran, while the club
 * page, where a row exists, names the Monday that did. That was a card and a
 * page contradicting each other about the same enrollment, in the surface a
 * parent checks *most* often, in exactly the situation they are most likely to
 * be checking it. The card has no list of its own to be consistent with and no
 * rows to fall back on, so it has nothing to offer but the guess.
 *
 * So the fallback returns `lastSessionStart: null` and the card drops to copy
 * that names no session, stating instead when access ends — which the
 * subscription row tells us outright and no walk has to guess. **This is a
 * deliberate information downgrade, not a gap waiting to be filled**: the card
 * gives up a date it could only have invented, keeps the not-renewing marking
 * the plan requires, and points at a page with the fuller answer. Giving the
 * card a truthful date means giving it the stored history, not a better walk.
 */
function cancellationFor(
  /** The instant paid access ends — `null` on a healthy subscription. */
  accessUntil: Date | null,
  /**
   * The forward walk's occurrences, already bounded by the paid window and
   * sorted soonest-first.
   */
  remaining: readonly { start: Date }[],
): SessionCancellation | null {
  if (accessUntil === null) return null;

  // Nothing left inside the window. The membership is still winding down and
  // still has to say so — it just has no session it may honestly name.
  if (remaining.length === 0) {
    return { accessUntil, lastSessionStart: null, isLastSession: false };
  }

  return {
    accessUntil,
    lastSessionStart: remaining[remaining.length - 1].start,
    // "This *is* the last one" — a claim about the session the card is
    // otherwise pointing at, so it needs one still to come and it needs to be
    // the only one left.
    isLastSession: remaining.length === 1,
  };
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
    // Emitted for the whole of a winding-down membership's life, including the
    // stretch after its last session has run — that is when a parent is most
    // likely to be looking. What varies is whether it carries a date: only the
    // forward walk can supply one this surface is entitled to state. See
    // `cancellationFor`.
    cancellation: cancellationFor(subEnd, occurrences),
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
