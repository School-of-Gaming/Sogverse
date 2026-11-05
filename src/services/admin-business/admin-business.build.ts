import { fromZonedTime } from "date-fns-tz";
import { endDateToCutoff } from "@/lib/session-occurrence";
import { sumCents } from "@/lib/money";
import { effectiveStatus } from "@/lib/products/effective-status";
import type {
  BillingMode,
  FamilySubscription,
  GeduGroupAssignment,
  GeduProfile,
  Participation,
  Payment,
  Product,
  ProductType,
} from "@/types";
import {
  helsinkiMonthOf,
  helsinkiMonthStart,
  recentHelsinkiMonths,
} from "./helsinki-month";

/**
 * The pure half of the business page: every figure, from the rows the service
 * reads. Nothing here reads anything or keeps a clock; `now` is handed in.
 *
 * The definitions are in this directory's `CLAUDE.md`; the comments here say
 * how each one is computed.
 */

/** How many Helsinki months the monthly charts cover, the current one included. */
export const BUSINESS_MONTH_COUNT = 12;

/** The days after an account's creation in which it counts as engaged. */
export const FIRST_WEEK_DAYS = 7;

/**
 * How far back the first-week cohort reaches: accounts created in the 30 days
 * before the last full week, so every one counted has had its whole week.
 */
export const FIRST_WEEK_COHORT_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * The `family_subscriptions` statuses that are a subscription Stripe is still
 * collecting. `cancelled` is over — Stripe stopped, whether or not the seat has
 * ended yet — and `incomplete` never took its first payment.
 */
export const LIVE_SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "past_due",
  "canceling",
];

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------

export type BusinessFamilyRow = { id: string; created_at: string };
/** A parent's link to one gamer, as it stands now. */
export type BusinessGamerLinkRow = { parent_id: string };
export type BusinessProductRow = Pick<
  Product,
  "id" | "product_type" | "billing_mode" | "start_date" | "end_date" | "timezone"
>;
export type BusinessSeatRow = Pick<
  Participation,
  | "id"
  | "customer_id"
  | "participant_id"
  | "product_id"
  | "group_id"
  | "group_joined_at"
  | "signed_up_at"
  | "ended_at"
>;
/**
 * A waitlist place held now: the family waiting, on any product, for any gamer,
 * and when it joined the line — `signed_up_at` is stamped when the row is
 * written and never moved, unlike the line position.
 */
export type BusinessWaitlistPlaceRow = Pick<Participation, "customer_id" | "signed_up_at">;
export type BusinessSubscriptionRow = Pick<
  FamilySubscription,
  "customer_id" | "participation_id" | "currency" | "status" | "created_at" | "ended_at"
>;
export type BusinessPriceRow = {
  product_id: string;
  currency: string;
  price_cents: number;
};
export type BusinessPaymentRow = Pick<
  Payment,
  "customer_id" | "amount_cents" | "currency" | "purpose" | "product_id" | "created_at"
>;

/** One month of the municipality invoicing page's own build. */
export interface MunicipalityMonthTotal {
  month: string;
  totalCents: number;
  clubsWithoutFee: number;
}

export type BusinessAssignmentRow = Pick<GeduGroupAssignment, "gedu_id" | "group_id" | "product_id">;
export type BusinessGeduProfileRow = Pick<GeduProfile, "user_id" | "certified">;

/**
 * A group session that ran, as the gedu invoicing page's own build reads it:
 * a stored session on a date that has arrived, not cancelled and not on a
 * holiday, with every gedu that build pays for it.
 */
export interface HeldSession {
  groupId: string;
  productId: string;
  /** The product-local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Never empty: a session nobody is paid for names no gedu and is not read. */
  geduIds: readonly string[];
}

/** One month of the gedu invoicing build: the sessions held in it. */
export interface GeduMonthSessions {
  month: string;
  sessions: readonly HeldSession[];
}

