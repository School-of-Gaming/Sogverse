"use client";

/**
 * Page-load perf logger — diagnostic tool, not load-bearing.
 *
 * Goal: a single fenced markdown block on the console per page load, dense
 * enough to paste into a Claude conversation and get a diagnosis without
 * back-and-forth. Lives until the app's perf architecture (locale-in-URL,
 * scoped dashboard layout, static public pages — see TODO.md) makes the
 * common slow cases impossible, at which point this can be deleted wholesale.
 *
 * Removal recipe (when the time comes):
 *   1. Delete this file (`src/lib/perf.ts`) and its wrapper
 *      (`src/components/dev/perf-logger.tsx`).
 *   2. Grep `usePagePerf|useQueryPerf|PerfLogger` across `src/` — remove the
 *      imports and the hook/component calls from each page. Nothing else
 *      depends on it.
 *   3. There is no other entanglement: no providers, no context, no
 *      registered hooks elsewhere, no env vars required (the
 *      NEXT_PUBLIC_VERCEL_* reads fall back to "local"), no CSS, no styles.
 *
 * Adding to a new page: drop `usePagePerf("route/name")` at the top of a
 * client component on that route. Optionally pair `useQueryPerf(...)` with
 * each React Query call you want timed. No other setup.
 */

import { useEffect, useRef } from "react";

const SETTLE_QUIET_WINDOW_MS = 750;
const SETTLE_MIN_WAIT_MS = 1000;
const SETTLE_MAX_WAIT_MS = 10000;
const SETTLE_POLL_INTERVAL_MS = 250;
const SLOW_RESOURCE_MS = 500;
const LONG_TASK_MS = 200;
const RSC_PREFETCH_MARKER = "?_rsc=";

const THRESHOLDS = {
  ttfb: { warn: 200, bad: 600 },
  lcp: { warn: 2500, bad: 4000 },
  fcp: { warn: 1800, bad: 3000 },
  cls: { warn: 0.1, bad: 0.25 },
  jsBytes: { warn: 307_200, bad: 1_048_576 },
} as const;

type Verdict = "OK" | "WARN" | "BAD";

interface QueryEntry {
  label: string;
  registeredAt: number;
  fetchStart: number | null;
  resolvedAt: number | null;
}

interface PageState {
  page: string;
  startedAt: number;
  navType: string;
  queries: Map<string, QueryEntry>;
  longTasks: Array<{ duration: number; startTime: number }>;
  cls: number;
  lcp: number | null;
  fcp: number | null;
  lastActivityAt: number;
  emitted: boolean;
  observers: PerformanceObserver[];
  settleTimer: ReturnType<typeof setInterval> | null;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

const pageStates = new Map<string, PageState>();
let hasEmittedThisDocument = false;

function classify(
  value: number,
  threshold: { warn: number; bad: number },
): Verdict {
  if (value >= threshold.bad) return "BAD";
  if (value >= threshold.warn) return "WARN";
  return "OK";
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)}MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function detectNavType(): string {
  if (hasEmittedThisDocument) return "soft";
  const nav = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return "hard (unknown)";
  switch (nav.type) {
    case "navigate":
      return "hard (initial)";
    case "reload":
      return "hard (reload)";
    case "back_forward":
      return "hard (back/forward)";
    case "prerender":
      return "hard (prerender)";
    default:
      return `hard (${nav.type})`;
  }
}

