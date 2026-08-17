import type { ProductType, UserRole } from "@/types";

/**
 * The presentational shapes the admin dashboard's draft body renders.
 *
 * Everything here is already **derived** — counted, joined, sorted and resolved
 * — so the body is a pure function of its props and the aggregation lives on
 * whichever side is feeding it. Today that is the preview scene's fixture
 * builder; at promotion it will be the route's data shell running the same
 * aggregation against real rows. Keeping the shapes in the middle is what makes
 * the swap a change of one module rather than a rewrite of the page.
 *
 * The vocabulary deliberately mirrors the database's: `product_type`,
 * `product_status`, seat counts as `activeCount` / `seatCount` (null meaning
 * uncapped), calendar dates as bare `YYYY-MM-DD` strings, weekdays as
 * `0 = Monday … 6 = Sunday` exactly as `schedule_slots.weekday` stores them.
 * A shape that renamed those would only have to be translated back.
 */

/**
 * The things that can be wrong with a product, worst first.
 *
 * The order is the whole ranking: it is what sorts one product's issue lines and
 * what sorts the products against each other, so a card whose worst problem is
 * "nobody is teaching this group" always outranks one that is only missing a
 * fee. It runs from *a child is enrolled and nobody is looking after them* down
 * to *a number is missing from a form*.
 *
 * **The queue is product-first, and this list is why.** An admin does not think
 * "show me every unassigned gamer on the platform"; they think "which product
 * needs me, what is wrong with it, and who does that concern". A category-first
 * queue inverts that — it scatters one product's three problems across three
 * lists and makes the admin reassemble them — so the categories survive only as
 * the *lines inside a product's card*, which is where they belong.
 */
export const PRODUCT_ISSUE_KINDS = [
  "unassigned-gamers",
  "group-without-gedu",
  "waitlist-open-seats",
  "missing-gedu-fee",
  "missing-municipality-fee",
] as const;

export type ProductIssueKind = (typeof PRODUCT_ISSUE_KINDS)[number];

/** One thing wrong with one product. */
export interface ProductIssue {
  /** Stable React key — a product can carry two group issues at once. */
  id: string;
  kind: ProductIssueKind;
  /**
   * The line as the admin reads it, already worded and already counted:
   * "3 unassigned gamers", "Group Alpha has no gedu", "4 waitlisted · 2 seats
   * open". The count lives in the string because the count *is* the fact — a
   * separate numeric field would only ever be re-templated into this sentence.
   */
  label: string;
}

/** One product that needs an admin, with everything wrong with it. */
export interface ProductAttention {
  productId: string;
  /**
   * The product's full name. It is never truncated on the card: a name is how
   * an admin recognises which of five Minecraft clubs this is, and a truncated
   * one costs exactly the information the card exists to carry.
   */
  name: string;
  productType: ProductType;
  /** The product's admin page — where every one of these issues is fixed. */
  href: string;
  issues: readonly ProductIssue[];
}

/** A gedu account waiting on an admin's decision. */
export interface UncertifiedGedu {
  /**
   * The account's real UUID. It has to be real: the identicon beside the name is
   * hashed out of the id's hex bytes, so a readable stand-in renders a
   * degenerate face rather than a different one.
   */
  id: string;
  name: string;
  /** How long they have been waiting — "registered 12 days ago". */
  registered: string;
}

/**
 * One role's tile in the users strip.
 *
 * `verified` is `null` rather than `0` for gamers, and the difference is the
 * point: a gamer's email is a synthetic `@gamer.sogverse.internal` address that
 * nobody will ever click a link in, so "0 verified" would report a problem that
 * does not exist. `null` means the stat has no meaning for this role and the
 * tile renders nothing in its place. `certified` is the same shape for the same
 * reason — only gedus can be certified.
 */
export interface AdminUserRoleStat {
  role: UserRole;
  total: number;
  verified: number | null;
  certified: number | null;
}

/**
 * One resolved occurrence of a product, on one day of the visible week.
 *
 * **`product_status` is deliberately not on it, or anywhere else on this page.**
 * The four statuses collapse, for an admin looking at a schedule, into three
 * facts — this is coming, this is happening, this is over — and the schedule
 * already says all three by construction: a chip in the week rows is happening,
 * a line in the coming-up feed is coming, and a run that is over resolves to
 * nothing at all. A status chip beside those would restate what the reader has
 * already been told by *where* they are reading.
 */
