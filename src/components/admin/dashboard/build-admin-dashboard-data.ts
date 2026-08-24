import { formatInTimeZone } from "date-fns-tz";
import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { dateTimeInstant } from "@/lib/schedule-occurrence";
import { formatDate } from "@/lib/utils";
import type {
  AdminDashboardAttentionProduct,
  AdminDashboardCertificationCandidate,
  AdminDashboardScheduleProduct,
  AdminDashboardSnapshot,
  AdminDashboardUserStat,
  UserRole,
} from "@/types";
import type {
  AdminDashboardData,
  AdminUserRoleStat,
  ComingUpCohort,
  ComingUpDay,
  ComingUpItem,
  ProductAttention,
  ProductIssue,
  ScheduleChip,
  ScheduleWeek,
  UncertifiedGedu,
} from "./admin-dashboard-data";
import {
  addCalendarDays,
  addCalendarMonths,
  mondayOf,
  monthsAfter,
  weekdayOf,
} from "./calendar";
import { PRODUCT_TYPE_ORDER } from "./product-type-presentation";

/**
 * Turn one `get_admin_dashboard` snapshot into everything the page body renders.
 *
 * This is the promotion twin of `mock-dashboard-fixtures.ts`: the fixtures build
 * the same shapes from a hand-written catalogue, this builds them from real
 * rows, and the body cannot tell the two apart. Both do the *same* work — count,
 * resolve, sort — because the split the shapes were drawn around is that
 * aggregation belongs to whoever is feeding the page and never to the page.
 *
 * It is a pure function of its four arguments: no clock, no query, no locale
 * hook. That is what makes a week's resolution, a cohort's collapse and a
 * cross-zone regrouping testable without a browser, and it is why the shell
 * above it does nothing but read the snapshot and hand it over. **Nothing here
 * is worded**: an issue leaves as a `kind` plus the numbers that go in it, and
 * the components map the pair through `t()`. `locale` is used for the two things
 * that are not copy — picking a product's own name out of its translations, and
 * the `Intl` formatters that turn a gap into "2 days ago".
 *
 * **The schedule half converts; the coming-up half does not**, and the rule
 * behind that split is the repo's own: a value with a clock face converts, a
 * bare date does not. A session is a date *plus* a wall clock, so it is resolved
 * to an instant in the product's zone and re-read in the viewer's — re-grouped
 * onto whichever weekday it lands on there. A term's first and last day carry no
 * time of day at all, so they stay UTC-pinned calendar dates and are compared,
 * grouped and rendered as themselves.
 */
export interface BuildAdminDashboardDataArgs {
  snapshot: AdminDashboardSnapshot;
  /** UI locale, for picking each product's name out of its translations. */
  locale: SupportedLocale;
  /** The viewer's IANA zone — every date and clock face lands in this. */
  viewerTimeZone: string;
  /** Request-stable "now". The page's only clock. */
  now: Date;
}

/**
 * How far back and forward the snapshot's schedule set reaches
 * (`(now AT TIME ZONE p.timezone)::date - 30` to `+ 4 months` in the RPC).
 *
 * The occurrence walk below applies these in each **product's** zone, which is
 * where the RPC applies them; the offered week window applies them in the
 * **viewer's** and then shrinks by a day at each end, because the two anchors
 * straddle a midnight for part of every day — see `windowWeekStarts`.
 *
 * The page must not offer a week the data cannot fill: the holiday dates are
 * bounded to this same window, so a week beyond it would render a break as a
 * session. Week navigation therefore stops at the last week lying **wholly**
 * inside it rather than at an arbitrary count of steps.
 */
const WINDOW_DAYS_BEFORE = 30;
const WINDOW_MONTHS_AFTER = 4;

/**
 * How far the coming-up feed looks: the rest of this month plus three more.
 *
 * A calendar boundary rather than a day count, so the feed never ends by
 * slicing a term boundary in half at an arbitrary cutoff. Anchored to the first
 * of the current month it is always inside the schedule window above, which is
 * what keeps the two halves of the panel talking about the same set of products.
 */
