import "server-only";

import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import type { AnalyticsRange } from "@/services/admin-analytics/admin-analytics.build";
import {
  readBreakdowns,
  readCampaigns,
  readLandingPages,
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
 * only what it shows, inside its own `<Suspense>` on the route, so a section
 * draws as soon as its own read lands and one failing read leaves every other
 * section standing. Each fallback below is shaped like what it stands in for,
 * at its final height: an uncached hour is a round trip to Vercel, so the
 * skeleton is drawn at once.
 */

type SectionProps = { range: AnalyticsRange; now: Date };

/** A ghost bar, for the skeletons. */
function Ghost({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-lifted ${className}`} />;
}

// ---------------------------------------------------------------------------
// The range's totals
// ---------------------------------------------------------------------------

/** The totals card's width, shared by the card and its skeleton. */
const OVERVIEW_WIDTH = "max-w-md";

export function OverviewSkeleton() {
  return (
    <Card className={`flex min-h-48 flex-col gap-3 p-5 ${OVERVIEW_WIDTH}`} aria-hidden>
      <Ghost className="h-4 w-28" />
      <Ghost className="h-10 w-36" />
      <Ghost className="h-3 w-full" />
      <Ghost className="h-3 w-4/5" />
    </Card>
  );
}

export async function OverviewSection({ range, now }: SectionProps) {
  const t = await getTranslations("admin.analytics.views");
  const result = await readWebAnalyticsOverview(range, now);
  return (
    <div className={OVERVIEW_WIDTH}>
      {result.ok ? (
        <MeasureCard
          title={t("title")}
          figure={result.data.pageviews}
          detail={t("visitors", { count: result.data.visitors })}
          caption={t("caption")}
          footer={<ReadAt readAt={result.readAt} />}
        />
      ) : (
        <MeasureFailure title={t("title")} caption={t("caption")} reason={result.reason} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Over time
// ---------------------------------------------------------------------------

export function TimelineSkeleton() {
  return (
    <Card className="space-y-6 p-5" aria-hidden>
      <Ghost className="h-4 w-32" />
      <Ghost className="h-60 w-full" />
    </Card>
  );
}

/** Every day of the range, its pageviews and visitors. */
export async function TimelineSection({ range, now }: SectionProps) {
  const result = await readWebAnalyticsOverview(range, now);
  if (!result.ok) return <AnalyticsFailure reason={result.reason} />;
  return <AnalyticsTimeline rows={result.data.days} />;
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
