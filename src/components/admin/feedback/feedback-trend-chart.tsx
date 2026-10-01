"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SessionFeedbackTheme } from "@/components/voice/feedback/session-feedback-items";
import { formatDayMonth } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";
import {
  LOW_N,
  positiveShare,
  type FeedbackView,
  type RatingTally,
  type WeekFigures,
} from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { useThemeLabel } from "./use-feedback-labels";

/**
 * **The trend** — each theme's weekly share of positive answers, one small
 * chart per theme, over the responses per week as quiet bars.
 *
 * Small multiples rather than four lines on one plot: four series would need
 * four categorical hues, and every hue the palette has already means something
 * (a Yty element, a status, a person's own pick) that a theme is not. One line
 * per panel in act, one shared 0–100% scale, and the panels read side by side.
 * The responses are their own chart beneath rather than a second axis, because
 * a count and a share have no common scale.
 *
 * A week resting on fewer than `LOW_N` answers draws a hollow point: it is
 * shown, because hiding it would hide that the week happened, but it does not
 * claim the confidence a filled point does. A week with no answers draws no
 * point and breaks the line, so a summer break reads as a gap rather than as a
 * straight line across it.
 *
 * Pointing at a week, in any panel, picks that week in all of them: each
 * panel's figure turns to that week's, and the line under the bars names it.
 * The same numbers are a table one press away, for a reader who cannot point.
 */
export function FeedbackTrendChart({ view }: { view: FeedbackView }) {
  const t = useTranslations("admin.feedback.trend");
  const locale = useLocale();
  const themeLabel = useThemeLabel();
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { weeks } = view;
  const hoveredWeek = hovered === null ? null : weeks[hovered];

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t("heading")}</h2>
          <p className="text-xs text-muted-foreground">{t("description", { min: LOW_N })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowTable((shown) => !shown)}>
          {showTable ? t("hideTable") : t("showTable")}
        </Button>
      </div>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {view.themes.map((theme) => (
          <ThemePanel
            key={theme}
            label={themeLabel(theme)}
            weeks={weeks}
            theme={theme}
            overall={view.totals.themes[theme]}
            hovered={hovered}
            onHover={setHovered}
          />
        ))}
      </div>

      <ResponsesBars weeks={weeks} hovered={hovered} onHover={setHovered} />

      <p className="text-xs tabular-nums text-muted-foreground">
        {hoveredWeek === null
          ? t("span", {
              from: formatDayMonth(weeks[0].weekStart, locale),
              to: formatDayMonth(weeks[weeks.length - 1].weekStart, locale),
            })
          : t("weekResponses", {
              date: formatDayMonth(hoveredWeek.weekStart, locale),
              count: hoveredWeek.responses,
            })}
      </p>

      {showTable && <TrendTable view={view} />}
    </Card>
  );
}

/** The plot's left gutter, shared by every panel and the bars so weeks align. */
const AXIS_GUTTER = "w-9 shrink-0";

