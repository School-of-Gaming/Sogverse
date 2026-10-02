"use client";

import { Fragment, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { SessionFeedbackMeter } from "@/components/voice/feedback/SessionFeedbackMeter";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { useScrollSentinel } from "@/hooks/use-scroll-sentinel";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatDateOnly } from "@/lib/utils";
import type { AdminFeedbackResponse } from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackResponses } from "./aggregate-feedback";
import { feedbackHref, type FeedbackOrigin } from "./feedback-place";
import { SegmentedButtons } from "./feedback-shell";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";
import { NEGATIVE_UP_TO } from "./feedback-tally";
import { useFeedbackStatementLabels, useRatingWord } from "./use-feedback-labels";

/** How many responses are revealed at a time as the reader scrolls. */
const PAGE_SIZE = 20;

/**
 * How far below the last response counts as reached: roughly a screen, so the
 * next twenty are in the document before the reader's eye gets there. Every
 * response is already in memory, so revealing early costs a render and nothing
 * else.
 */
const SENTINEL_ROOT_MARGIN = "800px 0px";

type Show = "worthReading" | "all";

/**
 * **What gamers said** — the responses themselves, one card each, opening on
 * the ones worth reading: a negative answer or a note, the reads most likely to need
 * acting on, in the order the aggregation ranks them. The switch widens it to
 * every response, newest first.
 *
 * The same list on every detail page and across the platform, so an admin
 * reads a group's responses exactly as they read everyone's. It grows as the
 * reader scrolls, twenty at a time.
 */
export function WhatGamersSaid({
  responses,
  origin,
}: {
  responses: FeedbackResponses;
  /** Where the gamer, group, product and Gedu links should lead back to. */
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.responses");
  const [show, setShow] = useState<Show>("worthReading");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const list = show === "worthReading" ? responses.worthReading : responses.all;
  const more = limit < list.length;

  const sentinelRef = useScrollSentinel({
    enabled: more,
    onReach: () => setLimit((current) => current + PAGE_SIZE),
    rootMargin: SENTINEL_ROOT_MARGIN,
  });

  return (
    <div className="space-y-3">
      <SegmentedButtons
        label={t("filterLabel")}
        current={show}
        onChoose={(next) => {
          setShow(next);
          setLimit(PAGE_SIZE);
        }}
        options={[
          { key: "worthReading", label: t("worthReading", { count: responses.worthReading.length }) },
          { key: "all", label: t("all", { count: responses.all.length }) },
        ]}
      />
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {show === "worthReading" ? t("noneWorthReading") : t("none")}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.slice(0, limit).map((response) => (
            <li key={responseKey(response)}>
              <ResponseCard response={response} origin={origin} />
            </li>
          ))}
        </ul>
      )}
      {/* Below every card, so a revealed batch lands in the slack beneath the
          list and nothing painted moves. Unmounted once nothing is left. */}
      {more && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </div>
  );
}

function responseKey(response: AdminFeedbackResponse): string {
  return `${response.respondent.id}-${response.groupId}-${response.sessionDate}-${response.submittedAt}`;
}

/** One response: who and where, each statement's answer as the gamer gave it, and the note. */
function ResponseCard({
  response,
  origin,
}: {
  response: AdminFeedbackResponse;
  origin: FeedbackOrigin;
}) {
  const labels = useFeedbackStatementLabels(response.source);

  return (
    <Card className="space-y-3 p-4">
      <ResponseFacts response={response} origin={origin} />
      <ul className="space-y-1.5">
        {FEEDBACK_CATALOGUES[response.source].map(({ key }) => {
          const value = response.answers[key];
          return (
            <AnswerRow
              key={key}
              statement={labels[key] ?? key}
              rating={SESSION_FEEDBACK_RATINGS.find((level) => level === value)}
            />
          );
        })}
      </ul>
      {response.note.trim() !== "" && (
        <blockquote className="whitespace-pre-wrap border-l-2 border-act pl-3 text-sm">
          {response.note}
        </blockquote>
      )}
    </Card>
  );
}

/**
 * A statement, the answer drawn as the gamer's own bar, and its word. A negative
 * answer's word takes the warning ink beside its icon, so it stands out without
 * leaning on colour alone; a skipped statement is the empty bar and "Skipped".
 */
function AnswerRow({
  statement,
  rating,
}: {
  statement: string;
  rating: SessionFeedbackRating | undefined;
}) {
  const t = useTranslations("admin.feedback");
  const ratingWord = useRatingWord();
  const word = rating === undefined ? t("skipped") : ratingWord(rating);
  const negative = rating !== undefined && rating <= NEGATIVE_UP_TO;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_7rem] items-center gap-x-3 text-sm">
      <span className="min-w-0">{statement}</span>
      <SessionFeedbackMeter level={rating} label={word} />
      {/* The meter already says the word to assistive tech. */}
      <span
        aria-hidden
        className={
          negative
            ? "inline-flex items-center gap-1 font-medium text-warning"
            : rating === undefined
              ? "text-muted-foreground"
              : undefined
        }
      >
        {negative && <TriangleAlert className="h-3.5 w-3.5 shrink-0" />}
        {word}
      </span>
    </li>
  );
}

/** The gamer and the date, then the group, its product and the Gedus — each a way into its own page. */
function ResponseFacts({
  response,
  origin,
}: {
  response: AdminFeedbackResponse;
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.responses");
  const locale = useLocale();
  const linkClass = "hover:underline";

  return (
    <div className="space-y-0.5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <Link
          href={feedbackHref({ view: "detail", scope: { kind: "gamer", id: response.respondent.id }, origin })}
          className={`font-medium ${linkClass}`}
        >
          {response.respondent.name}
        </Link>
        <span className="tabular-nums text-xs text-muted-foreground">
          {formatDateOnly(response.sessionDate, locale)}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
        <span>
          <Link
            href={feedbackHref({ view: "detail", scope: { kind: "group", id: response.groupId }, origin })}
            className={linkClass}
          >
            {response.groupName}
          </Link>
          {SCHEDULE_PART_SEPARATOR}
          <Link
            href={feedbackHref({ view: "detail", scope: { kind: "product", id: response.productId }, origin })}
            className={linkClass}
          >
            {response.productName}
          </Link>
        </span>
        <span>
          {response.gedus.length === 0
            ? t("noGedu")
            : response.gedus.map((gedu, index) => (
                <Fragment key={gedu.id}>
                  {index > 0 && ", "}
                  <Link
                    href={feedbackHref({ view: "detail", scope: { kind: "gedu", id: gedu.id }, origin })}
                    className={linkClass}
                  >
                    {gedu.name}
                  </Link>
                </Fragment>
              ))}
        </span>
      </p>
    </div>
  );
}
