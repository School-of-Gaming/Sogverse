"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn, formatDateOnly } from "@/lib/utils";
import type { AdminFeedbackResponse } from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackView } from "./aggregate-feedback";
import type { FeedbackEntityHrefs } from "./feedback-breakdown-table";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";
import { useFeedbackStatementLabels, useRatingWord } from "./use-feedback-labels";

/** How many responses the list shows before it is asked for more. */
const PAGE_SIZE = 20;

/**
 * **The responses themselves**, newest session first, for the slice on show.
 *
 * The notes are the page's qualitative signal and the one most likely to need
 * acting on — a child saying nobody listens to them is a safeguarding read
 * before it is a satisfaction one — so a note is printed whole, never clipped,
 * and the list can be narrowed to only the responses carrying one.
 */
export function FeedbackResponsesList({
  view,
  hrefs,
}: {
  view: FeedbackView;
  hrefs: FeedbackEntityHrefs;
}) {
  const t = useTranslations("admin.feedback.responses");
  const toggleId = useId();
  const [onlyNotes, setOnlyNotes] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const shown = useMemo(
    () =>
      onlyNotes
        ? view.responses.filter((response) => response.note.trim() !== "")
        : view.responses,
    [view.responses, onlyNotes],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <label htmlFor={toggleId} className="inline-flex items-center gap-2 text-sm">
          <Checkbox
            id={toggleId}
            checked={onlyNotes}
            onChange={(event) => {
              setOnlyNotes(event.target.checked);
              setLimit(PAGE_SIZE);
            }}
          />
          {t("onlyNotes")}
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-border p-4 text-sm text-muted-foreground">
          {t("noneWithNotes")}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.slice(0, limit).map((response) => (
            <ResponseRow
              key={`${response.respondent.id}-${response.groupId}-${response.sessionDate}-${response.submittedAt}`}
              response={response}
              hrefs={hrefs}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {t("showing", { shown: Math.min(limit, shown.length), total: shown.length })}
        </span>
        {shown.length > limit && (
          <Button variant="outline" size="sm" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            {t("showMore")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ResponseRow({
  response,
  hrefs,
}: {
  response: AdminFeedbackResponse;
  hrefs: FeedbackEntityHrefs;
}) {
  const t = useTranslations("admin.feedback.responses");
  const locale = useLocale();
  const labels = useFeedbackStatementLabels(response.source);
  const ratingWord = useRatingWord();
  const gamerHref = hrefs.person(response.respondent.id);
  const groupHref = hrefs.group(response);

  return (
    <li className="space-y-2 p-4">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="tabular-nums text-muted-foreground">
          {formatDateOnly(response.sessionDate, locale)}
        </span>
        <MaybeLink href={gamerHref} className="font-medium">
          {response.respondent.name}
        </MaybeLink>
        <span className="text-muted-foreground">
          <MaybeLink href={groupHref}>
            {[response.productName, response.groupName].join(SCHEDULE_PART_SEPARATOR)}
          </MaybeLink>
        </span>
        <span className="text-xs text-muted-foreground">
          {response.gedus.length === 0
            ? t("noGedu")
            : response.gedus.map((gedu) => gedu.name).join(", ")}
        </span>
      </p>

      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {FEEDBACK_CATALOGUES[response.source].map(({ key }) => {
          const value = response.answers[key];
          const rating = SESSION_FEEDBACK_RATINGS.find((level) => level === value);
          return (
            <div key={key} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground" title={labels[key]}>
                {labels[key] ?? key}
              </dt>
              <dd className="flex items-center gap-2 text-xs">
                <RatingMeter rating={rating ?? null} />
                {rating === undefined ? (
                  <span className="text-muted-foreground">{t("skipped")}</span>
                ) : (
                  ratingWord(rating)
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {response.note.trim() !== "" && (
        <p className="whitespace-pre-wrap border-l-2 border-act pl-3 text-sm">{response.note}</p>
      )}
    </li>
  );
}

/**
 * The answer as the respondent drew it: five steps charged up to the level
 * they chose, in act, as on their own screen.
 */
function RatingMeter({ rating }: { rating: SessionFeedbackRating | null }) {
  return (
    <span className="flex items-end gap-px" aria-hidden>
      {SESSION_FEEDBACK_RATINGS.map((level) => (
        <span
          key={level}
          className={cn(
            "w-1.5 rounded-sm",
            METER_HEIGHTS[level],
            rating !== null && level <= rating ? "bg-act" : "bg-lifted",
          )}
        />
      ))}
    </span>
  );
}

const METER_HEIGHTS: Record<SessionFeedbackRating, string> = {
  1: "h-1",
  2: "h-1.5",
  3: "h-2",
  4: "h-2.5",
  5: "h-3",
};

function MaybeLink({
  href,
  className,
  children,
}: {
  href: ReturnType<FeedbackEntityHrefs["person"]>;
  className?: string;
  children: ReactNode;
}) {
  if (href === null) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={cn("hover:underline", className)}>
      {children}
    </Link>
  );
}
