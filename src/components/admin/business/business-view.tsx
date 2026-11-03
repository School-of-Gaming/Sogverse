"use client";

import { useId, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartColor,
  type ChartConfig,
} from "@/components/ui/chart";
import { formattingLocale } from "@/lib/constants/locales";
import { formatDate, formatDateOnly } from "@/lib/date-format";
import { formatCurrencyFromCents } from "@/lib/money";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { useTimezone } from "@/providers";
import type {
  BusinessOverview,
  EngagementSlice,
} from "@/services/admin-business/admin-business.build";
import {
  engagementShares,
  figureChange,
  hasUnattributedRevenue,
  seriesStart,
  signupRate,
  signupRateChangePoints,
  type SeriesStart,
} from "./business-figures";

/**
 * **The business page's presentational half**: leadership's monthly read on
 * how School of Gaming is doing. Everything here takes the overview already
 * built on the server; nothing reads anything.
 *
 * **A month before a series' records begin is drawn as nothing, never as
 * zero**, and a note under the chart says where the records begin: "nothing
 * was recorded" and "nothing happened" must not look alike.
 *
 * **The colours name what is counted.** Money and families are told apart by
 * the product kind they come from, in the kind's own Yty family as the admin
 * surfaces already spend it — consumer clubs in Glow, camps and events in
 * Valor, municipality clubs in Wit — so a subscription is the same green on the
 * donut and in the revenue bars. What belongs to no kind takes the inks. The
 * three per-month series of families take act for the figure the business
 * works for, a seat taken, beside the ink and the destructive status for a
 * family that stopped paying.
 */

/** Each chart's height: fixed, so the box is held while it measures. */
const CHART_HEIGHT = "h-64";

/** A monthly chart grows to fill its card when the card beside it is taller. */
const MONTHLY_CHART_SIZE = "min-h-64 w-full flex-1";

/** The gap between a donut's slices: the card's own ground, so each slice stands apart. */
const SLICE_EDGE = "var(--color-card)";

/** The one stack the revenue bands share, so each month is one bar. */
const REVENUE_STACK = "revenue";

/** The Gedu ratio line's colour: the one its series is configured with below. */
const RATIO_STROKE = "var(--series-seatsPerTeachingGedu)";

/** A count in the reader's locale. */
function useCount(): (value: number) => string {
  const format = new Intl.NumberFormat(formattingLocale(useLocale()));
  return (value) => format.format(value);
}

/** A change with its sign, "+3" or "−2"; zero is the caller's to word. */
function useSignedCount(): (value: number) => string {
  const format = new Intl.NumberFormat(formattingLocale(useLocale()), { signDisplay: "exceptZero" });
  return (value) => format.format(value);
}

/** EUR cents as money in the reader's locale. */
function useEuros(): (cents: number) => string {
  const locale = useLocale();
  return (cents) => formatCurrencyFromCents(cents, "eur", locale);
}

/**
 * A month as the axis and the tooltip name it. The axis gives the first month
 * and January their year, so a window crossing New Year says which year each
 * side is in; the tooltip always does.
 */
