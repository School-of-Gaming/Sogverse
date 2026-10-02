"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { addCalendarMonths } from "@/lib/calendar-date";
import { formatDateOnly, formatDateRange } from "@/lib/utils";
import type { FeedbackTimeline as Timeline, FeedbackTimelinePoint } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { periodDays, type FeedbackPeriod } from "./feedback-tally";

/**
 * **The whole history of how positive gamers are**, from the first day with
 * data to today. The line is the positive share bucket by bucket, in act, over
 * a labelled 0–100% scale with faint gridlines and the months along the
 * bottom; a bucket nobody answered in is a gap, never a zero. A detail page
 * set against the platform draws the platform's line beside it as a dashed
 * grey, named in a legend. Hovering a point, or walking the points with the
 * arrow keys, reads it out.
 *
 * The chart's height is fixed and the canvas is drawn at the width it is
 * given, so text stays its own size at any width. Until the box is measured it
 * stays empty at that height: a chart drawn at a guessed width would shift
 * every label and point sideways once the real width arrived.
 */

const HEIGHT = 208;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 44 };
/** The scale's labelled steps; the 0 line is the baseline, the rest gridlines. */
const GRID = [0, 0.25, 0.5, 0.75, 1];
/** The closest two month labels may sit. */
const MIN_TICK_GAP_PX = 64;
const AVERAGE_MONTH_DAYS = 30.44;

/** The box's width, following it as the layout changes; 0 until measured. */
function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Days from `origin` to `date`: 0 for the same day. */
function dayIndex(date: string, origin: string): number {
  return periodDays({ from: origin, to: date }) - 1;
}

/** Every 1st of a month inside the history, oldest first. */
function monthStarts(history: FeedbackPeriod): string[] {
  const starts: string[] = [];
  let start = history.from.endsWith("-01")
    ? history.from
    : addCalendarMonths(`${history.from.slice(0, 7)}-01`, 1);
  while (start <= history.to) {
    starts.push(start);
    start = addCalendarMonths(start, 1);
  }
  return starts;
}

