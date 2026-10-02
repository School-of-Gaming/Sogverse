"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";
import { cn } from "@/lib/utils";

/**
 * **shadcn/ui's chart, on Recharts, adapted to the one dark theme.** A chart is
 * Recharts' own components inside a `ChartContainer`, which names each series
 * in a `ChartConfig` and hands its colour to the drawing as `var(--series-<key>)`.
 *
 * Where this departs from the registry's copy, it is for a rule here:
 *
 * - **A series' colour is a theme token, never a value.** `ChartColor` admits
 *   only `var(--color-…)`, so a chart spends the same tokens as every other
 *   surface, and a hex, a palette class or a colour function cannot reach it.
 *   There is no `--chart-N` palette: which token a series wears is what the
 *   series means, decided where the chart is drawn.
 * - **The colours are set on the container's `style`, not in an injected
 *   `<style>` element.** There is one theme, so the registry's per-theme
 *   stylesheet has nothing to switch between; a series' colour is a token the
 *   theme already defines, and a custom property set on the element hands it on
 *   with nothing to keep in step with the theme.
 * - **A series' variable has a namespace of its own, `--series-<key>`.** The
 *   registry writes `--color-<key>`, which is the theme's namespace: a series
 *   keyed like a token (`border`, `card`, `act`) would shadow that token inside
 *   the chart, or point at itself.
 * - **Nothing draws until the box is measured.** The registry seeds a guessed
 *   size so a chart paints on the server; a chart drawn at a guessed width
 *   shifts every label sideways when the real width arrives. The caller gives
 *   the container its height, so the space is held while it waits.
 * - **A series is found in the config by its `dataKey`**, the one way the
 *   charts here name one; the registry's lookups by a payload field, for
 *   charts keyed by category, arrive with the first chart that needs them.
 * - **The legend keys an entry by a short stroke of its line**, dashed where
 *   the series is, so a line is matched to its name by shape as well as colour.
 *
 * The gridlines take the neutral edge and the axis text, cursor and legend the
 * quiet ink from the container's class list, so a chart passes no colour for
 * its scaffold. Keyboard focus lands on the chart's surface (Recharts'
 * accessibility layer, on by default) and is drawn in act.
 */

/** A theme colour token, as a CSS variable reference: `var(--color-act)`. */
export type ChartColor = `var(--color-${string})`;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: ChartColor;
  }
>;

/**
 * The size the container starts at: no width, so nothing draws until the box
 * is measured. The height is positive only because Recharts warns about a
 * container with neither; the box's real height comes from the caller.
 */
const UNMEASURED = { width: 0, height: 1 } as const;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

/** Each configured series' colour as the custom property its drawing reads. */
function seriesColours(config: ChartConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config).flatMap(([key, { color }]) =>
      color === undefined ? [] : [[`--series-${key}`, color]],
    ),
  );
}

/** The configured series a legend entry draws. */
function seriesOf(config: ChartConfig, dataKey: unknown): ChartConfig[string] | undefined {
  return typeof dataKey === "string" || typeof dataKey === "number"
    ? config[String(dataKey)]
    : undefined;
}

function ChartContainer({
  className,
  style,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        className={cn(
          "flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-muted-foreground [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-act",
          className,
        )}
        style={{ ...seriesColours(config), ...style }}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer initialDimension={UNMEASURED}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipContentProps = RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, string | number>;

/**
 * The tooltip's frame: a heading the caller formats, then each drawn series'
 * row as the caller formats it. A chart here always says what a reading means
 * in its own words, so both formatters are required and the frame draws no
 * row of its own.
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  labelClassName,
  labelFormatter,
  formatter,
}: Pick<TooltipContentProps, "label" | "payload"> & {
  /** Set by Recharts while a point is being read. */
  active?: boolean;
  className?: string;
  labelClassName?: string;
  labelFormatter: NonNullable<TooltipContentProps["labelFormatter"]>;
  formatter: NonNullable<TooltipContentProps["formatter"]>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      <div className={cn("font-medium", labelClassName)}>{labelFormatter(label, payload)}</div>
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => (
            <div key={index} className="flex w-full flex-wrap items-center gap-2">
              {formatter(item.value, item.name, item, index, payload)}
            </div>
          ))}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  payload,
  verticalAlign = "bottom",
}: React.ComponentProps<"div"> & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const series = seriesOf(config, item.dataKey);
          const dashed = isDashed(item.payload);

          return (
            <div key={index} className="flex items-center gap-1.5 text-muted-foreground">
              <svg width={16} height={4} aria-hidden className="shrink-0">
                <line
                  x1={1}
                  x2={15}
                  y1={2}
                  y2={2}
                  stroke={item.color}
                  strokeWidth={dashed ? 1.5 : 2}
                  strokeDasharray={dashed ? LEGEND_DASH : undefined}
                  strokeLinecap="round"
                />
              </svg>
              {series?.label}
            </div>
          );
        })}
    </div>
  );
}

/** The dash a legend draws for a dashed series: shorter than the line's own, to fit a 16px key. */
const LEGEND_DASH = "3 3";

/** Whether a legend entry's series is drawn with a dash, read off the series' own props. */
function isDashed(payload: object | undefined): boolean {
  return (
    payload !== undefined &&
    "strokeDasharray" in payload &&
    payload.strokeDasharray !== undefined &&
    payload.strokeDasharray !== "none"
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent };
