import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  compareCalendarDates,
  monthEndOf,
  projectMonthDates,
  recordHasHappened,
  unrecordedOrUpcoming,
} from "@/lib/invoicing/month";
import { isoWeekOf } from "@/lib/iso-week";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  deriveSessionStaffing,
  type GeduAssignmentRole,
  type StaffingAssignment,
  type SubstitutionRequestInput,
} from "@/lib/session-staffing";
import { productLocalDate } from "@/lib/session-occurrence";
import { sumCents } from "@/lib/utils";
import type {
  GeduInvoicingGedu,
  GeduInvoicingGroup,
  GeduInvoicingProduct,
  GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing";

/**
 * Turn one month of gedu invoicing — `get_admin_gedu_invoicing` (every gedu) or
 * `get_my_gedu_invoicing` (the caller alone), one document shape — into what a
 * gedu invoices School of Gaming for.
 *
 * Pure, like the municipality builder it mirrors: no clock (the caller injects
 * "now"), no query, no translator. **Nothing here is worded** — every name is
 * one out of the document and every figure is arithmetic.
 *
 * ## What the month pays
 *
 * **Counting is per gedu, per (group, date) — a seat.** Unlike the municipality
 * invoice, two groups of one product on one date are *not* collapsed: a gedu at
 * two groups is two seats and ran two sessions.
 *
 * **A seat pays iff a stored session row exists on a date that has arrived, and
 * the gedu was expected there.** "Expected" is the substitution derivation
 * (`deriveSessionStaffing`), run here over exactly the seats the document
 * carries: an absent gedu is not paid for the date they gave away, and their sub
 * is — in the role recorded on the substitution. The fee is the product's
 * *current* fee for that role, read with the page.
 *
 * **A schedule is a claim, not a session** — the municipality rules, per seat.
 * The product's weekly slots are projected across the month, clipped to its
 * term; a gedu's own substitution and absence dates are claims too, because a
 * request is a statement that a session was due that day. A claim the gedu was expected at,
 * with no row, is `unrecorded` before the product's own today and `upcoming`
 * from today on. **Records beat projections**: a row on a date nothing projects
 * still pays. A row dated after today is `upcoming`, never paid.
 *
 * **A cancelled date is never paid and never missed**, and only a claimed date
 * gets a cancelled line — a cancellation the gedu has no claim on renders
 * nothing, as in the municipality invoice.
 *
 * **An absence renders as a quiet line**, so a gedu can see why an assigned
 * date does not pay, and it names the sub who covered it where one did. A sub's
 * lines name the gedu they covered for. Both are names out of the document,
 * carried as data; the wording is the caller's.
 *
 * **Money is integer cents end to end**, summed through the guarded addition
 * that throws on an unsafe integer, and divided into euros once, at render. An
 * unset fee is never zero: its club's total is null, it is outside every
 * subtotal and total, and the counts say how many clubs and sessions were left
 * out. A fee of 0 is a real zero and pays zero.
 */

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

/** Which subtotal a club's money lands in. */
export type GeduInvoiceSegment = "municipality" | "consumer";

/** What one dated seat on a gedu's invoice is. */
export type GeduInvoiceLineKind =
  /** A stored row on a date that has arrived, and the gedu was expected. Pays. */
  | "paid"
  /** A claimed date the gedu was expected at, that has passed with no row. */
  | "unrecorded"
  /** Not reached yet — a claim ahead of today, or a row written ahead of it. */
  | "upcoming"
  /** A claimed date an admin cancelled. Never paid, never missed. */
  | "cancelled"
  /** The gedu filed an absence for it. Never paid, never missed. */
  | "absent";

/** A gedu named on another gedu's line — who covered, or who was covered. */
export interface GeduInvoicePerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface GeduInvoiceLine {
  /** The product-local calendar date, `YYYY-MM-DD`. */
  date: string;
  isoWeek: number;
  kind: GeduInvoiceLineKind;
  /** The group this seat is in — two groups of one club are two seats. */
  groupId: string;
  groupName: string;
  /**
   * On an `absent` line, the sub who covered it, or null while nobody has.
   * Null on every other kind.
   */
  substitute: GeduInvoicePerson | null;
  /**
   * On a seat the gedu holds as a sub, the gedu they covered for — whatever
   * became of the date. Null on a seat of their own.
   */
  coveringFor: GeduInvoicePerson | null;
}

/** One club, in one role, for one gedu: what one role's seats in it came to. */
export interface GeduInvoiceClub {
  productId: string;
  productType: GeduInvoicingProduct["product_type"];
  segment: GeduInvoiceSegment;
  name: string;
  /** The role this club's lines were paid (or would have been) in. */
  role: GeduAssignmentRole;
  locationName: string | null;
  municipalityName: string | null;
  /** The product's current fee for `role`, in cents; null where it is unset. */
  feeCents: number | null;
  /** Seats that pay. */
  paidCount: number;
  /** Claimed seats that passed with no row — the thing worth asking about. */
  unrecordedCount: number;
  /** `paidCount × feeCents`, or null where the fee is unset. */
  totalCents: number | null;
  /** Ascending by date, then group name. */
  lines: readonly GeduInvoiceLine[];
}

export interface GeduInvoice {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Municipality clubs first, then by name, then primary before assistant. */
  clubs: readonly GeduInvoiceClub[];
  /** The municipality clubs with a fee, summed. */
  municipalityTotalCents: number;
  /** Every other club with a fee, summed. */
  consumerTotalCents: number;
  /** `municipalityTotalCents + consumerTotalCents`. */
  totalCents: number;
  paidCount: number;
  unrecordedCount: number;
  /** Clubs whose fee is unset — outside every total. */
  clubsWithoutFee: number;
  /** Paid seats in those clubs — the sessions the totals are short by. */
  sessionsWithoutFee: number;
}

export interface GeduInvoicingView {
  /** The first day of the month, `YYYY-MM-01`. */
  monthStart: string;
  /** Every gedu with at least one line, by name. */
  gedus: readonly GeduInvoice[];
  /** The sum of the gedu totals — never a second pass over the clubs. */
  totalCents: number;
  municipalityTotalCents: number;
  consumerTotalCents: number;
  geduCount: number;
  paidCount: number;
  unrecordedCount: number;
  /** Distinct products some gedu's club line has no fee for. */
  clubsWithoutFee: number;
  /** Every gedu's `sessionsWithoutFee`, summed — each is a seat left out. */
  sessionsWithoutFee: number;
}

export interface BuildGeduInvoicingArgs {
  snapshot: GeduInvoicingSnapshot;
  /** UI locale, for picking names out of translations and for sorting them. */
  locale: SupportedLocale;
  /** Request-stable "now". The page's only clock. */
  now: Date;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export function buildGeduInvoicing({
  snapshot,
  locale,
  now,
}: BuildGeduInvoicingArgs): GeduInvoicingView {
  const monthStart = snapshot.month_start;
  const monthEnd = monthEndOf(monthStart);

  const context: BuildContext = {
    locale,
    now,
    monthStart,
    monthEnd,
    groups: new Map(snapshot.groups.map((group) => [group.id, group])),
    products: new Map(snapshot.products.map((product) => [product.id, product])),
  };

  const gedus = snapshot.gedus
    .map((gedu) => buildGedu(gedu, context))
    // A gedu with a seat and nothing dated in the month — a group whose term
    // missed it and that recorded nothing — has nothing to invoice and is not
    // listed, as the municipality invoice drops an empty club.
    .filter((gedu) => gedu.clubs.length > 0)
    .sort(
      (a, b) =>
        a.firstName.localeCompare(b.firstName, locale) ||
        a.lastName.localeCompare(b.lastName, locale) ||
        compareCodeUnits(a.id, b.id),
    );

  return {
    monthStart,
    gedus,
    // Summed from the gedu totals, so the month cannot disagree with the rows
    // it stands over.
    totalCents: sumCents(gedus.map((gedu) => gedu.totalCents)),
    municipalityTotalCents: sumCents(
      gedus.map((gedu) => gedu.municipalityTotalCents),
    ),
    consumerTotalCents: sumCents(gedus.map((gedu) => gedu.consumerTotalCents)),
    geduCount: gedus.length,
    paidCount: count(gedus, (gedu) => gedu.paidCount),
    unrecordedCount: count(gedus, (gedu) => gedu.unrecordedCount),
    // Distinct products, not the gedus' counts summed: one unpriced club staffed
    // by five gedus is one fee to set, not five.
    clubsWithoutFee: new Set(
      gedus.flatMap((gedu) =>
        gedu.clubs
          .filter((club) => club.feeCents === null)
          .map((club) => club.productId),
      ),
    ).size,
    sessionsWithoutFee: count(gedus, (gedu) => gedu.sessionsWithoutFee),
  };
}

interface BuildContext {
  locale: SupportedLocale;
  now: Date;
  monthStart: string;
  monthEnd: string;
  groups: ReadonlyMap<string, GeduInvoicingGroup>;
  products: ReadonlyMap<string, GeduInvoicingProduct>;
}

interface RoledLine {
  role: GeduAssignmentRole;
  line: GeduInvoiceLine;
}

function buildGedu(gedu: GeduInvoicingGedu, context: BuildContext): GeduInvoice {
  const groupIds = new Set([
    ...gedu.assignments.map((seat) => seat.group_id),
    ...gedu.substitutions.map((seat) => seat.group_id),
    ...gedu.absences.map((seat) => seat.group_id),
  ]);

  // Keyed by (product, role): one club entry per role the gedu held in it.
  const byClub = new Map<
    string,
    { product: GeduInvoicingProduct; role: GeduAssignmentRole; lines: GeduInvoiceLine[] }
  >();

  for (const groupId of groupIds) {
    const group = required(context.groups.get(groupId), "group", groupId);
    const product = required(
      context.products.get(group.product_id),
      "product",
      group.product_id,
    );
    for (const { role, line } of groupLines(gedu, group, product, context)) {
      const key = `${product.id}|${role}`;
      const entry = byClub.get(key);
      if (entry === undefined) {
        byClub.set(key, { product, role, lines: [line] });
      } else {
        entry.lines.push(line);
      }
    }
  }

  const clubs = [...byClub.values()]
    .map(({ product, role, lines }) =>
      buildClub(product, role, lines, context.locale),
    )
    .sort(
      (a, b) =>
        (a.segment === b.segment ? 0 : a.segment === "municipality" ? -1 : 1) ||
        a.name.localeCompare(b.name, context.locale) ||
        (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1) ||
        compareCodeUnits(a.productId, b.productId),
    );

  const municipalityTotalCents = sumCents(
    feeTotals(clubs.filter((club) => club.segment === "municipality")),
  );
  const consumerTotalCents = sumCents(
    feeTotals(clubs.filter((club) => club.segment === "consumer")),
  );
  const unset = clubs.filter((club) => club.feeCents === null);

  return {
    id: gedu.id,
    firstName: gedu.first_name,
    lastName: gedu.last_name,
    email: gedu.email,
    clubs,
    municipalityTotalCents,
    consumerTotalCents,
    // The two subtotals, added — the gedu total is never a third pass.
    totalCents: sumCents([municipalityTotalCents, consumerTotalCents]),
    paidCount: count(clubs, (club) => club.paidCount),
    unrecordedCount: count(clubs, (club) => club.unrecordedCount),
    clubsWithoutFee: unset.length,
    sessionsWithoutFee: count(unset, (club) => club.paidCount),
  };
}

/**
 * The gedu's own seats on one group, in the shape the staffing derivation
 * reads: their assignment (if any) as the group's one assignment, their
 * substitutions as `substituted` requests naming them, and their own absences
 * as requests they filed.
 *
 * Other gedus' seats are not needed — whether *this* gedu is expected turns only
 * on their own assignment and the requests they appear in. The other party on
 * each request (the absent gedu on a substitution, the sub on an absence) is
 * mapped through as the document names them; the derivation reads the absent
 * gedu only to take them out of the seat, and they are never this gedu.
 */
export function staffingInputs(
  gedu: GeduInvoicingGedu,
  groupId: string,
): { gedus: StaffingAssignment[]; requests: SubstitutionRequestInput[] } {
  const self = { id: gedu.id, firstName: gedu.first_name };
  return {
    gedus: gedu.assignments
      .filter((seat) => seat.group_id === groupId)
      .map((seat) => ({ ...self, role: seat.role })),
    requests: [
      ...gedu.substitutions
        .filter((seat) => seat.group_id === groupId)
        .map((seat) => ({
          id: seat.request_id,
          sessionDate: seat.session_date,
          requestedBy: {
            id: seat.absent_gedu.id,
            firstName: seat.absent_gedu.first_name,
          },
          role: seat.role,
          status: "substituted" as const,
          substituteId: self,
        })),
      ...gedu.absences
        .filter((seat) => seat.group_id === groupId)
        .map((seat) => ({
          id: seat.request_id,
          sessionDate: seat.session_date,
          requestedBy: self,
          role: seat.role,
          status: seat.status,
          substituteId:
            seat.substitute === null
              ? null
              : { id: seat.substitute.id, firstName: seat.substitute.first_name },
        })),
    ],
  };
}

function groupLines(
  gedu: GeduInvoicingGedu,
  group: GeduInvoicingGroup,
  product: GeduInvoicingProduct,
  context: BuildContext,
): RoledLine[] {
  // The product's own today: every date compared against it is one of the
  // product's own local dates, so a UTC today would be off by one for hours of
  // every day.
  const today = productLocalDate(context.now, product.timezone);
  const inputs = staffingInputs(gedu, group.id);

  // A claim says a session was due: the product's projection, or a date on a
  // request the gedu is party to — booked in as a sub, or away on their own
  // absence. Both halves of one request claim its date, so the absent gedu's
  // page shows every date the sub's does: an absence the schedule no longer
  // projects still renders as an absent line, or a cancelled one where the date
  // was cancelled, exactly as the sub sees it. An absence can only ever produce
  // one of those two kinds — a live request takes its filer out of the seat.
  const claims = new Set(
    projectMonthDates(product, context.monthStart, context.monthEnd),
  );
  for (const seat of [...gedu.substitutions, ...gedu.absences]) {
    if (seat.group_id === group.id) claims.add(seat.session_date);
  }
  const records = new Set(group.sessions);
  const cancelled = new Set(group.cancelled_sessions);

  const lines: RoledLine[] = [];
  for (const date of new Set([...claims, ...records])) {
    const staffing = deriveSessionStaffing({
      gedus: inputs.gedus,
      requests: inputs.requests,
      sessionDate: date,
      viewerId: gedu.id,
    });
    const expected =
      staffing.expected.find((one) => one.id === gedu.id) ?? null;
    // The gedu's own live request on the date — an absence they filed.
    const absence = staffing.viewerRequest;
    // Neither expected nor absent: a sub-only group on a date they were not
    // booked for, which is somebody else's seat.
    const seat = expected ?? absence;
    if (seat === null) continue;
    // The role the seat is paid in: the assignment's, or the substitution's.
    // An absent seat keeps the role it was filed in, so it sits under the club
    // line it would have paid on.
    const role = seat.role;

    // Whom the gedu covered for on this date, where the seat is a substitution.
    const covering = gedu.substitutions.find(
      (sub) => sub.group_id === group.id && sub.session_date === date,
    );
    const coveringFor =
      covering === undefined ? null : person(covering.absent_gedu);

    const line = (
      kind: GeduInvoiceLineKind,
      substitute: GeduInvoicePerson | null = null,
    ): RoledLine => ({
      role,
      line: {
        date,
        isoWeek: isoWeekOf(date).week,
        kind,
        groupId: group.id,
        groupName: group.name,
        substitute,
        coveringFor,
      },
    });

    if (cancelled.has(date)) {
      // Only a claimed date carries a cancelled line; a cancellation over a
      // record nothing projects keeps it from paying and renders nothing.
      if (claims.has(date)) lines.push(line("cancelled"));
      continue;
    }
    if (expected === null) {
      // The absence the gedu filed, and its sub once it has one — an open
      // request names nobody, whatever rode along on the row.
      const filed = gedu.absences.find(
        (one) => absence !== null && one.request_id === absence.id,
      );
      lines.push(
        line(
          "absent",
          filed?.status === "substituted" && filed.substitute !== null
            ? person(filed.substitute)
            : null,
        ),
      );
      continue;
    }
    if (records.has(date)) {
      lines.push(line(recordHasHappened(date, today) ? "paid" : "upcoming"));
    } else {
      lines.push(line(unrecordedOrUpcoming(date, today)));
    }
  }
  return lines;
}

function buildClub(
  product: GeduInvoicingProduct,
  role: GeduAssignmentRole,
  lines: GeduInvoiceLine[],
  locale: SupportedLocale,
): GeduInvoiceClub {
  const sorted = [...lines].sort(
    (a, b) =>
      compareCalendarDates(a.date, b.date) ||
      a.groupName.localeCompare(b.groupName, locale) ||
      compareCodeUnits(a.groupId, b.groupId),
  );
  const feeCents =
    role === "primary"
      ? product.primary_gedu_fee_cents
      : product.assistant_gedu_fee_cents;
  const paidCount = sorted.filter((line) => line.kind === "paid").length;

  return {
    productId: product.id,
    productType: product.product_type,
    segment:
      product.product_type === "municipality_club" ? "municipality" : "consumer",
    name: resolveTranslation(product.product_translations, locale)?.name ?? "",
    role,
    locationName:
      product.location === null
        ? null
        : localizedLocationName(product.location, locale),
    municipalityName:
      product.municipality === null
        ? null
        : localizedLocationName(product.municipality, locale),
    feeCents,
    paidCount,
    unrecordedCount: sorted.filter((line) => line.kind === "unrecorded").length,
    // One multiplication in cents, through the same guard every sum goes
    // through, and no division anywhere.
    totalCents: feeCents === null ? null : sumCents([feeCents * paidCount]),
    lines: sorted,
  };
}

function feeTotals(clubs: readonly GeduInvoiceClub[]): number[] {
  return clubs.flatMap((club) =>
    club.totalCents === null ? [] : [club.totalCents],
  );
}

function person(row: {
  id: string;
  first_name: string;
  last_name: string;
}): GeduInvoicePerson {
  return { id: row.id, firstName: row.first_name, lastName: row.last_name };
}

/**
 * A gedu as a reader names them — both names, as the rest of staff copy does.
 * It lives with the build rather than with the page so the server-side exports
 * name people exactly as the page does.
 */
export function fullName(
  person: Pick<GeduInvoicePerson, "firstName" | "lastName">,
): string {
  return `${person.firstName} ${person.lastName}`;
}

/** A stable last tie-break that does not depend on the reader's locale. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function count<T>(items: readonly T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}

/**
 * A reference the document promises — every seat's group is in `groups`,
 * every group's product in `products`. A miss is a builder bug on the SQL side,
 * and it fails loudly rather than rendering a quietly short invoice.
 */
function required<T>(value: T | undefined, what: string, id: string): T {
  if (value === undefined) {
    throw new Error(`buildGeduInvoicing: document names no ${what} ${id}`);
  }
  return value;
}