const COMING_UP_MONTHS = 4;

/**
 * The order the users strip reads in: the platform's own hierarchy.
 *
 * **A role added to `user_role` does not arrive on this page by itself.** The
 * RPC drives its tiles off `enum_range`, so a new role is counted and sent the
 * moment the enum has it — but the page still has to be told twice where it
 * goes: here, and in the strip's glyph map. The glyph map is a
 * `Record<UserRole, …>` and so fails to compile until somebody chooses an icon;
 * this list is a plain array and would silently *drop* the tile instead, which
 * is why it is worth saying out loud rather than trusting the type system to
 * catch both halves.
 */
const ROLE_ORDER: readonly UserRole[] = ["customer", "gamer", "gedu", "admin"];

/**
 * The half of the page that only changes at midnight.
 *
 * Two fields of `AdminDashboardData` are missing because neither is a
 * day-granular fact: a gedu's wait has to age while the page sits open, and the
 * viewer's zone abbreviation turns over on a DST transition *inside* a day
 * (EET → EEST at 03:00 local, not at the following midnight). Both are cheap
 * maps over a handful of rows, so the shell re-runs them against the live clock
 * and lays them over this. Leaving them out of the shape rather than computing
 * values the shell would overwrite is what keeps each derivation to one live
 * call site.
 */
export type AdminDashboardDayData = Omit<
  AdminDashboardData,
  "timeZoneAbbrev" | "uncertifiedGedus"
>;

