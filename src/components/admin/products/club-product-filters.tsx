"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useSpokenLanguages, useUsersByRole } from "@/services/users";
import { useAllLocations } from "@/services/locations";
import { buildAncestorChain } from "@/components/locations/location-tree";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatWeekday } from "@/components/public/products/format-product-schedule";
import { resolveLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import { ProductRows } from "./product-rows";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductWithDetails } from "@/services/products";
import type { Location, ProductType } from "@/types";

interface ClubProductFiltersProps {
  productType: ProductType;
  products: ProductWithDetails[];
}

// The filtered club list. Owns the day / educator / language / municipality
// filters and the reference-data hooks they need; only mounts for the two club
// types (camps/events render <ProductRows> directly), so the extra reference
// queries never fire on the other admin product pages.
//
// All filters are single-select; no selection means "all", and active filters
// AND together — a row must satisfy every one. Filtering is client-side over
// the already loaded list; the day/educator/language/municipality data all ride
// on the list query (educator via `gedu_group_assignments`, municipality
// resolved from `location_id` against the locations tree).
export function ClubProductFilters({
  productType,
  products,
}: ClubProductFiltersProps) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const config = PRODUCT_TYPE_CONFIG[productType];
  const plural = t(`types.${config.i18nKey}.plural`);

  const isConsumer = productType === "consumer_club";
  const isMunicipality = productType === "municipality_club";

  const [day, setDay] = useState<string | null>(null);
  const [geduId, setGeduId] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [municipalityId, setMunicipalityId] = useState<string | null>(null);

  // All three reference queries fire for both club types even though each page
  // only reads a subset: consumer clubs ignore `locations` (the largest of the
  // three — the whole locations tree), municipality clubs ignore
  // `spokenLanguages`. Left unconditional on purpose: the queries are cheap and
  // cached, and gating them would mean splitting the municipality-only work into
  // a child component that only mounts for `isMunicipality`. If the locations
  // tree ever grows enough to matter, that split is the fix.
  const { data: gedus } = useUsersByRole("gedu");
  const { data: spokenLanguages } = useSpokenLanguages();
  const { data: locations } = useAllLocations();

  const languageName = useLanguageNames();

  // Resolve each club to its Finnish municipality. A municipality club's
  // `location_id` is either the municipality itself (online clubs pick one) or
  // a site beneath it (in-person clubs pin a leaf site) — walking the ancestor
  // chain and picking the `municipality` node handles both shapes. DB CHECK
  // constraints guarantee a municipality club always has a `location_id`, so
  // there's no "no municipality" bucket here.
  const muniByProduct = useMemo(() => {
    const map = new Map<string, Location>();
    if (!locations) return map;
    const byId = new Map(locations.map((l) => [l.id, l]));
    for (const p of products) {
      if (!p.location_id) continue;
      const loc = byId.get(p.location_id);
      if (!loc) continue;
      const muni = buildAncestorChain(loc, locations).find(
        (c) => c.type === "municipality",
      );
      if (muni) map.set(p.id, muni);
    }
    return map;
  }, [locations, products]);

  // Each filter's options are derived from the values actually present on the
  // listed clubs, so a selection always yields at least one match (no dead
  // entries). Day/educator/municipality sort by localized label; language keeps
  // its canonical reference order.
  const dayOptions = useMemo(() => {
    const present = new Set<number>();
    for (const p of products)
      for (const s of p.schedule_slots) present.add(s.weekday);
    return [...present]
      .sort((a, b) => a - b)
      .map((w) => ({ value: String(w), label: formatWeekday(w, uiLocale, "long") }));
  }, [products, uiLocale]);

  const geduOptions = useMemo(() => {
    const present = new Set<string>();
    for (const p of products)
      for (const a of p.gedu_group_assignments) present.add(a.gedu_id);
    const nameById = new Map(
      (gedus ?? []).map((g) => [
        g.id,
        [g.first_name, g.last_name].filter(Boolean).join(" ") || g.first_name,
      ]),
    );
    return [...present]
      .map((id) => ({ value: id, label: nameById.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, uiLocale));
  }, [products, gedus, uiLocale]);

  const languageOptions = useMemo(() => {
    if (!isConsumer) return [];
    const present = new Set<string>();
    for (const p of products)
      if (p.spoken_language_code) present.add(p.spoken_language_code);
    // Order by the canonical spoken-language reference order (same as the
    // spoken-language checkboxes), not alphabetically — language lists have a
    // conventional ordering. Any present code missing from the reference list
    // is appended defensively.
    const ordered = (spokenLanguages ?? [])
      .map((l) => l.code)
      .filter((code) => present.has(code));
    for (const code of present) if (!ordered.includes(code)) ordered.push(code);
    return ordered.map((code) => {
      const name = languageName(code, code.toUpperCase());
      return {
        value: code,
        label: name,
        adornment: <LanguageFlag code={code} showCode={false} title={name} />,
      };
    });
  }, [products, spokenLanguages, languageName, isConsumer]);

  const municipalityOptions = useMemo(() => {
    if (!isMunicipality) return [];
    const byId = new Map<string, string>();
    for (const muni of muniByProduct.values()) {
      if (!byId.has(muni.id))
        byId.set(muni.id, localizedLocationName(muni, uiLocale));
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, uiLocale));
  }, [muniByProduct, isMunicipality, uiLocale]);

  const filtered = useMemo(() => {
    const dayNum = day === null ? null : Number(day);
    return products.filter((p) => {
      if (dayNum !== null && !p.schedule_slots.some((s) => s.weekday === dayNum))
        return false;
      if (
        geduId !== null &&
        !p.gedu_group_assignments.some((a) => a.gedu_id === geduId)
      )
        return false;
      if (isConsumer && language !== null && p.spoken_language_code !== language)
        return false;
      if (isMunicipality && municipalityId !== null) {
        if (muniByProduct.get(p.id)?.id !== municipalityId) return false;
      }
      return true;
    });
  }, [
    products,
    day,
    geduId,
    language,
    municipalityId,
    isConsumer,
    isMunicipality,
    muniByProduct,
  ]);

  const anyActive =
    day !== null ||
    geduId !== null ||
    (isConsumer && language !== null) ||
    (isMunicipality && municipalityId !== null);

  function clear() {
    setDay(null);
    setGeduId(null);
    setLanguage(null);
    setMunicipalityId(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterDropdown
          label={t("filters.day")}
          allLabel={t("filters.allDays")}
          options={dayOptions}
          value={day}
          onChange={setDay}
        />
        <FilterCombobox
          label={t("filters.gedu")}
          placeholder={t("filters.searchGedu")}
          options={geduOptions}
          value={geduId}
          onChange={setGeduId}
          noResultsLabel={t("filters.noResults")}
        />
        {isConsumer && (
          <FilterDropdown
            label={t("filters.language")}
            allLabel={t("filters.allLanguages")}
            options={languageOptions}
            value={language}
            onChange={setLanguage}
          />
        )}
        {isMunicipality && (
          <FilterCombobox
            label={t("filters.municipality")}
            placeholder={t("filters.searchMunicipality")}
            options={municipalityOptions}
            value={municipalityId}
            onChange={setMunicipalityId}
            noResultsLabel={t("filters.noResults")}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {t("filters.showing", {
            count: filtered.length,
            total: products.length,
          })}
        </span>
        {/* No vertical padding: with py-1 the button is taller than the bare
            text, so toggling it in/out grows the row and shifts the cards below.
            Its height now matches the showing-count span's line-height. */}
        {anyActive && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-md px-2 transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
            {t("filters.clear")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("filters.noMatches", { plural })}
          </CardContent>
        </Card>
      ) : (
        <ProductRows products={filtered} productType={productType} />
      )}
    </div>
  );
}
