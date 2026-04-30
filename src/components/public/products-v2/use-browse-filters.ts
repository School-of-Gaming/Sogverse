"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TOPIC_PARAM = "topic";
const TAG_PARAM = "tag";

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// URL-state hook for the topic + tag chip filters.
//
// Toggling a chip writes via `router.replace({ scroll: false })` so chip
// taps don't push history entries or jerk the scroll position. Other
// query params (e.g. `?mock=1`) are preserved across writes.

export function useBrowseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const topics = useMemo(
    () => parseList(searchParams.get(TOPIC_PARAM)),
    [searchParams],
  );
  const tags = useMemo(
    () => parseList(searchParams.get(TAG_PARAM)),
    [searchParams],
  );
  const hasAny = topics.length > 0 || tags.length > 0;

  const writeNext = useCallback(
    (next: { topics?: string[]; tags?: string[] }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.topics !== undefined) {
        if (next.topics.length === 0) params.delete(TOPIC_PARAM);
        else params.set(TOPIC_PARAM, next.topics.join(","));
      }
      if (next.tags !== undefined) {
        if (next.tags.length === 0) params.delete(TAG_PARAM);
        else params.set(TAG_PARAM, next.tags.join(","));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleTopic = useCallback(
    (slug: string) => {
      const lower = slug.toLowerCase();
      const next = topics.includes(lower)
        ? topics.filter((t) => t !== lower)
        : [...topics, lower];
      writeNext({ topics: next });
    },
    [topics, writeNext],
  );

  const toggleTag = useCallback(
    (slug: string) => {
      const lower = slug.toLowerCase();
      const next = tags.includes(lower)
        ? tags.filter((t) => t !== lower)
        : [...tags, lower];
      writeNext({ tags: next });
    },
    [tags, writeNext],
  );

  const clear = useCallback(() => {
    writeNext({ topics: [], tags: [] });
  }, [writeNext]);

  return { topics, tags, hasAny, toggleTopic, toggleTag, clear };
}
