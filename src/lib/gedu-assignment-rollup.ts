import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { runEndedOn } from "@/lib/product-run";
import { occurrenceOnDate } from "@/lib/session-date-occurrence";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { MyAssignedProductSessionRow } from "@/services/assignments";
import type { ProductType } from "@/types";
import type {
  AppHrefObject,
  MaybeInertHref,
  MaybeInertHrefObject,
} from "@/lib/constants/routes";
import { INERT_HREF } from "@/lib/constants/routes";

/**
 * Rolling a gedu's assignments up to **one card per assignment** for the
 * dashboard.
 *
 * The dashboard used to enumerate occurrences: a weekly club emitted up to eight
 * near-identical cards, and a camp one per scheduled day, so a gedu with two
 * clubs met a screen of a dozen rows saying almost the same thing. Once per-
 * session detail lives in the product page's feed, that enumeration has exactly
 * one right home — the feed — and the dashboard's job shrinks to "which rooms do
 * I run, which one is next, and where am I behind". This module is that
 * reduction: it consumes the same assignment rows the per-occurrence expansion
 * does, and emits one summary per (product × group).
 *
 * The occurrence horizon is still walked, because the *next* session has to be
 * correct including the case where one is in progress right now — it is just
 * collapsed to its first element instead of being handed on as a list. A
 * recurring-schedule line replaces the enumerated dates, so the reader still
 * learns the cadence without reading eight rows to infer it.
 *
 * **What is gedu-specific is what is left here.** Whether a run has finished and
 * whether it is live are facts about a *product*, and which type noun a product
 * falls under is a fact about the schema — a family surface asks all three of the
 * same questions about the same rows. Those derivations live in the neutral
 * modules beside this one (`product-run`, `activity-type`) and are consumed here;
 * only the assignment-shaped roll-up and its ordering are the gedu's own.
 *
 * **There are two roll-ups here, over one list of rows.** Since 00272 the
 * assignment read returns a second kind of seat — a live **substitution**, one row per
 * substitution date — and the two reduce differently: an assignment collapses a
 * schedule to its next occurrence, a substitution *is* one occurrence and collapses to
 * nothing. So they emit different summaries and draw different cards, and each
 * roll-up ignores the other's rows.
 *
 * **Every per-seat fact is keyed by (product, group), never by product alone.**
 * A gedu holds at most one assignment per product, which is what made a product
 * id look like a key — but a substitution is on a *group*, and one gedu may substitute on a
 * sibling group of a product they already teach. Under a product key those two
 * cards would have shared a badge count, a workspace link and a voice room.
 * {@link geduAssignmentKey} is that key; a substitution's own identity is (group,
 * date), which is {@link geduSubstitutionKey}.
 */

/**
 * An assignment row plus the two group-level facts a roll-up card needs.
 *
 * The per-occurrence expansion never needed either, so the RPC behind the live
 * dashboard does not return them yet: promotion adds the gedu's own group name
 * and that group's active participation count to its output. Until then a
 * fixture supplies them, which is also why they are modelled as part of the
 * *input* rather than invented inside this module.
 */
export interface GeduAssignmentRow extends MyAssignedProductSessionRow {
  /** Display name of the gedu's own group, or `null` when unnamed. */
  groupName: string | null;
  /** Active participations in the gedu's own group — not the product total. */
  groupParticipantCount: number;
  /**
   * The site an in-person product runs at, or `null` for a remote one. Every
   * in-person product has a location (the schema requires it), so `null` here
   * means "no building involved" rather than "not loaded".
   */
  siteName: string | null;
}

/**
 * The key every per-seat fact is looked up by — a product and the gedu's group
 * in it, together.
 *
 * Product alone was the key until substitutions existed, and it was wrong the moment
 * they did: two seats on one product (an assignment on one group, a substitution on
 * another) would have collided on every one of the three maps below, so one
 * card would have drawn the other's badge and linked to the other's workspace.
 */
export function geduAssignmentKey(productId: string, groupId: string): string {
  return `${productId}:${groupId}`;
}

/**
 * A substitution's own identity: the group, and the product-local date it substitutions.
 *
 * One card per substitution date — a sub who substitutions two Mondays of one group holds
 * two seats, and they are told apart by nothing else.
 */
export function geduSubstitutionKey(groupId: string, substitutionDate: string): string {
  return `${groupId}:${substitutionDate}`;
}