function useMonthName(): {
  tick: (month: string, index: number) => string;
  full: (month: string) => string;
} {
  const locale = useLocale();
  return {
    tick: (month, index) =>
      formatDateOnly(
        month,
        locale,
        index === 0 || month.slice(5, 7) === "01"
          ? { month: "short", year: "numeric" }
          : { month: "short" },
      ),
    full: (month) => formatDateOnly(month, locale, { month: "long", year: "numeric" }),
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function BusinessOverviewView({ overview }: { overview: BusinessOverview }) {
  return (
    <div className="space-y-6">
      <ReadAt readAt={overview.readAt} />
      <HeadlineTiles overview={overview} />
      <div className="grid gap-6 xl:grid-cols-3">
        <EngagementCard overview={overview} />
        <div className="xl:col-span-2">
          <RevenueCard overview={overview} />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <FamiliesCard overview={overview} />
        <GedusCard overview={overview} />
      </div>
    </div>
  );
}

/** When the figures were computed, in the reader's zone. */
function ReadAt({ readAt }: { readAt: string }) {
  const t = useTranslations("admin.business");
  const locale = useLocale();
  const timeZone = useTimezone();
  const time = formatDate(readAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  return <p className="text-xs text-muted-foreground">{t("readAt", { time })}</p>;
}

/** A section's card: its heading, what its figures are, the figures, and its notes. */
function BusinessCard({
  heading,
  caption,
  notes,
  children,
}: {
  heading: string;
  caption: string;
  notes?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Fills its grid row, so cards side by side end level; a monthly chart takes the slack.
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="space-y-1">
        <Heading level={2} step="card-title">{heading}</Heading>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      {children}
      {notes}
    </Card>
  );
}

/** The quiet lines under a chart: where its records begin, what it leaves out. */
function Notes({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1 border-t border-border pt-3">
      {lines.map((line) => (
        <p key={line} className="text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Headline tiles
// ---------------------------------------------------------------------------

function HeadlineTiles({ overview }: { overview: BusinessOverview }) {
  const t = useTranslations("admin.business.tiles");
  const count = useCount();
  const euros = useEuros();
  const { headline } = overview;
  const percent = new Intl.NumberFormat(formattingLocale(useLocale()), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const rate = signupRate(headline.signupToSeat.now);
  const ratePoints = signupRateChangePoints(
    headline.signupToSeat.now,
    headline.signupToSeat.endOfLastMonth,
  );

  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label={t("payingFamilies.label")}
        value={count(headline.payingFamilies.now)}
        change={<CountChange change={figureChange(headline.payingFamilies)} />}
      />
      <Tile
        label={t("revenue.label")}
        value={euros(headline.monthlyRecurringRevenueCents.now)}
        detail={t("revenue.subscriptions", { count: headline.liveSubscriptions.now })}
        change={<MoneyChange cents={figureChange(headline.monthlyRecurringRevenueCents)} />}
        note={
          headline.subscriptionsOutsideRevenue > 0
            ? t("revenue.outside", { count: headline.subscriptionsOutsideRevenue })
            : undefined
        }
      />
      <Tile
        label={t("gamers.label")}
        value={count(headline.gamersInSeat.now)}
        detail={t("gamers.municipality", { count: headline.gamersInMunicipalitySeat.now })}
        change={<CountChange change={figureChange(headline.gamersInSeat)} />}
      />
      <Tile
        label={t("signup.label")}
        value={rate === null ? null : percent.format(rate)}
        detail={
          rate === null
            ? t("signup.none", { days: headline.signupToSeat.windowDays })
            : t("signup.detail", {
                seated: headline.signupToSeat.now.seated,
                registered: headline.signupToSeat.now.registered,
                days: headline.signupToSeat.windowDays,
              })
        }
        change={ratePoints === null ? undefined : <PointsChange points={ratePoints} />}
      />
    </dl>
  );
}

function Tile({
  label,
  value,
  detail,
  change,
  note,
}: {
  label: string;
  /** Null where there is no figure to show; the detail line says why. */
  value: string | null;
  detail?: string;
  change?: ReactNode;
  note?: string;
}) {
  return (
    <Card className="space-y-1 p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        {value !== null && (
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
        )}
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {change && <p className="text-xs text-muted-foreground">{change}</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </dd>
    </Card>
  );
}

function CountChange({ change }: { change: number }) {
  const t = useTranslations("admin.business");
  const signed = useSignedCount();
  return <>{change === 0 ? t("noChange") : t("change", { change: signed(change) })}</>;
}

function MoneyChange({ cents }: { cents: number }) {
  const t = useTranslations("admin.business");
  const format = new Intl.NumberFormat(formattingLocale(useLocale()), {
    style: "currency",
    currency: "EUR",
    signDisplay: "exceptZero",
  });
  return <>{cents === 0 ? t("noChange") : t("change", { change: format.format(cents / 100) })}</>;
}

function PointsChange({ points }: { points: number }) {
  const t = useTranslations("admin.business");
  const signed = useSignedCount();
  return (
    <>{points === 0 ? t("noChange") : t("tiles.signup.change", { change: signed(points) })}</>
  );
}

// ---------------------------------------------------------------------------
// Families by engagement
// ---------------------------------------------------------------------------

/** Each slice's colour, as the chart fills it and as its key's swatch. */
const SLICE_COLOUR: Record<EngagementSlice, { color: ChartColor; swatch: string }> = {
  subscriber: { color: "var(--color-yty-glow)", swatch: "bg-yty-glow" },
  paidBefore: { color: "var(--color-yty-valor)", swatch: "bg-yty-valor" },
  municipalityOnly: { color: "var(--color-yty-wit)", swatch: "bg-yty-wit" },
  freeOnly: { color: "var(--color-foreground)", swatch: "bg-foreground" },
  neverEnrolled: { color: "var(--color-muted-foreground)", swatch: "bg-muted-foreground" },
};

function EngagementCard({ overview }: { overview: BusinessOverview }) {
  const t = useTranslations("admin.business.engagement");
  const count = useCount();
  const percent = new Intl.NumberFormat(formattingLocale(useLocale()), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const rows = engagementShares(overview.engagement);
  const config = Object.fromEntries(
    rows.map(({ slice }) => [slice, { label: t(`slices.${slice}`), color: SLICE_COLOUR[slice].color }]),
  ) satisfies ChartConfig;
  const data = rows.map((row) => ({ ...row, fill: `var(--series-${row.slice})` }));
  const describedBy = useId();

  return (
    <BusinessCard heading={t("heading")} caption={t("caption")}>
      <div className="relative">
        <ChartContainer config={config} className={`${CHART_HEIGHT} w-full`}>
          <PieChart aria-label={t("chart")} aria-describedby={describedBy}>
            <Pie
              data={data}
              dataKey="families"
              nameKey="slice"
              innerRadius="62%"
              outerRadius="92%"
              stroke={SLICE_EDGE}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {count(overview.engagement.totalFamilies)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("total", { count: overview.engagement.totalFamilies })}
          </span>
        </div>
      </div>
      <ul id={describedBy} className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.slice} className="flex items-center gap-3 py-1.5 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${SLICE_COLOUR[row.slice].swatch}`} />
            <span className="min-w-0 flex-1">{t(`slices.${row.slice}`)}</span>
            <span className="tabular-nums">{count(row.families)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {percent.format(row.share)}
            </span>
          </li>
        ))}
      </ul>
    </BusinessCard>
  );
}

// ---------------------------------------------------------------------------
// The monthly charts
// ---------------------------------------------------------------------------

/**
 * The month axis, with the month in progress marked "so far" under its name:
 * its figures are partial, and a short last bar must not read as a bad month.
 */
function useMonthTick(currentMonth: string): (props: XAxisTickContentProps) => ReactNode {
  const t = useTranslations("admin.business");
  const { tick } = useMonthName();
  return function renderTick({ x, y, payload }: XAxisTickContentProps) {
    const month = String(payload.value);
    return (
      <text x={x} y={y} textAnchor="middle" className="fill-muted-foreground text-xs">
        <tspan x={x} dy={12}>
          {tick(month, payload.index)}
        </tspan>
        {month === currentMonth && (
          <tspan x={x} dy={14}>
            {t("soFar")}
          </tspan>
        )}
      </text>
    );
  };
}

/** The tooltip's heading: the month in full, and "so far" for the month in progress. */
function useMonthLabel(currentMonth: string) {
  const t = useTranslations("admin.business");
  const { full } = useMonthName();
  return (_: unknown, payload: readonly { payload?: unknown }[]) => {
    const row = payload[0]?.payload;
    if (typeof row !== "object" || row === null || !("month" in row) || typeof row.month !== "string") {
      return null;
    }
    return row.month === currentMonth
      ? t("monthSoFar", { month: full(row.month) })
      : full(row.month);
  };
}

/** One series' line in a tooltip: its name and its value, or that it has none. */
function TooltipRow({ label, value }: { label: ReactNode; value: string }) {
  return (
    <p className="flex w-full justify-between gap-4 tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </p>
  );
}

/** Where a series' records begin, as a note, or nothing when every month has them. */
function useStartNote(): (
  start: SeriesStart,
  from: (month: string) => string,
  none: string,
) => string[] {
  const { full } = useMonthName();
  return (start, from, none) => {
    if (start.kind === "covered") return [];
    if (start.kind === "none") return [none];
    return [from(full(start.month))];
  };
}

const REVENUE_SERIES = [
  "subscriptionCents",
  "campsAndEventsCents",
  "municipalityCents",
  "unattributedCents",
] as const;
type RevenueSeries = (typeof REVENUE_SERIES)[number];

const REVENUE_COLOUR: Record<RevenueSeries, ChartColor> = {
  subscriptionCents: "var(--color-yty-glow)",
  campsAndEventsCents: "var(--color-yty-valor)",
  municipalityCents: "var(--color-yty-wit)",
  unattributedCents: "var(--color-muted-foreground)",
};

function isRevenueSeries(name: unknown): name is RevenueSeries {
  return REVENUE_SERIES.some((series) => series === name);
}

function RevenueCard({ overview }: { overview: BusinessOverview }) {
  const t = useTranslations("admin.business.revenue");
  const euros = useEuros();
  const { full } = useMonthName();
  const monthTick = useMonthTick(overview.currentMonth);
  const monthLabel = useMonthLabel(overview.currentMonth);
  const startNote = useStartNote();
  const describedBy = useId();
  const compact = new Intl.NumberFormat(formattingLocale(useLocale()), {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const { months, paymentsBeginMonth, nonEurPayments } = overview.revenue;
  const series = REVENUE_SERIES.filter(
    (key) => key !== "unattributedCents" || hasUnattributedRevenue(months),
  );
  const config = Object.fromEntries(
    series.map((key) => [key, { label: t(`series.${key}`), color: REVENUE_COLOUR[key] }]),
  ) satisfies ChartConfig;

  const notes = [
    ...startNote(
      seriesStart(months.map((month) => month.month), paymentsBeginMonth),
      (month) => t("startsFrom", { month }),
      t("none"),
    ),
    ...(nonEurPayments > 0 ? [t("nonEur", { count: nonEurPayments })] : []),
  ];

  const amount = (cents: number | null) => (cents === null ? t("noData") : euros(cents));

  return (
    <BusinessCard heading={t("heading")} caption={t("caption")} notes={<Notes lines={notes} />}>
      <ChartContainer config={config} className={MONTHLY_CHART_SIZE}>
        <BarChart
          data={[...months]}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          aria-label={t("chart")}
          aria-describedby={describedBy}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tick={monthTick} interval={0} height={40} tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={(cents: number) => compact.format(cents / 100)}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={monthLabel}
                formatter={(value, name, item) => {
                  if (!isRevenueSeries(name)) return null;
                  const row: unknown = item.payload;
                  const clubs =
                    name === "municipalityCents" &&
                    typeof row === "object" &&
                    row !== null &&
                    "municipalityClubsWithoutFee" in row &&
                    typeof row.municipalityClubsWithoutFee === "number"
                      ? row.municipalityClubsWithoutFee
                      : 0;
                  return (
                    <div className="w-full">
                      <TooltipRow
                        label={t(`series.${name}`)}
                        value={amount(typeof value === "number" ? value : null)}
                      />
                      {clubs > 0 && (
                        <p className="text-muted-foreground">{t("clubsWithoutFee", { count: clubs })}</p>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key) => (
            <Bar key={key} dataKey={key} stackId={REVENUE_STACK} fill={`var(--series-${key})`} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartContainer>
      <ul id={describedBy} className="sr-only">
        {months.map((month) => (
          <li key={month.month}>
            {[
              full(month.month),
              ...series.map((key) => `${t(`series.${key}`)} ${amount(month[key])}`),
            ].join(SCHEDULE_PART_SEPARATOR)}
          </li>
        ))}
      </ul>
    </BusinessCard>
  );
}

const FAMILY_SERIES = ["signups", "firstSeats", "stoppedPaying"] as const;
type FamilySeries = (typeof FAMILY_SERIES)[number];

const FAMILY_COLOUR: Record<FamilySeries, ChartColor> = {
  signups: "var(--color-foreground)",
  firstSeats: "var(--color-act)",
  stoppedPaying: "var(--color-destructive)",
};

function isFamilySeries(name: unknown): name is FamilySeries {
  return FAMILY_SERIES.some((series) => series === name);
}

function FamiliesCard({ overview }: { overview: BusinessOverview }) {
  const t = useTranslations("admin.business.families");
  const count = useCount();
  const { full } = useMonthName();
  const monthTick = useMonthTick(overview.currentMonth);
  const monthLabel = useMonthLabel(overview.currentMonth);
  const describedBy = useId();
  const config = Object.fromEntries(
    FAMILY_SERIES.map((key) => [key, { label: t(`series.${key}`), color: FAMILY_COLOUR[key] }]),
  ) satisfies ChartConfig;

  return (
    <BusinessCard heading={t("heading")} caption={t("caption")}>
      <ChartContainer config={config} className={MONTHLY_CHART_SIZE}>
        <BarChart
          data={[...overview.families]}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          aria-label={t("chart")}
          aria-describedby={describedBy}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tick={monthTick} interval={0} height={40} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickFormatter={count} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={monthLabel}
                formatter={(value, name) =>
                  isFamilySeries(name) && typeof value === "number" ? (
                    <TooltipRow label={t(`series.${name}`)} value={count(value)} />
                  ) : null
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {FAMILY_SERIES.map((key) => (
            <Bar key={key} dataKey={key} fill={`var(--series-${key})`} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartContainer>
      <ul id={describedBy} className="sr-only">
        {overview.families.map((month) => (
          <li key={month.month}>
            {[
              full(month.month),
              ...FAMILY_SERIES.map((key) => `${t(`series.${key}`)} ${count(month[key])}`),
            ].join(SCHEDULE_PART_SEPARATOR)}
          </li>
        ))}
      </ul>
    </BusinessCard>
  );
}

/**
 * Seats per teaching Gedu as the line, with the two counts it divides in a
 * table beneath: the two counts sit on scales far apart, so one axis would
 * flatten the Gedus to the floor and two would invite comparing heights that
 * mean nothing to each other.
 */
function GedusCard({ overview }: { overview: BusinessOverview }) {
  const t = useTranslations("admin.business.gedus");
  const count = useCount();
  const { tick } = useMonthName();
  const monthTick = useMonthTick(overview.currentMonth);
  const monthLabel = useMonthLabel(overview.currentMonth);
  const startNote = useStartNote();
  const ratio = new Intl.NumberFormat(formattingLocale(useLocale()), { maximumFractionDigits: 1 });
  const { months, recordsBeginMonth } = overview.gedus;
  const config = {
    seatsPerTeachingGedu: { label: t("rows.seatsPerTeachingGedu"), color: "var(--color-act)" },
  } satisfies ChartConfig;
  const value = (figure: number | null, format: (n: number) => string) =>
    figure === null ? t("noData") : format(figure);

  const notes = startNote(
    seriesStart(months.map((month) => month.month), recordsBeginMonth),
    (month) => t("startsFrom", { month }),
    t("none"),
  );

  return (
    <BusinessCard heading={t("heading")} caption={t("caption")} notes={<Notes lines={notes} />}>
      <ChartContainer config={config} className={MONTHLY_CHART_SIZE}>
        <LineChart
          data={[...months]}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          aria-label={t("chart")}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tick={monthTick} interval={0} height={40} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={ratio.format} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={monthLabel}
                formatter={(figure) =>
                  typeof figure === "number" ? (
                    <TooltipRow label={t("rows.seatsPerTeachingGedu")} value={ratio.format(figure)} />
                  ) : null
                }
              />
            }
          />
          <Line
            dataKey="seatsPerTeachingGedu"
            type="linear"
            stroke={RATIO_STROKE}
            strokeWidth={2}
            dot={{ r: 3, fill: RATIO_STROKE }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                <span className="sr-only">{t("month")}</span>
              </th>
              {months.map((month, index) => (
                <th key={month.month} scope="col" className="px-1.5 py-1.5 text-right font-medium">
                  {tick(month.month, index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-muted-foreground">
                {t("rows.teachingGedus")}
              </th>
              {months.map((month) => (
                <td key={month.month} className="px-1.5 py-1.5 text-right">
                  {value(month.teachingGedus, count)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-muted-foreground">
                {t("rows.seatsFilled")}
              </th>
              {months.map((month) => (
                <td key={month.month} className="px-1.5 py-1.5 text-right">
                  {count(month.seatsFilled)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-muted-foreground">
                {t("rows.seatsPerTeachingGedu")}
              </th>
              {months.map((month) => (
                <td key={month.month} className="px-1.5 py-1.5 text-right">
                  {value(month.seatsPerTeachingGedu, ratio.format)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </BusinessCard>
  );
}

// ---------------------------------------------------------------------------
// While the overview is read
// ---------------------------------------------------------------------------

function Ghost({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-lifted ${className}`} />;
}

/**
 * The page's shape while the overview is read: a perceptibly slow read, so
 * the skeleton is drawn at once — the tiles and every card as ghosts at their
 * final size.
 */
export function BusinessOverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Ghost className="h-4 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="space-y-3 p-5">
            <Ghost className="h-4 w-32" />
            <Ghost className="h-8 w-24" />
            <Ghost className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <GhostCard />
        <div className="xl:col-span-2">
          <GhostCard />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <GhostCard />
        <GhostCard />
      </div>
    </div>
  );
}

function GhostCard() {
  return (
    <Card className="space-y-4 p-5">
      <Ghost className="h-5 w-40" />
      <Ghost className="h-3 w-3/4" />
      <Ghost className={`${CHART_HEIGHT} w-full`} />
    </Card>
  );
}
