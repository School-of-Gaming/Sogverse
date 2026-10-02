"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import {
  buildFeedbackOverview,
  buildFeedbackTimeline,
  type FeedbackDimension,
  type FeedbackOverview,
  type FeedbackParticipation,
  type FeedbackRead,
  type FeedbackStatementLine,
  type FeedbackTimeline as FeedbackTimelineModel,
  type ShareFigure,
} from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { ShareText } from "./feedback-marks";
import { feedbackHref, type FeedbackPlace } from "./feedback-place";
import { FeedbackShell } from "./feedback-shell";
import { FeedbackTimeline } from "./feedback-timeline";
import { useFeedbackStatementLabels } from "./use-feedback-labels";

/**
 * **`/admin/feedback` — the pulse, with no lists on it.** One figure for how
 * positive gamers have been since the first answer, the whole history drawn
 * beneath it, one line per statement, and four doors to the lists an admin
 * dives into: products, groups, Gedus and what gamers said, each saying in a
 * few words whether there is anything to find there.
 */
export function FeedbackOverviewPage({ read }: { read: FeedbackRead }) {
  const t = useTranslations("admin.feedback");
  const { dataset, source, history } = read;
  const overview = useMemo(() => buildFeedbackOverview(dataset, source), [dataset, source]);
  const timeline = useMemo(
    () => buildFeedbackTimeline(dataset, source, history, null),
    [dataset, source, history],
  );

  return (
    <FeedbackShell title={t("title")}>
      <FeedbackHero
        headline={overview.headline}
        participation={overview.participation}
        timeline={timeline}
      />
      {overview.participation.responses === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <StatementLines statements={overview.statements} source={overview.source} />
          <Explore overview={overview} />
        </>
      )}
    </FeedbackShell>
  );
}

/**
 * The headline figure and how many answered, over the timeline of the whole
 * history. Shared with the detail pages, which add the platform beside the
 * figure.
 */
export function FeedbackHero({
  headline,
  participation,
  timeline,
  scopeLabel,
  comparison,
}: {
  headline: ShareFigure;
  participation: FeedbackParticipation;
  timeline: FeedbackTimelineModel;
  /** The legend's name for the scope's line, beside the platform's. */
  scopeLabel?: string;
  /** The detail pages' "platform 89%" and below-average line. */
  comparison?: ReactNode;
}) {
  const t = useTranslations("admin.feedback.hero");

  return (
    <Card className="space-y-5 p-5">
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 sm:items-end">
        <div className="space-y-1">
          <p className="flex h-12 items-end gap-2">
            {headline.positiveShare === null ? (
              <ShareText figure={headline} className="text-2xl font-semibold" />
            ) : (
              <>
                <ShareText figure={headline} className="text-5xl font-semibold leading-none tabular-nums" />
                <span className="text-lg leading-tight text-muted-foreground">{t("positive")}</span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{t("definition")}</p>
        </div>
        <div className="space-y-1 sm:text-right">
          {comparison}
          <ParticipationLine participation={participation} />
        </div>
      </div>
      <FeedbackTimeline timeline={timeline} scopeLabel={scopeLabel} />
    </Card>
  );
}

function ParticipationLine({ participation }: { participation: FeedbackParticipation }) {
  const t = useTranslations("admin.feedback");
  const locale = useLocale();
  const parts = [t("answers", { count: participation.responses })];
  if (participation.responseRate !== null) {
    parts.push(t("hero.responseRate", { share: formatShare(participation.responseRate, locale) }));
  }
  return <p className="text-xs text-muted-foreground">{parts.join(SCHEDULE_PART_SEPARATOR)}</p>;
}

/** The statements in the order they are asked, one line each. */
function StatementLines({
  statements,
  source,
}: {
  statements: FeedbackStatementLine[];
  source: FeedbackOverview["source"];
}) {
  const t = useTranslations("admin.feedback.statements");
  const locale = useLocale();
  const labels = useFeedbackStatementLabels(source);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("legend")}</p>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {statements.map(({ key, figure }) => (
            // Negative before positive, as the meter reads: No on the left, Definitely on the right.
            <li
              key={key}
              className="grid grid-cols-[auto_auto] items-baseline justify-start gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem] sm:justify-stretch sm:gap-x-6"
            >
              <p className="col-span-2 text-sm sm:col-span-1">{labels[key] ?? key}</p>
              <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
                {figure.negativeShare === null ? null : t("negative", { share: formatShare(figure.negativeShare, locale) })}
              </p>
              {figure.positiveShare === null ? (
                <ShareText figure={figure} className="text-sm text-muted-foreground sm:text-right" />
              ) : (
                <p className="text-sm font-semibold tabular-nums sm:text-right">
                  {t("positive", { share: formatShare(figure.positiveShare, locale) })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** The four doors to the lists, each summarised in a few words. */
function Explore({ overview }: { overview: FeedbackOverview }) {
  const t = useTranslations("admin.feedback.explore");
  const dimensions: FeedbackDimension[] = ["product", "group", "gedu"];

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{t("heading")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dimensions.map((dimension) => (
          <ExploreCard
            key={dimension}
            place={{ view: "list", dimension }}
            title={t(`titles.${dimension}`)}
            count={t(`counts.${dimension}`, { count: overview.dimensions[dimension].rows })}
          />
        ))}
        <ExploreCard
          place={{ view: "responses" }}
          title={t("titles.responses")}
          count={t("counts.responses", { count: overview.responses.total })}
        />
      </div>
    </section>
  );
}

function ExploreCard({ place, title, count }: { place: FeedbackPlace; title: string; count: string }) {
  return (
    <Link href={feedbackHref(place)} className="group block">
      <Card className="flex h-full items-center justify-between gap-3 p-4 transition-colors group-hover:bg-hover">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{count}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