/** One rolled-up card: an assignment, its next session, and its backlog. */
export interface GeduAssignmentSummary {
  /** Stable key — an assignment is unique per (product, group). */
  productId: string;
  groupId: string;
  /** Translated product name. */
  productName: string;
  productType: ProductType;
  groupName: string | null;
  /** Gamers in the gedu's own group. */
  groupParticipantCount: number;
  /**
   * The product's last day as a bare `YYYY-MM-DD` calendar date, or `null` on an
   * open-ended run that has no last day at all.
   *
   * Kept as the raw string rather than an instant because that is what it is: a
   * zoneless calendar date, rendered date-only and UTC-pinned wherever it is
   * shown. Whether that day is already behind us is a question about the current
   * instant, so it is asked of the clock through the shared run-state
   * derivations rather than baked in here.
   */
  endDate: string | null;
  /**
   * The zone `endDate` is a date **in** — the product's own, which is where its
   * calendar days begin and end.
   *
   * It rides along with the date because the pair is what the ended test needs
   * and neither half answers it alone: a bare date cannot say when its day is
   * over, and a zone has nothing to be over.
   */
  timezone: string;
  /**
   * Start of the soonest session still worth showing, or `null` once the
   * schedule has run out (a finished camp, a club with no slots).
   */
  nextSessionStart: Date | null;
  /** End of that session — drives the start–end range label. */
  nextSessionEnd: Date | null;
  /**
   * Whether this assignment has a voice room at all — true only for a remote
   * product. **An in-person assignment renders no Join affordance**, rather
   * than a locked one: a locked button promises it will unlock, and a camp in a
   * library has no room behind it that ever will.
   *
   * Note what is *not* here: whether the room is open right now. That is a fact
   * about the current instant, not about the assignment, and baking it into a
   * summary built once per data change gave the card two clocks — a badge
   * recomputed on every `useNow()` tick beside a Join button frozen at whatever
   * the roll-up thought when it last ran. Ask the shared liveness derivation
   * instead, at the moment of asking.
   */
  hasVoiceRoom: boolean;
  /** Where the Join button navigates. `"#"` keeps it inert. */
  voiceHref: MaybeInertHrefObject;
  /**
   * The site an in-person assignment runs at, `null` for a remote one.
   *
   * It is the **in-person counterpart of the Join button**: the card's one
   * outward-facing line, answering the question the gedu actually has about a
   * product with no room — where am I going. The two are exclusive by
   * construction, so one card zone holds whichever of them applies and is never
   * empty on either kind of product.
   */
  siteName: string | null;
  /** Where a click anywhere on the card navigates — the product's feed. */
  openHref: MaybeInertHref;
  /**
   * How many owed past sessions still need something — the number behind the
   * card's badge, computed server-side by the assignment-summaries RPC and
   * carried through here rather than re-derived.
   *
   * A session counts while its register is unfinished, its report unwritten, its
   * report unsent, or — on the final session of a run that requires creations —
   * a current member still owes one. The unit is **sessions**, not gaps: the
   * final session has one more way to need attention, never a second entry in
   * the count.
   */
  attentionCount: number;
}

export interface RollUpArgs {
  rows: readonly GeduAssignmentRow[];
  now: Date;
  locale: SupportedLocale;
  /**
   * Outstanding sessions per seat, keyed by {@link geduAssignmentKey}; missing
   * means none.
   */
  attentionByAssignment?: Readonly<Record<string, number>>;
  /** Where each seat's card navigates, keyed by {@link geduAssignmentKey}. */
  hrefByAssignment: Readonly<Record<string, AppHrefObject>>;
  /** Voice-room href per seat; anything missing collapses to `"#"`. */
  voiceHrefByAssignment?: Readonly<Record<string, AppHrefObject>>;
}

/**
 * Roll assignment rows up into one summary each, **sorted by soonest next
 * session ascending** so a live or imminent session floats to the top and an
 * assignment with nothing scheduled sinks to the bottom — with every finished
 * run below all of them. Sorting here rather than in the view keeps the section
 * presentational and makes the order testable.
 */
