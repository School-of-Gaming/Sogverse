import { formatInTimeZone } from "date-fns-tz";
import type { EffectiveProductStatusDB, Product } from "@/types";

// Lifecycle inputs needed to explain *why* a product is still pending —
// used by the admin list to add a "starts when..." caption under the row.
export type PendingHintInputs = Pick<
  Product,
  "start_date" | "signup_threshold" | "registration_opens_at" | "timezone"
>;

export type PendingHintKey =
  | "registrationOpens"
  | "dateAndThreshold"
  | "startDate"
  | "pastDateThreshold"
  | "threshold";

export interface PendingHint {
  key: PendingHintKey;
  /** Values to interpolate into the message, raw — caller formats dates. */
  values: { date?: string; count?: number };
}

// Lifecycle decisions only need these four columns. Keeping the input type
// narrow lets callers project a smaller select without losing type-safety.
// `timezone` is required because `start_date` / `end_date` are date-only;
// "has it passed" depends on the product's local calendar day, not UTC.
export type LifecycleInputs = Pick<
  Product,
  "start_date" | "end_date" | "signup_threshold" | "timezone"
>;

/**
 * The status of a product. There is no stored status and never was one worth
 * reading: the lifecycle is a function of the dates, the signup threshold and
 * the live count of sign-ups, so nothing has to be flipped by a cron and no
 * reader can be handed a value that reality has moved past.
 *
 * - A product has *started* once its start date has been reached and any
 *   signup threshold is met. A product with neither a start date nor a
 *   threshold has nothing that could start it and stays pending — that is a
 *   product whose dates have not been filled in, not one under way.
 * - A started product is `running` until its end date passes, then
 *   `completed`.
 * - A product whose end date passes without ever starting is `expired` —
 *   distinct from `completed`, which means it actually ran.
 *
 * Date-only fields (start_date / end_date) are compared against `now`
 * after projecting `now` into the product's timezone — so an event with
 * end_date = today stays "running" through end-of-day local time, not
 * UTC midnight.
 *
 * `activeParticipations` is the count of active sign-ups. Pass 0 where the
 * caller has no count to hand; threshold-bearing products then read as pending
 * until a count is threaded through.
 *
 * The database derives the same four values the same way, from the same
 * columns, through `effective_status(uuid)`.
 */
export type EffectiveProductStatus = EffectiveProductStatusDB;

export function effectiveStatus(
  p: LifecycleInputs,
  now: Date,
  activeParticipations: number,
): EffectiveProductStatus {
  const nowDate = formatInTimeZone(now, p.timezone, "yyyy-MM-dd");
  const endPassed = p.end_date !== null && p.end_date < nowDate;

  const hasDate = p.start_date !== null;
  const hasThreshold = p.signup_threshold !== null;
  const startReached = !hasDate || p.start_date! <= nowDate;
  const thresholdMet =
    !hasThreshold || activeParticipations >= p.signup_threshold!;
  const started = (hasDate || hasThreshold) && startReached && thresholdMet;

  if (started) {
    return endPassed ? "completed" : "running";
  }

  // Hasn't started — either still waiting (pending) or the window closed
  // without ever satisfying the start conditions (expired).
  return endPassed ? "expired" : "pending";
}

/**
 * Decide which "still pending because..." caption applies to a product
 * whose effective status is `pending`. Returns null if there's nothing
 * meaningful to say (no scheduled open, no start date, no threshold).
 *
 * Order of precedence is deliberate:
 *   1. Registration not yet open (no one can sign up at all).
 *   2. Future start date — combined with threshold if set, else date-only.
 *   3. Past start date but threshold unmet (post-launch wait).
 *   4. Threshold-only (no date involved).
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
  const startInFuture = p.start_date !== null && p.start_date > nowDate;
  const startInPast = p.start_date !== null && p.start_date <= nowDate;

  if (startInFuture && p.signup_threshold) {
    return {
      key: "dateAndThreshold",
      values: { date: p.start_date!, count: p.signup_threshold },
    };
  }
  if (startInFuture) {
    return { key: "startDate", values: { date: p.start_date! } };
  }
  if (startInPast && p.signup_threshold) {
    return {
      key: "pastDateThreshold",
      values: { count: p.signup_threshold },
    };
  }
  if (p.signup_threshold) {
    return { key: "threshold", values: { count: p.signup_threshold } };
  }
  return null;
}
