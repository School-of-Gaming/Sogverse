"use client";

import { useEffect, useRef } from "react";

const pageStarts = new Map<string, number>();

function logLine(line: string) {
  console.log(line);
}

function startPage(page: string) {
  pageStarts.set(page, performance.now());
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
