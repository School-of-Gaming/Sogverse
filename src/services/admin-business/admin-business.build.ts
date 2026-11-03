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

/** The window the sign-up → first seat figure looks back over. */
export const SIGNUP_WINDOW_DAYS = 90;

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
  products: readonly BusinessProductRow[];
  /** Every seat held now or once — active and ended, never waitlisted. */
  seats: readonly BusinessSeatRow[];
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

export interface SignupConversion {
  /** Parent accounts created in the window. */
  registered: number;
  /** Of those, how many have taken a seat. */
  seated: number;
}

export interface BusinessHeadline {
  payingFamilies: BusinessFigure;
  /** In EUR cents. */
  monthlyRecurringRevenueCents: BusinessFigure;
  liveSubscriptions: BusinessFigure;
  /** Live subscriptions now that are not in the revenue figure: not EUR, or no price. */
  subscriptionsOutsideRevenue: number;
  gamersInSeat: BusinessFigure;
  gamersInMunicipalitySeat: BusinessFigure;
  /** The window ends now, and at the end of last month for the comparison. */
  signupToSeat: { now: SignupConversion; endOfLastMonth: SignupConversion; windowDays: number };
}

export type EngagementSlice =
  | "subscriber"
  | "paidBefore"
  | "municipalityOnly"
  | "freeOnly"
  | "neverEnrolled";

/** The slices in the order they are decided: a family is in the first it matches. */
export const ENGAGEMENT_SLICES: readonly EngagementSlice[] = [
  "subscriber",
  "paidBefore",
  "municipalityOnly",
  "freeOnly",
  "neverEnrolled",
];

export interface BusinessEngagement {
  /** Every slice, in `ENGAGEMENT_SLICES` order, zero included. */
  slices: readonly { slice: EngagementSlice; families: number }[];
  /** Every parent account — the slices' sum. */
  totalFamilies: number;
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
  /** Sessions held. Null before `recordsBeginMonth`, as is `ratio`. */
  sessions: number | null;
  ratio: GamersPerGedu | null;
}

export interface BusinessGedus {
  months: readonly GeduMonth[];
  /** The first month of the window in which any session was held, or null. */
  recordsBeginMonth: string | null;
  /** Over the groups of products running now that have a gedu assigned. */
  now: GamersPerGedu;
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

function payingFamiliesAt(spans: readonly SeatSpan[], at: number): number {
  return new Set(
    spans
      .filter((span) => span.billingMode === "paid" && heldAt(span, at))
      .map((span) => span.customerId),
  ).size;
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

function signupConversionAt(
  families: readonly BusinessFamilyRow[],
  firstSeatByFamily: ReadonlyMap<string, number>,
  at: number,
): SignupConversion {
  const from = at - SIGNUP_WINDOW_DAYS * DAY_MS;
  const registered = families.filter((family) => {
    const created = Date.parse(family.created_at);
    return created > from && created <= at;
  });
  const seated = registered.filter((family) => {
    const first = firstSeatByFamily.get(family.id);
    return first !== undefined && first <= at;
  });
  return { registered: registered.length, seated: seated.length };
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
          ? "neverEnrolled"
          : seats.every((seat) => seat.productType === "municipality_club")
            ? "municipalityOnly"
            : "freeOnly";
    counts.set(slice, (counts.get(slice) ?? 0) + 1);
  }
  return {
    slices: ENGAGEMENT_SLICES.map((slice) => ({ slice, families: counts.get(slice) ?? 0 })),
    totalFamilies: facts.families.length,
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
      return {
        month,
        subscriptionCents: recorded ? sumCents(bucket.subscription) : null,
        campsAndEventsCents: recorded ? sumCents(bucket.campsAndEvents) : null,
        unattributedCents: recorded ? sumCents(bucket.unattributed) : null,
        municipalityCents: muni.totalCents,
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

  return months.map((month) => ({
    month,
    signups: signups.get(month) ?? 0,
    firstSeats: firstSeats.get(month) ?? 0,
    stoppedPaying: stopped.get(month) ?? 0,
  }));
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

/**
 * The groups of products running now that have a gedu assigned: their gamers
 * seated now over their assignments. A group nobody is assigned to is left
 * out, as a session no gedu is paid for is left out of the months.
 */
function gamersPerGeduNow(
  facts: BusinessFacts,
  spansByGroup: ReadonlyMap<string, readonly SeatSpan[]>,
  running: ReadonlySet<string>,
  now: number,
): GamersPerGedu {
  const assignedByGroup = groupBy(
    facts.assignments.filter((row) => running.has(row.product_id)),
    (row) => row.group_id,
  );
  let gamers = 0;
  let gedus = 0;
  for (const [groupId, assigned] of assignedByGroup) {
    gedus += assigned.length;
    gamers += new Set(
      (spansByGroup.get(groupId) ?? [])
        .filter((span) => span.participantId !== span.customerId && heldAt(span, now))
        .map((span) => span.participantId),
    ).size;
  }
  return ratioOf(gamers, gedus);
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
        return { month, sessions: null, ratio: null };
      }
      let gamers = 0;
      let gedus = 0;
      for (const session of sessions) {
        gamers += gamersAtSession(session, spansByGroup, products);
        gedus += session.geduIds.length;
      }
      return { month, sessions: sessions.length, ratio: ratioOf(gamers, gedus) };
    }),
    recordsBeginMonth,
    now: gamersPerGeduNow(facts, spansByGroup, running, now.getTime()),
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

  const mrrNow = recurringRevenueAt(facts, nowMs);
  const mrrThen = recurringRevenueAt(facts, lastMonthEnd);

  return {
    readAt: now.toISOString(),
    currentMonth,
    headline: {
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
      signupToSeat: {
        now: signupConversionAt(facts.families, firstSeatByFamily, nowMs),
        endOfLastMonth: signupConversionAt(facts.families, firstSeatByFamily, lastMonthEnd),
        windowDays: SIGNUP_WINDOW_DAYS,
      },
    },
    engagement: engagementOf(facts, spans, nowMs),
    revenue: revenueOf(facts, months),
    families: familiesByMonth(facts, firstSeatByFamily, months, nowMs),
    gedus: gedusOf(facts, spans, months, now),
  };
}
