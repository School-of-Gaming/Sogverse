import type {
  BusinessEngagement,
  BusinessFigure,
  EngagementSlice,
  RevenueMonth,
  SignupConversion,
} from "@/services/admin-business/admin-business.build";

/**
 * The business page's arithmetic over figures already built: what the page
 * draws that the overview does not carry as a number of its own. Pure, so the
 * view only formats.
 */

/** How far a figure moved since last month ended. */
export function figureChange(figure: BusinessFigure): number {
  return figure.now - figure.endOfLastMonth;
}

/**
 * The share of a window's sign-ups who took a seat, or `null` when nobody
 * signed up in it: no sign-ups is not a rate of nought.
 */
export function signupRate(conversion: SignupConversion): number | null {
  return conversion.registered === 0 ? null : conversion.seated / conversion.registered;
}

/**
 * How many percentage points the sign-up rate moved, as whole points. `null`
 * when either end has no rate to compare.
 */
export function signupRateChangePoints(
  now: SignupConversion,
  endOfLastMonth: SignupConversion,
): number | null {
  const current = signupRate(now);
  const before = signupRate(endOfLastMonth);
  if (current === null || before === null) return null;
  return Math.round(current * 100) - Math.round(before * 100);
}

/** Each slice with its share of every family, in the order the build sent. */
export function engagementShares(
  engagement: BusinessEngagement,
): { slice: EngagementSlice; families: number; share: number }[] {
  return engagement.slices.map(({ slice, families }) => ({
    slice,
    families,
    share: engagement.totalFamilies === 0 ? 0 : families / engagement.totalFamilies,
  }));
}

/**
 * Whether any month has money that names no product. The band is drawn only
 * then: a legend entry for a band that is empty everywhere is noise.
 */
export function hasUnattributedRevenue(months: readonly RevenueMonth[]): boolean {
  return months.some((month) => (month.unattributedCents ?? 0) > 0);
}

/**
 * Where a monthly series' records begin, relative to the months the chart
 * shows: before the first of them (every month has data), at one of them (the
 * months before it are empty, not zero), or nowhere (no month has data).
 */
export type SeriesStart =
  | { kind: "covered" }
  | { kind: "from"; month: string }
  | { kind: "none" };

export function seriesStart(
  months: readonly string[],
  beginMonth: string | null,
): SeriesStart {
  if (beginMonth === null) return { kind: "none" };
  if (beginMonth <= months[0]) return { kind: "covered" };
  return { kind: "from", month: beginMonth };
}