/** A week's horizontal centre, as a percentage of the plot's width. */
function weekX(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

function ThemePanel({
  label,
  theme,
  weeks,
  overall,
  hovered,
  onHover,
}: {
  label: string;
  theme: SessionFeedbackTheme;
  weeks: WeekFigures[];
  overall: RatingTally;
  hovered: number | null;
  onHover: (index: number | null) => void;
}) {
  const t = useTranslations("admin.feedback.trend");
  const locale = useLocale();
  const shown = hovered === null ? overall : weeks[hovered].themes[theme];
  const points = weeks.map((week, index) => {
    const tally = week.themes[theme];
    const share = positiveShare(tally);
    return share === null
      ? null
      : { x: weekX(index, weeks.length), y: 100 - share * 100, low: tally.n < LOW_N };
  });

  // One subpath per unbroken run of answered weeks.
  let path = "";
  let drawing = false;
  for (const point of points) {
    if (point === null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${point.x} ${point.y} `;
    drawing = true;
  }

  const summary = weeks
    .map((week) => {
      const tally = week.themes[theme];
      return `${formatDayMonth(week.weekStart, locale)} ${formatShare(positiveShare(tally), locale)} (${tally.n})`;
    })
    .join(", ");

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-medium">{label}</h3>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <span className="text-sm font-semibold text-foreground">
            {formatShare(positiveShare(shown), locale)}
          </span>{" "}
          {t("answers", { count: shown.n })}
        </p>
      </div>
      <div className="flex">
        <div className={cn(AXIS_GUTTER, "relative text-xs tabular-nums text-muted-foreground")} aria-hidden>
          <span className="absolute right-2 top-0 -translate-y-1/2">{formatShare(1, locale)}</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{formatShare(0.5, locale)}</span>
          <span className="absolute bottom-0 right-2 translate-y-1/2">{formatShare(0, locale)}</span>
        </div>
        <div
          role="img"
          aria-label={t("panelLabel", { theme: label, summary })}
          className="relative h-28 flex-1"
        >
          <div className="absolute inset-x-0 top-0 border-t border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          {hovered !== null && (
            <div
              className="absolute inset-y-0 w-px bg-border"
              style={{ left: `${weekX(hovered, weeks.length)}%` }}
            />
          )}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            <path
              d={path}
              fill="none"
              className="stroke-act"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((point, index) =>
            point === null ? null : (
              <span
                key={weeks[index].weekStart}
                className={cn(
                  "absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  point.low ? "border-2 border-act bg-card" : "bg-act",
                  hovered === index && "h-3 w-3",
                )}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ),
          )}
          <HoverColumns count={weeks.length} onHover={onHover} />
        </div>
      </div>
    </div>
  );
}

/**
 * One invisible column per week across the whole plot: the target is the
 * week, not the point, so a hollow eight-pixel dot needs no aim.
 */
function HoverColumns({
  count,
  onHover,
}: {
  count: number;
  onHover: (index: number | null) => void;
}) {
  return (
    <div className="absolute inset-0 flex" onMouseLeave={() => onHover(null)} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-full flex-1" onMouseEnter={() => onHover(index)} />
      ))}
    </div>
  );
}

function ResponsesBars({
  weeks,
  hovered,
  onHover,
}: {
  weeks: WeekFigures[];
  hovered: number | null;
  onHover: (index: number | null) => void;
}) {
  const t = useTranslations("admin.feedback.trend");
  const locale = useLocale();
  const max = Math.max(1, ...weeks.map((week) => week.responses));

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{t("responsesHeading")}</h3>
      <div className="flex">
        <div className={cn(AXIS_GUTTER, "relative text-xs tabular-nums text-muted-foreground")} aria-hidden>
          <span className="absolute right-2 top-0 -translate-y-1/2">{max.toLocaleString(locale)}</span>
          <span className="absolute bottom-0 right-2 translate-y-1/2">{(0).toLocaleString(locale)}</span>
        </div>
        <div
          role="img"
          aria-label={t("responsesLabel", {
            summary: weeks
              .map((week) => `${formatDayMonth(week.weekStart, locale)} ${week.responses}`)
              .join(", "),
          })}
          className="relative flex h-16 flex-1 items-end gap-px border-b border-border"
        >
          {weeks.map((week, index) => (
            <div
              key={week.weekStart}
              className={cn(
                "flex-1 rounded-t-sm",
                hovered === index ? "bg-foreground" : "bg-muted-foreground",
              )}
              style={{ height: `${(week.responses / max) * 100}%` }}
            />
          ))}
          <HoverColumns count={weeks.length} onHover={onHover} />
        </div>
      </div>
    </div>
  );
}

/** The chart's numbers as a table, week by week. */
function TrendTable({ view }: { view: FeedbackView }) {
  const t = useTranslations("admin.feedback.trend");
  const locale = useLocale();
  const themeLabel = useThemeLabel();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-3 font-medium">{t("week")}</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">{t("responses")}</th>
            {view.themes.map((theme) => (
              <th key={theme} scope="col" className="py-1.5 pr-3 text-right font-medium">
                {themeLabel(theme)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {view.weeks.map((week) => (
            <tr key={week.weekStart}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {formatDayMonth(week.weekStart, locale)}
              </th>
              <td className="py-1.5 pr-3 text-right">{week.responses}</td>
              {view.themes.map((theme) => {
                const tally = week.themes[theme];
                return (
                  <td
                    key={theme}
                    className={cn("py-1.5 pr-3 text-right", tally.n < LOW_N && "text-muted-foreground")}
                  >
                    {formatShare(positiveShare(tally), locale)}{" "}
                    <span className="text-muted-foreground">({tally.n})</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
