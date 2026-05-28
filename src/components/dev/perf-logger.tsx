"use client";

import { usePagePerf } from "@/lib/perf";

/**
 * Mounts the page-load perf logger from a server component. Renders nothing.
 * Remove together with `src/lib/perf.ts` when the perf logger is retired.
 */
export function PerfLogger({ page }: { page: string }) {
  usePagePerf(page);
  return null;
}
