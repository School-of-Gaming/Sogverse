import { addCalendarDays, monthsAfter, weekdayOf } from "@/lib/calendar-date";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { isoWeekOf } from "@/lib/iso-week";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  formatProductSchedule,
  joinScheduleGroups,
} from "@/lib/products/format-product-schedule";
import { productLocalDate } from "@/lib/session-occurrence";
import { sumCents } from "@/lib/utils";
import type {
  MunicipalityInvoicingClub,
  MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";

/**
 * Turn one month of `get_admin_municipality_invoicing` into the invoice the
 * page renders.
 *
 * It is a pure function of its arguments: no clock, no query, no locale hook,
 * no `t()`. That is what makes a month's counting testable without a browser,
 * and it is why the shell above it does nothing but read the document and hand
 * it over. **Nothing here is worded** — the one string that arrives from
 * outside is the name of the bucket clubs with no municipality fall into, and
 * it is passed in for the same reason a total is not: the caller owns the
 * copy, this function owns the arithmetic.
 *
 * ## What the month counts
 *
 * **A session ran iff a stored session row exists** for one of the club's
 * groups on a date inside the month. Those rows are written lazily — one
 * appears when an educator records a report, a note or an attendance mark — so
 * a row is the evidence somebody was there, and it is the only evidence that
 * bills.
 *
 * **Counting is per club, per calendar date.** A club may run several groups,
 * and two groups meeting on the same date are one session of that club. The
 * rows arrive raw, one per group and date, and are collapsed here.
 *
 * **A schedule is a claim, not a session.** The weekly slots are projected
 * across the month, clipped to the club's own term, so a date the club was
 * supposed to run and has no row for is visible. Such a date is worth nothing —
 * it is shown at zero so the CFO can go and find out what happened — and a date
 * still in the future is not a problem at all, only a date not yet reached.
 * "Today" is the club's own local today, because the dates being compared are
 * the club's own local dates. **Records beat projections**: a stored row on a
 * date the schedule does not project still counts, which is the same rule every
 * session feed in this app follows.
 *
 * **A date after the club's own today never bills, whatever is stored on it.**
 * Nothing stops a gedu writing a note against a session that has not happened
 * yet, and that row would otherwise invoice a municipality for a session still
 * ahead of it. Such a date is `upcoming` — the same line a projection with no row
 * gets — and it is outside the count. A row dated *today* bills: the date is the
 * club's own local day, and an educator writing a session up in the afternoon is
 * recording one that ran.
 *
 * **Projection is only offered for a club whose status is `running` or
 * `completed`,** and only where it has a term to clip against. A club that has
 * not started, or was cancelled, or carries no start date, contributes its
 * stored rows alone.
 *
 * **Money is integer cents from end to end.** The recorded count is multiplied
 * by the fee in cents, the cents are summed, and the division into euros
 * happens once, at render. A null fee is never worth zero: the club's total is
 * null, it is excluded from its municipality's total, and the municipality
 * carries a count of how many of its clubs are in that state.
 */

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

/** What one session line on the invoice is. */
export type InvoiceSessionKind =
  /** A stored row exists on a date that has arrived. This is what bills. */
  | "recorded"
  /** The schedule projected it, no row exists, and the date has passed. */
  | "unrecorded"
  /**
   * The date has not arrived yet — whether the schedule merely projects it or a
   * stored row already sits on it. A row written ahead of its own session is
   * something the database permits and the invoice must not bill.
   */
  | "upcoming";

export interface InvoiceSession {
  /** The club-local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** The ISO week number the date falls in — how Finnish admins say *when*. */
  isoWeek: number;
  kind: InvoiceSessionKind;
}

export interface InvoiceClub {
  id: string;
  name: string;
  /** The school hall it meets in. Null is type-driven only — see `buildClub`. */
  locationName: string | null;
  /** One line of weekdays and clock faces, or null where it has no slots. */
  scheduleSummary: string | null;
  /** The club's current per-session fee in cents, or null where it is unset. */
  feeCents: number | null;
  /** Distinct dates with a stored row that has arrived — what bills. */
  recordedCount: number;
  /**
   * Dates the schedule projected, that have passed, and that carry no stored
   * row — the one thing on this page worth investigating, counted here so the
   * club's own line can say so without being opened.
   *
   * It is on the view model rather than derived in the component for the same
   * reason every other count is: a number the CFO acts on belongs to the one
   * function that is tested, and a component filtering the session lines itself
   * would be a second definition of "missed" nothing holds to the first.
   */
  unrecordedCount: number;
  /** `recordedCount × feeCents`, or null where the fee is unset. */
  totalCents: number | null;
  sessions: readonly InvoiceSession[];
}

export interface InvoiceMunicipality {
  /** Null for the trailing bucket of clubs that resolve to no municipality. */
  id: string | null;
  name: string;
  /** The sum of the clubs that have a fee. Clubs without one are not in it. */
  totalCents: number;
  /** How many of this municipality's clubs were left out of that total. */
  clubsWithoutFee: number;
  /** Sessions that ran across this municipality's clubs — what bills. */
  recordedCount: number;
  clubs: readonly InvoiceClub[];
}

export interface MunicipalityInvoicingView {
  /** The first day of the month, `YYYY-MM-01`. */
  monthStart: string;
  municipalities: readonly InvoiceMunicipality[];
  /**
   * The whole month: every municipality's total, summed in cents through the
   * same guard every other sum on this page goes through.
   *
   * It is here rather than in the component because it is the same arithmetic
   * as every other total — count times fee, summed, divided once at render —
   * and a figure the CFO reads first has no business being the one figure
   * nothing tests. A club with no fee is outside it, exactly as it is outside
   * its own municipality's, and `clubsWithoutFee` is how the page says so.
   */
  totalCents: number;
  /** How many clubs in the month were left out of `totalCents`. */
  clubsWithoutFee: number;
  /** How many municipalities are on the invoice, the trailing bucket included. */
  municipalityCount: number;
  /** How many clubs are on the invoice, across every municipality. */
  clubCount: number;
  /** How many sessions ran across the whole month — what `totalCents` bills. */
  recordedCount: number;
}

export interface BuildMunicipalityInvoicingArgs {
  snapshot: MunicipalityInvoicingSnapshot;
  /** UI locale, for picking names out of translations and for sorting them. */
  locale: SupportedLocale;
  /** Request-stable "now". The page's only clock. */
  now: Date;
  /**
   * What to call the bucket for clubs whose location chain reaches no
   * municipality. Passed in rather than resolved here because this module is
   * pure and has no translator; passed in *at all* rather than left to the
   * component because the bucket is sorted and rendered like any other, and a
   * nameless one would have to be special-cased in two places instead of none.
   */
  noMunicipalityLabel: string;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export function buildMunicipalityInvoicing({
  snapshot,
  locale,
  now,
  noMunicipalityLabel,
}: BuildMunicipalityInvoicingArgs): MunicipalityInvoicingView {
  const monthStart = snapshot.month_start;
  const monthEnd = addCalendarDays(monthsAfter(monthStart, 1), -1);

  // Keyed by municipality id, with the empty string standing for "no
  // municipality" — a Map key rather than a separate list, so the bucket is
  // filled by the same loop as every other and only its *position* is special.
  const buckets = new Map<
    string,
    { id: string | null; name: string; clubs: InvoiceClub[] }
  >();

  for (const club of snapshot.clubs) {
    const built = buildClub(club, { locale, now, monthStart, monthEnd });
    // A club with nothing in the month — no row, and no projected date once the
    // term was clipped — is not on this invoice at all. Rendering it empty
    // would say the club did nothing in a month it was not running in.
    if (built.sessions.length === 0) continue;

    const key = club.municipality?.id ?? "";
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, {
        id: club.municipality?.id ?? null,
        name:
          club.municipality === null
            ? noMunicipalityLabel
            : localizedLocationName(club.municipality, locale),
        clubs: [built],
      });
    } else {
      bucket.clubs.push(built);
    }
  }

  const named = [...buckets.values()].filter((bucket) => bucket.id !== null);
  const unnamed = [...buckets.values()].filter((bucket) => bucket.id === null);
  named.sort((a, b) => a.name.localeCompare(b.name, locale));

  // The no-municipality bucket trails every real one whatever it is called. It
  // is a list of things to fix rather than a municipality to invoice, and
  // sorting it in by name would hide it somewhere in the middle.
  const municipalities: InvoiceMunicipality[] = [...named, ...unnamed].map(
    (bucket) => {
      const clubs = [...bucket.clubs].sort((a, b) =>
        a.name.localeCompare(b.name, locale),
      );
      return {
        id: bucket.id,
        name: bucket.name,
        totalCents: sumCents(
          clubs.flatMap((club) =>
            club.totalCents === null ? [] : [club.totalCents],
          ),
        ),
        clubsWithoutFee: clubs.filter((club) => club.feeCents === null).length,
        recordedCount: clubs.reduce(
          (count, club) => count + club.recordedCount,
          0,
        ),
        clubs,
      };
    },
  );

  return {
    monthStart,
    municipalities,
    // The month is summed from the municipality totals rather than from the
    // clubs again: one arithmetic, stated once, so the figure at the top of the
    // page cannot disagree with the figures it is standing over.
    totalCents: sumCents(municipalities.map((one) => one.totalCents)),
    clubsWithoutFee: municipalities.reduce(
      (count, one) => count + one.clubsWithoutFee,
      0,
    ),
    municipalityCount: municipalities.length,
    clubCount: municipalities.reduce((count, one) => count + one.clubs.length, 0),
    recordedCount: municipalities.reduce(
      (count, one) => count + one.recordedCount,
      0,
    ),
  };
}

