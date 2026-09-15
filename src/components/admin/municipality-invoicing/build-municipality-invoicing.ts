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
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
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
 * it over. **Nothing here is worded**: every name on the invoice is a name out
 * of the document — a municipality's, a club's, a hall's — and every figure is
 * arithmetic. The caller owns the copy; this function owns the sums.
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
 * **Projection is offered wherever the club has a start date to clip against.**
 * That date is the whole of the "has it begun" rule: the walk starts at the
 * later of it and the month, so a club whose term starts after this month
 * projects nothing here anyway. A club with no start date contributes its stored
 * rows alone, because there is no day to start walking from.
 *
 * **Money is integer cents from end to end.** The recorded count is multiplied
 * by the fee in cents, the cents are summed, and the division into euros
 * happens once, at render. A null fee is never worth zero: the club's total is
 * null, it is excluded from its municipality's total, and the municipality
 * carries a count of how many of its clubs are in that state.
 *
 * **A club's Fennoa customer is carried, never counted.** It decides who an
 * invoice is addressed to and nothing about what the invoice says, so a club
 * with no customer is in every total exactly as it would be with one — the
 * counts of clubs without a customer sit beside the counts of clubs without a
 * fee precisely so the two cannot be read as the same kind of gap. The missing
 * fee costs money off a total; the missing customer costs a file.
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
  /**
   * The Fennoa customer this club is invoiced to, whole, or null where nobody
   * has said who pays yet.
   *
   * Passed straight through from the document rather than reduced to a flag,
   * because what reads it next is a file: the customer number, the invoice
   * name and the postal address all have to reach the serializer, and a club is
   * the only thing that knows which customer they came from.
   *
   * **A missing one costs no money.** It changes nothing about any total on
   * this page — it decides only whether a file can be produced for this club,
   * which is why the counts beside it are separate from `clubsWithoutFee`.
   */
  invoiceCustomer: InvoiceCustomerRow | null;
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
  id: string;
  name: string;
  /** The sum of the clubs that have a fee. Clubs without one are not in it. */
  totalCents: number;
  /** How many of this municipality's clubs were left out of that total. */
  clubsWithoutFee: number;
  /**
   * How many of this municipality's clubs name no Fennoa customer.
   *
   * Counted like `clubsWithoutFee` and meaning something entirely different: a
   * club with no fee is missing from a *total*, while a club with no customer
   * is missing from nothing — its sessions and its money are on this page in
   * full. What it cannot do is have a file produced for it, so this is a count
   * of blocked exports rather than of excluded money, and the two are separate
   * numbers because a club can be either, both or neither.
   */
  clubsWithoutCustomer: number;
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
  /**
   * How many clubs in the month name no Fennoa customer, across every
   * municipality — the month-level twin of the count on each municipality, and
   * the same distinction: it is a count of clubs whose file is blocked, never
   * of money missing from `totalCents`, which it does not touch.
   */
  clubsWithoutCustomer: number;
  /** How many municipalities are on the invoice. */
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
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export function buildMunicipalityInvoicing({
  snapshot,
  locale,
  now,
}: BuildMunicipalityInvoicingArgs): MunicipalityInvoicingView {
  const monthStart = snapshot.month_start;
  const monthEnd = addCalendarDays(monthsAfter(monthStart, 1), -1);

  // Keyed by municipality id. Every club has one — the database refuses to
  // answer a month in which any club's location chain reaches no municipality —
  // so there is no bucket here for the clubs that do not belong anywhere, and
  // no branch anywhere below asking whether this one is it.
  const buckets = new Map<
    string,
    { id: string; name: string; clubs: InvoiceClub[] }
  >();

  for (const club of snapshot.clubs) {
    const built = buildClub(club, { locale, now, monthStart, monthEnd });
    // A club with nothing in the month — no row, and no projected date once the
    // term was clipped — is not on this invoice at all. Rendering it empty
    // would say the club did nothing in a month it was not running in.
    if (built.sessions.length === 0) continue;

    const bucket = buckets.get(club.municipality.id);
    if (bucket === undefined) {
      buckets.set(club.municipality.id, {
        id: club.municipality.id,
        name: localizedLocationName(club.municipality, locale),
        clubs: [built],
      });
    } else {
      bucket.clubs.push(built);
    }
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );

  const municipalities: InvoiceMunicipality[] = ordered.map((bucket) => {
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
      clubsWithoutCustomer: clubs.filter(
        (club) => club.invoiceCustomer === null,
      ).length,
      recordedCount: clubs.reduce((count, club) => count + club.recordedCount, 0),
      clubs,
    };
  });

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
    clubsWithoutCustomer: municipalities.reduce(
      (count, one) => count + one.clubsWithoutCustomer,
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
    // Straight through. Nothing here reads it — a missing customer changes no
    // count and no total — and that is the point: it is carried so the file the
    // export writes comes out of the same build every figure on this page does.
    invoiceCustomer: club.invoice_customer,
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
 * Two things decide whether there is anything to project at all. A club with no
 * start date has no day to start walking from, and guessing one would invent
 * sessions nobody was ever going to run. And a club with no slots has no weekly
 * claim to project. The start date is also what says whether the club had begun:
 * the walk is clipped to it, so a term starting after this month yields nothing
 * without a separate test for it.
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
