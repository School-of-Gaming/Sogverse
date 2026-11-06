"use client";

import { useId } from "react";
import { Pie, PieChart } from "recharts";
import { useLocale } from "next-intl";
import { ChartContainer, type ChartColor, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/cn";
import { formattingLocale } from "@/lib/constants/locales";

/**
 * **A whole split into its parts: a donut with the whole in its hole, and a key
 * beneath that names each part with its count and its share.** The caller
 * decides which of the two figures a row leads with — the count where the
 * number of things is the news, the share where the split is.
 *
 * A slice's figures are `null` while they are being read: the ring is drawn
 * empty and the key keeps its labels with the figures left blank, at the
 * height the loaded donut takes. A share is `null` where there is none to
 * give, as when the whole is nothing; the ring is drawn empty then too.
 */

export interface DonutSlice {
  key: string;
  label: string;
  /** The slice's count; `null` while it is being read. */
  value: number | null;
  /** The slice's part of the whole, from 0 to 1; `null` when there is none to give. */
  share: number | null;
  /** The slice's colour on the ring. */
  color: ChartColor;
  /** The key's swatch: a background class in the same token as `color`. */
  swatch: string;
}

/** The gap between slices: the card's own ground, so each slice stands apart. */
const SLICE_EDGE = "var(--color-card)";

/** The ring with nothing to split: the ground the loading ghosts take. */
const EMPTY_RING = { key: "empty", color: "var(--color-lifted)" } as const satisfies {
  key: string;
  color: ChartColor;
};

export function DonutChart({
  slices,
  total,
  chartLabel,
  lead,
}: {
  slices: readonly DonutSlice[];
  /** The whole, as its count and the word under it; `null` while it is being read. */
  total: { value: number; label: string } | null;
  /** The chart's accessible name. */
  chartLabel: string;
  /** Which figure leads a row of the key; the other follows it, quieter. */
  lead: "value" | "share";
}) {
  const locale = useLocale();
  const count = new Intl.NumberFormat(formattingLocale(locale));
  const percent = new Intl.NumberFormat(formattingLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const describedBy = useId();

  const empty = total === null || total.value === 0;
  const config = Object.fromEntries(
    empty
      ? [[EMPTY_RING.key, { color: EMPTY_RING.color }]]
      : slices.map((slice) => [slice.key, { label: slice.label, color: slice.color }]),
  ) satisfies ChartConfig;
  const data = empty
    ? [{ key: EMPTY_RING.key, value: 1, fill: `var(--series-${EMPTY_RING.key})` }]
    : slices.map((slice) => ({ key: slice.key, value: slice.value, fill: `var(--series-${slice.key})` }));

  return (
    <>
      <div className="relative">
        <ChartContainer config={config} className="h-64 w-full">
          <PieChart aria-label={chartLabel} aria-describedby={describedBy}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="62%"
              outerRadius="92%"
              stroke={SLICE_EDGE}
              strokeWidth={empty ? 0 : 2}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {total !== null && (
            <>
              <span className="text-2xl font-semibold tabular-nums">{count.format(total.value)}</span>
              <span className="text-xs text-muted-foreground">{total.label}</span>
            </>
          )}
        </div>
      </div>
      <ul id={describedBy} className="divide-y divide-border">
        {slices.map((slice) => {
          const value = slice.value === null ? null : count.format(slice.value);
          const share = slice.share === null ? null : percent.format(slice.share);
          return (
            <li key={slice.key} className="flex items-center gap-3 py-1.5 text-sm">
              <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", slice.swatch)} />
              <span className="min-w-0 flex-1">{slice.label}</span>
              {lead === "value" ? (
                <>
                  <span className="tabular-nums">{value}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{share}</span>
                </>
              ) : (
                <>
                  <span className="tabular-nums">{share}</span>
                  <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
