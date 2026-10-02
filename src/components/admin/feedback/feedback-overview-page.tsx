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
  type FeedbackListDimension,
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
import { FeedbackStatementTable } from "./feedback-statement-table";
import { FeedbackTimeline } from "./feedback-timeline";

/**
 * **`/admin/feedback` — the pulse, with no lists on it.** One figure for how
 * positive gamers have been since the first answer, the whole history drawn
 * beneath it, each statement's answers, and three doors to the lists an admin
 * dives into: products (whose groups are a breakdown on a product's own page),
 * Gedus, and what gamers said.
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
          <Statements statements={overview.statements} source={overview.source} />
          <Explore overview={overview} />
        </>
      )}
    </FeedbackShell>
  );
}

/**
 * The headline figure and how many answered, beside the timeline of the whole
 * history from `lg` (the figure a third, the chart two thirds) and over it
 * below. Shared with the detail pages, which add the platform beside the
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
    <Card className="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center">
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 sm:items-end lg:grid-cols-1 lg:items-start lg:gap-y-4">
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
        <div className="space-y-1 sm:text-right lg:text-left">
          {comparison}
          <ParticipationLine participation={participation} />
        </div>
      </div>
      <div className="min-w-0">
        <FeedbackTimeline timeline={timeline} scopeLabel={scopeLabel} />
      </div>
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

/**
 * The platform's statements, in the same table a detail page draws. The
 * platform is what everything else is set against, so it carries no
 * comparison of its own.
 */
function Statements({
  statements,
  source,
}: {
  statements: FeedbackStatementLine[];
  source: FeedbackOverview["source"];
}) {
  const t = useTranslations("admin.feedback.statements");
  const lines = useMemo(
    () => statements.map((line) => ({ ...line, againstPlatform: null })),
    [statements],
  );

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{t("heading")}</h2>
      <FeedbackStatementTable source={source} statements={lines} />
    </section>
  );
}

/** The three doors — products, Gedus and gamers — each summarised in a few words. */
function Explore({ overview }: { overview: FeedbackOverview }) {
  const t = useTranslations("admin.feedback.explore");
  const dimensions: FeedbackListDimension[] = ["product", "gedu"];

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{t("heading")}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
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
