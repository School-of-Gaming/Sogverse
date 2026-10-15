import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { REQUEST_LOG_DAYS } from "@/lib/vercel-analytics.server";
import { formatDateOnly } from "@/lib/utils";
import { buildTimeline, type AnalyticsRange } from "@/services/admin-analytics/admin-analytics.build";
import {
  readBreakdowns,
  readCampaigns,
  readLandingPages,
  readServedPageLoads,
  readSignups,
  readTopPages,
  readWebAnalyticsOverview,
} from "@/services/admin-analytics/admin-analytics.server";
import { AnalyticsTimeline } from "./analytics-timeline";
import {
  AnalyticsFailure,
  Breakdowns,
  CampaignsTable,
  LandingPagesTable,
  MeasureCard,
  MeasureFailure,
  ReadAt,
  TopPagesTable,
} from "./analytics-view";

/**
 * **The analytics page's sections, each its own read.** Every section awaits
 * only what it shows, inside its own `<Suspense>` on the route, so the fast
 * reads (the database, a cached hour) draw while the slow one — the request
 * log, read a day at a time — is still arriving, and one failing read leaves
 * every other section standing. Each fallback below is shaped like what it
 * stands in for, at its final height: these reads are known to be slow, so the
 * skeleton is drawn at once.
 */

type SectionProps = { range: AnalyticsRange; now: Date };

/** A ghost bar, for the skeletons. */
function Ghost({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-lifted ${className}`} />;
}

// ---------------------------------------------------------------------------
// The three measures
// ---------------------------------------------------------------------------

export function MeasureSkeleton() {
  return (
    <Card className="flex h-full min-h-48 flex-col gap-3 p-5" aria-hidden>
      <Ghost className="h-4 w-28" />
      <Ghost className="h-10 w-36" />
      <Ghost className="h-3 w-full" />
      <Ghost className="h-3 w-4/5" />
    </Card>
  );
}

export async function ServedMeasure({ range, now }: SectionProps) {
  const t = await getTranslations("admin.analytics.measures.served");
  const locale = await getLocale();
  const result = await readServedPageLoads(range, now);
  if (!result.ok) {
    return <MeasureFailure title={t("title")} caption={t("caption")} reason={result.reason} />;
  }
  const { window, total } = result.data;
  const covers =
    window === null
      ? t("outside", { days: REQUEST_LOG_DAYS })
      : window.from === range.from
        ? null
        : t("window", {
            from: formatDateOnly(window.from, locale),
            to: formatDateOnly(window.to, locale),
            days: REQUEST_LOG_DAYS,
          });
  return (
    <MeasureCard
      title={t("title")}
      figure={window === null ? null : total}
      caption={t("caption")}
      footer={
        <>
          {covers && <p className="text-xs text-muted-foreground">{covers}</p>}
          <ReadAt readAt={result.readAt} />
        </>
      }
    />
  );
}

export async function ViewsMeasure({ range, now }: SectionProps) {
  const t = await getTranslations("admin.analytics.measures.views");
  const result = await readWebAnalyticsOverview(range, now);
  if (!result.ok) {
    return <MeasureFailure title={t("title")} caption={t("caption")} reason={result.reason} />;
  }
  return (
    <MeasureCard
      title={t("title")}
      figure={result.data.pageviews}
      detail={t("visitors", { count: result.data.visitors })}
      caption={t("caption")}
      footer={<ReadAt readAt={result.readAt} />}
    />
  );
}

export async function SignupsMeasure({ range }: SectionProps) {
  const t = await getTranslations("admin.analytics.measures.signups");
  const result = await readSignups(range.from, range.to);
  if (!result.ok) {
    return <MeasureFailure title={t("title")} caption={t("caption")} reason={result.reason} />;
  }
  return <MeasureCard title={t("title")} figure={result.data.total} caption={t("caption")} />;
}

// ---------------------------------------------------------------------------
// Over time
// ---------------------------------------------------------------------------

export function TimelineSkeleton() {
  return (
    <Card className="space-y-6 p-5" aria-hidden>
      <Ghost className="h-4 w-32" />
      <Ghost className="h-60 w-full" />
      <Ghost className="h-36 w-full" />
    </Card>
  );
}

/**
 * Every day of the range, all four measures. It waits on the request log as
 * well, because the chart is drawn once; a measure that failed is left off the
 * chart and named under it rather than drawn as zeros.
 */
export async function TimelineSection({ range, now }: SectionProps) {
  const t = await getTranslations("admin.analytics.timeline");
  const [visits, served, signups] = await Promise.all([
    readWebAnalyticsOverview(range, now),
    readServedPageLoads(range, now),
    readSignups(range.from, range.to),
  ]);
  const notes = [
    ...(served.ok ? [] : [t("missing.served")]),
    ...(visits.ok ? [] : [t("missing.visits")]),
    ...(signups.ok ? [] : [t("missing.signups")]),
  ];
  const rows = buildTimeline(range, {
    visits: visits.ok ? visits.data.days : null,
    served: served.ok ? served.data : null,
    signups: signups.ok ? signups.data.days : null,
  });
  return <AnalyticsTimeline rows={rows} notes={notes} />;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-4 py-3">
          <Ghost className="h-4 w-1/2" />
          <Ghost className="h-4 w-12" />
        </div>
      ))}
    </Card>
  );
}

export async function LandingPagesSection({ range, now }: SectionProps) {
  const result = await readLandingPages(range, now);
  if (!result.ok) return <AnalyticsFailure reason={result.reason} />;
  return (
    <div className="space-y-2">
      <LandingPagesTable rows={result.data} />
      <ReadAt readAt={result.readAt} />
    </div>
  );
}

export async function CampaignsSection({ range, now }: SectionProps) {
  const result = await readCampaigns(range, now);
  if (!result.ok) return <AnalyticsFailure reason={result.reason} />;
  return (
    <div className="space-y-2">
      <CampaignsTable rows={result.data} />
      <ReadAt readAt={result.readAt} />
    </div>
  );
}

export async function TopPagesSection({ range, now }: SectionProps) {
  const result = await readTopPages(range, now);
  if (!result.ok) return <AnalyticsFailure reason={result.reason} />;
  return (
    <div className="space-y-2">
      <TopPagesTable rows={result.data} />
      <ReadAt readAt={result.readAt} />
    </div>
  );
}

export function BreakdownsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <Card key={index} className="space-y-3 p-4">
          <Ghost className="h-4 w-24" />
          {[0, 1, 2, 3, 4].map((line) => (
            <Ghost key={line} className="h-4 w-full" />
          ))}
        </Card>
      ))}
    </div>
  );
}

export async function BreakdownsSection({ range, now }: SectionProps) {
  const result = await readBreakdowns(range, now);
  if (!result.ok) return <AnalyticsFailure reason={result.reason} />;
  return (
    <div className="space-y-2">
      <Breakdowns {...result.data} />
      <ReadAt readAt={result.readAt} />
    </div>
  );
}