export function buildAdminDashboardData({
  snapshot,
  locale,
  viewerTimeZone,
  now,
}: BuildAdminDashboardDataArgs): AdminDashboardDayData {
  const today = formatInTimeZone(now, viewerTimeZone, "yyyy-MM-dd");

  // The dot on a schedule chip and the cards in the queue are the same fact, so
  // the flagged set is taken from the queue rather than derived twice.
  const flagged = new Set(
    snapshot.attention_products.map((product) => product.id),
  );

  const { weeks, currentWeekIndex } = resolveWeeks({
    products: snapshot.schedule_products,
    locale,
    viewerTimeZone,
    now,
    today,
    flagged,
  });

  return {
    now,
    timeZone: viewerTimeZone,
    products: snapshot.attention_products.map((product) =>
      toProductAttention(product, locale),
    ),
    users: orderUsers(snapshot.users),
    weeks,
    currentWeekIndex,
    comingUp: buildComingUp(snapshot.schedule_products, locale, today),
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Four tiles in a fixed order, whatever order the RPC aggregated them in.
 *
 * The order is the platform's own — the people it is for, the children they
 * bring, the educators who teach them, the staff who run it — and reading it off
 * the wire would make the strip's order an accident of a `GROUP BY`.
 */
function orderUsers(
  stats: readonly AdminDashboardUserStat[],
): readonly AdminUserRoleStat[] {
  const byRole = new Map(stats.map((stat) => [stat.role, stat]));
  return ROLE_ORDER.flatMap((role) => {
    const stat = byRole.get(role);
    return stat === undefined ? [] : [stat];
  });
}

// ---------------------------------------------------------------------------
// The attention queue
// ---------------------------------------------------------------------------

/**
 * One product's card: its name, and every one of its problems as a fact.
 *
 * The wire carries facts (`unassigned_count`, a list of group names, a
 * waitlist pair, two booleans) and this keeps them facts: a `kind` naming the
 * message and the numbers or names that message interpolates. **Nothing here is
 * worded**, because this module is pure — no locale hook, no `t()` — and a count
 * folded into an English string could not have carried its plural rule into
 * Finnish anyway. The card's own ordering is the grid's business; it sorts by
 * severity itself.
 */
function toProductAttention(
  product: AdminDashboardAttentionProduct,
  locale: SupportedLocale,
): ProductAttention {
  const issues: ProductIssue[] = [];

  if (product.unassigned_count > 0) {
    issues.push({
      id: `${product.id}-unassigned-gamers`,
      kind: "unassigned-gamers",
      values: { count: product.unassigned_count },
    });
  }

  for (const group of product.groups_without_gedu) {
    issues.push({
      id: `${product.id}-group-without-gedu-${group.id}`,
      kind: "group-without-gedu",
      values: { group: group.name },
    });
  }

  if (product.waitlist !== null) {
    const { waitlist_count: waiting, open_seats: open } = product.waitlist;
    issues.push({
      id: `${product.id}-waitlist-open-seats`,
      kind: "waitlist-open-seats",
      values: { waiting, open },
    });
  }

  if (product.missing_gedu_fee) {
    issues.push({
      id: `${product.id}-missing-gedu-fee`,
      kind: "missing-gedu-fee",
    });
  }

  if (product.missing_municipality_fee) {
    issues.push({
      id: `${product.id}-missing-municipality-fee`,
      kind: "missing-municipality-fee",
    });
  }

  return {
    productId: product.id,
    name: productName(product.translations, locale),
    productType: product.product_type,
    href: ROUTES.admin.product(product.product_type, product.id),
    issues,
  };
}

// ---------------------------------------------------------------------------
// The certification queue
// ---------------------------------------------------------------------------

/**
 * The queue, aged against a clock — and the **only** part of this module that
 * wants a ticking one.
 *
 * Everything else here is day-granular: which weeks exist, which occurrence
 * lands on which weekday, what is coming up. A wait is not — "3 minutes ago"
 * has to become "an hour ago" while the page sits open — so it is exported
 * separately, and the shell re-runs this cheap map against the live clock while
 * the expensive half is memoised on the calendar day.
 *
 * It also carries each candidate's standing under the contract, which is the one
 * value here that is a *date* rather than a gap and so wants the viewer's zone
 * as well as their locale. That standing informs the decision and gates nothing:
 * certification is the platform's only blocking lever, and an unsigned candidate
 * is still certifiable — over a confirmation the queue asks for first.
 */
export function buildCertificationQueue(
  candidates: readonly AdminDashboardCertificationCandidate[],
  locale: SupportedLocale,
  now: Date,
  /** The viewer's zone — an acceptance is an instant, so it converts. */
  viewerTimeZone: string,
): UncertifiedGedu[] {
  return candidates.map((candidate) =>
    toUncertifiedGedu(candidate, locale, now, viewerTimeZone),
  );
}

function toUncertifiedGedu(
  candidate: AdminDashboardCertificationCandidate,
  locale: SupportedLocale,
  now: Date,
  viewerTimeZone: string,
): UncertifiedGedu {
  const name = [candidate.first_name, candidate.last_name]
    .filter((part) => part.trim().length > 0)
    .join(" ");

  return {
    id: candidate.id,
    // The account is real and the name may not be; an unnamed row still has to
    // be actionable, and its identicon is keyed to the id either way. The
    // stand-in wording belongs to the card, so the absence travels as `null`.
    name: name.length > 0 ? name : null,
    registeredAgo: relativeWait(candidate.created_at, now, locale),
    // The wire's null already means "not standing under the terms in force",
    // whether that is because nothing was ever signed or because what was
    // signed has been superseded. Nothing here re-derives that distinction.
    contractAcceptedOn:
      candidate.contract_accepted_at === null
        ? null
        : formatDate(candidate.contract_accepted_at, locale, {
            dateStyle: "medium",
            timeZone: viewerTimeZone,
          }),
  };
}

/**
 * "2 days ago", "3 weeks ago", "2 months ago" — the wait, in the coarsest unit
 * that still says something.
 *
 * The wire sends `created_at` rather than a number of days precisely so the
 * clock for this is the page's, and `Intl.RelativeTimeFormat` is what turns the
 * gap into words: it is locale-formatted by the platform, so nothing here is
 * translated copy that could drift from the number beside it.
 *
 * Exported for the fixtures, which age their pinned registrations against their
 * pinned clock through this same function — a preview whose waits were English
 * literals would be the one part of the scene that did not follow the reader's
 * locale.
 */
export function relativeWait(
  createdAt: string,
  now: Date,
  locale: string,
): string {
  const elapsedMs = now.getTime() - new Date(createdAt).getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const minutes = Math.round(elapsedMs / 60_000);
  if (Math.abs(minutes) < 60) return format.format(-minutes, "minute");

  const hours = Math.round(elapsedMs / 3_600_000);
  if (Math.abs(hours) < 24) return format.format(-hours, "hour");

  const days = Math.round(elapsedMs / 86_400_000);
  if (Math.abs(days) < 14) return format.format(-days, "day");

  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 9) return format.format(-weeks, "week");

  return format.format(-Math.round(days / 30), "month");
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

interface ResolveWeeksArgs {
  products: readonly AdminDashboardScheduleProduct[];
  locale: SupportedLocale;
  viewerTimeZone: string;
  now: Date;
  /** Today, as the calendar date it is in the viewer's zone. */
  today: string;
  flagged: ReadonlySet<string>;
}

/**
 * Every occurrence in the window, placed in the viewer's week.
 *
 * The whole range is resolved up front rather than a week at a time, because
 * stepping weeks is local state over data the page already holds — a step that
 * had to resolve anything would be a round trip charged for a click.
 *
 * **A product is "on break" in a week only when every session it had there fell
 * on a holiday.** A club that loses one of its two Wednesdays to a public
 * holiday still met that week, and a break line claiming otherwise would say
 * something false about a week the reader can see the other chip in.
 */
function resolveWeeks({
  products,
  locale,
  viewerTimeZone,
  now,
  today,
  flagged,
}: ResolveWeeksArgs): { weeks: ScheduleWeek[]; currentWeekIndex: number } {
  const weekStarts = windowWeekStarts(today);
  const inWindow = new Set(weekStarts);

  const chipsByWeek = new Map<string, ScheduleChip[]>();
  /** weekStart → productId → how many of its sessions there, and how many fell on a holiday. */
  const breakTally = new Map<
    string,
    Map<string, { name: string; sessions: number; holidays: number }>
  >();

  for (const product of products) {
    const name = productName(product.translations, locale);
    const href = ROUTES.admin.product(product.product_type, product.id);
    const holidays = new Set(product.holidays);

    for (const occurrence of productOccurrences(product, now)) {
      const { date, time } = viewerPlacement(
        occurrence.date,
        occurrence.slot.start_time,
        product.timezone,
        viewerTimeZone,
      );
      const weekStart = mondayOf(date);
      // The viewer's week can reach a day either side of the source window; a
      // week the data does not wholly cover is not offered at all.
      if (!inWindow.has(weekStart)) continue;

      let tally = breakTally.get(weekStart);
      if (tally === undefined) {
        tally = new Map();
        breakTally.set(weekStart, tally);
      }
      const entry = tally.get(product.id) ?? {
        name,
        sessions: 0,
        holidays: 0,
      };
      entry.sessions += 1;
      if (holidays.has(occurrence.date)) entry.holidays += 1;
      tally.set(product.id, entry);

      if (holidays.has(occurrence.date)) continue;

      const chips = chipsByWeek.get(weekStart) ?? [];
      chips.push({
        id: `${product.id}-${date}-${time}`,
        productId: product.id,
        productName: name,
        productType: product.product_type,
        weekday: weekdayOf(date),
        startTime: time,
        durationMinutes: occurrence.slot.duration_minutes,
        activeCount: product.active_count,
        seatCount: product.seat_count,
        needsAttention: flagged.has(product.id),
        href,
      });
      chipsByWeek.set(weekStart, chips);
    }
  }

  const weeks = weekStarts.map((weekStart): ScheduleWeek => {
    const tally = breakTally.get(weekStart);
    const onBreak =
      tally === undefined
        ? []
        : [...tally.values()]
            .filter((entry) => entry.sessions === entry.holidays)
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));

    return {
      weekStart,
      chips: chipsByWeek.get(weekStart) ?? [],
      onBreak,
    };
  });

  const currentWeekIndex = Math.max(weekStarts.indexOf(mondayOf(today)), 0);

  return { weeks, currentWeekIndex };
}

