"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FeedbackSource } from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackDimensionRow, ShareFigure } from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { BelowAverage, Change, ShareBar, ShareText } from "./feedback-marks";
import { useFeedbackHref } from "./feedback-nav";
import type { FeedbackOrigin } from "./feedback-place";
import { useFeedbackStatementLabels } from "./use-feedback-labels";

const ROW_GRID =
  "grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(8rem,16rem)_7rem] sm:items-center";

/**
 * **Products, groups or Gedus, worst first**, each a link to its own page.
 *
 * A row reads left to right as name, how many answered, how positive against
 * the platform's grey mark, and how it moved; a row below the platform says so
 * in words, naming the statement it lags most. A row that ran sessions but
 * heard nothing back comes last, saying so in place of a share.
 */
export function FeedbackDimensionRows({
  source,
  rows,
  platform,
  origin,
}: {
  source: FeedbackSource;
  rows: FeedbackDimensionRow[];
  platform: ShareFigure;
  /** Where each row's page should lead back to. */
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback.rows");
  const locale = useLocale();

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("none")}</p>;
  }

  return (
    <div>
      <div
        className={`${ROW_GRID} hidden border-b border-border px-4 py-2 text-xs text-muted-foreground sm:grid`}
        aria-hidden
      >
        <span />
        <span className="text-right">{t("answers")}</span>
        <span>
          {platform.positiveShare === null
            ? t("positive")
            : t("positiveAgainst", { share: formatShare(platform.positiveShare, locale) })}
        </span>
        <span>{t("change")}</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <Row key={row.id} row={row} source={source} platform={platform} origin={origin} />
        ))}
      </ul>
    </div>
  );
}

function Row({
  row,
  source,
  platform,
  origin,
}: {
  row: FeedbackDimensionRow;
  source: FeedbackSource;
  platform: ShareFigure;
  origin: FeedbackOrigin;
}) {
  const t = useTranslations("admin.feedback");
  const locale = useLocale();
  const href = useFeedbackHref();
  const labels = useFeedbackStatementLabels(source);
  const share = row.overall.current.positiveShare;

  return (
    <li>
      <Link
        href={href({ view: "detail", scope: { kind: row.dimension, id: row.id }, origin })}
        className="block px-4 py-3 transition-colors hover:bg-hover"
      >
        <div className={ROW_GRID}>
          <RowName row={row} />
          <span className="text-sm tabular-nums text-muted-foreground sm:text-right">
            {t("answers", { count: row.responses })}
          </span>
          {share === null ? (
            <ShareText figure={row.overall.current} className="text-sm text-muted-foreground" />
          ) : (
            <span className="flex items-center gap-3">
              <ShareBar share={share} platform={platform.positiveShare} />
              <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatShare(share, locale)}
              </span>
            </span>
          )}
          <Change points={row.overall.changePoints} className="text-xs" />
        </div>
        {row.belowPlatform && (
          <div className="mt-1.5">
            <BelowAverage
              statement={row.weakest === null ? null : (labels[row.weakest.key] ?? row.weakest.key)}
            />
          </div>
        )}
      </Link>
    </li>
  );
}

function RowName({ row }: { row: FeedbackDimensionRow }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium">{row.name}</span>
      {row.dimension === "group" && row.product !== null && (
        <span className="block truncate text-xs text-muted-foreground">{row.product.name}</span>
      )}
    </span>
  );
}
