import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import {
  BreakdownsSection,
  BreakdownsSkeleton,
  CampaignsSection,
  LandingPagesSection,
  OverviewSkeleton,
  OverviewSection,
  TableSkeleton,
  TimelineSection,
  TimelineSkeleton,
  TopPagesSection,
} from "@/components/admin/analytics/analytics-sections";
import { AnalyticsSection, AnalyticsShell } from "@/components/admin/analytics/analytics-view";
import { requireRole } from "@/lib/auth";
import { earliestTrafficDay } from "@/lib/vercel-analytics.server";
import { resolveAnalyticsRange, utcToday } from "@/services/admin-analytics/admin-analytics.build";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminAnalytics") };
}

/**
 * `/admin/analytics` — the site's traffic, from Vercel Web Analytics, over the
 * UTC days the address names.
 *
 * The proxy already admits only admins here; the role is checked again before
 * anything is read, because the Vercel token behind these figures reads every
 * page of the project. The title and the range picker wait on nothing, and
 * every section streams in under its own `<Suspense>`, keyed by the range so a
 * new range swaps each section for its skeleton rather than leaving the old
 * range's figures under the new range's heading.
 */
export default async function AdminAnalyticsRoute({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const gate = await requireRole("admin");
  if (gate instanceof NextResponse) notFound();

  const now = new Date();
  const earliest = earliestTrafficDay(now);
  const range = resolveAnalyticsRange(await searchParams, now, earliest);
  const key = `${range.from}..${range.to}`;
  const props = { range, now };
  const t = await getTranslations("admin.analytics");

  return (
    <AnalyticsShell range={range} earliest={earliest} today={utcToday(now)}>
      <Suspense key={`overview-${key}`} fallback={<OverviewSkeleton />}>
        <OverviewSection {...props} />
      </Suspense>

      <AnalyticsSection heading={t("timeline.heading")}>
        <Suspense key={`timeline-${key}`} fallback={<TimelineSkeleton />}>
          <TimelineSection {...props} />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection heading={t("landing.heading")} caption={t("landing.caption")}>
        <Suspense key={`landing-${key}`} fallback={<TableSkeleton />}>
          <LandingPagesSection {...props} />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection heading={t("campaigns.heading")} caption={t("campaigns.caption")}>
        <Suspense key={`campaigns-${key}`} fallback={<TableSkeleton />}>
          <CampaignsSection {...props} />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection heading={t("pages.heading")} caption={t("pages.caption")}>
        <Suspense key={`pages-${key}`} fallback={<TableSkeleton rows={10} />}>
          <TopPagesSection {...props} />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection heading={t("breakdowns.heading")} caption={t("breakdowns.caption")}>
        <Suspense key={`breakdowns-${key}`} fallback={<BreakdownsSkeleton />}>
          <BreakdownsSection {...props} />
        </Suspense>
      </AnalyticsSection>
    </AnalyticsShell>
  );
}
