"use client";

import { useId } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import { formattingLocale } from "@/lib/constants/locales";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatDateOnly } from "@/lib/utils";
import type { AnalyticsResult, DayVisits } from "@/services/admin-analytics/admin-analytics.build";
import { AnalyticsFailure, ReadAt } from "./analytics-view";

/**
 * **The range's traffic in one card**, the way Vercel's own dashboard draws
 * it: the range's pageviews and visitors side by side, and beneath them the
 * same two day by day — pageviews in act and visitors in ink, one point per
 * UTC day. Each figure's swatch is the chart's legend.
 *
 * The card is drawn whole while its read is in flight, the figures, the chart
 * and the read time as ghosts at their final size, so nothing below it moves
 * when the read lands. What the chart shows is also listed as visually hidden
 * text, which the chart names as its description.
 */

const STROKE = {
  pageviews: "var(--series-pageviews)",
  visitors: "var(--series-visitors)",
} as const;

const SERIES = ["pageviews", "visitors"] as const;

/** Each series' colour as a fill, for its figure's swatch; the same tokens the chart config names. */
const SWATCH = { pageviews: "bg-act", visitors: "bg-foreground" } as const;

/** Whether a tooltip item's name is one of the chart's series. */
function isSeries(name: unknown): name is (typeof SERIES)[number] {
  return SERIES.some((series) => series === name);
}

export type TrafficState =
  | { status: "loading" }
  | { status: "failed"; reason: Extract<AnalyticsResult<unknown>, { ok: false }>["reason"] }
  | { status: "ready"; pageviews: number; visitors: number; days: DayVisits[]; readAt: string };

/** A ghost bar, for the loading card. */
function Ghost({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded bg-lifted ${className}`} />;
}

/** One of the range's totals, under its label and the swatch its line wears. */
function Figure({
  label,
  series,
  value,
}: {
  label: string;
  series: (typeof SERIES)[number];
  value: string | null;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden className={`h-0.5 w-3 rounded-full ${SWATCH[series]}`} />
        {label}
      </dt>
      <dd className="mt-1 flex h-9 items-center text-3xl font-semibold leading-9 tabular-nums">
        {value ?? <Ghost className="h-8 w-28" />}
      </dd>
    </div>
  );
}

export function TrafficCard({ state }: { state: TrafficState }) {
  const t = useTranslations("admin.analytics.traffic");
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

  const ready = state.status === "ready" ? state : null;

  return (
    <Card className="space-y-5 p-5">
      <Heading level={2} step="card-title">{t("heading")}</Heading>

      {state.status === "failed" ? (
        <AnalyticsFailure reason={state.reason} />
      ) : (
        <>
          <dl className="flex flex-wrap gap-x-12 gap-y-4">
            <Figure
              label={t("series.pageviews")}
              series="pageviews"
              value={ready && number.format(ready.pageviews)}
            />
            <Figure
              label={t("visitors")}
              series="visitors"
              value={ready && number.format(ready.visitors)}
            />
          </dl>

          {ready ? (
            <ChartContainer config={traffic} className="h-60 w-full">
              <LineChart
                data={ready.days}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                aria-label={t("chart")}
                aria-describedby={trafficId}
              >
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
          ) : (
            <Ghost className="h-60 w-full" />
          )}
        </>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="max-w-3xl text-xs text-muted-foreground">{t("caption")}</p>
        {ready ? (
          <div className="sm:shrink-0">
            <ReadAt readAt={ready.readAt} />
          </div>
        ) : state.status === "loading" ? (
          <Ghost className="h-4 w-56 sm:shrink-0" />
        ) : null}
      </div>

      {ready && (
        <ul id={trafficId} className="sr-only">
          {ready.days.map((row) => (
            <li key={row.day}>{describe(row)}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