export interface BusinessFacts {
  /** Every parent account. */
  families: readonly BusinessFamilyRow[];
  /** Every parent–gamer link. */
  gamerLinks: readonly BusinessGamerLinkRow[];
  products: readonly BusinessProductRow[];
  /** Every seat held now or once — active and ended, never waitlisted. */
  seats: readonly BusinessSeatRow[];
  /** Every waitlist place held now; a place is not a seat, and keeps no history. */
  waitlistPlaces: readonly BusinessWaitlistPlaceRow[];
  subscriptions: readonly BusinessSubscriptionRow[];
  prices: readonly BusinessPriceRow[];
  /** Every payment ever recorded. */
  payments: readonly BusinessPaymentRow[];
  /** One per month of the window, from the municipality invoicing build. */
  municipalityMonths: readonly MunicipalityMonthTotal[];
  /** One per month of the window, from the gedu invoicing build. */
  geduMonths: readonly GeduMonthSessions[];
  /** Every gedu's group assignment, as it stands now. */
  assignments: readonly BusinessAssignmentRow[];
  /** Every gedu's profile, for whether they are certified. */
  geduProfiles: readonly BusinessGeduProfileRow[];
}

// ---------------------------------------------------------------------------
// What the page receives
// ---------------------------------------------------------------------------

/** A figure now, and the same figure as it stood when last month ended. */
export interface BusinessFigure {
  now: number;
  endOfLastMonth: number;
}

export interface FirstWeekEngagement {
  /** Parent accounts created in the cohort window. */
  signups: number;
  /** Of those, how many booked a seat or joined a waitlist within their first week. */
  engaged: number;
}

/** One complete month's revenue, every band summed, beside the month before's. */
export interface MonthRevenueTotal {
  /** The last complete Helsinki month, `YYYY-MM-01`. */
  month: string;
  /** In EUR cents; null when no payments were recorded yet that month. */
  totalCents: number | null;
  /** The total of the month before it, null on the same terms. */
  monthBeforeCents: number | null;
}

export interface BusinessHeadline {
  revenueLastMonth: MonthRevenueTotal;
  payingFamilies: BusinessFigure;
  /** In EUR cents. */
  monthlyRecurringRevenueCents: BusinessFigure;
  liveSubscriptions: BusinessFigure;
  /** Live subscriptions now that are not in the revenue figure: not EUR, or no price. */
  subscriptionsOutsideRevenue: number;
  gamersInSeat: BusinessFigure;
  gamersInMunicipalitySeat: BusinessFigure;
  /** The cohort measured now, and at the end of last month for the comparison. */
  firstWeekEngagement: { now: FirstWeekEngagement; endOfLastMonth: FirstWeekEngagement };
}

export type EngagementSlice =
  | "subscriber"
  | "paidBefore"
  | "municipalityOnly"
  | "freeOnly"
  | "waiting"
  | "neverEnrolled"
  | "noGamer";

/** The slices in the order they are decided: a family is in the first it matches. */
export const ENGAGEMENT_SLICES: readonly EngagementSlice[] = [
  "subscriber",
  "paidBefore",
  "municipalityOnly",
  "freeOnly",
  "waiting",
  "neverEnrolled",
  "noGamer",
];

export interface BusinessEngagement {
  /** Every slice, in `ENGAGEMENT_SLICES` order, zero included. */
  slices: readonly { slice: EngagementSlice; families: number }[];
  /** Every parent account — the slices' sum. */
  totalFamilies: number;
  /**
   * Subscribing families that are not paying families yet: they subscribe to a
   * club whose run has not begun, and hold no paid seat now.
   */
  subscribersNotYetBegun: number;
}

