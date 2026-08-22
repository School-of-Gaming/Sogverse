"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { findAgeBand, type AgeBand } from "@/lib/constants/gamer-age";
import type { ProductFormat } from "./filter-products";
import {
  isAudienceFilterValue,
  type AudienceFilterValue,
} from "./product-audience";
import { isProductTag, type ProductTag } from "./product-tag";
import {
  isSpokenLanguageCode,
  type SpokenLanguageCode,
} from "@/lib/constants/spoken-languages";
import { CATEGORY_PARAM } from "./shop-categories";

const TOPIC_PARAM = "topic";
const FORMAT_PARAM = "format";
const LANGUAGE_PARAM = "lang";
const AUDIENCE_PARAM = "audience";
const TAG_PARAM = "tag";
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

// The audience chips, deduped and restricted to the two values the row offers
// ("parents", "families"), so a hand-edited `?audience=everyone` — or a stale
// link carrying the retired `?audience=gamers` — reads as no selection rather
// than filtering the grid down to nothing.
function parseAudiences(raw: string | null): AudienceFilterValue[] {
  const seen = new Set<AudienceFilterValue>();
  for (const value of parseList(raw)) {
    if (isAudienceFilterValue(value)) seen.add(value);
  }
  return [...seen];
}

// The design-tag chips, deduped and restricted to the enum's own values through
// the tag module's guard — so a hand-edited `?tag=gifted`, or a link written
// against a tag a later migration renamed, reads as no selection rather than
// emptying the grid. Never spelled out here: the vocabulary is codegen's, and
// this file is not a second copy of it.
function parseTags(raw: string | null): ProductTag[] {
  const seen = new Set<ProductTag>();
  for (const value of parseList(raw)) {
    if (isProductTag(value)) seen.add(value);
  }
  return [...seen];
}

