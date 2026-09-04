"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useUsersByRole } from "@/services/users";
import {
  municipalityOf,
  type EmbeddedLocationNode,
} from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatWeekday } from "@/lib/products/format-product-schedule";
import { resolveLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  matchesProductSearch,
  normalizeProductSearch,
} from "./product-name-search";
import { ProductListResults } from "./product-list-results";
import {
  optionInRange,
  PRODUCT_LIST_PARAMS,
  useUrlParamState,
} from "./product-list-url-state";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductWithDetails } from "@/services/products";
import type { ProductType } from "@/types";

interface ClubProductFiltersProps {
  productType: ProductType;
  products: ProductWithDetails[];
  /** The page's search box, ANDed with the filters below. */
  search: string;
  /** Clearing here clears the search too — one button empties the whole bar. */
  onClearSearch: () => void;
}

// The filtered club list. Owns the day / educator / language / municipality
// filters and the reference-data hooks they need; only mounts for the two club
// types (camps and events narrow by the page's search box alone), so the extra
// reference queries never fire on the other admin product pages.
//
// All filters are single-select; no selection means "all", and active filters
// AND together — a row must satisfy every one, the page's search included.
// Filtering is client-side over the already loaded list; the
// day/educator/language/municipality data all ride on the list query (educator
// via `gedu_group_assignments`, municipality via the embedded location and its
// parent).
export function ClubProductFilters({
  productType,
  products,
  search,
  onClearSearch,
}: ClubProductFiltersProps) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const config = PRODUCT_TYPE_CONFIG[productType];
  const plural = t(`types.${config.i18nKey}.plural`);

  const isConsumer = productType === "consumer_club";
  const isMunicipality = productType === "municipality_club";

  // Each selection lives in the query string, so an admin who narrows the list,
  // opens a club and presses Back finds the bar exactly as they left it. The
  // raw values are clamped against the options below before anything reads
  // them — a stale bookmark can name an educator who has since left.
  const [dayParam, setDay] = useUrlParamState(PRODUCT_LIST_PARAMS.day);
  const [geduParam, setGeduId] = useUrlParamState(PRODUCT_LIST_PARAMS.gedu);
  const [languageParam, setLanguage] = useUrlParamState(
    PRODUCT_LIST_PARAMS.language,
  );
  const [municipalityParam, setMunicipalityId] = useUrlParamState(
    PRODUCT_LIST_PARAMS.municipality,
  );

  // Fires for both club types even though only the municipality page reads it.
  // Left unconditional on purpose — the query is cheap and cached, and gating
  // it would mean splitting the municipality-only work into a child component
  // that only mounts for `isMunicipality`.
  const { data: gedus } = useUsersByRole("gedu");

  const languageName = useLanguageNames();

  // Resolve each club to its Finnish municipality off the row itself — the list
  // query embeds the club's location plus one level of parent, which covers
  // both shapes the schema allows (online clubs point at the municipality, in-
  // person ones at a site under it). DB CHECK constraints guarantee a
  // municipality club always has a `location_id`, so there's no "no
  // municipality" bucket here.
  const muniByProduct = useMemo(() => {
    const map = new Map<string, EmbeddedLocationNode>();
    for (const p of products) {
      const muni = municipalityOf(p.locations);
      if (muni) map.set(p.id, muni);
    }
    return map;
  }, [products]);

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
    const present = new Set(products.map((p) => p.spoken_language_code));
    // Ordered by the enum's own declaration order — the same sequence every
    // other language control renders — rather than alphabetically by a name
    // that changes with the viewer's locale. Only languages some club is
    // actually delivered in are offered: a filter chip matching nothing is a
    // control that can only empty the table.
    return SPOKEN_LANGUAGES.filter((code) => present.has(code)).map((code) => {
      const name = languageName(code);
      return {
        value: code,
        label: name,
        adornment: <LanguageFlag code={code} showCode={false} title={name} />,
      };
    });
  }, [products, languageName, isConsumer]);

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

  // The stored params, each narrowed to something the control can actually
  // offer — a value naming a gedu who has left or a municipality whose last
  // club was retired reads as "all" rather than as a filter matching nothing.
  const day = optionInRange(dayOptions, dayParam);
  const geduId = optionInRange(geduOptions, geduParam);
  const language = optionInRange(languageOptions, languageParam);
  const municipalityId = optionInRange(municipalityOptions, municipalityParam);

  const filtered = useMemo(() => {
    const dayNum = day === null ? null : Number(day);
    const needle = normalizeProductSearch(search);
    return products.filter((p) => {
      if (!matchesProductSearch(p, needle)) return false;
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
    search,
    day,
    geduId,
    language,
    municipalityId,
    isConsumer,
    isMunicipality,
    muniByProduct,
  ]);

  const anyActive =
    normalizeProductSearch(search) !== "" ||
    day !== null ||
    geduId !== null ||
    (isConsumer && language !== null) ||
    (isMunicipality && municipalityId !== null);

  function clear() {
    setDay(null);
    setGeduId(null);
    setLanguage(null);
    setMunicipalityId(null);
    onClearSearch();
  }

  return (
    // A fragment: the page's own `space-y-4` spaces the search box, this grid,
    // the count line and the rows as one rhythm across all four product types.
    <>
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

      <ProductListResults
        products={filtered}
        total={products.length}
        productType={productType}
        plural={plural}
        narrowed={anyActive}
        onClear={clear}
      />
    </>
  );
}