export function rollUpGeduAssignments({
  rows,
  now,
  locale,
  attentionByAssignment,
  hrefByAssignment,
  voiceHrefByAssignment,
}: RollUpArgs): GeduAssignmentSummary[] {
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const summaries = rows
    // Substitution rows are the other roll-up's: a substitution is one dated afternoon, and
    // running it through the schedule walk would draw a sub a recurring card
    // claiming they teach the club every week.
    .filter((row) => row.kind === "assignment")
    .map((row) => {
    const next = nextOccurrenceFor(row, now, windowCloseMs);
    const hasVoiceRoom = row.product.isRemote === true;
    const key = geduAssignmentKey(row.product.id, row.groupId);
    return {
      productId: row.product.id,
      groupId: row.groupId,
      productName:
        resolveTranslation(row.product.translations, locale)?.name ?? "",
      productType: row.product.productType,
      groupName: row.groupName,
      groupParticipantCount: row.groupParticipantCount,
      endDate: row.product.endDate,
      timezone: row.product.timezone,
      nextSessionStart: next?.start ?? null,
      nextSessionEnd: next?.end ?? null,
      hasVoiceRoom,
      // Only meaningful when there is a room; an in-person assignment renders no
      // Join at all, so its href is never read.
      voiceHref: hasVoiceRoom
        ? (voiceHrefByAssignment?.[key] ?? INERT_HREF)
        : INERT_HREF,
      // Never carried by a remote product, whatever the row says: a product
      // with a voice room has no building, and a card showing both would be
      // claiming the group meets in two places.
      siteName: hasVoiceRoom ? null : row.siteName,
      openHref: hrefByAssignment[key] ?? INERT_HREF,
      attentionCount: attentionByAssignment?.[key] ?? 0,
    } satisfies GeduAssignmentSummary;
    });

  // Endedness is resolved once per assignment and carried through the sort
  // rather than recomputed inside the comparator: it is a zone-aware date parse,
  // and a comparator runs it O(n log n) times to answer the same question about
  // the same instant every time.
  const ranked = summaries.map((summary) => ({
    summary,
    endedOn: runEndedOn(summary, now),
  }));
  ranked.sort(byRunThenSoonestSession);
  return ranked.map((entry) => entry.summary);
}

/**
 * The soonest occurrence still worth showing for one assignment.
 *
 * Capped at one occurrence per walk: the roll-up only needs the head of the
 * list, and asking for the full horizon here would rebuild the very enumeration
 * this module exists to stop producing. An in-progress session is included —
 * that is the soonest meaningful moment for the card, and it is precisely when
 * the Join button matters.
 */
function nextOccurrenceFor(
  row: GeduAssignmentRow,
  now: Date,
  windowCloseMs: number,
): { start: Date; end: Date } | null {
  if (row.slots.length === 0) return null;

  const occurrences = enumerateRowOccurrences({
    slots: row.slots,
    timezone: row.product.timezone,
    now,
    startBoundary: startDateToCutoff(row.product.startDate, row.product.timezone),
    endBoundary: endDateToCutoff(row.product.endDate, row.product.timezone),
    cap: 1,
    windowCloseMs,
  });

  return occurrences[0] ?? null;
}

/** A summary paired with the ended test's answer, resolved once. */
interface RankedAssignment {
  summary: GeduAssignmentSummary;
  /** The last day of a finished run, or `null` while it is still going. */
  endedOn: string | null;
}

/**
 * **Every finished run sorts below every live one**, and only then does the
 * soonest-session order apply within each half.
 *
 * A gedu opening this page is deciding what to do next, and a run that is over
 * has nothing to contribute to that decision — but it is not gone either: the
 * workspace behind the card is where its attendance and write-ups live, and an
 * outstanding one is still owed. So an ended assignment is demoted rather than
 * dropped, and it lands in a run of its own at the foot of its type group.
 *
 * Inside that run the order is **most recently ended first**, which is the order
 * a gedu remembers them in: last term's club is the one they are still finishing
 * paperwork for, and the one from two years ago is archive. The dates are bare
 * `YYYY-MM-DD` strings, so a plain string comparison is already chronological
 * and needs no parsing to sort by.
 */
function byRunThenSoonestSession(
  a: RankedAssignment,
  b: RankedAssignment,
): number {
  if ((a.endedOn === null) !== (b.endedOn === null)) {
    return a.endedOn === null ? -1 : 1;
  }
  if (a.endedOn !== null && b.endedOn !== null) {
    if (a.endedOn !== b.endedOn) return a.endedOn < b.endedOn ? 1 : -1;
    return a.summary.productName.localeCompare(b.summary.productName);
  }
  return bySoonestSession(a.summary, b.summary);
}

/** Soonest first; assignments with no scheduled session last, then by name. */
function bySoonestSession(
  a: GeduAssignmentSummary,
  b: GeduAssignmentSummary,
): number {
  if (a.nextSessionStart === null && b.nextSessionStart === null) {
    return a.productName.localeCompare(b.productName);
  }
  if (a.nextSessionStart === null) return 1;
  if (b.nextSessionStart === null) return -1;
  return a.nextSessionStart.getTime() - b.nextSessionStart.getTime();
}