const UA_BROWSERS: Array<readonly [string, RegExp]> = [
  ["Edge", /Edg\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Safari", /Version\/(\d+).*Safari/],
];

function getUaShort(): string {
  if (typeof navigator === "undefined") return "?";
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let version = "?";
  for (const [name, regex] of UA_BROWSERS) {
    const match = regex.exec(ua);
    if (match) {
      browser = name;
      version = match[1];
      break;
    }
  }

  let platform = "Unknown OS";
  if (ua.includes("Windows")) platform = "Windows";
  else if (ua.includes("Mac OS X")) platform = "macOS";
  else if (ua.includes("Android")) platform = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";
  else if (ua.includes("Linux")) platform = "Linux";

  return `${browser} ${version} / ${platform}`;
}

function getNetworkInfo(): string {
  if (typeof navigator === "undefined") return "?";
  const conn = (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
  if (!conn) return "(unavailable)";
  const parts: string[] = [];
  if (conn.effectiveType) parts.push(conn.effectiveType);
  if (conn.downlink !== undefined) parts.push(`downlink=${conn.downlink}Mbps`);
  if (conn.rtt !== undefined) parts.push(`rtt=${conn.rtt}ms`);
  if (conn.saveData) parts.push("save-data");
  return parts.length > 0 ? parts.join(" ") : "(empty)";
}

type ResourceBucket = { bytes: number; count: number };
type ResourceBuckets = Record<
  "js" | "css" | "font" | "image" | "fetch" | "other",
  ResourceBucket
>;

function getResourceSummary(): ResourceBuckets {
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const buckets: ResourceBuckets = {
    js: { bytes: 0, count: 0 },
    css: { bytes: 0, count: 0 },
    font: { bytes: 0, count: 0 },
    image: { bytes: 0, count: 0 },
    fetch: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 },
  };

  for (const e of entries) {
    const url = e.name;
    let type: keyof ResourceBuckets = "other";
    if (e.initiatorType === "script" || /\.(?:js|mjs)(?:\?|$)/.test(url))
      type = "js";
    else if (/\.css(?:\?|$)/.test(url)) type = "css";
    else if (/\.(?:woff2?|ttf|otf|eot)(?:\?|$)/.test(url)) type = "font";
    else if (
      e.initiatorType === "img" ||
      /\.(?:png|jpe?g|webp|avif|svg|gif|ico)(?:\?|$)/.test(url)
    )
      type = "image";
    else if (
      e.initiatorType === "fetch" ||
      e.initiatorType === "xmlhttprequest"
    )
      type = "fetch";

    buckets[type].bytes += e.transferSize || 0;
    buckets[type].count += 1;
  }

  return buckets;
}

interface SlowResource {
  duration: number;
  initiatorType: string;
  host: string;
  path: string;
}

function getSlowResources(topN: number): SlowResource[] {
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  return entries
    .filter((e) => e.duration >= SLOW_RESOURCE_MS)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, topN)
    .map((e) => {
      let host = "?";
      let path = e.name;
      try {
        const u = new URL(e.name);
        host = u.host;
        path = u.pathname + u.search;
      } catch {
        // non-URL resource name — fall back to the raw string
      }
      return {
        duration: e.duration,
        initiatorType: e.initiatorType,
        host,
        path: path.length > 80 ? `${path.slice(0, 77)}...` : path,
      };
    });
}

interface RscPrefetchSummary {
  count: number;
  median: number;
  max: number;
  overOneSec: number;
}

function getRscPrefetches(): RscPrefetchSummary {
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const prefetches = entries.filter((e) =>
    e.name.includes(RSC_PREFETCH_MARKER),
  );
  if (prefetches.length === 0)
    return { count: 0, median: 0, max: 0, overOneSec: 0 };
  const durations = prefetches.map((p) => p.duration).sort((a, b) => a - b);
  return {
    count: prefetches.length,
    median: Math.round(durations[Math.floor(durations.length / 2)]),
    max: Math.round(durations[durations.length - 1]),
    overOneSec: durations.filter((d) => d > 1000).length,
  };
}

interface NavTimingSummary {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  domInteractive: number;
  dcl: number;
  serverTiming: string[];
}

function getNavTiming(): NavTimingSummary | null {
  const nav = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (!nav || nav.requestStart === 0) return null;
  return {
    dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    tcp: Math.round(nav.connectEnd - nav.connectStart),
    tls:
      nav.secureConnectionStart > 0
        ? Math.round(nav.connectEnd - nav.secureConnectionStart)
        : 0,
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    download: Math.round(nav.responseEnd - nav.responseStart),
    domInteractive: Math.round(nav.domInteractive - nav.requestStart),
    dcl: Math.round(nav.domContentLoadedEventStart - nav.requestStart),
    serverTiming: nav.serverTiming.map((s) => {
      const parts = [s.name];
      if (s.duration) parts.push(`dur=${s.duration}`);
      if (s.description) parts.push(`desc=${s.description}`);
      return parts.join(";");
    }),
  };
}

function markActivity(state: PageState) {
  state.lastActivityAt = performance.now();
}

function trySettle(state: PageState) {
  if (state.emitted) return;

  const now = performance.now();
  const elapsed = now - state.startedAt;
  const sinceActivity = now - state.lastActivityAt;

  if (elapsed >= SETTLE_MAX_WAIT_MS) {
    emit(state);
    return;
  }
  if (elapsed < SETTLE_MIN_WAIT_MS) return;
  if (sinceActivity < SETTLE_QUIET_WINDOW_MS) return;
  for (const q of state.queries.values()) {
    if (q.resolvedAt === null) return;
  }

  emit(state);
}

