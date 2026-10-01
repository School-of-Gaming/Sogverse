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
import { addCalendarDays, addCalendarMonths } from "@/lib/calendar-date";
import { formatDateOnly, formatDateRange } from "@/lib/utils";
import type { FeedbackTimeline as Timeline, FeedbackTimelinePoint } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { useFeedbackSelection } from "./feedback-nav";
import {
  clampSelection,
  dayIndex,
  moveSelection,
  stepSelectionEdge,
} from "./feedback-selection";
import { periodDays, type FeedbackPeriod } from "./feedback-tally";

/**
 * **The whole history of how positive gamers are, with the period being read
 * selected on it.** The line is the positive share bucket by bucket, in act,
 * over a labelled 0–100% scale with faint gridlines and the months along the
 * bottom; a bucket nobody answered in is a gap, never a zero. A detail page
 * set against the platform draws the platform's line beside it as a dashed
 * grey, named in a legend.
 *
 * The selection is picked on the chart itself rather than from preset spans:
 * drag across it for a new period, drag either handle to resize it, or drag
 * the selected stretch to slide it. It snaps to whole days, stays inside the
 * history and is never shorter than one bucket; what lies outside it is
 * dimmed under the scrim. Each handle is a slider a keyboard can move, a
 * bucket per arrow and four with shift, and the dates selected are written
 * out under the chart. Everything on the page follows the selection while it
 * is dragged; the URL takes it when the drag ends.
 *
 * The chart's height is fixed and the canvas is drawn at the width it is
 * given, so text stays its own size at any width and nothing beneath it moves
 * when the selection does. Until the box is measured it stays empty at that
 * height: a chart drawn at a guessed width would shift every label, point and
 * handle sideways once the real width arrived.
 */

const HEIGHT = 208;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 44 };
/** The scale's labelled steps; the 0 line is the baseline, the rest gridlines. */
const GRID = [0, 0.25, 0.5, 0.75, 1];
/** How far a press must travel to become a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** Buckets a handle moves for shift+arrow or Page Up/Down. */
const LARGE_STEP = 4;
/** How far a handle's grab area reaches out from its 2px line, so a thumb can find it. */
const HANDLE_REACH_PX = 12;
/** The closest two month labels may sit. */
const MIN_TICK_GAP_PX = 64;
const AVERAGE_MONTH_DAYS = 30.44;

type Drag =
  | { kind: "new"; anchor: number }
  | { kind: "from" | "to" }
  | { kind: "move"; anchor: number };

