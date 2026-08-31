import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { runEndedOn } from "@/lib/product-run";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { MyAssignedProductSessionRow } from "@/services/assignments";
import type { ProductType } from "@/types";

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
  voiceHref: string;
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
  openHref: string;
  /** Owed past sessions still missing their register, their report, or both. */
  attentionCount: number;
}

export interface RollUpArgs {
  rows: readonly GeduAssignmentRow[];
  now: Date;
  locale: SupportedLocale;
  /** Outstanding sessions per product id; missing means none. */
  attentionByProductId?: Readonly<Record<string, number>>;
  /** Where each assignment's card navigates, by product id. */
  hrefByProductId: Readonly<Record<string, string>>;
  /** Voice-room href per product id; anything missing collapses to `"#"`. */
  voiceHrefByProductId?: Readonly<Record<string, string>>;
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
  attentionByProductId,
  hrefByProductId,
  voiceHrefByProductId,
}: RollUpArgs): GeduAssignmentSummary[] {
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const summaries = rows.map((row) => {
    const next = nextOccurrenceFor(row, now, windowCloseMs);
    const hasVoiceRoom = row.product.isRemote === true;
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
        ? (voiceHrefByProductId?.[row.product.id] ?? "#")
        : "#",
      // Never carried by a remote product, whatever the row says: a product
      // with a voice room has no building, and a card showing both would be
      // claiming the group meets in two places.
      siteName: hasVoiceRoom ? null : row.siteName,
      openHref: hrefByProductId[row.product.id] ?? "#",
      attentionCount: attentionByProductId?.[row.product.id] ?? 0,
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
