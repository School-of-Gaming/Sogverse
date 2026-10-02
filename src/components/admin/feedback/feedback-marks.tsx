"use client";

import { Fragment } from "react";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import type { ShareFigure } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { useRatingWord } from "./use-feedback-labels";

/**
 * **The marks the feedback pages are drawn with.** One accent: act is the
 * measured series — the timeline's line, a bar's fill. The platform it is judged
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