export interface RevenueMonth {
  /** `YYYY-MM-01`, a Helsinki month. */
  month: string;
  /**
   * EUR cents charged in the month, by what the payment paid for. Null before
   * `paymentsBeginMonth`: no payments were recorded then, which is not the same
   * as none being taken.
   */
  subscriptionCents: number | null;
  campsAndEventsCents: number | null;
  /** Charged money that names no product a seat is sold on. */
  unattributedCents: number | null;
  /** The municipality invoicing page's total for the month. */
  municipalityCents: number;
  /** Every band summed; null exactly when the payment bands are. */
  totalCents: number | null;
  /** Clubs that page leaves out of that total for having no fee. */
  municipalityClubsWithoutFee: number;
}

export interface BusinessRevenue {
  months: readonly RevenueMonth[];
  /** The Helsinki month of the first payment ever recorded, or null when there is none. */
  paymentsBeginMonth: string | null;
  /** Payments in the window charged in a currency other than EUR, left out of every band. */
  nonEurPayments: number;
}

export interface FamilyMonth {
  month: string;
  /**
   * Paying families at the month's last instant; for the month in progress,
   * now, so the last point is the headline figure.
   */
  payingFamilies: number;
  /** Parent accounts created. */
  signups: number;
  /** Families whose first seat ever began. */
  firstSeats: number;
  /** Families whose last live subscription ended, leaving them none. */
  stoppedPaying: number;
}

/**
 * Gamers in front of gedus: a sum of gamers over a sum of gedus, both summed
 * over the same groups — a month's sessions, or the groups running now.
 */
export interface GamersPerGedu {
  /** Gamers seated in each group, summed over the groups. */
  gamers: number;
  /** Gedus on each group, summed over the groups. */
  gedus: number;
  /** `gamers / gedus`, null when no gedu is counted. */
  ratio: number | null;
}

export interface GeduMonth {
  month: string;
  /** Sessions held. Null before `recordsBeginMonth`, as are the rest. */
  sessions: number | null;
  ratio: GamersPerGedu | null;
  /** Distinct gedus who ran any of the month's sessions. */
  gedusWhoRan: number | null;
}

export interface BusinessGedus {
  months: readonly GeduMonth[];
  /** The first month of the window in which any session was held, or null. */
  recordsBeginMonth: string | null;
  /** Certified gedus now, and how many of them are assigned to a product running now. */
  certified: { certified: number; onRunningProduct: number };
}

export interface BusinessOverview {
  /** The instant every figure was computed at, ISO. */
  readAt: string;
  /** The Helsinki month in progress — the last month of every series. */
  currentMonth: string;
  headline: BusinessHeadline;
  engagement: BusinessEngagement;
  revenue: BusinessRevenue;
  families: readonly FamilyMonth[];
  gedus: BusinessGedus;
}

// ---------------------------------------------------------------------------
// Seats as intervals
// ---------------------------------------------------------------------------

/**
 * When a seat was held: from the later of its sign-up and its product's first
 * day, until it ended or its product's run did, whichever came first — both
 * days in the product's zone. `end` is null for a seat still open-ended.
 * `signedUpAt` is the booking, kept apart for the figures that measure when a
 * family committed rather than when the seat was in use.
 */
export interface SeatSpan {
  seatId: string;
  customerId: string;
  participantId: string;
  /** The seat's group now, or the one it ended in; null for a seat in none. */
  groupId: string | null;
  /** When the seat entered that group; null exactly when `groupId` is. */
  groupJoinedAt: number | null;
  productType: ProductType;
  billingMode: BillingMode;
  signedUpAt: number;
  start: number;
  end: number | null;
}

/**
 * A seat that ended before its product began was never held, and has no span:
 * it is left out rather than kept empty.
 */
