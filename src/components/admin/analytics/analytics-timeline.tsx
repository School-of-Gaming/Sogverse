"use client";

import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { formattingLocale } from "@/lib/constants/locales";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatDateOnly } from "@/lib/utils";
import type { TimelineRow } from "@/services/admin-analytics/admin-analytics.build";

/**
 * **The range day by day, as two charts on one card.** The traffic chart draws
 * pageviews in act, visitors in ink, and pages served — the denominator, every
 * visitor counted — as a dashed grey line; a day a measure was not read for
 * (pages served beyond the request log's month, or a measure that failed) is a
 * gap, never a zero. Signups sit on a chart of their own beneath it, because a
 * day's handful of new accounts would be a flat line on the traffic's scale.
 *
 * The days are UTC days, and the axis says so. Each chart's height is fixed,
 * so nothing below moves when it draws; what it shows is also listed as
 * visually hidden text, which the chart names as its description.
 */

const STROKE = {
  served: "var(--series-served)",
  pageviews: "var(--series-pageviews)",
  visitors: "var(--series-visitors)",
} as const;

/** The signups' bar fill: the colour its series is configured with. */
const SIGNUPS_FILL = "var(--series-signups)";

/** The denominator's dash, which says "for comparison" without another colour. */
const SERVED_DASH = "4 4";

const SERIES = ["served", "pageviews", "visitors", "signups"] as const;

/** Whether a tooltip item's name is one of the charts' series. */
function isSeries(name: unknown): name is (typeof SERIES)[number] {
  return SERIES.some((series) => series === name);
}

export function AnalyticsTimeline({
  rows,
  notes,
}: {
  rows: TimelineRow[];
  /** Lines under the charts saying which measure is missing and why. */
  notes: string[];
}) {
  const t = useTranslations("admin.analytics.timeline");
  const locale = useLocale();
  const number = new Intl.NumberFormat(formattingLocale(locale));
  const day = (value: string) => formatDateOnly(value, locale, { day: "numeric", month: "short" });
  const trafficId = useId();
  const signupsId = useId();

  const traffic = {
    served: { label: t("series.served"), color: "var(--color-muted-foreground)" },
    pageviews: { label: t("series.pageviews"), color: "var(--color-act)" },
    visitors: { label: t("series.visitors"), color: "var(--color-foreground)" },
  } satisfies ChartConfig;
  const signups = {
    signups: { label: t("series.signups"), color: "var(--color-act)" },
  } satisfies ChartConfig;

  const hasServed = rows.some((row) => row.served !== null);
  const hasVisits = rows.some((row) => row.pageviews !== null);
  const hasSignups = rows.some((row) => row.signups !== null);

  const describe = (row: TimelineRow) =>
    [
      formatDateOnly(row.day, locale),
      ...SERIES.flatMap((key) =>
        row[key] === null ? [] : [`${t(`series.${key}`)} ${number.format(row[key])}`],
      ),
    ].join(SCHEDULE_PART_SEPARATOR);

  const axis = (
    <XAxis
      dataKey="day"
      tickFormatter={day}
      interval="preserveStartEnd"
      minTickGap={24}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
    />
  );
  const yAxis = (
    <YAxis
      allowDecimals={false}
      tickFormatter={(value: number) => number.format(value)}
      tickLine={false}
      axisLine={false}
      width={48}
    />
  );
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const row: unknown = payload[0]?.payload;
            return typeof row === "object" && row !== null && "day" in row && typeof row.day === "string"
              ? formatDateOnly(row.day, locale)
              : null;
          }}
          formatter={(value, name) =>
            typeof value === "number" && isSeries(name) ? (
              <p className="flex justify-between gap-4 tabular-nums">
                <span className="text-muted-foreground">{t(`series.${name}`)}</span>
                {number.format(value)}
              </p>
            ) : null
          }
        />
      }
    />
  );

  return (
    <Card className="space-y-6 p-5">
      <div className="space-y-2" role="group" aria-label={t("traffic")}>
        <Heading level={3} step="label">{t("traffic")}</Heading>
        <ChartContainer config={traffic} className="h-60 w-full">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} aria-label={t("traffic")} aria-describedby={trafficId}>
            <CartesianGrid vertical={false} />
            {axis}
            {yAxis}
            {tooltip}
            <ChartLegend verticalAlign="top" align="left" content={<ChartLegendContent />} />
            {hasServed && (
              <Line
                dataKey="served"
                type="linear"
                stroke={STROKE.served}
                strokeWidth={1.5}
                strokeDasharray={SERVED_DASH}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {hasVisits && (
              <Line
                dataKey="visitors"
                type="linear"
                stroke={STROKE.visitors}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {hasVisits && (
              <Line
                dataKey="pageviews"
                type="linear"
                stroke={STROKE.pageviews}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ChartContainer>
      </div>

      {hasSignups && (
        <div className="space-y-2" role="group" aria-label={t("signups")}>
          <Heading level={3} step="label">{t("signups")}</Heading>
          <ChartContainer config={signups} className="h-36 w-full">
            <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} aria-label={t("signups")} aria-describedby={signupsId}>
              <CartesianGrid vertical={false} />
              {axis}
              {yAxis}
              {tooltip}
              <Bar dataKey="signups" fill={SIGNUPS_FILL} radius={2} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{t("utcDays")}</p>
        {notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>

      <ul id={trafficId} className="sr-only">
        {rows.map((row) => (
          <li key={row.day}>{describe(row)}</li>
        ))}
      </ul>
      <ul id={signupsId} className="sr-only">
        {rows.map((row) => (
          <li key={row.day}>
            {formatDateOnly(row.day, locale)}
            {SCHEDULE_PART_SEPARATOR}
            {t("series.signups")} {row.signups === null ? "" : number.format(row.signups)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