/**
 * The Mondays the week view can step through: every week lying **wholly** inside
 * the window, with a day's margin at each end.
 *
 * Bounding on whole weeks rather than on the window's own edges is what makes
 * the navigation honest at its ends. A half-covered week would render as a
 * quiet one — some of its products simply absent — which is indistinguishable
 * from a week where nothing was scheduled, and there is nothing on the page that
 * could tell the reader which they were looking at.
 *
 * **The day at each end is the price of two calendars.** This window is measured
 * from the *viewer's* today, while every product's own occurrence window is
 * measured from today in the *product's* zone — the RPC bounds its holidays that
 * way, and the walk above mirrors it. The two agree for most of the day and
 * disagree across whichever midnight comes first: an LA admin reading a Helsinki
 * club is a calendar date behind it for seven hours out of every twenty-four.
 * On those hours a boundary week can be offered whose first or last day lies
 * outside the product's window, so its sessions are simply missing — the exact
 * half-covered week the whole-weeks bound exists to refuse. Shrinking by one day
 * at each end covers the largest gap the two calendars can open (a day) and
 * costs at most one week of navigation at each extreme, which is a range nobody
 * is reading anyway.
 *
 * **The day comes off `today`, not off the far edge**, and the two are not the
 * same date. Adding four months clamps to the end of the target month, so a
 * subtraction on the far side is a subtraction from an already-clamped answer:
 * from 1 March, `+ 4 months − 1 day` is 30 June, while the product a calendar
 * date behind walked to `28 February + 4 months` = 28 June. Three days of window
 * the data does not cover, and the week of 22 June offered on the strength of
 * it. Taking the day off first asks the clamp the same question the product
 * asked it, which is the only way the two edges can agree. Day arithmetic
 * commutes, so the near edge is unaffected — it is written the same way for the
 * symmetry rather than because it had to change.
 */
