import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import { isVoiceWindowOpen } from "@/lib/voice-window";
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
  groupGamerCount: number;
  /**
   * The venue an in-person product runs at, or `null` for a remote one. Every
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
  groupGamerCount: number;
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
   */
  hasVoiceRoom: boolean;
  /**
   * Whether that session's voice window is open right now. Always false without
   * a room — an in-person assignment has no window to be inside, and a caller
   * lighting a card up on this flag would otherwise announce a room that does
   * not exist.
   */
  voiceIsOpen: boolean;
  /** Where the Join button navigates. `"#"` keeps it inert. */
  voiceHref: string;
  /**
   * The venue an in-person assignment runs at, `null` for a remote one.
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
  /** Past sessions of this assignment still needing a write-up. */
  attentionCount: number;
}

export interface RollUpArgs {
  rows: readonly GeduAssignmentRow[];
  now: Date;
  locale: SupportedLocale;
  /** Outstanding write-ups per product id; missing means none. */
  attentionByProductId?: Readonly<Record<string, number>>;
  /** Where each assignment's card navigates, by product id. */
  hrefByProductId: Readonly<Record<string, string>>;
  /** Voice-room href per product id; anything missing collapses to `"#"`. */
  voiceHrefByProductId?: Readonly<Record<string, string>>;
}

/**
 * Roll assignment rows up into one summary each, **sorted by soonest next
 * session ascending** so a live or imminent session floats to the top and an
 * assignment with nothing scheduled sinks to the bottom. Sorting here rather
 * than in the view keeps the section presentational and makes the order
 * testable.
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
      groupGamerCount: row.groupGamerCount,
      nextSessionStart: next?.start ?? null,
      nextSessionEnd: next?.end ?? null,
      hasVoiceRoom,
      voiceIsOpen:
        hasVoiceRoom &&
        next !== null &&
        isVoiceWindowOpen(next.start, next.end, now),
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

  summaries.sort(bySoonestSession);
  return summaries;
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

/* ------------------------------------------------------------------ */
/*  Grouping by type noun                                              */
/* ------------------------------------------------------------------ */

/**
 * The nouns a gedu uses for the things they run.
 *
 * There are four product types and three nouns, because the two club types
 * (`consumer_club` and `municipality_club`) differ only in who pays. A gedu
 * standing in the room cannot tell them apart and has no reason to: both are a
 * club, and splitting the dashboard by billing arrangement would be the product
 * showing its accounting to the person teaching.
 */
export type GeduActivityType = "club" | "camp" | "event";

/**
 * The order the nouns appear in, which is deliberately not alphabetical.
 *
 * Clubs first because they are the standing commitment — the thing a gedu runs
 * every week for a term, and the reason most of them open the dashboard at all.
 * Camps next: intense, but a fortnight. Events last: occasional, and a gedu who
 * has one is not usually opening the page for it.
 */
export const GEDU_ACTIVITY_TYPE_ORDER: readonly GeduActivityType[] = [
  "club",
  "camp",
  "event",
];

/** Which noun a product type falls under. */
export function geduActivityTypeOf(productType: ProductType): GeduActivityType {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "club";
    case "camp":
      return "camp";
    case "event":
      return "event";
  }
}

export interface GeduActivityGroup<T> {
  type: GeduActivityType;
  items: T[];
}

/**
 * Split a gedu's assignments into one group per type noun, **skipping the types
 * they do not run**.
 *
 * A gedu with three clubs and nothing else should see one heading, not one
 * heading and two empty ones — an empty group on a personal dashboard reads as
 * something missing rather than as something absent. So the shape of the page
 * follows what the gedu actually has, and a camp gedu never learns that events
 * exist.
 *
 * Order **within** a group is whatever the caller handed over, untouched, which
 * is soonest-first out of the roll-up. Order **between** groups is fixed, so the
 * page does not reshuffle its own headings between two gedus or between two
 * terms for the same gedu.
 *
 * Generic over the row rather than tied to the card's shape: the grouping is a
 * fact about product types, and making it know what a dashboard card looks like
 * would drag a component's props into a pure module for no gain.
 */
export function groupAssignmentsByType<T>(
  items: readonly T[],
  productTypeOf: (item: T) => ProductType,
): GeduActivityGroup<T>[] {
  const buckets = new Map<GeduActivityType, T[]>();
  for (const item of items) {
    const type = geduActivityTypeOf(productTypeOf(item));
    const bucket = buckets.get(type);
    if (bucket === undefined) buckets.set(type, [item]);
    else bucket.push(item);
  }

  const groups: GeduActivityGroup<T>[] = [];
  for (const type of GEDU_ACTIVITY_TYPE_ORDER) {
    const bucketed = buckets.get(type);
    if (bucketed !== undefined && bucketed.length > 0) {
      groups.push({ type, items: bucketed });
    }
  }
  return groups;
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
