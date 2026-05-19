"use client";

import { useEffect, useRef } from "react";

const pageStarts = new Map<string, number>();

function logLine(line: string) {
  console.log(line);
}

function logNavTiming(page: string) {
  if (typeof performance === "undefined") return;
  const entries = performance.getEntriesByType("navigation");
  if (entries.length === 0) return;
  const nav = entries[0] as PerformanceNavigationTiming;
  if (nav.requestStart === 0) return;
  const ttfb = Math.round(nav.responseStart - nav.requestStart);
  const dcl = Math.round(nav.domContentLoadedEventStart - nav.requestStart);
  // Note: on Next.js soft navigations this reflects the original document
  // load, not the current page — useful only on hard refresh / direct URL.
  logLine(`[perf] ${page}: nav TTFB=${ttfb}ms DCL=${dcl}ms`);
}

function startPage(page: string) {
  pageStarts.set(page, performance.now());
  logNavTiming(page);
  logLine(`[perf] ${page}: render-start`);
}

function mark(page: string, label: string) {
  const start = pageStarts.get(page);
  if (start === undefined) return;
  const elapsed = Math.round(performance.now() - start);
  logLine(`[perf] ${page}: ${label} +${elapsed}ms`);
}

/**
 * Stamps a page-mount baseline and logs the first animation-frame paint.
 * Call once per page; subsequent mounts overwrite the baseline (intentional —
 * navigating back to the page restarts the clock).
 */
export function usePagePerf(page: string) {
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startPage(page);
    requestAnimationFrame(() => mark(page, "first-paint"));
  }, [page]);
}

/** Logs the moment a React Query's data first becomes available on this mount. */
export function useQueryPerf<T>(
  page: string,
  label: string,
  data: T | undefined,
  isFetching: boolean,
) {
  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    if (data !== undefined && !isFetching) {
      loggedRef.current = true;
      mark(page, `${label} ready`);
    }
  }, [page, label, data, isFetching]);
}
