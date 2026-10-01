"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { cn } from "@/lib/utils";
import { positiveShare, type FeedbackView, type StatementFigures } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { useFeedbackStatementLabels, useRatingWord, useThemeLabel } from "./use-feedback-labels";

/**
 * How each level of the answer bar is drawn in a distribution.
 *
 * Diverging on one accent and the neutrals, because a page that already spends
 * act spends nothing else without a reason: the two positive levels are act —
 * filled for "Definitely", edged for "Yes" — and the rest step down through the
 * greys, with "A bit" as the quiet middle. Warm reads as the answer we hope
 * for and grey as everything short of it, and the legend names every step, so
 * no level is told apart by colour alone.
 */
export const RATING_SWATCH: Record<SessionFeedbackRating, string> = {
  5: "bg-act",
  4: "border-2 border-act",
  3: "bg-lifted",
  2: "border-2 border-muted-foreground",
  1: "bg-muted-foreground",
};

/**
 * **The statements** — each one's answers across the five levels, in the
 * order the respondent was asked them, with its positive share and how many
 * answered it.
 */
export function FeedbackStatementBreakdown({ view }: { view: FeedbackView }) {
  const t = useTranslations("admin.feedback.statements");
  const ratingWord = useRatingWord();
  const labels = useFeedbackStatementLabels(view.source);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {SESSION_FEEDBACK_RATINGS.map((rating) => (
            <li key={rating} className="inline-flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-sm", RATING_SWATCH[rating])} aria-hidden />
              {ratingWord(rating)}
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-4">
        {view.statements.map((statement) => (
          <StatementRow
            key={statement.key}
            statement={statement}
            label={labels[statement.key] ?? statement.key}
          />
        ))}
      </ul>
    </Card>
  );
}

function StatementRow({ statement, label }: { statement: StatementFigures; label: string }) {
  const t = useTranslations("admin.feedback.statements");
  const locale = useLocale();
  const ratingWord = useRatingWord();
  const themeLabel = useThemeLabel();
  const [hovered, setHovered] = useState<SessionFeedbackRating | null>(null);
  const { tally } = statement;
  const shareOf = (rating: SessionFeedbackRating) =>
    tally.n === 0 ? null : tally.counts[rating] / tally.n;

  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-sm">
          {label} <span className="text-xs text-muted-foreground">{themeLabel(statement.theme)}</span>
        </p>
        {/* The figure turns to the level under the pointer, in the one slot,
            so pointing at a segment moves nothing around it. */}
        <p className="text-xs tabular-nums text-muted-foreground">
          {hovered === null
            ? t("positiveDetail", {
                share: formatShare(positiveShare(tally), locale),
                count: tally.n,
              })
            : t("levelDetail", {
                level: ratingWord(hovered),
                share: formatShare(shareOf(hovered), locale),
                count: tally.counts[hovered],
              })}
        </p>
      </div>
      <div className="flex h-3 gap-0.5" onMouseLeave={() => setHovered(null)}>
        {SESSION_FEEDBACK_RATINGS.map((rating) =>
          tally.counts[rating] === 0 ? null : (
            <span
              key={rating}
              className={cn("rounded-sm", RATING_SWATCH[rating])}
              style={{ flexGrow: tally.counts[rating], flexBasis: 0 }}
              onMouseEnter={() => setHovered(rating)}
            />
          ),
        )}
      </div>
      <p className="sr-only">
        {SESSION_FEEDBACK_RATINGS.map((rating) =>
          t("levelDetail", {
            level: ratingWord(rating),
            share: formatShare(shareOf(rating), locale),
            count: tally.counts[rating],
          }),
        ).join(", ")}
      </p>
    </li>
  );
}
