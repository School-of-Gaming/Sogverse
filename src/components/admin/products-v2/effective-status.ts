import type { ProductStatusV2, ProductV2 } from "@/types";

// Lifecycle decisions only need these four columns. Keeping the input
// type narrow lets callers project a smaller select without losing
// type-safety.
export type LifecycleInputs = Pick<
  ProductV2,
  "status" | "start_date" | "end_date" | "signup_threshold"
>;

/**
 * The displayed status of a product. Derived from stored facts so the
 * UI doesn't drift from reality and we don't need a cron to flip
 * `pending → running` (or `running → completed`).
 *
 * - `draft` / `cancelled` pass through.
 * - `pending` upgrades to `running` once start_date has been reached
 *   AND any signup_threshold is met. With neither condition set we stay
 *   pending — there's nothing to evaluate, admin must manually start.
 * - Stored or derived `running` downgrades to `completed` once end_date
 *   has passed.
 * - The admin "Start under threshold" override stores `running` directly
 *   — it doesn't pass through this helper.
 *
 * Date-only fields (start_date / end_date) are compared via `new Date(...)`
 * which treats them as midnight UTC. That's accurate to the day for any
 * end_date in the past — i.e. exactly what shows up on the admin list
 * page. There's a small edge case for end_dates falling on *today* (an
 * event happening today flips to "completed" earlier than end-of-day),
 * but no UI consumes that yet. Revisit with `date-fns-tz` and the
 * product's `timezone` column if/when it matters.
 *
 * `activeParticipations` is the count of active sign-ups. Pass 0 until
 * `participations_v2` is wired up; threshold-bearing products will then
 * show as pending until the count rises.
 */
export function effectiveStatus(
  p: LifecycleInputs,
  now: Date,
  activeParticipations: number,
): ProductStatusV2 {
  if (p.status === "draft" || p.status === "cancelled") return p.status;
  if (p.status === "completed") return "completed";

  const endPassed = p.end_date !== null && new Date(p.end_date) < now;

  if (p.status === "running") {
    return endPassed ? "completed" : "running";
  }

  // p.status === "pending"
  const hasDate = p.start_date !== null;
  const hasThreshold = p.signup_threshold !== null;
  if (!hasDate && !hasThreshold) return "pending";

  const startReached = !hasDate || new Date(p.start_date!) <= now;
  const thresholdMet =
    !hasThreshold || activeParticipations >= p.signup_threshold!;

  if (startReached && thresholdMet) {
    return endPassed ? "completed" : "running";
  }
  return "pending";
}