interface ClubContext {
  locale: SupportedLocale;
  now: Date;
  monthStart: string;
  monthEnd: string;
}

function buildClub(
  club: MunicipalityInvoicingClub,
  { locale, now, monthStart, monthEnd }: ClubContext,
): InvoiceClub {
  // One session per club per date, whatever number of groups met on it.
  const recordedDates = new Set(
    club.sessions.map((session) => session.session_date),
  );

  // The club's own today. The dates on both sides of this comparison are
  // club-local calendar dates, so the clock has to be read in the club's zone —
  // a UTC "today" would call this evening's Helsinki session unrecorded for the
  // two hours before midnight there, every night of the year.
  const today = productLocalDate(now, club.timezone);

  // A stored row is evidence only for a day that has happened. The table takes
  // whatever date an educator types, so a note saved against next week's session
  // would otherwise be invoiced a week early — and an invoice that is too big is
  // the one error on this page nobody downstream can catch.
  const billableDates = new Set(
    [...recordedDates].filter((date) => date <= today),
  );

  const lines: InvoiceSession[] = [];
  for (const date of recordedDates) {
    lines.push({
      date,
      isoWeek: isoWeekOf(date).week,
      kind: billableDates.has(date) ? "recorded" : "upcoming",
    });
  }
  for (const date of projectedDates(club, monthStart, monthEnd)) {
    if (recordedDates.has(date)) continue;
    lines.push({
      date,
      isoWeek: isoWeekOf(date).week,
      kind: date < today ? "unrecorded" : "upcoming",
    });
  }
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const feeCents = club.municipality_fee_cents;
  const recordedCount = billableDates.size;

  return {
    id: club.id,
    name: resolveTranslation(club.product_translations, locale)?.name ?? "",
    locationName:
      club.location === null
        ? null
        : localizedLocationName(club.location, locale),
    scheduleSummary: scheduleSummary(club, locale, now),
    feeCents,
    recordedCount,
    unrecordedCount: lines.filter((line) => line.kind === "unrecorded").length,
    // One multiplication in cents, through the same guard every sum goes
    // through, and no division anywhere: the euros appear once, at render.
    totalCents: feeCents === null ? null : sumCents([feeCents * recordedCount]),
    sessions: lines,
  };
}