interface DragState {
  drag: Drag;
  startX: number;
  moved: boolean;
  /** The selection when the press began: what a cancelled drag returns to. */
  before: FeedbackPeriod;
  latest: FeedbackPeriod;
}

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
  const { history, minDays, unit, selection, preview, commit } = useFeedbackSelection();
  const { points, platform } = timeline;

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useWidth(boxRef);

  const dragRef = useRef<DragState | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<number | null>(null);
  const [focusedEdge, setFocusedEdge] = useState<"from" | "to" | null>(null);

  const days = periodDays(history);
  const plotLeft = MARGIN.left;
  const plotRight = Math.max(plotLeft + 1, width - MARGIN.right);
  const plotWidth = plotRight - plotLeft;
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotMiddle = (plotTop + plotBottom) / 2;

  /** The left edge of a day; `days` is the right edge of the last one. */
  const xAt = (day: number) => plotLeft + (day / days) * plotWidth;
  const yAt = (share: number) => plotBottom - share * (plotBottom - plotTop);
  const dateAt = (day: number) => addCalendarDays(history.from, day);

  // A point sits over the middle of the days its bucket holds.
  const centres = useMemo(
    () =>
      points.map(
        (point) => (dayIndex(point.start, history.from) + dayIndex(point.end, history.from) + 1) / 2,
      ),
    [points, history.from],
  );
  const pointX = (index: number) => xAt(centres[index]);

  const selectedFrom = dayIndex(selection.from, history.from);
  const selectedTo = dayIndex(selection.to, history.from);
  const selectionLeft = xAt(selectedFrom);
  const selectionRight = xAt(selectedTo + 1);
  // A handle reaches into the selection at most a quarter of its width, so the
  // middle half stays the selection's own to slide however short it is.
  const handleInnerReach = Math.min(HANDLE_REACH_PX, (selectionRight - selectionLeft) / 4);

  const ticks = useMemo(() => {
    const monthWidth = (plotWidth * AVERAGE_MONTH_DAYS) / days;
    const every = [1, 2, 3, 6, 12].find((step) => step * monthWidth >= MIN_TICK_GAP_PX) ?? 12;
    return monthStarts(history).filter((start) => (Number(start.slice(5, 7)) - 1) % every === 0);
  }, [history, plotWidth, days]);

  /** The day under a pointer, inside the history. */
  const dayUnder = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    const x = ((clientX - rect.left) * width) / rect.width;
    return Math.min(Math.max(Math.floor(((x - plotLeft) / plotWidth) * days), 0), days - 1);
  };

  /** The point nearest a pointer, so the reader aims at a date, never at a 2px line. */
  const pointUnder = (clientX: number): number | null => {
    if (points.length === 0) return null;
    const day = dayUnder(clientX) + 0.5;
    let nearest = 0;
    centres.forEach((centre, index) => {
      if (Math.abs(centre - day) < Math.abs(centres[nearest] - day)) nearest = index;
    });
    return nearest;
  };

  const selectionFor = (state: DragState, day: number): FeedbackPeriod => {
    const { drag, before } = state;
    switch (drag.kind) {
      case "new":
        return clampSelection(
          { from: dateAt(Math.min(drag.anchor, day)), to: dateAt(Math.max(drag.anchor, day)) },
          history,
          minDays,
        );
      case "from": {
        const latest = dayIndex(before.to, history.from) - minDays + 1;
        return clampSelection({ from: dateAt(Math.min(day, latest)), to: before.to }, history, minDays);
      }
      case "to": {
        const earliest = dayIndex(before.from, history.from) + minDays - 1;
        return clampSelection({ from: before.from, to: dateAt(Math.max(day, earliest)) }, history, minDays);
      }
      case "move":
        return moveSelection(before, day - drag.anchor, history);
    }
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const day = dayUnder(event.clientX);
    const edge =
      event.target instanceof Element
        ? event.target.closest("[data-edge]")?.getAttribute("data-edge")
        : undefined;
    const drag: Drag =
      edge === "from" || edge === "to"
        ? { kind: edge }
        : day >= selectedFrom && day <= selectedTo
          ? { kind: "move", anchor: day }
          : { kind: "new", anchor: day };
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { drag, startX: event.clientX, moved: false, before: selection, latest: selection };
    setHovered(null);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const state = dragRef.current;
    if (state === null) {
      if (event.pointerType !== "touch") setHovered(pointUnder(event.clientX));
      return;
    }
    if (!state.moved && Math.abs(event.clientX - state.startX) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    state.latest = selectionFor(state, dayUnder(event.clientX));
    preview(state.latest);
  };

  const onPointerUp = () => {
    const state = dragRef.current;
    dragRef.current = null;
    if (state?.moved === true) commit(state.latest);
  };

  // The browser took the gesture (a vertical scroll on a phone): undo the drag.
  const onPointerCancel = () => {
    const state = dragRef.current;
    dragRef.current = null;
    if (state?.moved === true) commit(state.before);
  };

  const onEdgeKey = (edge: "from" | "to") => (event: KeyboardEvent<SVGGElement>) => {
    const large = event.shiftKey ? LARGE_STEP : 1;
    let next: FeedbackPeriod;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = stepSelectionEdge(selection, edge, -large, unit, history);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = stepSelectionEdge(selection, edge, large, unit, history);
        break;
      case "PageDown":
        next = stepSelectionEdge(selection, edge, -LARGE_STEP, unit, history);
        break;
      case "PageUp":
        next = stepSelectionEdge(selection, edge, LARGE_STEP, unit, history);
        break;
      case "Home":
        next = edge === "from"
          ? { from: history.from, to: selection.to }
          : clampSelection({ from: selection.from, to: selection.from }, history, minDays);
        break;
      case "End":
        next = edge === "to"
          ? { from: selection.from, to: history.to }
          : { from: addCalendarDays(selection.to, 1 - minDays), to: selection.to };
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(clampSelection(next, history, minDays));
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

  const dateLabel = (date: string) =>
    formatDateOnly(date, locale, { day: "numeric", month: "short", year: "numeric" });

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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {platform !== null ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <LegendItem label={scopeLabel ?? ""} dashed={false} />
            <LegendItem label={t("timeline.platform")} dashed />
          </ul>
        ) : (
          <span />
        )}
        <span>{t("timeline.hint")}</span>
      </div>

      <div ref={boxRef} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              className="block h-full w-full touch-pan-y select-none overflow-visible"
              role="group"
              aria-label={t(unit === "week" ? "timeline.byWeek" : "timeline.byMonth")}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
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
                className="cursor-crosshair"
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

              {/* Outside the selection, dimmed. */}
              <g aria-hidden className="pointer-events-none">
                <rect
                  x={plotLeft}
                  y={plotTop}
                  width={Math.max(0, selectionLeft - plotLeft)}
                  height={plotBottom - plotTop}
                  className="fill-scrim"
                />
                <rect
                  x={selectionRight}
                  y={plotTop}
                  width={Math.max(0, plotRight - selectionRight)}
                  height={plotBottom - plotTop}
                  className="fill-scrim"
                />
              </g>

              {/* The selection itself: grabbed to slide it. */}
              <rect
                x={selectionLeft}
                y={plotTop}
                width={Math.max(0, selectionRight - selectionLeft)}
                height={plotBottom - plotTop}
                fill="transparent"
                className="cursor-grab active:cursor-grabbing"
              />

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

              <Handle
                edge="from"
                x={selectionLeft}
                top={plotTop}
                bottom={plotBottom}
                middle={plotMiddle}
                innerReach={handleInnerReach}
                label={t("timeline.start")}
                valueText={dateLabel(selection.from)}
                min={0}
                max={days - 1}
                now={selectedFrom}
                focused={focusedEdge === "from"}
                onFocusChange={(focused) => setFocusedEdge(focused ? "from" : null)}
                onKeyDown={onEdgeKey("from")}
              />
              <Handle
                edge="to"
                x={selectionRight}
                top={plotTop}
                bottom={plotBottom}
                middle={plotMiddle}
                innerReach={handleInnerReach}
                label={t("timeline.end")}
                valueText={dateLabel(selection.to)}
                min={0}
                max={days - 1}
                now={selectedTo}
                focused={focusedEdge === "to"}
                onFocusChange={(focused) => setFocusedEdge(focused ? "to" : null)}
                onKeyDown={onEdgeKey("to")}
              />
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

      <p className="text-sm tabular-nums">
        {t("timeline.selection", {
          range: formatDateRange(selection.from, selection.to, locale),
          days: periodDays(selection),
        })}
      </p>
    </div>
  );
}

