import { z } from "zod";
import { Constants } from "@/types";

/**
 * Runtime contract for `get_admin_dashboard`, the single JSONB document behind
 * the admin dashboard. The generated type is `Json`, so this schema is the
 * structure — written from the RPC body in the migration that created it, and
 * parsed against real Postgres output by the db test in CI, which is what keeps
 * the two honest.
 *
 * **The vocabulary is the database's**, deliberately: `product_type`, seat
 * counts as `active_count` / `seat_count` (null meaning uncapped), calendar
 * dates as bare `YYYY-MM-DD` strings, weekdays as `0 = Monday … 6 = Sunday`
 * exactly as `schedule_slots.weekday` stores them. The page renames what it
 * renders; a wire shape that renamed them first would only have to be
 * translated back to be checked against the function.
 *
 * **Everything here is a fact, not a view.** Sections 1–3 arrive counted
 * because counting is a query's job; section 4 arrives as raw calendar facts
 * because resolving them into weeks is what week navigation *is*, and doing it
 * server-side would cost a round trip per week.
 */

/** One product name, in one locale. */
const productName = z.object({
  locale: z.string(),
  name: z.string(),
});

/**
 * One role's tile in the users strip. Always four of them (one per `user_role`),
 * including roles nobody holds — a zero tile is a fact, a missing tile is a gap.
 *
 * `verified` is null rather than 0 for gamers, and the difference is the point:
 * a gamer's address is a synthetic `@gamer.sogverse.internal` handle nobody will
 * ever click a link in, so "0 verified" would report a problem that does not
 * exist. Null means the stat has no meaning for this role. `certified` is the
 * same shape for the same reason — only an educator can be certified.
 */
export const adminDashboardUserStat = z.object({
  role: z.enum(Constants.public.Enums.user_role),
  total: z.number(),
  verified: z.number().nullable(),
  certified: z.number().nullable(),
});

/**
 * A gedu account waiting on a certification decision. `created_at` is sent
 * rather than a wait in days because "registered 12 days ago" is relative-time
 * copy, and where the clock for that comes from is the page's business.
 */
export const adminDashboardCertificationCandidate = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  created_at: z.string(),
});

/** A group with members and nobody teaching it. */
export const adminDashboardGroupWithoutGedu = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * People queueing while seats stand open — both halves, because the line an
 * admin reads names both ("4 waitlisted · 2 seats open"). Null on a product
 * where the situation does not arise at all: no queue, no cap, or no free seat.
 */
export const adminDashboardWaitlistPressure = z.object({
  waitlist_count: z.number(),
  open_seats: z.number(),
});

/**
 * A live product with at least one thing wrong with it. A product with nothing
 * wrong is absent from the list entirely, so every entry here has at least one
 * of the five issues populated.
 *
 * The issues are facts, not sentences: the page words and orders them, because
 * the wording is translated copy and the order is a ranking the page owns.
 */
export const adminDashboardAttentionProduct = z.object({
  id: z.string(),
  product_type: z.enum(Constants.public.Enums.product_type),
  translations: z.array(productName),
  /** Active seats sitting in no group. */
  unassigned_count: z.number(),
  /** Groups with at least one active member and no gedu assigned. */
  groups_without_gedu: z.array(adminDashboardGroupWithoutGedu),
  waitlist: adminDashboardWaitlistPressure.nullable(),
  /**
   * The primary gedu fee is unset. A fee of *zero* is a volunteer session —
   * a decision somebody made — and never flagged; the assistant fee is never
   * flagged at all, because unset there means "no assistant".
   */
  missing_gedu_fee: z.boolean(),
  /** Municipality clubs only; false everywhere else by construction. */
  missing_municipality_fee: z.boolean(),
});

/** One recurring session slot, in the product's own timezone. */
export const adminDashboardScheduleSlot = z.object({
  /** 0 = Monday … 6 = Sunday, matching `schedule_slots.weekday`. */
  weekday: z.number(),
  /** `HH:MM` wall clock in the product's zone. */
  start_time: z.string(),
  duration_minutes: z.number(),
});

/**
 * One product the schedule window still has something to say about, with the
 * calendar facts a week resolves from.
 *
 * The set is every product effectively pending or running, plus a tail: a run
 * whose end date fell in the last thirty days still has occurrences in the weeks
 * of history the view can step back through. Cancelled and completed products
 * are absent — they are history, whatever their slots still say.
 */
export const adminDashboardScheduleProduct = z.object({
  id: z.string(),
  product_type: z.enum(Constants.public.Enums.product_type),
  translations: z.array(productName),
  timezone: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  /** Null is uncapped — not "no seats". */
  seat_count: z.number().nullable(),
  active_count: z.number(),
  waitlist_count: z.number(),
  schedule_slots: z.array(adminDashboardScheduleSlot),
  /**
   * The product's holiday dates that fall inside the schedule window, as bare
   * calendar dates. A week whose sessions all land on one of these is a break,
   * which the page needs in order to say a product is absent *on purpose*.
   */
  holidays: z.array(z.string()),
});

/** The whole document `get_admin_dashboard` returns. */
export const adminDashboardSnapshot = z.object({
  users: z.array(adminDashboardUserStat),
  certification_queue: z.array(adminDashboardCertificationCandidate),
  attention_products: z.array(adminDashboardAttentionProduct),
  schedule_products: z.array(adminDashboardScheduleProduct),
});

/**
 * The compile-time shapes, derived from the schemas above so the wire contract
 * and the types can't drift. Re-exported through `@/types` so consumers keep a
 * single import surface.
 */
export type AdminDashboardUserStat = z.infer<typeof adminDashboardUserStat>;
export type AdminDashboardCertificationCandidate = z.infer<
  typeof adminDashboardCertificationCandidate
>;
export type AdminDashboardGroupWithoutGedu = z.infer<
  typeof adminDashboardGroupWithoutGedu
>;
export type AdminDashboardWaitlistPressure = z.infer<
  typeof adminDashboardWaitlistPressure
>;
export type AdminDashboardAttentionProduct = z.infer<
  typeof adminDashboardAttentionProduct
>;
export type AdminDashboardScheduleSlot = z.infer<
  typeof adminDashboardScheduleSlot
>;
export type AdminDashboardScheduleProduct = z.infer<
  typeof adminDashboardScheduleProduct
>;
export type AdminDashboardSnapshot = z.infer<typeof adminDashboardSnapshot>;