export function seatSpans(
  seats: readonly BusinessSeatRow[],
  products: readonly BusinessProductRow[],
): SeatSpan[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return seats.flatMap((seat) => {
    const product = byId.get(seat.product_id);
    if (product === undefined) {
      throw new Error(`Seat ${seat.id} names product ${seat.product_id}, which was not read`);
    }
    const signedUpAt = Date.parse(seat.signed_up_at);
    const runStart = fromZonedTime(`${product.start_date}T00:00:00`, product.timezone).getTime();
    const start = Math.max(signedUpAt, runStart);
    const ended = seat.ended_at === null ? null : Date.parse(seat.ended_at);
    const runEnd = endDateToCutoff(product.end_date, product.timezone);
    // The cutoff is the run's last millisecond; the span ends just after it.
    const runEndMs = runEnd === null ? null : runEnd.getTime() + 1;
    const candidates = [ended, runEndMs].filter((ms): ms is number => ms !== null);
    const end = candidates.length === 0 ? null : Math.min(...candidates);
    if (end !== null && end <= start) return [];
    return [
      {
        seatId: seat.id,
        customerId: seat.customer_id,
        participantId: seat.participant_id,
        groupId: seat.group_id,
        groupJoinedAt: seat.group_joined_at === null ? null : Date.parse(seat.group_joined_at),
        productType: product.product_type,
        billingMode: product.billing_mode,
        signedUpAt,
        start,
        end,
      },
    ];
  });
}

function heldAt(span: SeatSpan, at: number): boolean {
  return span.start <= at && (span.end === null || span.end > at);
}

function overlaps(span: SeatSpan, from: number, to: number): boolean {
  return span.start < to && (span.end === null || span.end > from);
}

/**
 * The stretches of time a set of spans covers, merged where they touch or
 * overlap, in order. An open-ended stretch has `end` null and is always last.
 */
export function mergeSpans(
  spans: readonly { start: number; end: number | null }[],
): { start: number; end: number | null }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number | null }[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && (last.end === null || span.start <= last.end)) {
      last.end =
        last.end === null || span.end === null ? null : Math.max(last.end, span.end);
    } else {
      merged.push({ start: span.start, end: span.end });
    }
  }
  return merged;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group === undefined) groups.set(k, [item]);
    else group.push(item);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

function payingFamilySet(spans: readonly SeatSpan[], at: number): Set<string> {
  return new Set(
    spans
      .filter((span) => span.billingMode === "paid" && heldAt(span, at))
      .map((span) => span.customerId),
  );
}

function payingFamiliesAt(spans: readonly SeatSpan[], at: number): number {
  return payingFamilySet(spans, at).size;
}

/** A seat the parent holds themselves is not a gamer's. */
function gamersAt(spans: readonly SeatSpan[], at: number, municipalityOnly: boolean): number {
  return new Set(
    spans
      .filter(
        (span) =>
          span.participantId !== span.customerId &&
          heldAt(span, at) &&
          (!municipalityOnly || span.productType === "municipality_club"),
      )
      .map((span) => span.participantId),
  ).size;
}

/**
 * When a subscription was live, or null for one never live. Only its end is
 * kept as a moment, so one stored as still collecting is taken to have been
 * collecting since it was created, and one that stopped without its seat
 * ending is taken never to have been.
 */
function subscriptionSpan(sub: BusinessSubscriptionRow): { start: number; end: number | null } | null {
  const start = Date.parse(sub.created_at);
  if (sub.ended_at !== null) return { start, end: Date.parse(sub.ended_at) };
  return LIVE_SUBSCRIPTION_STATUSES.includes(sub.status) ? { start, end: null } : null;
}

function subscriptionLiveAt(sub: BusinessSubscriptionRow, at: number): boolean {
  const span = subscriptionSpan(sub);
  return span !== null && span.start <= at && (span.end === null || span.end > at);
}

interface RecurringRevenue {
  cents: number;
  live: number;
  outside: number;
}

/**
 * Live subscriptions at `at`, priced at the monthly price their seat's product
 * carries today in the subscription's own currency. Only EUR is summed.
 */
