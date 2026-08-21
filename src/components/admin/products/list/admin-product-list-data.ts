import type { EffectiveProductStatus } from "@/lib/products/effective-status";
import type { ProductType } from "@/types";

/**
 * The shape one row of the **unified admin product list** is drawn from, and
 * the pure filter/sort arithmetic over it.
 *
 * **It is a view-model, not a table row, and that is deliberate.** The live list
 * today reads `products` per type and can answer none of the questions the
 * redesign asks of a row: how many seats are actually filled, who queues behind
 * them, who is sitting in no group, which educators teach it, and whether last
 * week got written up. Those are aggregates across four tables. Promotion means
 * one read that returns this shape — so the shape is written down here first,
 * the body is built against it, and the query is written to it rather than the
 * body being bent around whatever the existing query happens to return.
 *
 * Everything in this module is pure: no React, no clock of its own, no `Intl`.
 * The row carries the *facts*; the body formats them.
 */

/**
 * Why a row is asking for attention.
 *
 * A closed set rather than free text, because the row draws one warning glyph
 * whatever is wrong and hands the reasons to a tooltip — so each has to be
 * nameable in the message catalogue, and a new one has to be added there rather
 * than arriving as an untranslated sentence from a query.
 */
export const PRODUCT_ATTENTION_REASONS = [
  /** No educator is assigned to any group on the product. */
  "no_gedu",
  /** Somebody holds a seat and sits in no group. */
  "unplaced",
  /** The primary gedu fee is null — unknown rather than volunteer. */
  "missing_gedu_fee",
  /** A municipality club with no municipality fee recorded. */
  "missing_municipality_fee",
  /** A session that has finished and has no write-up against it. */
  "unwritten_session",
] as const;

export type ProductAttentionReason =
  (typeof PRODUCT_ATTENTION_REASONS)[number];

/** The two formats a product runs in — a filter axis, derived from `isRemote`. */
export const PRODUCT_FORMATS = ["online", "in_person"] as const;
export type ProductFormat = (typeof PRODUCT_FORMATS)[number];

/**
 * One product as the list needs it.
 *
 * The `schedule` sub-object is deliberately the exact subset the shared schedule
 * formatter consumes, so the row's "when" column is rendered by the same code
 * the shop card uses and the two cannot drift on what "Tue 17:00 · Thu 17:00"
 * means.
 */
export interface AdminProductListRow {
  id: string;
  name: string;
  productType: ProductType;
  /** Already resolved — the list does not re-derive lifecycle per render. */
  status: EffectiveProductStatus;
  isVisible: boolean;
  isRemote: boolean;
  /** What the schedule formatter needs, and nothing else. */
  schedule: {
    product_type: ProductType;
    start_date: string | null;
    end_date: string | null;
    timezone: string;
    schedule_slots: {
      weekday: number;
      start_time: string;
      duration_minutes: number;
    }[];
  };
  /**
   * The venue, or `null` for an online product. A municipality club shows its
   * municipality **whichever** of the two it is — see `municipalityName`.
   */
  siteName: string | null;
  /**
   * The Finnish kunta a municipality club is tied to. Non-null on every
   * municipality club, online or not, and null on every other type: the tie is
   * to the funding municipality, not to a building, so an online muni club
   * still belongs to a town and the row still says which.
   */
  municipalityName: string | null;
  /** Every educator on the product, first names only. Empty = attention. */
  geduFirstNames: string[];
  /** Capacity cap, or `null` for uncapped. */
  seatCount: number | null;
  /** Active participations — the seats actually taken. */
  filledSeats: number;
  waitlistCount: number;
  /** Active seats sitting in no group. */
  unplacedCount: number;
  spokenLanguageCode: string;
  attention: readonly ProductAttentionReason[];
}

/**
 * The statuses the default "Active" filter admits.
 *
 * Running **and** pending, because a product that has not started yet is the one
 * an admin is most likely to still owe something — an educator, a fee, a
 * threshold that has not been met. The filter is on by default and visibly so:
 * the great majority of rows in a mature catalogue are finished runs nobody is
 * working on, and a list that opened on all of them would bury the twenty that
 * matter under two hundred that do not.
 */
export const ACTIVE_STATUSES: readonly EffectiveProductStatus[] = [
  "running",
  "pending",
];

