"use client";

import { useId, useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { useLocale, useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatDateOnly, formatDateRange } from "@/lib/utils";
import type { FeedbackTimeline as Timeline, FeedbackTimelinePoint } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";

/**
 * **The whole history of how positive gamers are**, from the first day with
 * data to today. The line is the positive share bucket by bucket, in act, over
 * a labelled 0–100% scale with faint gridlines and the months along the
 * bottom; a bucket nobody answered in is a gap, never a zero, and an answered
 * bucket between two gaps is a dot. A detail page set against the platform
 * draws the platform's line beside it as a dashed grey, named in a legend.
 * Hovering a bucket, or walking them with the arrow keys once the chart has
 * focus, moves the tooltip onto it. The tooltip is drawn, never announced: what
 * assistive tech reads is the same readings listed as visually hidden text,
 * which the chart's focusable surface names as its description.
 *
 * The chart's height is fixed and it is drawn at the width it is given, so
 * text stays its own size at any width. Until the box is measured it stays
 * empty at that height, so nothing below it moves when it draws.
 */

/** Each line's stroke: the colour its series is configured with below. */
const STROKE = { scope: "var(--series-scope)", platform: "var(--series-platform)" } as const;
/** The platform line's dash, which says "for comparison" without a second colour. */
const PLATFORM_DASH = "4 4";
/** The point being read: the scope's colour ringed in the card's ground so it lifts off the line. */
const ACTIVE_DOT = { r: 4.5, fill: STROKE.scope, stroke: "var(--color-card)", strokeWidth: 2 };

type Series = keyof typeof STROKE;

/** One bucket as the chart draws it. */
interface Row {
  start: string;
  point: FeedbackTimelinePoint;
  scope: number | null;
  platform: number | null;
}

/** An answered bucket with no answered neighbour: no line reaches it, so it is drawn as a dot. */
function isolated(rows: Row[], index: number, key: Series): boolean {
  return (
    rows[index]?.[key] != null && rows[index - 1]?.[key] == null && rows[index + 1]?.[key] == null
  );
}

/**
 * The buckets the bottom axis names, each with its month: the first bucket,
 * always, with the month the history starts in, and then every bucket holding
 * the 1st of a month. The first label and January carry the year. Recharts
 * thins these by measured width, always keeping the first.
 */
function monthTicks(points: FeedbackTimelinePoint[], locale: string): Map<string, string> {
  const ticks = new Map<string, string>();
  points.forEach((point, index) => {
    const month =
      index === 0
        ? point.start
        : point.start.endsWith("-01")
          ? point.start
          : point.end.slice(0, 7) !== point.start.slice(0, 7)
            ? `${point.end.slice(0, 7)}-01`
            : null;
    if (month === null) return;
    const withYear = index === 0 || month.slice(5, 7) === "01";
    ticks.set(
      point.start,
      formatDateOnly(month, locale, withYear ? { month: "short", year: "numeric" } : { month: "short" }),
    );
  });
  return ticks;
}

/** A series' dot, drawn only where the bucket is isolated: everywhere else the line says it. */
function isolatedDot(rows: Row[], key: Series, radius: number, { cx, cy, index }: DotItemDotProps) {
  return cx !== undefined && cy !== undefined && isolated(rows, index, key) ? (
    <circle key={index} cx={cx} cy={cy} r={radius} fill={STROKE[key]} />
  ) : null;
}

/** Whether a tooltip item's datum is one of the chart's rows. */
function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && "point" in value && "start" in value;
}

export function FeedbackTimeline({
  timeline,
  scopeLabel,
}: {
  timeline: Timeline;
  /** What the act line stands for, named in the legend beside the platform's; only read when there is a platform line. */
  scopeLabel?: string;
}) {
  const t = useTranslations("admin.feedback");
  const locale = useLocale();
  const { unit, points, platform } = timeline;

  const rows = useMemo<Row[]>(
    () =>
      points.map((point, index) => ({
        start: point.start,
        point,
        scope: point.positiveShare,
        platform: platform?.at(index)?.positiveShare ?? null,
      })),
    [points, platform],
  );
  const ticks = useMemo(() => monthTicks(points, locale), [points, locale]);

  const config = {
    scope: { label: scopeLabel, color: "var(--color-act)" },
    platform: { label: t("timeline.platform"), color: "var(--color-muted-foreground)" },
  } satisfies ChartConfig;

  const share = (value: number) => formatShare(value, locale);

  /** A bucket read out as one line: its dates, how positive, how many answered and the platform. */
  const describe = (row: Row): string => {
    const parts = [
      formatDateRange(row.point.start, row.point.end, locale),
      row.scope === null ? t("noAnswers") : t("statements.positive", { share: share(row.scope) }),
    ];
    if (row.point.n > 0) parts.push(t("answers", { count: row.point.n }));
    if (row.platform !== null) parts.push(t("detail.platform", { share: share(row.platform) }));
    return parts.join(SCHEDULE_PART_SEPARATOR);
  };

  const label = t(unit === "week" ? "timeline.byWeek" : "timeline.byMonth");
  const readingsId = useId();

  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <ChartContainer config={config} className="h-52 w-full">
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          aria-label={label}
          aria-describedby={readingsId}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="start"
            ticks={[...ticks.keys()]}
            tickFormatter={(start: string) => ticks.get(start) ?? ""}
            interval="preserveStart"
            minTickGap={16}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={share}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ChartTooltip
            filterNull={false}
            content={
              <ChartTooltipContent
                className="max-w-56"
                labelClassName="font-normal text-muted-foreground"
                labelFormatter={(_, payload) => {
                  const row: unknown = payload[0]?.payload;
                  return isRow(row) ? formatDateRange(row.point.start, row.point.end, locale) : null;
                }}
                formatter={(_, name, item) => {
                  const row: unknown = item.payload;
                  if (!isRow(row)) return null;
                  return name === "platform" ? (
                    row.platform === null ? null : (
                      <p className="tabular-nums text-muted-foreground">
                        {t("detail.platform", { share: share(row.platform) })}
                      </p>
                    )
                  ) : (
                    <div>
                      <p className="text-sm font-semibold tabular-nums">
                        {row.scope === null
                          ? t("noAnswers")
                          : t("statements.positive", { share: share(row.scope) })}
                      </p>
                      {row.point.n > 0 && (
                        <p className="tabular-nums text-muted-foreground">
                          {t("answers", { count: row.point.n })}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          {platform !== null && (
            <ChartLegend verticalAlign="top" align="left" content={<ChartLegendContent />} />
          )}
          {/* The platform first, so the scope's line is drawn over it. */}
          {platform !== null && (
            <Line
              dataKey="platform"
              type="linear"
              stroke={STROKE.platform}
              strokeWidth={1.5}
              strokeDasharray={PLATFORM_DASH}
              dot={(props) => isolatedDot(rows, "platform", 2.5, props)}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="scope"
            type="linear"
            stroke={STROKE.scope}
            strokeWidth={2}
            dot={(props) => isolatedDot(rows, "scope", 4, props)}
            activeDot={ACTIVE_DOT}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      {/* The chart's readings as text, for a reader who cannot see it. */}
      <ul id={readingsId} className="sr-only">
        {rows.map((row) => (
          <li key={row.start}>{describe(row)}</li>
        ))}
      </ul>
    </div>
  );
}
