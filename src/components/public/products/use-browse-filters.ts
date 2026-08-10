"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { findAgeBand, type AgeBand } from "@/lib/constants/gamer-age";
import type { ProductFormat } from "./filter-products";

const TOPIC_PARAM = "topic";
const FORMAT_PARAM = "format";
const LANGUAGE_PARAM = "lang";
const AGE_PARAM = "age";
const DAYS_PARAM = "days";

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Weekdays as integers 0=Mon..6=Sun (matching `schedule_slots.weekday`).
// Anything out of range or unparseable is dropped so a hand-edited URL can't
// surface a day the filter never offered; the result is deduped and sorted so
// `?days=4,0,4` normalises to `[0, 4]`.
function parseDays(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function parseFormat(raw: string | null): ProductFormat | null {
  if (raw === "online" || raw === "in_person") return raw;
  return null;
}

// A selected age band, encoded as "min-max" (e.g. "7-9"). Only a value matching
// one of the offered bands resolves; anything else reads as "any age" (null) so
// a hand-edited URL can't surface a band the filter never offered.
function parseAge(raw: string | null): AgeBand | null {
  if (!raw) return null;
  const [minRaw, maxRaw] = raw.split("-");
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  return findAgeBand(min, max);
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
  const days = useMemo(
    () => parseDays(searchParams.get(DAYS_PARAM)),
    [searchParams],
  );
  // Every filter here applies on every browse surface, so one flag covers the
  // Clear button: it shows exactly when clearing would change something.
  const hasAny =
    topics.length > 0 ||
    format !== null ||
    languages.length > 0 ||
    age !== null ||
    days.length > 0;

  const writeNext = useCallback(
    (next: {
      topics?: string[];
      format?: ProductFormat | null;
      languages?: string[];
      age?: AgeBand | null;
      days?: number[];
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
        else params.set(AGE_PARAM, `${next.age.min}-${next.age.max}`);
      }
      if (next.days !== undefined) {
        if (next.days.length === 0) params.delete(DAYS_PARAM);
        else params.set(DAYS_PARAM, next.days.join(","));
      }
      const qs = params.toString();
      // Update the URL via the History API rather than `router.replace` so a
      // chip tap doesn't trigger an RSC navigation. The shop page is a dynamic
      // async Server Component (it re-runs three RLS-scoped Supabase queries on
      // every render); routing here would refetch that payload before the
      // client-side `filterProducts()` — which needs no server data — could
      // run, making the filter feel laggy. `useSearchParams()` reflects
      // `replaceState`, so every reader in this hook updates synchronously.
      window.history.replaceState(
        null,
        "",
        qs ? `${pathname}?${qs}` : pathname,
      );
    },
    [pathname, searchParams],
  );

  // Toggle a group of topics as one unit. Most chips carry a single topic; the
  // "Minecraft" chip stands for all three editions on every browse surface.
  // Toggling on adds the whole group (deduped) — a partially-selected group
  // (possible via URL) completes to the full group; toggling off removes it.
  const toggleTopics = useCallback(
    (group: readonly string[]) => {
      const lowers = group.map((g) => g.toLowerCase());
      const allActive = lowers.every((l) => topics.includes(l));
      const next = allActive
        ? topics.filter((t) => !lowers.includes(t))
        : [...new Set([...topics, ...lowers])];
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
    (value: AgeBand | null) => {
      writeNext({ age: value });
    },
    [writeNext],
  );

  const toggleDay = useCallback(
    (weekday: number) => {
      const next = days.includes(weekday)
        ? days.filter((d) => d !== weekday)
        : [...days, weekday].sort((a, b) => a - b);
      writeNext({ days: next });
    },
    [days, writeNext],
  );

  const clear = useCallback(() => {
    writeNext({ topics: [], format: null, languages: [], age: null, days: [] });
  }, [writeNext]);

  return {
    topics,
    format,
    languages,
    age,
    days,
    hasAny,
    toggleTopics,
    toggleFormat,
    toggleLanguage,
    setAge,
    toggleDay,
    clear,
  };
}