function windowWeekStarts(today: string): string[] {
  // A day in from each edge of the window the snapshot itself covers — and the
  // day comes off *today*, before the offsets are applied, on both edges.
  const windowStart = addCalendarDays(
    addCalendarDays(today, 1),
    -WINDOW_DAYS_BEFORE,
  );
  /** Exclusive, a day inside the RPC's own `< window_end`. */
  const windowEnd = addCalendarMonths(
    addCalendarDays(today, -1),
    WINDOW_MONTHS_AFTER,
  );

  let first = mondayOf(windowStart);
  if (first < windowStart) first = addCalendarDays(first, 7);

  let last = mondayOf(addCalendarDays(windowEnd, -1));
  if (addCalendarDays(last, 6) >= windowEnd) last = addCalendarDays(last, -7);

  const starts: string[] = [];
  for (let week = first; week <= last; week = addCalendarDays(week, 7)) {
    starts.push(week);
  }
  return starts;
}

interface Occurrence {
  /** The calendar date in the **product's** zone. */
  date: string;
  slot: AdminDashboardScheduleProduct["schedule_slots"][number];
}

/**
 * Every date a product's slots fall on inside its own window, holidays included.
 *
 * The walk is in the product's zone because that is the zone its term dates,
 * its slot weekdays and its holidays are all authored in — a term that ends on
 * the 13th ends on the 13th there, whoever is reading. Conversion happens one
 * step later, per occurrence, once there is a concrete date to hang a clock
 * face on.
 */