/**
 * One **substitution** card: a single afternoon a sub is holding, and the workspace it
 * opens.
 *
 * It is deliberately not a {@link GeduAssignmentSummary} with a date bolted on.
 * Almost every field on that one answers a question about a *run* — the next
 * session, the cadence, whether the run has ended, how many children are in the
 * group week after week — and none of those is a question about one substituted
 * Monday. What a sub needs is where and when, and the way in.
 */
export interface GeduSubstitutionSummary {
  groupId: string;
  /** Product-local `YYYY-MM-DD` — the other half of this card's identity. */
  substitutionDate: string;
  productId: string;
  /** Translated product name. */
  productName: string;
  productType: ProductType;
  groupName: string | null;
  /** The product's own zone, which `substitutionDate` is a date in. */
  timezone: string;
  /**
   * The substituted session's start and end, or `null` when the schedule no longer
   * projects that weekday.
   *
   * `null` is a real answer rather than a failure: a substitution keys on (group,
   * date) like every session record, so an admin moving the schedule's weekday
   * afterwards leaves a row naming a day the schedule has stopped producing.
   * The card then shows the date alone rather than disappearing, which is what
   * the orphaned-request rule asks of every reader of one.
   */
  startsAt: Date | null;
  endsAt: Date | null;
  /**
   * When the group's workspace opens to this sub — the substituted session's start
   * less 48 hours — or `null` on an orphaned date, which has no start to count
   * back from.
   *
   * **The card outlives the lock.** A substitution is on My SOG from the moment it is
   * approved, so a sub can see the afternoon they agreed to take; what waits
   * until this instant is the *workspace* behind it, and the database applies
   * the same 48 hours to every gate that reaches the group. So a card whose
   * `accessOpensAt` is still ahead is drawn locked rather than withheld.
   *
   * `null` means the lock does not apply: a date the schedule no longer
   * projects has no start, and the database's own predicate falls open on it
   * rather than shut — a sub must not be locked out of a session they ran and
   * still owe a report for.
   *
   * Computed on the instant, never by stepping a date string: 48 hours before
   * a Monday 17:00 is a Saturday 17:00 in real time, whatever a calendar
   * subtraction of two days would say across a DST transition.
   */
  accessOpensAt: Date | null;
  /** Whether there is a room at all — true only on a remote product. */
  hasVoiceRoom: boolean;
  /** Where the Join navigates. `"#"` keeps it inert. */
  voiceHref: MaybeInertHrefObject;
  /** The building, on an in-person product; `null` on a remote one. */
  siteName: string | null;
  /**
   * The workspace this card opens — **carrying the group as a query param**.
   *
   * A sub has no assignment row to resolve a group from, and one substituting a
   * sibling group of a product they already teach would otherwise land in their
   * own group's workspace: the right product, the wrong roster. The param is
   * what the workspace route reads to answer "which group is mine".
   */
  openHref: MaybeInertHref;
  /**
   * What this one session still owes — the same four conditions every other
   * count applies, scoped to a set of one occurrence rather than recomputed.
   * It is 0 or 1 by construction, and the badge is the badge every other card
   * wears.
   */
  attentionCount: number;
}

/**
 * How long before a substituted session the group's workspace opens to the sub.
 *
 * This is the client's half of a bound the **database** enforces — every gate
 * that lets a substitution reach the group applies the same lead against the same
 * session start — so it exists here only to tell a sub when their card will
 * unlock, and moving it is a migration and this line together.
 */
const SUBSTITUTION_ACCESS_LEAD_MS = 48 * 60 * 60 * 1000;

export interface SubstitutionRollUpArgs {
  rows: readonly GeduAssignmentRow[];
  locale: SupportedLocale;
  /**
   * Outstanding work per substitution, keyed by {@link geduSubstitutionKey}; missing means
   * none.
   */
  attentionBySubstitution?: Readonly<Record<string, number>>;
  /**
   * Where each seat's workspace lives, keyed by {@link geduAssignmentKey} —
   * **the same map the assignment roll-up takes**, because a substitution's workspace
   * is its product's and its group's like any other. The group query param is
   * added here rather than by the caller, so the rule that a substitution's link
   * carries its group has one home.
   */
  hrefByAssignment: Readonly<Record<string, AppHrefObject>>;
  /** Voice-room href per seat; anything missing collapses to `"#"`. */
  voiceHrefByAssignment?: Readonly<Record<string, AppHrefObject>>;
}

