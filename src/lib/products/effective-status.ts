import { formatInTimeZone } from "date-fns-tz";
import type { EffectiveProductStatusDB, Product } from "@/types";

// Lifecycle inputs needed to explain *why* a product is still pending —
// used by the admin list to add a "starts when..." caption under the row.
export type PendingHintInputs = Pick<
  Product,
  "start_date" | "registration_opens_at" | "timezone"
>;

export type PendingHintKey = "registrationOpens" | "startDate";

export interface PendingHint {
  key: PendingHintKey;
  /** Values to interpolate into the message, raw — caller formats dates. */
  values: { date: string };
}

// Lifecycle decisions only need these three columns. Keeping the input type
// narrow lets callers project a smaller select without losing type-safety.
// `timezone` is required because `start_date` / `end_date` are date-only;
// "has it passed" depends on the product's local calendar day, not UTC.
export type LifecycleInputs = Pick<
  Product,
  "start_date" | "end_date" | "timezone"
>;

/**
 * The status of a product. There is no stored status and never was one worth
 * reading: the lifecycle is a function of the two dates alone, so nothing has
 * to be flipped by a cron and no reader can be handed a value that reality has
 * moved past.
 *
 * - A product is `pending` until its start date is reached.
 * - From then on it is `running` until its end date passes, and `completed`
 *   after. A product with no end date never leaves `running`.
 *
 * There is no state for a product that ended without ever starting: every
 * product carries a start date, and the database's date-range CHECK keeps the
 * end date on or after it, so today < start_date <= end_date cannot arise.
 *
 * Date-only fields (start_date / end_date) are compared against `now`
 * after projecting `now` into the product's timezone — so an event with
 * end_date = today stays "running" through end-of-day local time, not
 * UTC midnight.
 *
 * The database derives the same three values the same way, from the same
 * columns, through `effective_status(uuid)`.
 */
export type EffectiveProductStatus = EffectiveProductStatusDB;

export function effectiveStatus(
  p: LifecycleInputs,
  now: Date,
): EffectiveProductStatus {
  const nowDate = formatInTimeZone(now, p.timezone, "yyyy-MM-dd");

  if (p.start_date > nowDate) return "pending";
  return p.end_date !== null && p.end_date < nowDate ? "completed" : "running";
}

/**
 * Decide which "still pending because..." caption applies to a product
 * whose effective status is `pending`. Returns null if there's nothing
 * meaningful to say.
 *
 * Order of precedence is deliberate: registration not yet open comes first,
 * because until it does nobody can sign up at all; the start date is what the
 * caption falls back to.
 *
 * The function returns a structural { key, values } so the list page can
 * map it through next-intl's t() and format the date in the user locale.
 */
export function pendingHintKey(
  p: PendingHintInputs,
  now: Date,
): PendingHint | null {
  const nowMs = now.getTime();

  if (new Date(p.registration_opens_at).getTime() > nowMs) {
    return {
      key: "registrationOpens",
      values: { date: p.registration_opens_at },
    };
  }

  // start_date is date-only; "in the future" means the product's local
  // calendar day hasn't arrived yet.
  const nowDate = formatInTimeZone(now, p.timezone, "yyyy-MM-dd");
  if (p.start_date > nowDate) {
    return { key: "startDate", values: { date: p.start_date } };
  }
  return null;
}
