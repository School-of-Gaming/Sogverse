"use client";

import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { SESSION_FEEDBACK_RATINGS } from "@/components/voice/feedback/session-feedback-items";
import type { FeedbackSource } from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackDetailStatement } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { FeedbackHint } from "./feedback-hint";
import { BelowAverage, ShareText } from "./feedback-marks";
import {
  useFeedbackStatementLabels,
  useFeedbackStatementShortLabels,
  useRatingWord,
} from "./use-feedback-labels";

/**
 * **Every statement's answers in one table** — the overview's and every
 * detail page's "By statement". A row per statement in the order they are
 * asked, named by its short name with the sentence a hover or a focus away; a
 * column per answer, No to Definitely, as the meter reads; then the positive
 * share.
 *
 * A statement set against the platform carries the platform's share behind
 * its own and, below it, the warning. One without a comparison — the
 * platform's own, a gamer's — shows its share alone: the table reads only
 * what the row carries.
 *
 * From `lg` it is a real table; below, where the admin sidebar leaves too
 * little width for six columns, each statement folds into a block of its own.
 * The two are never shown together, so assistive tech meets one of them.
 */
export function FeedbackStatementTable({
  source,
  statements,
}: {
  source: FeedbackSource;
  statements: readonly FeedbackDetailStatement[];
}) {
  const t = useTranslations("admin.feedback.statements");
  const tFeedback = useTranslations("admin.feedback");
  const ratingWord = useRatingWord();
  const shortLabels = useFeedbackStatementShortLabels(source);
  const labels = useFeedbackStatementLabels(source);

  const nameOf = (key: string, block: boolean) => (
    <FeedbackHint hint={labels[key] ?? key} block={block} className="text-sm font-medium">
      {shortLabels[key] ?? key}
    </FeedbackHint>
  );

  return (
    <Card>
      <table className="hidden w-full table-fixed border-collapse lg:table">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-border text-left align-bottom text-xs font-medium text-muted-foreground">
            <th scope="col" className="w-28 px-4 py-2 font-medium">
              <span className="sr-only">{t("statement")}</span>
            </th>
            {SESSION_FEEDBACK_RATINGS.map((rating) => (
              <th key={rating} scope="col" className="w-20 px-2 py-2 font-medium">
                {ratingWord(rating)}
              </th>
            ))}
            <th scope="col" className="px-4 py-2 font-medium">
              <FeedbackHint hint={tFeedback("hero.definition")} alignEnd>
                {tFeedback("rows.positive")}
              </FeedbackHint>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {statements.map((line) => (
            <tr key={line.key} className="align-top">
              <th scope="row" className="px-4 py-2.5 text-left font-normal">
                {nameOf(line.key, true)}
              </th>
              {SESSION_FEEDBACK_RATINGS.map((rating) => (
                <td key={rating} className="px-2 py-2.5">
                  <AnswerCount count={line.figure.distribution[rating]} answers={line.figure.answers} />
                </td>
              ))}
              <td className="px-4 py-2.5">
                <PositiveShare line={line} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-border lg:hidden">
        {statements.map((line) => (
          <li key={line.key} className="space-y-2 px-4 py-3">
            {nameOf(line.key, false)}
            <dl className="grid max-w-xs grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-xs">
              {SESSION_FEEDBACK_RATINGS.map((rating) => (
                <Fragment key={rating}>
                  <dt className="text-muted-foreground">{ratingWord(rating)}</dt>
                  <dd className="text-right tabular-nums">{line.figure.distribution[rating]}</dd>
                </Fragment>
              ))}
            </dl>
            <PositiveShare line={line} stated />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One answer's count, with a thin act rule beneath it as long as its share of
 * the statement's answers, so the five read as a distribution across the row
 * and a long rule is a large share, not merely the largest level. Act stays
 * at its full value — a brand colour is never tinted — so the emphasis is kept
 * low by drawing it thin rather than faint. A zero is the figure and no rule.
 */
function AnswerCount({ count, answers }: { count: number; answers: number }) {
  return (
    <span className="relative block pb-1.5 text-sm tabular-nums">
      {count}
      {count > 0 && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 rounded-full bg-act"
          style={{ width: `${(count / answers) * 100}%` }}
        />
      )}
    </span>
  );
}

/**
 * The statement's positive share and, where it is set against the platform,
 * the platform's share behind it and the warning beneath. The platform's share
 * is also always in the text, for a reader who cannot hover. `stated` writes
 * the share as a phrase, "83% positive", for the folded block, which has no
 * column heading to name it.
 */
function PositiveShare({ line, stated = false }: { line: FeedbackDetailStatement; stated?: boolean }) {
  const t = useTranslations("admin.feedback.statements");
  const tDetail = useTranslations("admin.feedback.detail");
  const locale = useLocale();
  const { figure, againstPlatform: comparison } = line;

  if (figure.positiveShare === null) {
    return <ShareText figure={figure} className="text-sm text-muted-foreground" />;
  }
  const share = formatShare(figure.positiveShare, locale);
  const text = stated ? t("positive", { share }) : share;
  const platformShare = comparison?.platform.positiveShare ?? null;
  const platform =
    platformShare === null ? null : tDetail("platform", { share: formatShare(platformShare, locale) });

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {platform === null || stated ? (
        <span className="text-sm font-semibold tabular-nums">{text}</span>
      ) : (
        <>
          <FeedbackHint hint={platform} className="text-sm font-semibold tabular-nums">
            {text}
          </FeedbackHint>
          <span className="sr-only">{platform}</span>
        </>
      )}
      {platform !== null && stated && (
        <span className="text-xs tabular-nums text-muted-foreground">{platform}</span>
      )}
      {comparison?.belowPlatform === true && <BelowAverage statement={null} />}
    </div>
  );
}