function* productOccurrences(
  product: AdminDashboardScheduleProduct,
  now: Date,
): Generator<Occurrence> {
  // A product with no first day has no occurrences to place: there is no date
  // to start walking from, and guessing one would invent sessions.
  if (product.start_date === null) return;

  const sourceToday = formatInTimeZone(now, product.timezone, "yyyy-MM-dd");
  const windowStart = addCalendarDays(sourceToday, -WINDOW_DAYS_BEFORE);
  const windowEnd = addCalendarMonths(sourceToday, WINDOW_MONTHS_AFTER);

  const from =
    product.start_date > windowStart ? product.start_date : windowStart;
  // Exclusive end: the day after the term's last, or the window's edge.
  const termEnd =
    product.end_date === null ? null : addCalendarDays(product.end_date, 1);
  const until = termEnd !== null && termEnd < windowEnd ? termEnd : windowEnd;

  for (const slot of product.schedule_slots) {
    // The first occurrence of this weekday on or after `from`, then a week at a
    // time. Stepping seven calendar days on a UTC-pinned date is exact — a
    // weekday cannot drift, which is the whole reason these dates never leave
    // UTC until a clock face is attached to them.
    const offset = (slot.weekday - weekdayOf(from) + 7) % 7;
    for (
      let date = addCalendarDays(from, offset);
      date < until;
      date = addCalendarDays(date, 7)
    ) {
      yield { date, slot };
    }
  }
}

/**
 * One occurrence as the viewer meets it: their calendar date, their clock face.
 *
 * The identical-zone case short-circuits, and that is not only an optimisation:
 * when the product's zone *is* the viewer's, the stored wall clock already is
 * the viewer's wall clock, and round-tripping it through an instant could only
 * introduce error. It is also the overwhelmingly common path — Helsinki products
 * read by a Helsinki admin — so the conversion cost falls only on the reader who
 * actually needs it.
 */
function viewerPlacement(
  date: string,
  startTime: string,
  sourceTimeZone: string,
  viewerTimeZone: string,
): { date: string; time: string } {
  if (sourceTimeZone === viewerTimeZone) {
    return { date, time: startTime.slice(0, 5) };
  }
  // A recurring wall clock cannot be converted without a concrete date — the
  // offset is DST-dependent — which is exactly what this occurrence has.
  const instant = dateTimeInstant(date, startTime, sourceTimeZone);
  const stamp = formatInTimeZone(instant, viewerTimeZone, "yyyy-MM-dd HH:mm");
  return { date: stamp.slice(0, 10), time: stamp.slice(11) };
}

/**
 * The viewer's short zone abbreviation, or `null` when nothing converted.
 *
 * Asked of the scheduled products rather than of a constant, because the answer
 * is about this snapshot: an admin in Helsinki reading Helsinki products is told
 * nothing, and the moment one product is authored somewhere else the whole
 * schedule says which clock it is on. Resolved at `now` so the abbreviation is
 * the one currently in force (EET in winter, EEST in summer).
 *
 * **Exported because it is one of the two things on this page the ticking clock
 * genuinely moves.** A zone changes its abbreviation *inside* a day — Helsinki
 * at 03:00 on the last Sunday in March — so resolving it alongside the week
 * arithmetic, which is sampled once per calendar day, would leave the page
 * claiming EET for the rest of a day it had already spent in EEST. It is one
 * `Intl` format over a `some()`, so the shell re-runs it per tick.
 */
