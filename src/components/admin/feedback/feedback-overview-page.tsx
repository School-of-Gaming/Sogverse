"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import type {
  FeedbackBucketUnit,
  FeedbackDimension,
  FeedbackHeadline,
  FeedbackOverview,
  FeedbackParticipation,
  FeedbackStatementLine,
} from "./aggregate-feedback";
import { formatShare } from "./feedback-format";
import { Change, ShareText, Sparkline } from "./feedback-marks";
import { useFeedbackHref } from "./feedback-nav";
import type { FeedbackPlace } from "./feedback-place";
import type { FeedbackRange } from "./feedback-range";
import { FeedbackShell } from "./feedback-shell";
import { useFeedbackStatementLabels } from "./use-feedback-labels";

const OVERVIEW: FeedbackPlace = { view: "overview" };

/**
 * **`/admin/feedback` — the pulse, with no lists on it.** One figure for how
 * positive gamers are and which way it is moving, one line per statement, and
 * four doors to the lists an admin dives into: products, groups, Gedus and the
 * notes, each saying in a few words whether there is anything to find there.
 */
export function FeedbackOverviewPage({
  range,
  overview,
}: {
  range: FeedbackRange;
  overview: FeedbackOverview;
}) {
  const t = useTranslations("admin.feedback");

  return (
    <FeedbackShell range={range} place={OVERVIEW} title={t("title")}>
      {overview.participation.responses === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <FeedbackHero
            headline={overview.headline}
            participation={overview.participation}
            unit={overview.bucketUnit}
          />
          <StatementLines statements={overview.statements} unit={overview.bucketUnit} source={overview.source} />
          <Explore overview={overview} />
        </>
      )}
    </FeedbackShell>
  );
}

/**
 * The headline figure, its move since the previous period and its line over
 * this one, with how many answered beneath. Shared with the detail pages,
 * which add the platform beside the figure.
 */
export function FeedbackHero({
  headline,
  participation,
  unit,
  comparison,
}: {
  headline: FeedbackHeadline;
  participation: FeedbackParticipation;
  unit: FeedbackBucketUnit;
  /** The detail pages' "platform 89%" and below-average line. */
  comparison?: ReactNode;
}) {
  const t = useTranslations("admin.feedback.hero");

  return (
    <Card className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:items-center">
      <div className="space-y-1">
        {headline.current.tooFew ? (
          <ShareText figure={headline.current} className="text-2xl font-semibold" />
        ) : (
          <p className="flex items-baseline gap-2">
            <ShareText figure={headline.current} className="text-5xl font-semibold" />
            <span className="text-lg text-muted-foreground">{t("positive")}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("definition")}</p>
        {comparison}
        <Change points={headline.changePoints} withPeriod className="text-sm" />
      </div>
      <div className="space-y-2">
        <Sparkline series={headline.series} unit={unit} width={480} height={72} />
        <ParticipationLine participation={participation} />
      </div>
    </Card>
  );
}

function ParticipationLine({ participation }: { participation: FeedbackParticipation }) {
  const t = useTranslations("admin.feedback.hero");
  const locale = useLocale();
  const parts = [t("answers", { count: participation.responses })];
  if (participation.responseRate !== null) {
    parts.push(t("responseRate", { share: formatShare(participation.responseRate, locale) }));
  }
  return <p className="text-xs text-muted-foreground">{parts.join(SCHEDULE_PART_SEPARATOR)}</p>;
}

/** The statements in the order they are asked, one line each. */
function StatementLines({
  statements,
  unit,
  source,
}: {
  statements: FeedbackStatementLine[];
  unit: FeedbackBucketUnit;
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
          {statements.map((line) => (
            <li
              key={line.key}
              className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_5rem] sm:items-center"
            >
              <p className="text-sm">{labels[line.key] ?? line.key}</p>
              <div className="text-sm">
                {line.current.tooFew ? (
                  <ShareText figure={line.current} className="text-muted-foreground" />
                ) : (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold tabular-nums">
                      {t("positive", { share: formatShare(line.current.positiveShare, locale) })}
                    </span>
                    <Change points={line.changePoints} className="text-xs text-muted-foreground" />
                  </span>
                )}
              </div>
              <Sparkline series={line.series} unit={unit} width={128} height={28} className="max-w-32" />
              <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
                {line.current.tooFew ? null : t("low", { share: formatShare(line.current.lowShare, locale) })}
              </p>
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
        {dimensions.map((dimension) => {
          const summary = overview.dimensions[dimension];
          return (
            <ExploreCard
              key={dimension}
              place={{ view: "list", dimension }}
              title={t(`titles.${dimension}`)}
              lines={[t("below", { count: summary.confidentlyBelow }), t(`counts.${dimension}`, { count: summary.rows })]}
              flagged={summary.confidentlyBelow > 0}
            />
          );
        })}
        <ExploreCard
          place={{ view: "notes", lowAnswerOnly: true }}
          title={t("titles.notes")}
          lines={[
            t("notesLow", { count: overview.notes.withLowAnswer }),
            t("counts.notes", { count: overview.notes.total }),
          ]}
          flagged={overview.notes.withLowAnswer > 0}
        />
      </div>
    </section>
  );
}

function ExploreCard({
  place,
  title,
  lines,
  flagged,
}: {
  place: FeedbackPlace;
  title: string;
  lines: [string, string];
  /** Whether the first line names something to look at, and so reads in the full ink. */
  flagged: boolean;
}) {
  const href = useFeedbackHref();
  return (
    <Link href={href(place)} className="group block">
      <Card className="flex h-full items-center justify-between gap-3 p-4 transition-colors group-hover:bg-hover">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">{title}</p>
          <p className={flagged ? "text-sm" : "text-sm text-muted-foreground"}>{lines[0]}</p>
          <p className="text-xs text-muted-foreground">{lines[1]}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
