"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { cn, formatDateOnly } from "@/lib/utils";
import type {
  FeedbackBucketUnit,
  FeedbackSparkPoint,
  ShareFigure,
} from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { useFeedbackRange } from "./feedback-nav";
import { useRatingWord } from "./use-feedback-labels";

/**
 * **The marks the feedback pages are drawn with.** One accent: act is the
 * measured series — a sparkline's line, a bar's fill. The platform it is judged
 * against is a grey tick, a track is the lifted grey, and the warning colour
 * appears only beside its icon and words. How much is told by length and by the
 * figure in text, never by hue.
 */

/** The answer levels top to bottom in a breakdown: the hoped-for answers first. */
const BREAKDOWN_ORDER: readonly SessionFeedbackRating[] = [...SESSION_FEEDBACK_RATINGS].reverse();

/** A percentage, or "No answers" when nothing was answered. */
export function ShareText({
  figure,
  className,
}: {
  figure: ShareFigure;
  className?: string;
}) {
  const t = useTranslations("admin.feedback");
  const locale = useLocale();
  return (
    <span className={className}>
      {figure.positiveShare === null
        ? t("noAnswers")
        : formatShare(figure.positiveShare, locale)}
    </span>
  );
}

/**
 * A change in percentage points, with its direction as an arrow and in words.
 * Nothing at all when the two periods cannot be compared.
 */
export function Change({
  points,
  withPeriod = false,
  className,
}: {
  points: number | null;
  /** Adds "vs the previous 90 days". */
  withPeriod?: boolean;
  className?: string;
}) {
  const t = useTranslations("admin.feedback.change");
  const range = useFeedbackRange();
  if (points === null) return null;
  const rounded = Math.round(points);
  const size = Math.abs(rounded);
  const Arrow = rounded > 0 ? ArrowUp : ArrowDown;

  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      {rounded !== 0 && <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="sr-only">
        {rounded === 0
          ? t("none")
          : rounded > 0
            ? t("up", { points: size })
            : t("down", { points: size })}
      </span>
      <span aria-hidden>{rounded === 0 ? t("none") : t("points", { points: size })}</span>
      {withPeriod && <span className="text-muted-foreground">{t(`previous.${range}`)}</span>}
    </span>
  );
}

/** "Below average", or "Below average on: I learned something", with its icon. */
export function BelowAverage({ statement }: { statement: string | null }) {
  const t = useTranslations("admin.feedback");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {statement === null ? t("belowAverage") : t("belowAverageOn", { statement })}
    </span>
  );
}

/**
 * A positive share as a bar on the lifted track, with the platform's share as
 * a grey tick across it. Decorative: the share is always printed beside it.
 */
export function ShareBar({ share, platform }: { share: number; platform: number | null }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-lifted" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-act"
        style={{ width: `${share * 100}%` }}
      />
      {platform !== null && <PlatformTick share={platform} />}
    </div>
  );
}

function PlatformTick({ share }: { share: number }) {
  return (
    <div
      className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
      style={{ left: `${share * 100}%` }}
    />
  );
}

/**
 * **One statement's answers, a row per level**, "Definitely" down to "No": the
 * level's word, a bar in act as long as its share of the answers, and the
 * count. Every level has its row, a zero included, so the five always read in
 * the same place and an empty level says so rather than vanishing. The bars
 * share one scale — the statement's answers — so a long one is a large share,
 * not merely the largest level.
 */
export function AnswerBreakdown({ figure }: { figure: ShareFigure }) {
  const ratingWord = useRatingWord();
  return (
    <dl className="grid max-w-md grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1 text-xs">
      {BREAKDOWN_ORDER.map((rating) => {
        const count = figure.distribution[rating];
        return (
          <Fragment key={rating}>
            <dt className="text-muted-foreground">{ratingWord(rating)}</dt>
            <dd className="h-2 rounded-full bg-lifted" aria-hidden>
              {count > 0 && (
                <div
                  className="h-full rounded-full bg-act"
                  style={{ width: `${(count / figure.answers) * 100}%` }}
                />
              )}
            </dd>
            <dd className="text-right tabular-nums">{count}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

/** The bucket a sparkline point stands for, as a reader names it. */
function bucketName(start: string, unit: FeedbackBucketUnit, locale: string): string {
  return unit === "week"
    ? formatDateOnly(start, locale, { day: "numeric", month: "short" })
    : formatDateOnly(start, locale, { month: "short", year: "numeric" });
}

/** The lowest the vertical scale may start, so a calm line is never blown up into a swing. */
const SPARK_FLOOR_CEILING = 0.6;

/**
 * **The positive share over the period, bucket by bucket**, as a line in act.
 *
 * A bucket nobody answered in is a gap, not a point: the line breaks there
 * rather than drawing a zero. The scale runs to 100% at the top
 * and starts a step below the lowest point — never higher than 60% — so the
 * line has room to move without a two-point wobble filling the box. Each
 * bucket names itself on hover, and the whole series is read out as text.
 */
export function Sparkline({
  series,
  unit,
  width,
  height,
  className,
}: {
  series: FeedbackSparkPoint[];
  unit: FeedbackBucketUnit;
  width: number;
  height: number;
  className?: string;
}) {
  const t = useTranslations("admin.feedback.spark");
  const locale = useLocale();
  const pad = 3;
  const stated = series.flatMap((point) =>
    point.positiveShare === null ? [] : [point.positiveShare],
  );
  const lowest = stated.length === 0 ? 0 : Math.min(...stated);
  const floor = Math.min(SPARK_FLOOR_CEILING, Math.max(0, Math.floor((lowest - 0.05) * 10) / 10));
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const x = (index: number) => (series.length > 1 ? pad + index * step : width / 2);
  const y = (share: number) => pad + (1 - (share - floor) / (1 - floor)) * (height - pad * 2);

  // Runs of consecutive stated points: each run is one stroke.
  const runs: { index: number; share: number }[][] = [];
  let run: { index: number; share: number }[] = [];
  series.forEach((point, index) => {
    if (point.positiveShare === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push({ index, share: point.positiveShare });
    }
  });
  if (run.length > 0) runs.push(run);
  const last = runs.at(-1)?.at(-1);

  const describe = (point: FeedbackSparkPoint) => {
    const name = bucketName(point.start, unit, locale);
    return point.positiveShare === null
      ? t("none", { bucket: name })
      : t("point", { bucket: name, share: formatShare(point.positiveShare, locale) });
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-auto w-full overflow-visible", className)}
      role="img"
      aria-label={t(unit === "week" ? "labelWeek" : "labelMonth", {
        points: series.map(describe).join("; "),
      })}
    >
      {runs.map((points) =>
        points.length === 1 ? (
          <circle
            key={points[0].index}
            cx={x(points[0].index)}
            cy={y(points[0].share)}
            r={1.75}
            className="fill-act"
          />
        ) : (
          <polyline
            key={points[0].index}
            points={points.map((point) => `${x(point.index)},${y(point.share)}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-act"
          />
        ),
      )}
      {last !== undefined && (
        <circle cx={x(last.index)} cy={y(last.share)} r={2.5} className="fill-act" />
      )}
      {series.map((point, index) => (
        <rect
          key={point.start}
          x={x(index) - step / 2}
          y={0}
          width={Math.max(step, 4)}
          height={height}
          fill="transparent"
        >
          <title>{describe(point)}</title>
        </rect>
      ))}
    </svg>
  );
}
