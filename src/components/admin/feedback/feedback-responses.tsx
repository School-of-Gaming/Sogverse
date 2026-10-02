"use client";

import { Fragment, useEffect, useId, useState } from "react";
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
import { cn, formatDateOnly } from "@/lib/utils";
import type {
  AdminFeedbackResponse,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import {
  feedbackGroupTarget,
  type FeedbackGroupsPerProduct,
  type FeedbackResponses,
} from "./aggregate-feedback";
import { feedbackHref, type FeedbackOrigin } from "./feedback-place";
import { SegmentedButtons } from "./feedback-shell";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";
import { NEGATIVE_UP_TO } from "./feedback-tally";
import {
  useFeedbackStatementLabels,
  useFeedbackStatementShortLabels,
  useRatingWord,
} from "./use-feedback-labels";

/** How many responses are revealed at a time as the reader scrolls. */
const PAGE_SIZE = 20;

/**
 * How far below the last response counts as reached: roughly a screen, so the
 * next twenty are in the document before the reader's eye gets there. Every
 * response is already in memory, so revealing early costs a render and nothing
 * else.
 */
const SENTINEL_ROOT_MARGIN = "800px 0px";

/**
 * The table's columns from `lg`: who, where and when, then a column per
 * statement. Spare width is shared three parts to the who column and one to
 * each statement, so on a wide screen the answers spread across the card
 * instead of bunching at its right edge; on a narrow one each statement keeps
 * its 5.5rem and the who column takes what is left. Below `lg` a row is a
 * single column — the who line over one line per statement — because five
 * answer columns do not fit beside the admin sidebar until then.
 */
const ROW_GRID =
  "grid gap-y-1.5 lg:grid-cols-[minmax(0,3fr)_repeat(5,minmax(5.5rem,1fr))] lg:items-start lg:gap-x-3";

type Show = "worthReading" | "all";

/**
 * **What gamers said** — the responses themselves, a row each, opening on the
 * ones worth reading: a negative answer or a note, the reads most likely to
 * need acting on, in the order the aggregation ranks them. The switch widens
 * it to every response, newest first.
 *
 * The same list on every detail page and across the platform, so an admin
 * reads a group's responses exactly as they read everyone's. It grows as the
 * reader scrolls, twenty at a time.
 */
export function WhatGamersSaid({
  source,
  responses,
  origin,
}: {
  source: FeedbackSource;
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
        <ResponseTable
          source={source}
          responses={list.slice(0, limit)}
          groupsPerProduct={responses.groupsPerProduct}
          origin={origin}
        />
      )}
      {/* Below the table, so a revealed batch lands in the slack beneath the
          list and nothing painted moves. Unmounted once nothing is left. */}
      {more && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </div>
  );
}

function responseKey(response: AdminFeedbackResponse): string {
  return `${response.respondent.id}-${response.groupId}-${response.sessionDate}-${response.submittedAt}`;
}

/**
 * The responses as one table: the statements named once, in a heading row
 * that stays under the site header while the list scrolls, and a row per
 * response beneath it, its note on a full-width row of its own directly under
 * it. Each response's rows are one row group, so the divider falls between
 * responses and never between a row and its note.
 *
 * One DOM at every width. Below `lg` the heading row is hidden and each answer
 * cell names its statement itself, so a phone reads a response as a compact
 * block — who, then a line per statement — and assistive tech, which loses the
 * hidden headings with it, hears the same name the eye reads. The roles are
 * ARIA's rather than `<table>`'s for that reason: a table's own semantics do
 * not reliably survive its cells being laid out as a block.
 *
 * The card clips nothing: the sticky heading row needs every ancestor up to
 * the document to leave overflow alone.
 */