function emit(state: PageState) {
  if (state.emitted) return;
  state.emitted = true;
  hasEmittedThisDocument = true;

  if (state.settleTimer !== null) {
    clearInterval(state.settleTimer);
    state.settleTimer = null;
  }
  for (const obs of state.observers) obs.disconnect();

  const isSoft = state.navType === "soft";
  const navTiming = isSoft ? null : getNavTiming();
  const resources = getResourceSummary();
  const slow = getSlowResources(5);
  const prefetches = getRscPrefetches();

  const ttfbVerdict = navTiming ? classify(navTiming.ttfb, THRESHOLDS.ttfb) : null;
  const lcpVerdict =
    state.lcp !== null ? classify(state.lcp, THRESHOLDS.lcp) : null;
  const fcpVerdict =
    state.fcp !== null ? classify(state.fcp, THRESHOLDS.fcp) : null;
  const clsVerdict = classify(state.cls, THRESHOLDS.cls);
  const jsVerdict = classify(resources.js.bytes, THRESHOLDS.jsBytes);

  const verdictParts: string[] = [];
  if (navTiming && ttfbVerdict)
    verdictParts.push(`TTFB=${navTiming.ttfb}ms ${ttfbVerdict}`);
  if (state.lcp !== null && lcpVerdict)
    verdictParts.push(`LCP=${fmtMs(state.lcp)} ${lcpVerdict}`);
  verdictParts.push(`JS=${fmtBytes(resources.js.bytes)} ${jsVerdict}`);
  verdictParts.push(`RSC=${prefetches.count}`);
  verdictParts.push(`long-tasks=${state.longTasks.length}`);
  if (state.cls > 0) verdictParts.push(`CLS=${state.cls.toFixed(3)} ${clsVerdict}`);

  const lines: string[] = [];
  lines.push("```");
  lines.push(
    `[perf] ${state.page} · ${state.navType} · settled +${Math.round(performance.now() - state.startedAt)}ms`,
  );
  lines.push(`verdict: ${verdictParts.join(" · ")}`);
  lines.push("");

  lines.push("# identity");
  if (typeof location !== "undefined") {
    lines.push(`route       ${location.pathname}`);
    lines.push(`url         ${location.href}`);
  }
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || "?"
      : "?";
  lines.push(`locale      ${locale}`);
  lines.push(
    `env         ${process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local"}`,
  );
  lines.push(
    `build       ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}`,
  );
  lines.push(`ua          ${getUaShort()}`);
  lines.push(`network     ${getNetworkInfo()}`);
  lines.push("");

  lines.push("# web vitals");
  lines.push(
    `LCP         ${state.lcp !== null ? `${fmtMs(state.lcp)}   ${lcpVerdict}` : "(not measured)"}`,
  );
  lines.push(
    `FCP         ${state.fcp !== null ? `${fmtMs(state.fcp)}   ${fcpVerdict}` : "(not measured)"}`,
  );
  lines.push(`CLS         ${state.cls.toFixed(3)}   ${clsVerdict}`);
  lines.push("");

  if (navTiming) {
    lines.push("# nav timing");
    lines.push(
      `DNS=${navTiming.dns}ms  TCP=${navTiming.tcp}ms  TLS=${navTiming.tls}ms  TTFB=${navTiming.ttfb}ms ${ttfbVerdict}  download=${navTiming.download}ms`,
    );
    lines.push(
      `domInteractive=${navTiming.domInteractive}ms  DCL=${navTiming.dcl}ms`,
    );
    if (navTiming.serverTiming.length > 0) {
      lines.push("");
      lines.push("# server-timing");
      for (const s of navTiming.serverTiming) lines.push(`  ${s}`);
    }
    lines.push("");
  } else {
    lines.push("# nav timing");
    lines.push(
      "(soft nav — initial-document timing omitted; the transition itself is not directly measurable here)",
    );
    lines.push("");
  }

  lines.push("# resources");
  for (const [name, bucket] of Object.entries(resources) as Array<
    [keyof ResourceBuckets, ResourceBucket]
  >) {
    if (bucket.count === 0) continue;
    const verdict = name === "js" ? `  ${jsVerdict}` : "";
    lines.push(
      `${name.padEnd(10)}  ${fmtBytes(bucket.bytes).padEnd(8)} (${bucket.count} files)${verdict}`,
    );
  }
  lines.push("");

  if (slow.length > 0) {
    lines.push(`# slow resources (>${SLOW_RESOURCE_MS}ms, top ${slow.length})`);
    for (const s of slow) {
      lines.push(
        `  ${Math.round(s.duration)}ms  ${s.initiatorType.padEnd(8)} ${s.host}${s.path}`,
      );
    }
    lines.push("");
  }

  lines.push("# rsc-prefetches");
  if (prefetches.count === 0) {
    lines.push("  count=0");
  } else {
    lines.push(
      `  count=${prefetches.count}  median=${prefetches.median}ms  max=${prefetches.max}ms  over-1s=${prefetches.overOneSec}`,
    );
  }
  lines.push("");

  if (state.longTasks.length > 0) {
    const totalMs = state.longTasks.reduce((sum, t) => sum + t.duration, 0);
    const maxTask = state.longTasks.reduce((max, t) =>
      t.duration > max.duration ? t : max,
    );
    lines.push("# long tasks");
    lines.push(
      `  ${state.longTasks.length} tasks · ${Math.round(totalMs)}ms total blocking · max ${Math.round(maxTask.duration)}ms at +${Math.round(maxTask.startTime)}ms`,
    );
    lines.push("");
  }

  if (state.queries.size > 0) {
    lines.push("# queries");
    for (const q of state.queries.values()) {
      if (q.resolvedAt === null) {
        lines.push(`  ${q.label.padEnd(28)} (pending at settle)`);
        continue;
      }
      const elapsed = Math.round(q.resolvedAt - state.startedAt);
      const source =
        q.fetchStart !== null
          ? `fetch ${Math.round(q.resolvedAt - q.fetchStart)}ms`
          : "cache-hit";
      lines.push(`  ${q.label.padEnd(28)} ready +${elapsed}ms (${source})`);
    }
    lines.push("");
  }

  lines.push("```");

  console.log(lines.join("\n"));
}

