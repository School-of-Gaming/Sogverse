"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatTimeRange } from "@/lib/utils";
import type { CalendarFeedPreviewEvent } from "@/services/calendar-feed";
import { CopyButton, SectionHeading } from "./shared";

/**
 * What the feed URL on screen currently says: the computed sessions as a table,
 * and the `.ics` document they serialize to underneath it.
 *
 * One request answers both, because two polls would be two computations and a
 * table that could disagree with the document printed beneath it is worse than
 * no table at all.
 */

/** Roughly four rows of table, so the skeleton and the first result agree. */
const PREVIEW_MIN_HEIGHT = "min-h-40";

interface FeedPreviewProps {
  events: readonly CalendarFeedPreviewEvent[] | null;
  ics: string | null;
  /** The viewer's own zone: an admin's screen renders in their clock face. */
  timeZone: string | null;
  loading: boolean;
  /** Disabled until a source has resolved and a URL exists to poll. */
  canLoad: boolean;
  onLoad: () => void;
  errorMessage: string | null;
}

export function FeedPreview({
  events,
  ics,
  timeZone,
  loading,
  canLoad,
  onLoad,
  errorMessage,
}: FeedPreviewProps) {
  const t = useTranslations("admin.testing.calendarFeed");
  const locale = useLocale();

  return (
    <div className="space-y-3">
      <SectionHeading>{t("previewHeading")}</SectionHeading>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" disabled={loading || !canLoad} onClick={onLoad}>
          {loading ? t("loadingPreview") : t("loadPreview")}
        </Button>
      </div>

      {errorMessage !== null && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className={cn(PREVIEW_MIN_HEIGHT, "rounded-md border border-border")}>
        {loading ? (
          <PreviewSkeleton />
        ) : events && timeZone !== null ? (
          events.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("noEvents")}</p>
          ) : (
            <PreviewTable
              events={events}
              locale={locale}
              timeZone={timeZone}
            />
          )
        ) : null}
      </div>

      {/* The raw document arrives with the table above it, so opening this
          section is the only thing that ever moves what is below it. */}
      {ics !== null && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {t("rawHeading")}
          </summary>
          <div className="space-y-2 border-t border-border p-4">
            <div className="flex justify-end">
              <CopyButton value={ics} />
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-muted p-3 font-mono text-xs">
              {ics}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Ghost rows while the poll is out. A structured skeleton rather than nothing,
 * because this call fetches a document and expands every seat behind it — the
 * one perceptibly slow read on the card.
 */
function PreviewSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-6 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function PreviewTable({
  events,
  locale,
  timeZone,
}: {
  events: readonly CalendarFeedPreviewEvent[];
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("admin.testing.calendarFeed");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("columnWhen")}</th>
            <th className="px-3 py-2 font-medium">{t("columnSummary")}</th>
            <th className="px-3 py-2 font-medium">{t("columnGamer")}</th>
            <th className="px-3 py-2 font-medium">{t("columnProduct")}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.uid} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2">
                <span className="block">
                  {formatDate(event.start, locale, {
                    timeZone,
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatTimeRange(event.start, event.end, locale, timeZone)}
                </span>
              </td>
              <td className="px-3 py-2">
                {event.summary}
                {event.recurring && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("recurring")}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{event.gamerName}</td>
              <td className="px-3 py-2">{event.productName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