/** Which column the list is ordered by. */
export const PRODUCT_SORT_KEYS = ["default", "name", "status", "when", "seats"] as const;
export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export interface AdminProductListFilters {
  /** Free text over the product name. Empty string = no search. */
  search: string;
  /** Multi-select; empty = every type. */
  types: readonly ProductType[];
  /** True while the default active-only filter is engaged. */
  activeOnly: boolean;
  /** Multi-select; empty = both formats. */
  formats: readonly ProductFormat[];
  /** Weekday (0 = Monday) as a string, or `null` for all. */
  day: string | null;
  /** Educator first name, or `null` for all. */
  gedu: string | null;
  /** Spoken-language code, or `null` for all. */
  language: string | null;
  /** Municipality name, or `null` for all. */
  municipality: string | null;
}

export const EMPTY_PRODUCT_FILTERS: AdminProductListFilters = {
  search: "",
  types: [],
  activeOnly: true,
  formats: [],
  day: null,
  gedu: null,
  language: null,
  municipality: null,
};

/** Whether anything is narrowing the list — drives the Clear affordance. */
export function anyFilterActive(filters: AdminProductListFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.types.length > 0 ||
    !filters.activeOnly ||
    filters.formats.length > 0 ||
    filters.day !== null ||
    filters.gedu !== null ||
    filters.language !== null ||
    filters.municipality !== null
  );
}

export function productFormat(row: AdminProductListRow): ProductFormat {
  return row.isRemote ? "online" : "in_person";
}

/**
 * Narrow the list. Every active filter ANDs with the others — a row has to
 * satisfy all of them — which is the only composition that makes "X of Y" a
 * number a reader can act on.
 */
export function filterProductRows(
  rows: readonly AdminProductListRow[],
  filters: AdminProductListFilters,
): AdminProductListRow[] {
  const needle = filters.search.trim().toLocaleLowerCase();
  const day = filters.day === null ? null : Number(filters.day);

  return rows.filter((row) => {
    if (needle !== "" && !row.name.toLocaleLowerCase().includes(needle))
      return false;
    if (filters.types.length > 0 && !filters.types.includes(row.productType))
      return false;
    if (filters.activeOnly && !ACTIVE_STATUSES.includes(row.status))
      return false;
    if (
      filters.formats.length > 0 &&
      !filters.formats.includes(productFormat(row))
    )
      return false;
    if (
      day !== null &&
      !row.schedule.schedule_slots.some((slot) => slot.weekday === day)
    )
      return false;
    if (filters.gedu !== null && !row.geduFirstNames.includes(filters.gedu))
      return false;
    if (
      filters.language !== null &&
      row.spokenLanguageCode !== filters.language
    )
      return false;
    if (
      filters.municipality !== null &&
      row.municipalityName !== filters.municipality
    )
      return false;
    return true;
  });
}

/**
 * How urgent a status is when nothing else is asked for.
 *
 * The default order is **work first**: what is running, then what is about to,
 * then everything nobody is working on any more. Within the two live buckets the
 * tie is broken by start date, so a term about to open sits above one that opened
 * in September.
 */
const STATUS_RANK: Record<EffectiveProductStatus, number> = {
  running: 0,
  pending: 1,
  completed: 2,
  expired: 3,
  cancelled: 4,
};

/**
 * The date a row sorts on in the "when" column and in the default order.
 *
 * A bare calendar date compared as a string, which is exact for `YYYY-MM-DD` and
 * needs no zone: these are zoneless start dates, and giving them one to compare
 * them would be the off-by-one the date rules exist to prevent. A product with no
 * start date sorts last in either direction, because "not scheduled yet" is not a
 * point on the axis.
 */
function whenKey(row: AdminProductListRow): string | null {
  return row.schedule.start_date;
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** How full a row is, as the fraction the seats column sorts on. Uncapped last. */
function fillKey(row: AdminProductListRow): number {
  if (row.seatCount === null || row.seatCount === 0) return -1;
  return row.filledSeats / row.seatCount;
}

export function sortProductRows(
  rows: readonly AdminProductListRow[],
  key: ProductSortKey,
  direction: SortDirection,
  locale: string,
): AdminProductListRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const sorted = [...rows];

  sorted.sort((a, b) => {
    switch (key) {
      case "default": {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (rank !== 0) return rank;
        const date = compareNullableDate(whenKey(a), whenKey(b));
        if (date !== 0) return date;
        return a.name.localeCompare(b.name, locale);
      }
      case "name":
        return sign * a.name.localeCompare(b.name, locale);
      case "status":
        return (
          sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
          a.name.localeCompare(b.name, locale)
        );
      case "when":
        return (
          sign * compareNullableDate(whenKey(a), whenKey(b)) ||
          a.name.localeCompare(b.name, locale)
        );
      case "seats":
        return (
          sign * (fillKey(a) - fillKey(b)) ||
          a.name.localeCompare(b.name, locale)
        );
    }
  });

  return sorted;
}
