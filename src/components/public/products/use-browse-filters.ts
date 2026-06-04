"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  MIN_PRODUCT_AGE,
  MAX_PRODUCT_AGE,
} from "@/lib/constants/gamer-age";
import type { ProductFormat } from "./filter-products";

const TOPIC_PARAM = "topic";
const FORMAT_PARAM = "format";
const LANGUAGE_PARAM = "lang";
const AGE_PARAM = "age";

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseFormat(raw: string | null): ProductFormat | null {
  if (raw === "online" || raw === "in_person") return raw;
  return null;
}

// A single gamer age, clamped to the product age band. Anything out of range
// or unparseable reads as "any age" (null) so a hand-edited URL can't surface
// an option the filter never offered.
function parseAge(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_PRODUCT_AGE || n > MAX_PRODUCT_AGE) {
    return null;
  }
  return n;
}

// URL-state hook for the topic + tag + format chip filters.
//
// Toggling a chip writes via `router.replace({ scroll: false })` so chip
// taps don't push history entries or jerk the scroll position. Other
// query params (e.g. `?mock=1`) are preserved across writes.
//
// Format is single-valued — toggling a chip on with the other one active
// replaces, not adds. Selecting the active chip clears the filter.

export function useBrowseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const topics = useMemo(
    () => parseList(searchParams.get(TOPIC_PARAM)),
    [searchParams],
  );
  const format = useMemo(
    () => parseFormat(searchParams.get(FORMAT_PARAM)),
    [searchParams],
  );
  const languages = useMemo(
    () => parseList(searchParams.get(LANGUAGE_PARAM)),
    [searchParams],
  );
  const age = useMemo(
    () => parseAge(searchParams.get(AGE_PARAM)),
    [searchParams],
  );
  const hasAny =
    topics.length > 0 ||
    format !== null ||
    languages.length > 0 ||
    age !== null;

  const writeNext = useCallback(
    (next: {
      topics?: string[];
      format?: ProductFormat | null;
      languages?: string[];
      age?: number | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.topics !== undefined) {
        if (next.topics.length === 0) params.delete(TOPIC_PARAM);
        else params.set(TOPIC_PARAM, next.topics.join(","));
      }
      if (next.format !== undefined) {
        if (next.format === null) params.delete(FORMAT_PARAM);
        else params.set(FORMAT_PARAM, next.format);
      }
      if (next.languages !== undefined) {
        if (next.languages.length === 0) params.delete(LANGUAGE_PARAM);
        else params.set(LANGUAGE_PARAM, next.languages.join(","));
      }
      if (next.age !== undefined) {
        if (next.age === null) params.delete(AGE_PARAM);
        else params.set(AGE_PARAM, String(next.age));
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

  const toggleFormat = useCallback(
    (value: ProductFormat) => {
      writeNext({ format: format === value ? null : value });
    },
    [format, writeNext],
  );

  const toggleLanguage = useCallback(
    (code: string) => {
      const lower = code.toLowerCase();
      const next = languages.includes(lower)
        ? languages.filter((l) => l !== lower)
        : [...languages, lower];
      writeNext({ languages: next });
    },
    [languages, writeNext],
  );

  const setAge = useCallback(
    (value: number | null) => {
      writeNext({ age: value });
    },
    [writeNext],
  );

  const clear = useCallback(() => {
    writeNext({ topics: [], format: null, languages: [], age: null });
  }, [writeNext]);

  return {
    topics,
    format,
    languages,
    age,
    hasAny,
    toggleTopic,
    toggleFormat,
    toggleLanguage,
    setAge,
    clear,
  };
}
