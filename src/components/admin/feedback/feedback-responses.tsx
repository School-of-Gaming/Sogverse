"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { formatDateOnly } from "@/lib/utils";
import type { AdminFeedbackResponse } from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackNote } from "./aggregate-feedback";
import { ResponseMarks } from "./feedback-marks";
import { useFeedbackHref } from "./feedback-nav";
import type { FeedbackOrigin } from "./feedback-place";

/** How many rows a list shows before it is asked for more. */
const PAGE_SIZE = 20;

/**
 * **Notes, printed whole.** A note is the page's qualitative signal and the
 * one most likely to need acting on — a child saying nobody listens to them is
 * a safeguarding read before it is a satisfaction one — so it is never clipped.
 */
export function FeedbackNoteList({
  notes,
  origin,
  markLow = false,
}: {
  notes: FeedbackNote[];
  origin: FeedbackOrigin;
  /** Labels the notes that came with a low answer, where they are mixed with the rest. */
  markLow?: boolean;
}) {
  const t = useTranslations("admin.feedback.notes");
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (notes.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("none")}</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {notes.slice(0, limit).map(({ response, withLowAnswer }) => (
          <li key={responseKey(response)} className="space-y-2 p-4">
            <p className="whitespace-pre-wrap border-l-2 border-act pl-3 text-sm">{response.note}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ResponseMarks response={response} />
              {markLow && withLowAnswer && (
                <span className="text-xs font-medium">{t("withLowAnswer")}</span>
              )}
              <ResponseFacts response={response} origin={origin} />
            </div>
          </li>
        ))}
      </ul>
      <ShowMore shown={Math.min(limit, notes.length)} total={notes.length} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
    </>
  );
}

/**
 * **Every response, newest first**, one compact line each: when, who, where,
 * with whom, the answers as marks, and the note beneath when there is one.
 */
export function FeedbackResponseList({
  responses,
  origin,
}: {
  responses: AdminFeedbackResponse[];
  origin: FeedbackOrigin;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  return (
    <>
      <ul className="divide-y divide-border">
        {responses.slice(0, limit).map((response) => (
          <li key={responseKey(response)} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ResponseMarks response={response} />
              <ResponseFacts response={response} origin={origin} />
            </div>
            {response.note.trim() !== "" && (
              <p className="whitespace-pre-wrap border-l-2 border-act pl-3 text-sm">{response.note}</p>
            )}
          </li>
        ))}
      </ul>
      <ShowMore shown={Math.min(limit, responses.length)} total={responses.length} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
    </>
  );
}

function responseKey(response: AdminFeedbackResponse): string {
  return `${response.respondent.id}-${response.groupId}-${response.sessionDate}-${response.submittedAt}`;
}

/** Date, gamer, group and product, and the Gedus — each a way into its own page. */
function ResponseFacts({
  response,
  origin,
}: {
  response: AdminFeedbackResponse;
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.notes");
  const locale = useLocale();
  const href = useFeedbackHref();
  const linkClass = "hover:underline";

  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
      <span className="tabular-nums text-muted-foreground">
        {formatDateOnly(response.sessionDate, locale)}
      </span>
      <Link
        href={href({ view: "detail", scope: { kind: "gamer", id: response.respondent.id }, origin })}
        className={`font-medium ${linkClass}`}
      >
        {response.respondent.name}
      </Link>
      <span className="text-muted-foreground">
        <Link
          href={href({ view: "detail", scope: { kind: "group", id: response.groupId }, origin })}
          className={linkClass}
        >
          {response.groupName}
        </Link>
        {SCHEDULE_PART_SEPARATOR}
        <Link
          href={href({ view: "detail", scope: { kind: "product", id: response.productId }, origin })}
          className={linkClass}
        >
          {response.productName}
        </Link>
      </span>
      <span className="text-xs text-muted-foreground">
        {response.gedus.length === 0
          ? t("noGedu")
          : response.gedus.map((gedu, index) => (
              <Fragment key={gedu.id}>
                {index > 0 && ", "}
                <Link
                  href={href({ view: "detail", scope: { kind: "gedu", id: gedu.id }, origin })}
                  className={linkClass}
                >
                  {gedu.name}
                </Link>
              </Fragment>
            ))}
      </span>
    </p>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const t = useTranslations("admin.feedback.notes");
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
      <span className="tabular-nums">{t("showing", { shown, total })}</span>
      <Button variant="outline" size="sm" onClick={onMore}>
        {t("showMore")}
      </Button>
    </div>
  );
}