export function viewerZoneAbbrev(
  products: readonly AdminDashboardScheduleProduct[],
  viewerTimeZone: string,
  locale: string,
  now: Date,
): string | null {
  const converts = products.some(
    (product) => product.timezone !== viewerTimeZone,
  );
  if (!converts) return null;

  const part = new Intl.DateTimeFormat(locale, {
    timeZone: viewerTimeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((piece) => piece.type === "timeZoneName");
  return part?.value ?? null;
}

// ---------------------------------------------------------------------------
// The coming-up feed
// ---------------------------------------------------------------------------

/** Order the cohorts on one day take: what begins, what happens, what ends. */
const COMING_UP_KIND_ORDER: readonly ComingUpCohort["kind"][] = [
  "starts",
  "runs",
  "ends",
];

/**
 * One entry per milestone, grouped by date and then by kind and product type.
 *
 * These are bare calendar dates with no time of day, so they stay UTC-pinned:
 * a term's last day is the same day for every reader, and re-anchoring it to a
 * zone would move it for half of them. That is also why a single-date product
 * gets its own kind — an event that begins and ends on one evening does not
 * *start*, it happens, and a feed that announces its start and never mentions it
 * again is describing something other than an event.
 */
function buildComingUp(
  products: readonly AdminDashboardScheduleProduct[],
  locale: SupportedLocale,
  today: string,
): ComingUpDay[] {
  const horizonEnd = monthsAfter(`${today.slice(0, 7)}-01`, COMING_UP_MONTHS);
  const inHorizon = (date: string) => date >= today && date < horizonEnd;

  const byDate = new Map<string, Map<string, ComingUpCohort>>();

  const add = (
    date: string,
    kind: ComingUpCohort["kind"],
    product: AdminDashboardScheduleProduct,
  ) => {
    const cohortKey = `${kind}-${product.product_type}`;
    let day = byDate.get(date);
    if (day === undefined) {
      day = new Map<string, ComingUpCohort>();
      byDate.set(date, day);
    }
    const item: ComingUpItem = {
      id: product.id,
      name: productName(product.translations, locale),
      href: ROUTES.admin.product(product.product_type, product.id),
      activeCount: product.active_count,
      seatCount: product.seat_count,
    };
    const existing = day.get(cohortKey);
    if (existing === undefined) {
      day.set(cohortKey, {
        id: `${date}-${cohortKey}`,
        kind,
        productType: product.product_type,
        items: [item],
      });
    } else {
      day.set(cohortKey, { ...existing, items: [...existing.items, item] });
    }
  };

  for (const product of products) {
    if (product.start_date === null) continue;

    if (product.end_date === product.start_date) {
      if (inHorizon(product.start_date)) add(product.start_date, "runs", product);
      continue;
    }
    if (inHorizon(product.start_date)) add(product.start_date, "starts", product);
    if (product.end_date !== null && inHorizon(product.end_date)) {
      add(product.end_date, "ends", product);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, cohorts]) => ({
      date,
      cohorts: [...cohorts.values()].sort(compareComingUpCohorts),
    }));
}

/**
 * How the cohorts on one date read: what begins, then what happens, then what
 * ends, each in the page's own product-type order.
 *
 * Exported because the fixtures build the same feed from a hand-written
 * catalogue, and a second copy of this ranking would let the preview and the
 * live page disagree about the order of a day nobody thought to compare.
 */
export function compareComingUpCohorts(
  a: ComingUpCohort,
  b: ComingUpCohort,
): number {
  const kindDelta =
    COMING_UP_KIND_ORDER.indexOf(a.kind) - COMING_UP_KIND_ORDER.indexOf(b.kind);
  if (kindDelta !== 0) return kindDelta;
  return (
    PRODUCT_TYPE_ORDER.indexOf(a.productType) -
    PRODUCT_TYPE_ORDER.indexOf(b.productType)
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * A product's name in the reader's locale, through the admin surfaces' own
 * fallback chain (locale → English → whatever exists). Every product is
 * DB-guaranteed at least one translation, so the empty fallback is defensive.
 */
function productName(
  translations: readonly { locale: string; name: string }[],
  locale: SupportedLocale,
): string {
  return resolveTranslation(translations, locale)?.name ?? "";
}
