"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Search, X } from "lucide-react";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { Input } from "@/components/ui/input";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useLanguageNames } from "@/hooks/use-language-names";
import { resolveLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import { formatWeekday } from "@/components/public/products/format-product-schedule";
import { PRODUCT_TYPE_PRESENTATION, PRODUCT_TYPE_ORDER } from "@/components/admin/dashboard/product-type-presentation";
import type { ProductType } from "@/types";
import {
  PRODUCT_FORMATS,
  productFormat,
  type AdminProductListFilters,
  type AdminProductListRow,
  type ProductFormat,
} from "./admin-product-list-data";

/**
 * The list's own controls: one search field and seven filters over a single
 * catalogue of every product type.
 *
 * **Every option set is derived from the rows actually present**, so a selection
 * can never yield nothing — a municipality that runs no clubs is not offered,
 * and neither is a weekday nothing meets on. The type chips are the exception
 * and deliberately so: there are four types, they are the list's primary axis,
 * and a chip vanishing because the current catalogue happens to hold no events
 * would make the row of chips a different shape on different days.
 *
 * **The type chips carry the tinted glyph, never a bare swatch.** Icon and
 * colour travel as a pair everywhere the platform names a product type; a chip
 * that dropped the glyph would need a key, and a chip that dropped the colour
 * would be one more thing to read in a row of four.
 *
 * **Active is a filter that is on**, drawn selected, rather than a default the
 * reader has to infer. Switching it off widens the list to finished, expired and
 * cancelled runs — which is a real thing an admin does (finding last spring's
 * camp to clone) and a terrible thing to open the page on.
 */
export function AdminProductFilterBar({
  rows,
  filters,
  onChange,
  onClear,
  shownCount,
}: {
  /** The **unfiltered** catalogue — option sets are derived from all of it. */
  rows: readonly AdminProductListRow[];
  filters: AdminProductListFilters;
  onChange: (next: AdminProductListFilters) => void;
  onClear: () => void;
  /** How many rows survive the current filters, for the "X of Y" line. */
  shownCount: number;
}) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();

  const set = <K extends keyof AdminProductListFilters>(
    key: K,
    value: AdminProductListFilters[K],
  ) => onChange({ ...filters, [key]: value });

  const toggleType = (type: ProductType) =>
    set(
      "types",
      filters.types.includes(type)
        ? filters.types.filter((t2) => t2 !== type)
        : [...filters.types, type],
    );

  const toggleFormat = (format: ProductFormat) =>
    set(
      "formats",
      filters.formats.includes(format)
        ? filters.formats.filter((f) => f !== format)
        : [...filters.formats, format],
    );

  const dayOptions = useMemo(() => {
    const present = new Set<number>();
    for (const row of rows)
      for (const slot of row.schedule.schedule_slots) present.add(slot.weekday);
    return [...present]
      .sort((a, b) => a - b)
      .map((weekday) => ({
        value: String(weekday),
        label: formatWeekday(weekday, uiLocale, "long"),
      }));
  }, [rows, uiLocale]);

  const geduOptions = useMemo(() => {
    const present = new Set<string>();
    for (const row of rows) for (const name of row.geduFirstNames) present.add(name);
    return [...present]
      .sort((a, b) => a.localeCompare(b, uiLocale))
      .map((name) => ({ value: name, label: name }));
  }, [rows, uiLocale]);

  const languageOptions = useMemo(() => {
    const present = new Set<string>();
    for (const row of rows) present.add(row.spokenLanguageCode);
    return [...present].sort().map((code) => {
      const name = languageName(code, code.toUpperCase());
      return {
        value: code,
        label: name,
        adornment: <LanguageFlag code={code} showCode={false} title={name} />,
      };
    });
  }, [rows, languageName]);

  const municipalityOptions = useMemo(() => {
    const present = new Set<string>();
    for (const row of rows)
      if (row.municipalityName !== null) present.add(row.municipalityName);
    return [...present]
      .sort((a, b) => a.localeCompare(b, uiLocale))
      .map((name) => ({ value: name, label: name }));
  }, [rows, uiLocale]);

  const formatCounts = useMemo(() => {
    const counts: Record<ProductFormat, number> = { online: 0, in_person: 0 };
    for (const row of rows) counts[productFormat(row)] += 1;
    return counts;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder={t("catalogue.searchPlaceholder")}
            aria-label={t("catalogue.searchLabel")}
            className="pl-9"
          />
        </div>

        {/* The type row. Four chips, always all four, each carrying the glyph
            and the hue this platform uses for that type everywhere else. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRODUCT_TYPE_ORDER.map((type) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[type];
            const Icon = presentation.icon;
            const selected = filters.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "border-foreground/30 bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("h-3.5 w-3.5", presentation.text)}
                />
                {t(`types.${presentation.i18nKey}.plural`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Active is a toggle rather than a dropdown because it has two states
            and one of them is the answer 95% of the time. Drawn selected while
            engaged, so nobody has to wonder why the cancelled camp they came
            looking for is not in the list. */}
        <button
          type="button"
          onClick={() => set("activeOnly", !filters.activeOnly)}
          aria-pressed={filters.activeOnly}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            filters.activeOnly
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {filters.activeOnly && <Check aria-hidden className="h-3.5 w-3.5" />}
          {t("catalogue.filters.active")}
        </button>

        {PRODUCT_FORMATS.map((format) => {
          const selected = filters.formats.includes(format);
          return (
            <button
              key={format}
              type="button"
              onClick={() => toggleFormat(format)}
              aria-pressed={selected}
              disabled={formatCounts[format] === 0}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                selected
                  ? "border-foreground/30 bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`catalogue.filters.format.${format}`)}
            </button>
          );
        })}
      </div>

      {/* The four ported club filters, no longer clubs-only: a camp has a
          weekday and an educator exactly as a club does, and hiding the controls
          on two of the four types was an artefact of the list being split by
          type rather than a statement about the data. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FilterDropdown
          label={t("filters.day")}
          allLabel={t("filters.allDays")}
          options={dayOptions}
          value={filters.day}
          onChange={(value) => set("day", value)}
        />
        <FilterCombobox
          label={t("filters.gedu")}
          placeholder={t("filters.searchGedu")}
          options={geduOptions}
          value={filters.gedu}
          onChange={(value) => set("gedu", value)}
          noResultsLabel={t("filters.noResults")}
        />
        <FilterDropdown
          label={t("filters.language")}
          allLabel={t("filters.allLanguages")}
          options={languageOptions}
          value={filters.language}
          onChange={(value) => set("language", value)}
        />
        <FilterCombobox
          label={t("filters.municipality")}
          placeholder={t("filters.searchMunicipality")}
          options={municipalityOptions}
          value={filters.municipality}
          onChange={(value) => set("municipality", value)}
          noResultsLabel={t("filters.noResults")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {t("filters.showing", { count: shownCount, total: rows.length })}
        </span>
        {/* No vertical padding: the button has to be exactly the height of the
            count beside it, or toggling it in and out grows the row and shifts
            the table under it. */}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 transition-colors hover:text-foreground"
        >
          <X aria-hidden className="h-3 w-3" />
          {t("filters.clear")}
        </button>
      </div>
    </div>
  );
}
