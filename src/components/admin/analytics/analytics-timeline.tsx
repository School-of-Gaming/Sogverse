"use client";

import { useId } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
import type { DayVisits } from "@/services/admin-analytics/admin-analytics.build";

/**
 * **The range day by day**: pageviews in act and visitors in ink, one point per
 * UTC day, and the axis says the days are UTC days.
 *
 * The chart's height is fixed, so nothing below moves when it draws; what it
 * shows is also listed as visually hidden text, which the chart names as its
 * description.
 */

const STROKE = {
  pageviews: "var(--series-pageviews)",
  visitors: "var(--series-visitors)",
} as const;

const SERIES = ["pageviews", "visitors"] as const;

/** Whether a tooltip item's name is one of the chart's series. */
function isSeries(name: unknown): name is (typeof SERIES)[number] {
  return SERIES.some((series) => series === name);
}

export function AnalyticsTimeline({ rows }: { rows: DayVisits[] }) {
  const t = useTranslations("admin.analytics.timeline");
  const locale = useLocale();
  const number = new Intl.NumberFormat(formattingLocale(locale));
  const day = (value: string) => formatDateOnly(value, locale, { day: "numeric", month: "short" });
  const trafficId = useId();

  const traffic = {
    pageviews: { label: t("series.pageviews"), color: "var(--color-act)" },
    visitors: { label: t("series.visitors"), color: "var(--color-foreground)" },
  } satisfies ChartConfig;

  const describe = (row: DayVisits) =>
    [
      formatDateOnly(row.day, locale),
      ...SERIES.map((key) => `${t(`series.${key}`)} ${number.format(row[key])}`),
    ].join(SCHEDULE_PART_SEPARATOR);

  return (
    <Card className="space-y-6 p-5">
      <div className="space-y-2" role="group" aria-label={t("traffic")}>
        <Heading level={3} step="label">{t("traffic")}</Heading>
        <ChartContainer config={traffic} className="h-60 w-full">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} aria-label={t("traffic")} aria-describedby={trafficId}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={day}
              interval="preserveStartEnd"
              minTickGap={24}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              tickFormatter={(value: number) => number.format(value)}
              tickLine={false}
              axisLine={false}
              width={48}
            />
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
            <ChartLegend verticalAlign="top" align="left" content={<ChartLegendContent />} />
            <Line
              dataKey="visitors"
              type="linear"
              stroke={STROKE.visitors}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="pageviews"
              type="linear"
              stroke={STROKE.pageviews}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </div>

      <p className="text-xs text-muted-foreground">{t("utcDays")}</p>

      <ul id={trafficId} className="sr-only">
        {rows.map((row) => (
          <li key={row.day}>{describe(row)}</li>
        ))}
      </ul>
    </Card>
  );
}