/**
 * Roll the caller's substitutions up into one card each, **soonest substitution date
 * first**, with a date the schedule no longer projects last.
 *
 * No clock: a substitution card stands from the moment the substitution is approved until the
 * substitution expires, and the database is what decides that — a row is returned
 * while the substitution is the caller's and gone once it is not. Filtering again here
 * against a second clock would be a card disagreeing with the rows the page
 * actually has.
 *
 * The card's *lock* is a different question and is not decided here either:
 * every card carries the instant its workspace opens, and whether that instant
 * has passed is asked of the viewer's clock at render, where the rest of the
 * card's liveness already is.
 */
export function rollUpGeduSubstitutions({
  rows,
  locale,
  attentionBySubstitution,
  hrefByAssignment,
  voiceHrefByAssignment,
}: SubstitutionRollUpArgs): GeduSubstitutionSummary[] {
  const substitutions = rows.flatMap((row) => {
    // Both halves are what makes the row a substitution, and the type only guarantees
    // the first — so a `substitution` row with no date is dropped rather than drawn as
    // a card with nothing to say about when it is.
    if (row.kind !== "substitution" || row.substitutionDate === null) return [];

    const key = geduAssignmentKey(row.product.id, row.groupId);
    const occurrence = occurrenceOnDate({
      sessionDate: row.substitutionDate,
      slots: row.slots,
      timezone: row.product.timezone,
    });
    const hasVoiceRoom = row.product.isRemote === true;
    return [
      {
        groupId: row.groupId,
        substitutionDate: row.substitutionDate,
        productId: row.product.id,
        productName:
          resolveTranslation(row.product.translations, locale)?.name ?? "",
        productType: row.product.productType,
        groupName: row.groupName,
        timezone: row.product.timezone,
        startsAt: occurrence?.start ?? null,
        endsAt: occurrence?.end ?? null,
        accessOpensAt:
          occurrence === null
            ? null
            : new Date(occurrence.start.getTime() - SUBSTITUTION_ACCESS_LEAD_MS),
        hasVoiceRoom,
        voiceHref: hasVoiceRoom
          ? (voiceHrefByAssignment?.[key] ?? INERT_HREF)
          : INERT_HREF,
        siteName: hasVoiceRoom ? null : row.siteName,
        openHref: substitutionWorkspaceHref(hrefByAssignment[key], row.groupId),
        attentionCount:
          attentionBySubstitution?.[geduSubstitutionKey(row.groupId, row.substitutionDate)] ?? 0,
      } satisfies GeduSubstitutionSummary,
    ];
  });

  substitutions.sort(bySubstitutionMoment);
  return substitutions;
}

/**
 * A substitution's workspace link: the seat's own destination with the group added, or
 * the inert href when the caller named no destination for that seat.
 *
 * The group rides as a query param because a sub has no assignment row for one
 * to be resolved from — and one substituting a *sibling* group of a product they
 * already teach would otherwise land on their own group's workspace, which is
 * the right product and the wrong roster.
 *
 * A function rather than an inline ternary so the `undefined` half is a real
 * parameter type: an index signature says every key is present, and the seat a
 * preview supplied no link for is exactly the case this has to answer.
 */
function substitutionWorkspaceHref(
  workspace: AppHrefObject | undefined,
  groupId: string,
): MaybeInertHref {
  if (workspace === undefined) return INERT_HREF;
  return { ...workspace, query: { groupId } };
}

/**
 * Soonest substituted session first; an orphaned date — one the schedule no longer
 * projects — sorts last, by its own date, then by product name.
 *
 * The orphan has no instant to be ordered against and is history rather than
 * work, so it goes to the foot of the run for the same reason a finished
 * assignment does.
 */
function bySubstitutionMoment(a: GeduSubstitutionSummary, b: GeduSubstitutionSummary): number {
  if ((a.startsAt === null) !== (b.startsAt === null)) {
    return a.startsAt === null ? 1 : -1;
  }
  if (a.startsAt !== null && b.startsAt !== null) {
    const byStart = a.startsAt.getTime() - b.startsAt.getTime();
    if (byStart !== 0) return byStart;
  } else if (a.substitutionDate !== b.substitutionDate) {
    return a.substitutionDate < b.substitutionDate ? -1 : 1;
  }
  return a.productName.localeCompare(b.productName);
}
