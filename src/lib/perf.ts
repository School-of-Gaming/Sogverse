"use client";

import { useEffect, useRef } from "react";

const pageStarts = new Map<string, number>();
const RSC_PREFETCH_MARKER = "?_rsc=";

function logLine(line: string) {
  console.log(line);
}

// Note: phase fields are only meaningful on the original document load.
// Subsequent soft navs reuse the same navigation entry so the numbers
// don't update — interpret only on hard refresh / direct URL.
function logNavTiming(page: string) {
  if (typeof performance === "undefined") return;
  const entries = performance.getEntriesByType("navigation");
  if (entries.length === 0) return;
  const nav = entries[0] as PerformanceNavigationTiming;
  if (nav.requestStart === 0) return;

  const dns = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
  const tcp = Math.round(nav.connectEnd - nav.connectStart);
  // secureConnectionStart is 0 on plain HTTP or when the TCP connection was reused.
  const tls =
    nav.secureConnectionStart > 0
      ? Math.round(nav.connectEnd - nav.secureConnectionStart)
      : 0;
  const ttfb = Math.round(nav.responseStart - nav.requestStart);
  const download = Math.round(nav.responseEnd - nav.responseStart);
  const domInteractive = Math.round(nav.domInteractive - nav.requestStart);
  const dcl = Math.round(nav.domContentLoadedEventStart - nav.requestStart);
  const loadEvent =
    nav.loadEventStart > 0
      ? `${Math.round(nav.loadEventStart - nav.requestStart)}ms`
      : "pending";

  logLine(
    `[perf] ${page}: nav DNS=${dns}ms TCP=${tcp}ms TLS=${tls}ms TTFB=${ttfb}ms download=${download}ms domInteractive=${domInteractive}ms DCL=${dcl}ms loadEvent=${loadEvent}`,
  );
}

function logSlowResources(page: string, thresholdMs = 500, topN = 15) {
  if (typeof performance === "undefined") return;
  // Wait a beat so initial fetches/scripts have resource entries.
  setTimeout(() => {
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const slow = entries
      .filter((e) => e.duration >= thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, topN);
    if (slow.length === 0) {
      logLine(`[perf] ${page}: no slow resources (>${thresholdMs}ms)`);
      return;
    }
    logLine(
      `[perf] ${page}: slow resources (>${thresholdMs}ms, top ${slow.length}):`,
    );
    for (const e of slow) {
      let host = "?";
      try {
        host = new URL(e.name).host;
      } catch {
        // ignore non-URL resource names
      }
      const path = e.name.length > 100 ? `${e.name.slice(0, 97)}...` : e.name;
      logLine(
        `  ${Math.round(e.duration)}ms ${e.initiatorType.padEnd(8)} ${host} ${path}`,
      );
    }
  }, 1000);
}

function logRSCPrefetches(page: string) {
  if (typeof performance === "undefined") return;
  setTimeout(() => {
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const prefetches = entries.filter((e) =>
      e.name.includes(RSC_PREFETCH_MARKER),
    );
    if (prefetches.length === 0) {
      logLine(`[perf] ${page}: rsc-prefetches=0`);
      return;
    }
    const durations = prefetches
      .map((p) => Math.round(p.duration))
      .sort((a, b) => a - b);
    const max = durations[durations.length - 1];
    const median = durations[Math.floor(durations.length / 2)];
    const overOneSec = durations.filter((d) => d > 1000).length;
    logLine(
      `[perf] ${page}: rsc-prefetches=${prefetches.length} median=${median}ms max=${max}ms over-1s=${overOneSec}`,
    );
  }, 1500);
}

function observeLongTasks(page: string) {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const t of list.getEntries()) {
        if (t.duration > 200) {
          logLine(
            `[perf] ${page}: long-task ${Math.round(t.duration)}ms at +${Math.round(t.startTime)}ms`,
          );
        }
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  } catch {
    // longtask entry type not supported (Safari) — skip.
  }
}

function startPage(page: string) {
  pageStarts.set(page, performance.now());
  logNavTiming(page);
  logLine(`[perf] ${page}: render-start`);
  observeLongTasks(page);
  logSlowResources(page);
  logRSCPrefetches(page);
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

/**
 * Logs when a React Query starts fetching and when it resolves on this mount.
 * Distinguishes a fresh fetch (with its own duration) from a cache hit so the
 * console makes it obvious whether the wall-time was the query or just waiting.
 */
export function useQueryPerf<T>(
  page: string,
  label: string,
  data: T | undefined,
  isFetching: boolean,
) {
  const loggedReadyRef = useRef(false);
  const fetchStartRef = useRef<number | null>(null);
  const fetchStartLoggedRef = useRef(false);

  useEffect(() => {
    if (isFetching && fetchStartRef.current === null) {
      fetchStartRef.current = performance.now();
      if (!fetchStartLoggedRef.current) {
        fetchStartLoggedRef.current = true;
        mark(page, `${label} fetch-start`);
      }
    }

    if (loggedReadyRef.current) return;
    if (data === undefined || isFetching) return;

    loggedReadyRef.current = true;
    const source =
      fetchStartRef.current !== null
        ? `fetch ${Math.round(performance.now() - fetchStartRef.current)}ms`
        : "cache-hit";
    const start = pageStarts.get(page);
    const elapsed =
      start !== undefined ? Math.round(performance.now() - start) : 0;
    logLine(`[perf] ${page}: ${label} ready +${elapsed}ms (${source})`);
  }, [page, label, data, isFetching]);
}