export interface ScheduleChip {
  /** Stable key — product id plus the day it resolved onto. */
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  /**
   * 0 = Monday … 6 = Sunday, matching `schedule_slots.weekday` — but the
   * weekday the session lands on **for the viewer**, which is not always the
   * one the slot was authored on. A Helsinki club meeting at 09:00 on a Monday
   * is a Sunday evening for a reader in Los Angeles, and a row that filed it
   * under Monday would be describing somebody else's week.
   */
  weekday: number;
  /** `HH:MM` in the viewer's zone. */
  startTime: string;
  /** How long the session runs — carried in the chip's `title`. */
  durationMinutes: number;
  activeCount: number;
  /**
   * `null` is an uncapped product, not a product with no seats.
   *
   * Nothing on a schedule chip renders it — the counts live in the chip's
   * `title` and nowhere else. It stays on the shape because the coming-up feed
   * beside it does render one (a camp three weeks out with six of twenty sold is
   * a fact worth a line) and because a page that later wants the number back
   * should not have to re-derive it.
   */
  seatCount: number | null;
  /** Does this product appear in the attention queue above? */
  needsAttention: boolean;
  href: string;
}

/**
 * One week of the schedule, already resolved.
 *
 * "Resolved" is the load-bearing word: a product whose term has not started,
 * has ended, or is on a holiday break this week contributes no chip, so the
 * week is what is actually happening rather than what the schedule says in the
 * abstract. Doing that resolution in the feed keeps the body from having to know
 * about terms and breaks at all.
 */
export interface ScheduleWeek {
  /** The Monday, as a bare `YYYY-MM-DD` calendar date in the viewer's zone. */
  weekStart: string;
  chips: readonly ScheduleChip[];
  /** Products paused this week, named so the page can say why they are absent. */
  onBreak: readonly string[];
}

/** One product in a coming-up milestone. */
export interface ComingUpItem {
  id: string;
  name: string;
  href: string;
  activeCount: number;
  seatCount: number | null;
}

/**
 * Everything of one kind, of one product type, happening on one date.
 *
 * The grouping exists because a term does not trickle: forty-six clubs start on
 * the same Monday, and forty-six rows saying so is a wall that buries the camp
 * starting the day after. A cohort with a handful of members lists them; a
 * cohort with many collapses to a single counted line the reader can open.
 */
export interface ComingUpCohort {
  id: string;
  /**
   * `"runs"` is the single-date case and it is not a variant of `"starts"`. An
   * event that begins and ends on one evening does not start — it happens — and
   * a feed announcing that it starts, then never mentioning it again, is
   * describing something other than what an event is.
   */
  kind: "starts" | "ends" | "runs";
  productType: ProductType;
  items: readonly ComingUpItem[];
}

/** One dated row of the coming-up feed. */
export interface ComingUpDay {
  /** Bare calendar date. */
  date: string;
  cohorts: readonly ComingUpCohort[];
}

/** Everything the draft body renders. */
export interface AdminDashboardData {
  /** The instant the page is "now" for — the highlighted weekday row. */
  now: Date;
  /**
   * The **viewer's** zone. Every calendar date and every clock face on this page
   * has already been resolved into it, so the body never converts anything.
   *
   * A session is a date *plus a clock face*, so it converts — products are
   * authored in their own zone (Helsinki, in practice) and an admin reading the
   * schedule from anywhere else is shown their own wall clock, re-grouped onto
   * the weekday it actually lands on for them.
   */
  timeZone: string;
  /**
   * The viewer's short zone abbreviation, or `null` when it matches every
   * scheduled product's own zone.
   *
   * It exists so the adjustment above is visible rather than silent: when the
   * schedule was authored in one zone and is being read in another, the page
   * says which one the times are in. `null` is the ordinary case — a Helsinki
   * admin reading Helsinki products has nothing to be told. The string comes out
   * of `Intl` already locale-formatted, so it is not translated copy.
   */
  timeZoneAbbrev: string | null;
  /** Products needing an admin. Empty means nothing is wrong with any of them. */
  products: readonly ProductAttention[];
  /** Gedu accounts waiting on a certification decision. */
  uncertifiedGedus: readonly UncertifiedGedu[];
  users: readonly AdminUserRoleStat[];
  weeks: readonly ScheduleWeek[];
  /** Index into `weeks` of the week containing `now`; the page opens on it. */
  currentWeekIndex: number;
  /** What starts and what ends over the coming months, oldest date first. */
  comingUp: readonly ComingUpDay[];
}
