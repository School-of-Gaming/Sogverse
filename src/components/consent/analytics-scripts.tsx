"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
// The RAW pathname, deliberately: this is one of the sites that needs what is
// actually in the address bar (`/fi/kauppa/abc`) rather than the wrapped
// `usePathname`'s internal template. Both dimensions are derived from it —
// `path` is it verbatim, `route` is what the normalizer makes of it.
import { usePathname } from "next/navigation";
import { analyticsRouteFor } from "@/lib/analytics/route";
import { useConsent } from "./consent-provider";

/**
 * Vercel Web Analytics and Speed Insights, mounted only once the visitor has
 * said yes to analytics.
 *
 * **Nothing is sent before this mounts, and nothing has to be queued for it.**
 * `track()` from `@vercel/analytics` is a call through `window.va?.(…)`, and
 * `window.va` is installed by `<Analytics />` itself — so every event the app
 * fires while consent is absent is an optional call on an undefined global: no
 * request, no queue, no error. The call sites need no consent check of their
 * own, which is what keeps this one gate the only one.
 *
 * Mounting late costs less than it looks like it should on the Speed Insights
 * side: the collector script registers its `PerformanceObserver`s with
 * `buffered: true`, so the entries the browser recorded before the script
 * existed — the paint and layout-shift metrics for this very page load — are
 * replayed into it on registration. A visitor who accepts a few seconds in
 * still reports the load they actually had.
 *
 * **Analytics is mounted from the package's React entry point, not its Next
 * wrapper**, because the wrapper computes `route` in the browser by
 * substituting the current route's param values back out of the pathname — it
 * cannot see through a translated slug, and every translated page would own one
 * `route` row per language. `@/lib/analytics/route` derives the internal
 * template instead. Passing `route` turns the script's own auto-tracking off,
 * and the React component emits a pageview from an effect keyed on
 * `route` + `path`, which is what covers every client-side navigation. What the
 * Next wrapper adds and this does not need is a Suspense boundary for
 * `useSearchParams()`, which only its param substitution ever read.
 */
export function AnalyticsScripts() {
  const { consent } = useConsent();
  const pathname = usePathname();

  if (!consent?.analytics) return null;

  return (
    <>
      <SpeedInsights />
      <Analytics route={analyticsRouteFor(pathname)} path={pathname} />
    </>
  );
}