// The language chips, on the same terms as the tags: deduped and narrowed to
// the `spoken_language` enum through its guard, so `?lang=de` — or a link
// written before a language was retired — reads as no selection instead of
// emptying the grid. This is the one place a raw string becomes a language code
// on this surface; everything downstream carries the type.
function parseLanguages(raw: string | null): SpokenLanguageCode[] {
  const seen = new Set<SpokenLanguageCode>();
  for (const value of parseList(raw)) {
    if (isSpokenLanguageCode(value)) seen.add(value);
  }
  return [...seen];
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
// Toggling a chip writes via `window.history.replaceState` — no history
// entries pushed, no scroll jerk, no RSC navigation (see the note inside
// `writeNext`). Other query params (e.g. `?mock=1`) are preserved across
// writes.
//
// Format is single-valued — toggling a chip on with the other one active
// replaces, not adds. Selecting the active chip clears the filter.
//
// `clear` is the one place this hook reaches outside its own params: it also
// drops the shop's `category` param (owned by `useShopCategories`), because
// "Clear all" means every filter including Type. See the note on `clear`.

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
    () => parseLanguages(searchParams.get(LANGUAGE_PARAM)),
    [searchParams],
  );
  const audiences = useMemo(
    () => parseAudiences(searchParams.get(AUDIENCE_PARAM)),
    [searchParams],
  );
  const tags = useMemo(
    () => parseTags(searchParams.get(TAG_PARAM)),
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
  // Every filter *in this hook* applies on every browse surface, so one flag
  // covers all of them. It is not the whole Clear-button condition on its own:
  // clearing also resets the shop's Type row, so the button's owner ORs the
  // selected categories in (see `product-browse-filters.tsx`).
  const hasAny =
    topics.length > 0 ||
    format !== null ||
    languages.length > 0 ||
    audiences.length > 0 ||
    tags.length > 0 ||
    age !== null ||
    days.length > 0;

  const writeNext = useCallback(
    (
      next: {
        topics?: string[];
        format?: ProductFormat | null;
        languages?: SpokenLanguageCode[];
        audiences?: AudienceFilterValue[];
        tags?: ProductTag[];
        age?: AgeBand | null;
        days?: number[];
      },
      // The shop's Type param isn't one of this hook's filters; it rides along
      // here so "Clear all" stays a single write (see `clear`).
      options?: { clearCategories?: boolean },
    ) => {
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
      if (next.audiences !== undefined) {
        if (next.audiences.length === 0) params.delete(AUDIENCE_PARAM);
        else params.set(AUDIENCE_PARAM, next.audiences.join(","));
      }
      if (next.tags !== undefined) {
        if (next.tags.length === 0) params.delete(TAG_PARAM);
        else params.set(TAG_PARAM, next.tags.join(","));
      }
      if (next.age !== undefined) {
        if (next.age === null) params.delete(AGE_PARAM);
        else params.set(AGE_PARAM, `${next.age.min}-${next.age.max}`);
      }
      if (next.days !== undefined) {
        if (next.days.length === 0) params.delete(DAYS_PARAM);
        else params.set(DAYS_PARAM, next.days.join(","));
      }
      if (options?.clearCategories) params.delete(CATEGORY_PARAM);
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

  // The caller is the chip row, which enumerates the enum, so there is no
  // case-folding to do here: the value arrives already being one of the codes.
  const toggleLanguage = useCallback(
    (code: SpokenLanguageCode) => {
      const next = languages.includes(code)
        ? languages.filter((l) => l !== code)
        : [...languages, code];
      writeNext({ languages: next });
    },
    [languages, writeNext],
  );

  // Multi-select like topic and language, not single-valued like format — but
  // each chip is a tag rather than a flag, so the row never widens back to the
  // unfiltered grid: both chips lit is every product carrying an audience
  // badge, which deliberately excludes the gamers-only ones (the assumed
  // default, badged with nothing). Clearing the row is the only way back to
  // everything.
  const toggleAudience = useCallback(
    (value: AudienceFilterValue) => {
      const next = audiences.includes(value)
        ? audiences.filter((a) => a !== value)
        : [...audiences, value];
      writeNext({ audiences: next });
    },
    [audiences, writeNext],
  );

  // The audience row's shape exactly, for the same reason: a chip is the chip
  // the card wears, so the row never widens back to the unfiltered grid. Every
  // chip lit is every tagged product, and the untagged majority — which carries
  // no chip at all — is reachable only by clearing the row.
  const toggleTag = useCallback(
    (value: ProductTag) => {
      const next = tags.includes(value)
        ? tags.filter((tag) => tag !== value)
        : [...tags, value];
      writeNext({ tags: next });
    },
    [tags, writeNext],
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

  // "Clear all" means all of them, Type included: the shop's category chips are
  // an ordinary inclusive filter, so clearing returns to the default view with
  // every section showing. The category param is deleted here rather than by
  // calling into `useShopCategories` because both hooks read a snapshot of
  // `useSearchParams()` — a second, sequential write would rebuild the query
  // string from the pre-clear snapshot and resurrect everything this one just
  // deleted. One `replaceState`, or nothing. On the municipality page the
  // delete is a no-op in practice (nothing there writes the param), but a
  // stray hand-edited `?category=` would still be *read* — which is why the
  // Clear button's visibility gates the categories term on the Type row being
  // rendered (see `product-browse-filters.tsx`).
  const clear = useCallback(() => {
    writeNext(
      {
        topics: [],
        format: null,
        languages: [],
        audiences: [],
        tags: [],
        age: null,
        days: [],
      },
      { clearCategories: true },
    );
  }, [writeNext]);

  return {
    topics,
    format,
    languages,
    audiences,
    tags,
    age,
    days,
    hasAny,
    toggleTopics,
    toggleFormat,
    toggleLanguage,
    toggleAudience,
    toggleTag,
    setAge,
    toggleDay,
    clear,
  };
}