function ResponseTable({
  source,
  responses,
  groupsPerProduct,
  origin,
}: {
  source: FeedbackSource;
  responses: AdminFeedbackResponse[];
  groupsPerProduct: FeedbackGroupsPerProduct;
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.responses");
  const statements = FEEDBACK_CATALOGUES[source];
  const shortLabels = useFeedbackStatementShortLabels(source);

  return (
    <Card role="table" aria-label={t("title")}>
      <div
        role="rowgroup"
        className="sticky top-[var(--header-height)] z-10 hidden rounded-t-lg border-b border-border bg-card lg:block"
      >
        <div role="row" className={cn(ROW_GRID, "items-end px-4 py-2")}>
          <div role="columnheader">
            <span className="sr-only">{t("who")}</span>
          </div>
          {statements.map(({ key }, index) => (
            <StatementHeader
              key={key}
              source={source}
              statementKey={key}
              // The last columns open their sentence leftward, so it stays inside the card.
              alignEnd={index >= statements.length - 2}
            />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {responses.map((response) => (
          <div key={responseKey(response)} role="rowgroup" className="space-y-2 px-4 py-3">
            <div role="row" className={ROW_GRID}>
              <div role="cell" className="min-w-0 pb-1 lg:pb-0">
                <ResponseFacts response={response} groupsPerProduct={groupsPerProduct} origin={origin} />
              </div>
              {statements.map(({ key }) => {
                const value = response.answers[key];
                return (
                  <AnswerCell
                    key={key}
                    label={shortLabels[key] ?? key}
                    rating={SESSION_FEEDBACK_RATINGS.find((level) => level === value)}
                  />
                );
              })}
            </div>
            {response.note.trim() !== "" && (
              <div role="row">
                <div role="cell" aria-colspan={statements.length + 1}>
                  <blockquote className="whitespace-pre-wrap border-l-2 border-world pl-3 text-sm">
                    {response.note}
                  </blockquote>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * A statement's short name as its column heading, with the sentence the gamer
 * read on hover and on keyboard focus, and as the heading's accessible
 * description.
 *
 * The sentence opens from the whole heading cell and sits inside it, flush
 * against the name with its spacing drawn as padding, so the pointer can move
 * onto the sentence without leaving what opened it. Escape hides it while the
 * heading is hovered or focused, without moving either; leaving the heading,
 * or focus leaving it, lets it open again.
 */
function StatementHeader({
  source,
  statementKey,
  alignEnd,
}: {
  source: FeedbackSource;
  statementKey: string;
  alignEnd: boolean;
}) {
  const shortLabels = useFeedbackStatementShortLabels(source);
  const labels = useFeedbackStatementLabels(source);
  const sentenceId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // While the sentence can be showing, Escape hides it wherever focus is: a
  // reader pointing at the heading has not necessarily focused it.
  const engaged = hovered || focused;
  useEffect(() => {
    if (!engaged) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [engaged]);

  return (
    <div
      role="columnheader"
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setDismissed(false);
      }}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        setDismissed(false);
      }}
    >
      <span
        tabIndex={0}
        aria-describedby={sentenceId}
        className="cursor-help rounded-xs text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-act"
      >
        {shortLabels[statementKey] ?? statementKey}
      </span>
      <span
        className={cn(
          "invisible absolute top-full z-20 w-56 pt-1.5",
          !dismissed && "group-hover:visible group-focus-within:visible",
          alignEnd ? "right-0" : "left-0",
        )}
      >
        <span
          id={sentenceId}
          role="tooltip"
          className="block rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-md"
        >
          {labels[statementKey] ?? statementKey}
        </span>
      </span>
    </div>
  );
}

/**
 * One answer, drawn as the gamer's own bar with its word beneath. A negative
 * answer's word takes the warning ink beside its icon, so it stands out without
 * leaning on colour alone; a skipped statement is the empty bar and "Skipped".
 * Below `lg` the cell is a line — the statement's short name, the bar, the word
 * — since there is no heading row above it to name the column.
 */
function AnswerCell({
  label,
  rating,
}: {
  label: string;
  rating: SessionFeedbackRating | undefined;
}) {
  const t = useTranslations("admin.feedback");
  const ratingWord = useRatingWord();
  const word = rating === undefined ? t("skipped") : ratingWord(rating);
  const negative = rating !== undefined && rating <= NEGATIVE_UP_TO;

  return (
    <div
      role="cell"
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 lg:flex lg:flex-col lg:items-start lg:gap-1"
    >
      <span className="text-xs text-muted-foreground lg:hidden">{label}</span>
      <SessionFeedbackMeter level={rating} label={word} />
      {/* The meter already says the word to assistive tech. */}
      <span
        aria-hidden
        className={cn(
          "text-xs",
          negative
            ? "inline-flex items-center gap-1 font-medium text-warning"
            : rating === undefined && "text-muted-foreground",
        )}
      >
        {negative && <TriangleAlert className="h-3.5 w-3.5 shrink-0" />}
        {word}
      </span>
    </div>
  );
}

/**
 * The gamer, where they answered and the date; then, quietly, the Gedus —
 * each a way into its own page. Where they answered is named and linked by
 * `feedbackGroupTarget`: the product alone, or "Product · Group" where the
 * product ran more than one.
 */
function ResponseFacts({
  response,
  groupsPerProduct,
  origin,
}: {
  response: AdminFeedbackResponse;
  groupsPerProduct: FeedbackGroupsPerProduct;
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.responses");
  const locale = useLocale();
  const linkClass = "hover:underline";
  const where = feedbackGroupTarget(response, groupsPerProduct);

  return (
    <div className="space-y-0.5">
      <p className="text-sm">
        <Link
          href={feedbackHref({ view: "detail", scope: { kind: "gamer", id: response.respondent.id }, origin })}
          className={`font-medium ${linkClass}`}
        >
          {response.respondent.name}
        </Link>
        {SCHEDULE_PART_SEPARATOR}
        <Link href={feedbackHref({ view: "detail", scope: where.scope, origin })} className={linkClass}>
          {where.name}
        </Link>
        {SCHEDULE_PART_SEPARATOR}
        <span className="tabular-nums text-muted-foreground">
          {formatDateOnly(response.sessionDate, locale)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
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
      </p>
    </div>
  );
}
