import "server-only";

import { Card } from "@/components/ui/card";
import type { AnalyticsRange } from "@/services/admin-analytics/admin-analytics.build";
import {
  readBreakdowns,
  readCampaigns,
  readLandingPages,
  readTopPages,
  readWebAnalyticsOverview,
} from "@/services/admin-analytics/admin-analytics.server";
import { TrafficCard } from "./analytics-timeline";
import {
  AnalyticsFailure,
  Breakdowns,
  CampaignsTable,
  LandingPagesTable,
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
// Traffic: the range's totals and its days, from one read
// ---------------------------------------------------------------------------

/** The traffic card itself, drawn with its figures, chart and read time as ghosts. */
export function TrafficSkeleton() {
  return <TrafficCard state={{ status: "loading" }} />;
}

export async function TrafficSection({ range, now }: SectionProps) {
  const result = await readWebAnalyticsOverview(range, now);
  return (
    <TrafficCard
      state={
        result.ok
          ? {
              status: "ready",
              pageviews: result.data.pageviews,
              visitors: result.data.visitors,
              days: result.data.days,
              readAt: result.readAt,
            }
          : { status: "failed", reason: result.reason }
      }
    />
  );
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
