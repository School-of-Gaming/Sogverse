"use client";

import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { cn, formatDateOnly } from "@/lib/utils";
import type { AdminFeedbackResponse } from "@/services/session-feedback/admin-feedback.contracts";
import type {
  FeedbackBucketUnit,
  FeedbackSparkPoint,
  ShareFigure,
} from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";
import { useFeedbackRange } from "./feedback-nav";
import { useFeedbackStatementLabels, useRatingWord } from "./use-feedback-labels";

/**
 * **The marks the feedback pages are drawn with.** One accent: act is the
 * measured series — a sparkline's line, a bar's fill, the two positive levels
 * of an answer. The platform it is judged against is a grey tick, a track is
 * the lifted grey, and the warning colour appears only beside its icon and
 * words. How much is told by length and by the figure in text, never by hue.
 */

/** The answer levels left to right in a spread: the hoped-for answers first. */
const SPREAD_ORDER: readonly SessionFeedbackRating[] = [...SESSION_FEEDBACK_RATINGS].reverse();

/**
 * How each answer level is drawn. Act for the two positive levels — filled for
 * "Definitely", edged for "Yes" — and greys stepping down through the rest,
 * with "A bit" as the quiet middle. The legend names every step, so no level is
 * told apart by colour alone.
 */
export const RATING_SWATCH: Record<SessionFeedbackRating, string> = {
  5: "bg-act",
  4: "border-2 border-act",
  3: "bg-lifted",
  2: "border-2 border-muted-foreground",
  1: "bg-muted-foreground",
};

/** A percentage, or "Too few answers (n)" when the sample is too small to state one. */
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
      {figure.tooFew
        ? t("tooFew", { count: figure.n })
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
 * One statement's answers as a 100% bar, "Definitely" first, with the
 * platform's positive share as a tick — it lines up with where this scope's
 * own positive answers end.
 */
export function AnswerSpreadBar({
  figure,
  platform,
}: {
  figure: ShareFigure;
  platform: number | null;
}) {
  const ratingWord = useRatingWord();
  const locale = useLocale();
  const total = figure.answers;
  let start = 0;
  // Too few answers to state a share: the counts alone, never a percentage.
  const levelText = (rating: SessionFeedbackRating) => {
    const count = figure.distribution[rating];
    return figure.tooFew || total === 0
      ? `${ratingWord(rating)}: ${count}`
      : `${ratingWord(rating)}: ${formatShare(count / total, locale)} (${count})`;
  };

  return (
    <div className="relative h-3 w-full">
      {total === 0 ? (
        <div className="absolute inset-0 rounded-sm bg-lifted" />
      ) : (
        SPREAD_ORDER.map((rating) => {
          const count = figure.distribution[rating];
          const left = start;
          start += count / total;
          if (count === 0) return null;
          return (
            <div
              key={rating}
              className="absolute inset-y-0 px-px"
              style={{ left: `${left * 100}%`, width: `${(count / total) * 100}%` }}
              title={levelText(rating)}
            >
              <div className={cn("h-full w-full rounded-sm", RATING_SWATCH[rating])} />
            </div>
          );
        })
      )}
      {platform !== null && <PlatformTick share={platform} />}
      <p className="sr-only">
        {SPREAD_ORDER.map(levelText).join(", ")}
      </p>
    </div>
  );
}

/** The five answer words with the swatch each is drawn in. */
export function AnswerLegend({ withPlatform = false }: { withPlatform?: boolean }) {
  const t = useTranslations("admin.feedback");
  const ratingWord = useRatingWord();
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {SPREAD_ORDER.map((rating) => (
        <li key={rating} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm", RATING_SWATCH[rating])} aria-hidden />
          {ratingWord(rating)}
        </li>
      ))}
      {withPlatform && (
        <li className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-0.5 rounded-full bg-muted-foreground" aria-hidden />
          {t("platformMark")}
        </li>
      )}
    </ul>
  );
}

/**
 * One response's answers, small: a swatch per statement in the order asked,
 * each naming its statement and answer on hover and to a screen reader.
 */
export function ResponseMarks({ response }: { response: AdminFeedbackResponse }) {
  const t = useTranslations("admin.feedback");
  const labels = useFeedbackStatementLabels(response.source);
  const ratingWord = useRatingWord();

  return (
    <ul className="flex items-center gap-1">
      {FEEDBACK_CATALOGUES[response.source].map(({ key }) => {
        const value = response.answers[key];
        const rating = SESSION_FEEDBACK_RATINGS.find((level) => level === value);
        const text = `${labels[key] ?? key}: ${rating === undefined ? t("skipped") : ratingWord(rating)}`;
        return (
          <li key={key} title={text}>
            <span
              className={cn(
                "block h-3.5 w-3.5 rounded-sm",
                rating === undefined ? "border border-dashed border-border" : RATING_SWATCH[rating],
              )}
              aria-hidden
            />
            <span className="sr-only">{text}</span>
          </li>
        );
      })}
    </ul>
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
 * A bucket with too few answers is a gap, not a point: the line breaks rather
 * than drawing one child's mood as a trend. The scale runs to 100% at the top
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
    point.sparse || point.positiveShare === null ? [] : [point.positiveShare],
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
    if (point.sparse || point.positiveShare === null) {
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
    return point.sparse || point.positiveShare === null
      ? t("tooFew", { bucket: name, count: point.n })
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
