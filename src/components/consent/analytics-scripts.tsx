"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
 */
export function AnalyticsScripts() {
  const { consent } = useConsent();

  if (!consent?.analytics) return null;

  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