/**
 * Every date the club's weekly schedule puts inside the month, clipped to its
 * own term.
 *
 * Three things decide whether there is anything to project at all. A club that
 * is `pending` has not started and a `cancelled` one did not happen, so
 * projecting onto either would invent sessions nobody was ever going to run. A
 * club with no start date has no day to start walking from, and guessing one
 * would do the same. And a club with no slots has no weekly claim to project.
 *
 * The walk itself is bare-date arithmetic on UTC-pinned dates, which is exact:
 * these are the club's own calendar dates, a weekday cannot drift under
 * `addCalendarDays`, and nothing here ever grows a clock face.
 */
function projectedDates(
  club: MunicipalityInvoicingClub,
  monthStart: string,
  monthEnd: string,
): string[] {
  if (club.status !== "running" && club.status !== "completed") return [];
  // Type-driven, not reachable: a municipality club always carries both ends of
  // its term and a location by CHECK constraint, so these nulls exist only in
  // the generated types. Handled rather than asserted, because a page that
  // throws is a worse answer than one that projects nothing.
  if (club.start_date === null) return [];

  const from = club.start_date > monthStart ? club.start_date : monthStart;
  // An open-ended club runs to the end of the month; a club whose term ends
  // inside it stops on its last day, inclusive.
  const until =
    club.end_date !== null && club.end_date < monthEnd ? club.end_date : monthEnd;
  if (from > until) return [];

  const dates = new Set<string>();
  for (const slot of club.schedule_slots) {
    const offset = (slot.weekday - weekdayOf(from) + 7) % 7;
    for (
      let date = addCalendarDays(from, offset);
      date <= until;
      date = addCalendarDays(date, 7)
    ) {
      dates.add(date);
    }
  }
  return [...dates];
}

/**
 * The club's weekly cadence on one line, through the same formatter the admin
 * product rows use.
 *
 * It is rendered in the **club's own zone**, which is the one place this page
 * departs from the app's general "times render in the viewer's zone" rule, and
 * the reason is that every date beside it is already a club-local date. A
 * schedule converted into the reader's zone could name a weekday the session
 * rows next to it never fall on — a line saying Tuesday over a column of
 * Mondays — which is a worse answer than a clock face the reader has to adjust.
 * Municipalities are Finnish and their clubs are authored in Helsinki, so for
 * the CFO the two zones are the same one anyway.
 */
function scheduleSummary(
  club: MunicipalityInvoicingClub,
  locale: SupportedLocale,
  now: Date,
): string | null {
  const summary = formatProductSchedule({
    product: {
      product_type: "municipality_club",
      start_date: club.start_date,
      end_date: club.end_date,
      timezone: club.timezone,
      schedule_slots: club.schedule_slots,
    },
    locale,
    timeZone: club.timezone,
    now,
  });
  if (summary.kind !== "recurring") return null;
  return joinScheduleGroups(summary.groups) || null;
}