function recurringRevenueAt(facts: BusinessFacts, at: number): RecurringRevenue {
  const seatProduct = new Map(facts.seats.map((seat) => [seat.id, seat.product_id]));
  const price = new Map(
    facts.prices.map((row) => [`${row.product_id}:${row.currency}`, row.price_cents]),
  );
  const live = facts.subscriptions.filter((sub) => subscriptionLiveAt(sub, at));
  const priced: number[] = [];
  let outside = 0;
  for (const sub of live) {
    const amount =
      sub.currency === "eur"
        ? price.get(`${seatProduct.get(sub.participation_id)}:eur`)
        : undefined;
    if (amount === undefined) outside++;
    else priced.push(amount);
  }
  return { cents: sumCents(priced), live: live.length, outside };
}

/**
 * The accounts created between 37 and 7 days before `at`, and how many of them
 * booked or joined a line within a week of being created. Every such week ends
 * by `at`, so nothing booked after the instant measured can count.
 */
function firstWeekEngagementAt(
  families: readonly BusinessFamilyRow[],
  firstCommitByFamily: ReadonlyMap<string, number>,
  at: number,
): FirstWeekEngagement {
  const week = FIRST_WEEK_DAYS * DAY_MS;
  const to = at - week;
  const from = to - FIRST_WEEK_COHORT_DAYS * DAY_MS;
  const cohort = families.filter((family) => {
    const created = Date.parse(family.created_at);
    return created > from && created <= to;
  });
  const engaged = cohort.filter((family) => {
    const first = firstCommitByFamily.get(family.id);
    return first !== undefined && first <= Date.parse(family.created_at) + week;
  });
  return { signups: cohort.length, engaged: engaged.length };
}

// ---------------------------------------------------------------------------
// Families by engagement
// ---------------------------------------------------------------------------