/** Runs of consecutive answered points: each run is one stroke, a gap between runs. */
function runsOf(points: FeedbackTimelinePoint[]): { index: number; share: number }[][] {
  const runs: { index: number; share: number }[][] = [];
  let run: { index: number; share: number }[] = [];
  points.forEach((point, index) => {
    if (point.positiveShare === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push({ index, share: point.positiveShare });
    }
  });
  if (run.length > 0) runs.push(run);
  return runs;
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
  const { history, unit, points, platform } = timeline;

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useWidth(boxRef);

  const [hovered, setHovered] = useState<number | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<number | null>(null);

  const days = periodDays(history);
  const plotLeft = MARGIN.left;
  const plotRight = Math.max(plotLeft + 1, width - MARGIN.right);
  const plotWidth = plotRight - plotLeft;
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;

  /** The left edge of a day; `days` is the right edge of the last one. */
  const xAt = (day: number) => plotLeft + (day / days) * plotWidth;
  const yAt = (share: number) => plotBottom - share * (plotBottom - plotTop);

  // A point sits over the middle of the days its bucket holds.
  const centres = useMemo(
    () =>
      points.map(
        (point) => (dayIndex(point.start, history.from) + dayIndex(point.end, history.from) + 1) / 2,
      ),
    [points, history.from],
  );
  const pointX = (index: number) => xAt(centres[index]);

  const ticks = useMemo(() => {
    const monthWidth = (plotWidth * AVERAGE_MONTH_DAYS) / days;
    const every = [1, 2, 3, 6, 12].find((step) => step * monthWidth >= MIN_TICK_GAP_PX) ?? 12;
    return monthStarts(history).filter((start) => (Number(start.slice(5, 7)) - 1) % every === 0);
  }, [history, plotWidth, days]);

  /** The point nearest a pointer, so the reader aims at a date, never at a 2px line. */
  const pointUnder = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (points.length === 0 || rect === undefined || rect.width === 0) return null;
    const x = ((clientX - rect.left) * width) / rect.width;
    const day = ((x - plotLeft) / plotWidth) * days;
    let nearest = 0;
    centres.forEach((centre, index) => {
      if (Math.abs(centre - day) < Math.abs(centres[nearest] - day)) nearest = index;
    });
    return nearest;
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch") setHovered(pointUnder(event.clientX));
  };

  const onPointsKey = (event: KeyboardEvent<SVGGElement>) => {
    if (points.length === 0) return;
    const current = focusedPoint ?? points.length - 1;
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? Math.min(points.length - 1, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setFocusedPoint(next);
  };

  /** The platform's share at a point, where there is a platform line and it was answered. */
  const platformShareAt = (index: number): number | null =>
    platform === null ? null : (platform.at(index)?.positiveShare ?? null);

  const describe = (index: number): string => {
    const point = points[index];
    const parts = [
      formatDateRange(point.start, point.end, locale),
      point.positiveShare === null
        ? t("noAnswers")
        : t("statements.positive", { share: formatShare(point.positiveShare, locale) }),
    ];
    if (point.n > 0) parts.push(t("answers", { count: point.n }));
    const platformShare = platformShareAt(index);
    if (platformShare !== null) {
      parts.push(t("detail.platform", { share: formatShare(platformShare, locale) }));
    }
    return parts.join(" · ");
  };

  const shown = hovered ?? focusedPoint;
  const shownPoint = shown === null ? null : (points.at(shown) ?? null);
  const shownPlatform = shown === null ? null : platformShareAt(shown);
  const scopeRuns = runsOf(points);
  const platformRuns = platform === null ? [] : runsOf(platform);

  return (
    <div className="space-y-2">
      {platform !== null && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <LegendItem label={scopeLabel ?? ""} dashed={false} />
          <LegendItem label={t("timeline.platform")} dashed />
        </ul>
      )}

      <div ref={boxRef} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              className="block h-full w-full select-none overflow-visible"
              role="group"
              aria-label={t(unit === "week" ? "timeline.byWeek" : "timeline.byMonth")}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHovered(null)}
            >
              {/* The scale: labelled steps, the baseline and faint gridlines. */}
              {GRID.map((share) => (
                <g key={share} aria-hidden>
                  <line
                    x1={plotLeft}
                    x2={plotRight}
                    y1={yAt(share)}
                    y2={yAt(share)}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                    className="stroke-border"
                  />
                  <text
                    x={plotLeft - 8}
                    y={yAt(share)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-xs tabular-nums"
                  >
                    {formatShare(share, locale)}
                  </text>
                </g>
              ))}
              {ticks.map((start, index) => {
                const x = xAt(dayIndex(start, history.from));
                const withYear = index === 0 || start.slice(5, 7) === "01";
                return (
                  <g key={start} aria-hidden>
                    <line
                      x1={x}
                      x2={x}
                      y1={plotBottom}
                      y2={plotBottom + 4}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                      className="stroke-border"
                    />
                    <text
                      x={x}
                      y={plotBottom + 18}
                      textAnchor="middle"
                      className="fill-muted-foreground text-xs"
                    >
                      {formatDateOnly(
                        start,
                        locale,
                        withYear ? { month: "short", year: "numeric" } : { month: "short" },
                      )}
                    </text>
                  </g>
                );
              })}

              {/* The plot's own ground, so the whole of it answers the pointer. */}
              <rect
                x={plotLeft}
                y={plotTop}
                width={plotWidth}
                height={plotBottom - plotTop}
                fill="transparent"
              />

              {/* The platform first, so the scope's line is drawn over it. */}
              <g aria-hidden>
                {platformRuns.map((run) =>
                  run.length === 1 ? (
                    <circle
                      key={run[0].index}
                      cx={pointX(run[0].index)}
                      cy={yAt(run[0].share)}
                      r={2.5}
                      className="fill-muted-foreground"
                    />
                  ) : (
                    <polyline
                      key={run[0].index}
                      points={run.map((point) => `${pointX(point.index)},${yAt(point.share)}`).join(" ")}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-muted-foreground"
                    />
                  ),
                )}
                {scopeRuns.map((run) =>
                  run.length === 1 ? (
                    <circle
                      key={run[0].index}
                      cx={pointX(run[0].index)}
                      cy={yAt(run[0].share)}
                      r={4}
                      className="fill-act"
                    />
                  ) : (
                    <polyline
                      key={run[0].index}
                      points={run.map((point) => `${pointX(point.index)},${yAt(point.share)}`).join(" ")}
                      fill="none"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-act"
                    />
                  ),
                )}
              </g>

              {/* The point being read. */}
              {shown !== null && shownPoint !== null && (
                <g aria-hidden className="pointer-events-none">
                  <line
                    x1={pointX(shown)}
                    x2={pointX(shown)}
                    y1={plotTop}
                    y2={plotBottom}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                    className="stroke-muted-foreground"
                  />
                  {shownPoint.positiveShare !== null && (
                    <circle
                      cx={pointX(shown)}
                      cy={yAt(shownPoint.positiveShare)}
                      r={4.5}
                      strokeWidth={2}
                      className="fill-act stroke-card"
                    />
                  )}
                </g>
              )}

              {/* The points, read one at a time from the keyboard. */}
              <g
                tabIndex={0}
                role="slider"
                aria-label={t(unit === "week" ? "timeline.pointWeek" : "timeline.pointMonth")}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, points.length - 1)}
                aria-valuenow={focusedPoint ?? Math.max(0, points.length - 1)}
                aria-valuetext={points.length === 0 ? undefined : describe(focusedPoint ?? points.length - 1)}
                onFocus={() => setFocusedPoint((current) => current ?? Math.max(0, points.length - 1))}
                onBlur={() => setFocusedPoint(null)}
                onKeyDown={onPointsKey}
                className="outline-none"
              >
                <rect
                  x={plotLeft}
                  y={plotTop}
                  width={plotWidth}
                  height={plotBottom - plotTop}
                  fill="none"
                  strokeWidth={2}
                  className={focusedPoint === null ? "stroke-transparent" : "stroke-act"}
                />
              </g>
            </svg>

            {shown !== null && shownPoint !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
                style={{
                  left: Math.min(Math.max(pointX(shown), 80), width - 80),
                  top: plotTop - 6,
                }}
              >
                <p className="text-muted-foreground">
                  {formatDateRange(shownPoint.start, shownPoint.end, locale)}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {shownPoint.positiveShare === null
                    ? t("noAnswers")
                    : t("statements.positive", { share: formatShare(shownPoint.positiveShare, locale) })}
                </p>
                {shownPoint.n > 0 && (
                  <p className="tabular-nums text-muted-foreground">{t("answers", { count: shownPoint.n })}</p>
                )}
                {shownPlatform !== null && (
                  <p className="tabular-nums text-muted-foreground">
                    {t("detail.platform", { share: formatShare(shownPlatform, locale) })}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("timeline.since", {
          date: formatDateOnly(history.from, locale, { day: "numeric", month: "short", year: "numeric" }),
        })}
      </p>
    </div>
  );
}

/** A legend entry keyed by a short stroke of its line, solid act or dashed grey. */
function LegendItem({ label, dashed }: { label: string; dashed: boolean }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <svg width={16} height={4} aria-hidden className="shrink-0">
        <line
          x1={1}
          x2={15}
          y1={2}
          y2={2}
          strokeWidth={dashed ? 1.5 : 2}
          strokeDasharray={dashed ? "3 3" : undefined}
          strokeLinecap="round"
          className={dashed ? "stroke-muted-foreground" : "stroke-act"}
        />
      </svg>
      {label}
    </li>
  );
}