/** One end of the selection: a line the height of the plot with a grip, and a slider to a keyboard. */
function Handle({
  edge,
  x,
  top,
  bottom,
  middle,
  innerReach,
  label,
  valueText,
  min,
  max,
  now,
  focused,
  onFocusChange,
  onKeyDown,
}: {
  edge: "from" | "to";
  x: number;
  top: number;
  bottom: number;
  middle: number;
  /** How far the grab area reaches into the selection; outward it always reaches the full 12px. */
  innerReach: number;
  label: string;
  valueText: string;
  min: number;
  max: number;
  now: number;
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
}) {
  return (
    <g
      data-edge={edge}
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={valueText}
      // The ring is for a keyboard: a handle pressed to drag it is focused too, and shows none.
      onFocus={(event) => onFocusChange(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(event) => {
        onFocusChange(true);
        onKeyDown(event);
      }}
      className="cursor-ew-resize outline-none"
    >
      <rect
        x={edge === "from" ? x - HANDLE_REACH_PX : x - innerReach}
        y={top}
        width={HANDLE_REACH_PX + innerReach}
        height={bottom - top}
        fill="transparent"
      />
      <line x1={x} x2={x} y1={top} y2={bottom} strokeWidth={2} className="stroke-foreground" />
      <rect x={x - 4} y={middle - 12} width={8} height={24} rx={3} className="fill-foreground" />
      {focused && (
        <rect
          x={x - 7}
          y={middle - 15}
          width={14}
          height={30}
          rx={5}
          fill="none"
          strokeWidth={2}
          className="stroke-act"
        />
      )}
    </g>
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