function startObservers(state: PageState) {
  if (typeof PerformanceObserver === "undefined") return;

  const safeObserve = (
    type: string,
    handler: (entries: PerformanceEntry[]) => void,
  ) => {
    try {
      const obs = new PerformanceObserver((list) => handler(list.getEntries()));
      obs.observe({ type, buffered: true });
      state.observers.push(obs);
    } catch {
      // entry type unsupported in this browser — skip silently
    }
  };

  safeObserve("resource", (entries) => {
    if (entries.length > 0) markActivity(state);
  });

  safeObserve("longtask", (entries) => {
    for (const t of entries) {
      if (t.duration > LONG_TASK_MS) {
        state.longTasks.push({ duration: t.duration, startTime: t.startTime });
        markActivity(state);
      }
    }
  });

  safeObserve("largest-contentful-paint", (entries) => {
    if (entries.length === 0) return;
    state.lcp = entries[entries.length - 1].startTime;
    markActivity(state);
  });

  safeObserve("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint") state.fcp = e.startTime;
    }
  });

  safeObserve("layout-shift", (entries) => {
    for (const e of entries as LayoutShiftEntry[]) {
      if (!e.hadRecentInput) state.cls += e.value;
    }
  });
}

/**
 * Collects nav timing, web vitals, resource totals, slow resources, RSC
 * prefetches, long tasks, and React Query timings, then emits a single
 * fenced markdown block to the console once the page settles (quiet for
 * 750ms, all registered queries resolved, ≥1s and ≤10s after mount).
 *
 * Designed so the console output can be copied wholesale and pasted into
 * a Claude conversation for diagnosis.
 */
export function usePagePerf(page: string) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (typeof performance === "undefined") return;

    const state: PageState = {
      page,
      startedAt: performance.now(),
      navType: detectNavType(),
      queries: new Map(),
      longTasks: [],
      cls: 0,
      lcp: null,
      fcp: null,
      lastActivityAt: performance.now(),
      emitted: false,
      observers: [],
      settleTimer: null,
    };

    pageStates.set(page, state);
    startObservers(state);
    state.settleTimer = setInterval(
      () => trySettle(state),
      SETTLE_POLL_INTERVAL_MS,
    );

    return () => {
      if (!state.emitted) emit(state);
      pageStates.delete(page);
    };
  }, [page]);
}

/**
 * Registers a React Query observation with the page's perf logger.
 * Collected silently and included in the page's settle-time emit.
 */
export function useQueryPerf<T>(
  page: string,
  label: string,
  data: T | undefined,
  isFetching: boolean,
) {
  const registeredRef = useRef(false);

  useEffect(() => {
    const state = pageStates.get(page);
    if (!state) return;

    if (!registeredRef.current) {
      registeredRef.current = true;
      state.queries.set(label, {
        label,
        registeredAt: performance.now(),
        fetchStart: null,
        resolvedAt: null,
      });
      markActivity(state);
    }

    const entry = state.queries.get(label);
    if (!entry || entry.resolvedAt !== null) return;

    if (isFetching && entry.fetchStart === null) {
      entry.fetchStart = performance.now();
      markActivity(state);
    }

    if (data !== undefined && !isFetching) {
      entry.resolvedAt = performance.now();
      markActivity(state);
    }
  }, [page, label, data, isFetching]);
}
