"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";
import { cn } from "@/lib/utils";

/**
 * **shadcn/ui's chart, on Recharts, adapted to the one dark theme.** A chart is
 * Recharts' own components inside a `ChartContainer`, which names each series
 * in a `ChartConfig` and hands its colour to the drawing as `var(--color-<key>)`.
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
 *   stylesheet has nothing to switch between, and a custom property set on the
 *   element is the same cascade with no stylesheet for the page's CSP to rule on.
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
    icon?: React.ComponentType;
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
      color === undefined ? [] : [[`--color-${key}`, color]],
    ),
  );
}

/** The configured series an item of a tooltip or legend draws. */
function seriesOf(config: ChartConfig, dataKey: unknown): ChartConfig[string] | undefined {
  return typeof dataKey === "string" || typeof dataKey === "number"
    ? config[String(dataKey)]
    : undefined;
}

function ChartContainer({
  id,
  className,
  style,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
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

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, string | number>,
    "accessibilityLayer"
  >) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  const [first] = payload;
  const labelValue =
    typeof label === "string" ? (seriesOf(config, label)?.label ?? label) : seriesOf(config, first.dataKey)?.label;
  const tooltipLabel = hideLabel ? null : labelFormatter ? (
    <div className={cn("font-medium", labelClassName)}>{labelFormatter(labelValue, payload)}</div>
  ) : labelValue ? (
    <div className={cn("font-medium", labelClassName)}>{labelValue}</div>
  ) : null;

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const series = seriesOf(config, item.dataKey);
            const indicatorColor = color ?? item.color;

            return (
              <div
                key={index}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter && item.value !== undefined && item.name !== undefined ? (
                  formatter(item.value, item.name, item, index, payload)
                ) : (
                  <>
                    {series?.icon ? (
                      <series.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn("shrink-0 rounded-xs border-solid", {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          })}
                          style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">{series?.label ?? item.name}</span>
                      </div>
                      {item.value != null && (
                        <span className="font-medium tabular-nums text-foreground">
                          {typeof item.value === "number" ? item.value.toLocaleString() : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean;
} & RechartsPrimitive.DefaultLegendContentProps) {
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
            <div
              key={index}
              className="flex items-center gap-1.5 text-muted-foreground [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
            >
              {series?.icon && !hideIcon ? (
                <series.icon />
              ) : (
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
              )}
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