function engagementOf(
  facts: BusinessFacts,
  spans: readonly SeatSpan[],
  now: number,
): BusinessEngagement {
  const subscribers = new Set(
    facts.subscriptions
      .filter((sub) => subscriptionLiveAt(sub, now))
      .map((sub) => sub.customer_id),
  );
  const payers = new Set(
    facts.payments.filter((p) => p.amount_cents > 0).map((p) => p.customer_id),
  );
  const seatsByFamily = groupBy(spans, (span) => span.customerId);
  const withGamer = new Set(facts.gamerLinks.map((link) => link.parent_id));
  const waiting = new Set(facts.waitlistPlaces.map((place) => place.customer_id));
  const spanBySeat = new Map(spans.map((span) => [span.seatId, span]));
  const paying = payingFamilySet(spans, now);
  // A live subscription whose seat's club has not begun: its span starts later.
  const awaitingStart = new Set(
    facts.subscriptions
      .filter((sub) => {
        const span = spanBySeat.get(sub.participation_id);
        return subscriptionLiveAt(sub, now) && span !== undefined && span.start > now;
      })
      .map((sub) => sub.customer_id),
  );

  const counts = new Map<EngagementSlice, number>(
    ENGAGEMENT_SLICES.map((slice) => [slice, 0]),
  );
  for (const family of facts.families) {
    const seats = seatsByFamily.get(family.id) ?? [];
    const slice: EngagementSlice = subscribers.has(family.id)
      ? "subscriber"
      : payers.has(family.id)
        ? "paidBefore"
        : seats.length === 0
          ? waiting.has(family.id)
            ? "waiting"
            : withGamer.has(family.id)
              ? "neverEnrolled"
              : "noGamer"
          : seats.every((seat) => seat.productType === "municipality_club")
            ? "municipalityOnly"
            : "freeOnly";
    counts.set(slice, (counts.get(slice) ?? 0) + 1);
  }
  return {
    slices: ENGAGEMENT_SLICES.map((slice) => ({ slice, families: counts.get(slice) ?? 0 })),
    totalFamilies: facts.families.length,
    subscribersNotYetBegun: [...subscribers].filter(
      (id) => !paying.has(id) && awaitingStart.has(id),
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Revenue by month
// ---------------------------------------------------------------------------

type RevenueBand = "subscription" | "campsAndEvents" | "unattributed";

function bandOf(productType: ProductType | undefined): RevenueBand {
  switch (productType) {
    case "consumer_club":
      return "subscription";
    case "camp":
    case "event":
      return "campsAndEvents";
    default:
      return "unattributed";
  }
}

function revenueOf(
  facts: BusinessFacts,
  months: readonly string[],
): BusinessRevenue {
  const productType = new Map(facts.products.map((p) => [p.id, p.product_type]));
  const municipality = new Map(facts.municipalityMonths.map((m) => [m.month, m]));

  // A duplicate charge is refunded by hand; it never bought anything.
  const charged = facts.payments.filter((p) => p.purpose !== "reservation_duplicate");
  const firstPayment = facts.payments.reduce<number | null>((first, p) => {
    const at = Date.parse(p.created_at);
    return first === null || at < first ? at : first;
  }, null);
  const paymentsBeginMonth =
    firstPayment === null ? null : helsinkiMonthOf(new Date(firstPayment));

  const buckets: Record<RevenueBand, number[]>[] = months.map(() => ({
    subscription: [],
    campsAndEvents: [],
    unattributed: [],
  }));
  let nonEurPayments = 0;
  for (const payment of charged) {
    const index = months.indexOf(helsinkiMonthOf(new Date(payment.created_at)));
    if (index < 0) continue;
    const bucket = buckets[index];
    if (payment.currency !== "eur") {
      nonEurPayments++;
      continue;
    }
    const type = payment.product_id === null ? undefined : productType.get(payment.product_id);
    bucket[bandOf(type)].push(payment.amount_cents);
  }

  return {
    months: months.map((month, index) => {
      const muni = municipality.get(month);
      if (muni === undefined) {
        throw new Error(`No municipality invoicing total for ${month}`);
      }
      const bucket = buckets[index];
      const recorded = paymentsBeginMonth !== null && month >= paymentsBeginMonth;
      const subscriptionCents = sumCents(bucket.subscription);
      const campsAndEventsCents = sumCents(bucket.campsAndEvents);
      const unattributedCents = sumCents(bucket.unattributed);
      return {
        month,
        subscriptionCents: recorded ? subscriptionCents : null,
        campsAndEventsCents: recorded ? campsAndEventsCents : null,
        unattributedCents: recorded ? unattributedCents : null,
        municipalityCents: muni.totalCents,
        totalCents: recorded
          ? sumCents([subscriptionCents, campsAndEventsCents, unattributedCents, muni.totalCents])
          : null,
        municipalityClubsWithoutFee: muni.clubsWithoutFee,
      };
    }),
    paymentsBeginMonth,
    nonEurPayments,
  };
}

// ---------------------------------------------------------------------------
// Families by month
// ---------------------------------------------------------------------------

function countByMonth(instants: readonly number[], months: readonly string[]): Map<string, number> {
  const counts = new Map(months.map((month) => [month, 0]));
  for (const at of instants) {
    const month = helsinkiMonthOf(new Date(at));
    const current = counts.get(month);
    if (current !== undefined) counts.set(month, current + 1);
  }
  return counts;
}

function familiesByMonth(
  facts: BusinessFacts,
  spans: readonly SeatSpan[],
  firstSeatByFamily: ReadonlyMap<string, number>,
  months: readonly string[],
  now: number,
): FamilyMonth[] {
  const signups = countByMonth(
    facts.families.map((family) => Date.parse(family.created_at)),
    months,
  );
  const firstSeats = countByMonth([...firstSeatByFamily.values()], months);

  // Each time a family's live subscriptions, merged, run out is one stop: a
  // family that subscribed again and left again stopped twice. A stretch still
  // going has not. Camps and events are never subscriptions, so never a stop.
  const subscriptionsByFamily = groupBy(facts.subscriptions, (sub) => sub.customer_id);
  const stops = [...subscriptionsByFamily.values()].flatMap((familySubs) =>
    mergeSpans(
      familySubs.flatMap((sub) => {
        const span = subscriptionSpan(sub);
        return span === null ? [] : [span];
      }),
    ).flatMap((stretch) =>
      stretch.end !== null && stretch.end <= now ? [stretch.end] : [],
    ),
  );
  const stopped = countByMonth(stops, months);

  return months.map((month, index) => {
    // The month's last instant, or now for the month in progress, the last.
    const at =
      index === months.length - 1 ? now : helsinkiMonthStart(months[index + 1]).getTime() - 1;
    return {
      month,
      payingFamilies: payingFamiliesAt(spans, at),
      signups: signups.get(month) ?? 0,
      firstSeats: firstSeats.get(month) ?? 0,
      stoppedPaying: stopped.get(month) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Gamers per gedu
// ---------------------------------------------------------------------------

function ratioOf(gamers: number, gedus: number): GamersPerGedu {
  return { gamers, gedus, ratio: gedus === 0 ? null : gamers / gedus };
}

/** The calendar day after a `YYYY-MM-DD` date, by UTC-pinned arithmetic. */
function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * The gamers seated in a group on a session's date: a gamer's seat in that
 * group held at any moment of the product-local day. A seat is in its group
 * from when it joined it, and a move between groups keeps only the latest, so
 * a gamer who moved counts in their present group from the day they moved and
 * in their earlier one not at all.
 */
function gamersAtSession(
  session: HeldSession,
  spansByGroup: ReadonlyMap<string, readonly SeatSpan[]>,
  products: ReadonlyMap<string, BusinessProductRow>,
): number {
  const product = products.get(session.productId);
  if (product === undefined) {
    throw new Error(`A session of group ${session.groupId} names product ${session.productId}, which was not read`);
  }
  const from = fromZonedTime(`${session.date}T00:00:00`, product.timezone).getTime();
  const to = fromZonedTime(`${nextDate(session.date)}T00:00:00`, product.timezone).getTime();
  const seated = (spansByGroup.get(session.groupId) ?? []).filter(
    (span) =>
      span.participantId !== span.customerId &&
      span.groupJoinedAt !== null &&
      span.groupJoinedAt < to &&
      overlaps(span, from, to),
  );
  return new Set(seated.map((span) => span.participantId)).size;
}

function gedusOf(
  facts: BusinessFacts,
  spans: readonly SeatSpan[],
  months: readonly string[],
  now: Date,
): BusinessGedus {
  const products = new Map(facts.products.map((product) => [product.id, product]));
  const spansByGroup = new Map<string, SeatSpan[]>();
  for (const span of spans) {
    if (span.groupId === null) continue;
    const group = spansByGroup.get(span.groupId);
    if (group === undefined) spansByGroup.set(span.groupId, [span]);
    else group.push(span);
  }
  const sessionsByMonth = new Map(facts.geduMonths.map((m) => [m.month, m.sessions]));
  const recordsBeginMonth =
    months.find((month) => (sessionsByMonth.get(month)?.length ?? 0) > 0) ?? null;

  // Running by the app's own derived status: a product not yet begun has
  // nobody in front of a gedu, and a finished one no longer does.
  const running = new Set(
    facts.products
      .filter((product) => effectiveStatus(product, now) === "running")
      .map((product) => product.id),
  );
  const onRunning = new Set(
    facts.assignments.filter((row) => running.has(row.product_id)).map((row) => row.gedu_id),
  );
  const certified = facts.geduProfiles.filter((profile) => profile.certified);

  return {
    months: months.map((month) => {
      const sessions = sessionsByMonth.get(month);
      if (sessions === undefined) throw new Error(`No gedu invoicing month for ${month}`);
      if (recordsBeginMonth === null || month < recordsBeginMonth) {
        return { month, sessions: null, ratio: null, gedusWhoRan: null };
      }
      let gamers = 0;
      let gedus = 0;
      for (const session of sessions) {
        gamers += gamersAtSession(session, spansByGroup, products);
        gedus += session.geduIds.length;
      }
      return {
        month,
        sessions: sessions.length,
        ratio: ratioOf(gamers, gedus),
        gedusWhoRan: new Set(sessions.flatMap((session) => session.geduIds)).size,
      };
    }),
    recordsBeginMonth,
    certified: {
      certified: certified.length,
      onRunningProduct: certified.filter((profile) => onRunning.has(profile.user_id)).length,
    },
  };
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export function buildBusinessOverview(facts: BusinessFacts, now: Date): BusinessOverview {
  const nowMs = now.getTime();
  const months = recentHelsinkiMonths(now, BUSINESS_MONTH_COUNT);
  const currentMonth = helsinkiMonthOf(now);
  // The last instant of last month: a seat or subscription that ended at the
  // stroke of midnight was not held then.
  const lastMonthEnd = helsinkiMonthStart(currentMonth).getTime() - 1;

  const spans = seatSpans(facts.seats, facts.products);
  // A family's first seat is dated by its booking, not by when the product
  // began: it measures when the family committed.
  const firstSeatByFamily = new Map<string, number>();
  for (const span of spans) {
    const first = firstSeatByFamily.get(span.customerId);
    if (first === undefined || span.signedUpAt < first) {
      firstSeatByFamily.set(span.customerId, span.signedUpAt);
    }
  }

  // A family's first booking or line joined, by when it was made. Every seat
  // row counts, one with no span included: booking it was the commitment.
  const firstCommitByFamily = new Map<string, number>();
  for (const row of [...facts.seats, ...facts.waitlistPlaces]) {
    const at = Date.parse(row.signed_up_at);
    const first = firstCommitByFamily.get(row.customer_id);
    if (first === undefined || at < first) firstCommitByFamily.set(row.customer_id, at);
  }

  const revenue = revenueOf(facts, months);
  // The window ends with the month in progress, so the last complete month is
  // the one before it.
  const lastComplete = revenue.months.at(-2);
  const monthBefore = revenue.months.at(-3);
  if (lastComplete === undefined || monthBefore === undefined) {
    throw new Error(`A window of ${BUSINESS_MONTH_COUNT} months holds no two complete months`);
  }

  const mrrNow = recurringRevenueAt(facts, nowMs);
  const mrrThen = recurringRevenueAt(facts, lastMonthEnd);

  return {
    readAt: now.toISOString(),
    currentMonth,
    headline: {
      revenueLastMonth: {
        month: lastComplete.month,
        totalCents: lastComplete.totalCents,
        monthBeforeCents: monthBefore.totalCents,
      },
      payingFamilies: {
        now: payingFamiliesAt(spans, nowMs),
        endOfLastMonth: payingFamiliesAt(spans, lastMonthEnd),
      },
      monthlyRecurringRevenueCents: { now: mrrNow.cents, endOfLastMonth: mrrThen.cents },
      liveSubscriptions: { now: mrrNow.live, endOfLastMonth: mrrThen.live },
      subscriptionsOutsideRevenue: mrrNow.outside,
      gamersInSeat: {
        now: gamersAt(spans, nowMs, false),
        endOfLastMonth: gamersAt(spans, lastMonthEnd, false),
      },
      gamersInMunicipalitySeat: {
        now: gamersAt(spans, nowMs, true),
        endOfLastMonth: gamersAt(spans, lastMonthEnd, true),
      },
      firstWeekEngagement: {
        now: firstWeekEngagementAt(facts.families, firstCommitByFamily, nowMs),
        endOfLastMonth: firstWeekEngagementAt(facts.families, firstCommitByFamily, lastMonthEnd),
      },
    },
    engagement: engagementOf(facts, spans, nowMs),
    revenue,
    families: familiesByMonth(facts, spans, firstSeatByFamily, months, nowMs),
    gedus: gedusOf(facts, spans, months, now),
  };
}
