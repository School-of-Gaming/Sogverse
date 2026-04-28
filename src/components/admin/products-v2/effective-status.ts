import { formatInTimeZone } from "date-fns-tz";
import type { ProductStatusV2, ProductV2 } from "@/types";

// Lifecycle inputs needed to explain *why* a product is still pending —
// used by the admin list to add a "starts when..." caption under the row.
export type PendingHintInputs = Pick<
  ProductV2,
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

// Lifecycle decisions only need these five columns. Keeping the input type
// narrow lets callers project a smaller select without losing type-safety.
// `timezone` is required because `start_date` / `end_date` are date-only;
// "has it passed" depends on the product's local calendar day, not UTC.
export type LifecycleInputs = Pick<
  ProductV2,
  "status" | "start_date" | "end_date" | "signup_threshold" | "timezone"
>;

/**
 * The displayed status of a product. Derived from stored facts so the UI
 * doesn't drift from reality and we don't need a cron to flip
 * `pending → running` (or `running → completed`).
 *
 * - `draft` / `cancelled` pass through.
 * - `pending` upgrades to `running` once start_date has been reached AND
 *   any signup_threshold is met. With neither condition set we stay
 *   pending — there's nothing to evaluate, admin must manually start.
 * - Stored or derived `running` downgrades to `completed` once end_date
 *   has passed.
 * - A pending product whose end_date passes without ever satisfying its
 *   start conditions becomes `expired` — distinct from `completed`
 *   (technically ran) and from `cancelled` (admin killed it).
 * - The admin "Start under threshold" override stores `running` directly
 *   — it doesn't pass through this helper.
 *
 * Date-only fields (start_date / end_date) are compared against `now`
 * after projecting `now` into the product's timezone — so an event with
 * end_date = today stays "running" through end-of-day local time, not
 * UTC midnight.
 *
 * `activeParticipations` is the count of active sign-ups. Pass 0 until
 * `participations_v2` is wired up; threshold-bearing products will then
 * show as pending until the count rises.
 */
export type EffectiveProductStatusV2 = ProductStatusV2 | "expired";

export function effectiveStatus(
  p: LifecycleInputs,
  now: Date,
  activeParticipations: number,
): EffectiveProductStatusV2 {
  if (p.status === "draft" || p.status === "cancelled") return p.status;
  if (p.status === "completed") return "completed";

  const nowDate = formatInTimeZone(now, p.timezone, "yyyy-MM-dd");
  const endPassed = p.end_date !== null && p.end_date < nowDate;

  if (p.status === "running") {
    return endPassed ? "completed" : "running";
  }

  // p.status === "pending"
  const hasDate = p.start_date !== null;
  const hasThreshold = p.signup_threshold !== null;
  const startReached = !hasDate || p.start_date! <= nowDate;
  const thresholdMet =
    !hasThreshold || activeParticipations >= p.signup_threshold!;
  const wouldHaveRun =
    (hasDate || hasThreshold) && startReached && thresholdMet;

  if (wouldHaveRun) {
    return endPassed ? "completed" : "running";
  }

  // Hasn't started — either still waiting (pending) or window has closed
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
