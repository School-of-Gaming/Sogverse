"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FilterChip } from "@/components/ui/filter-chip";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { AdminListSearchField } from "@/components/admin/admin-list-narrowing";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "@/components/admin/dashboard/product-type-presentation";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useUsersByRole } from "@/services/users";
import {
  municipalityOf,
  type EmbeddedLocationNode,
} from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatWeekday } from "@/lib/products/format-product-schedule";
import { formattingLocale, resolveLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  matchesProductSearch,
  normalizeProductSearch,
} from "./product-name-search";
import { ProductListResults } from "./product-list-results";
import {
  useDebouncedUrlParamState,
  useUrlParamState,
} from "@/components/admin/admin-list-url-state";
import {
  optionInRange,
  productListFilterOffer,
  productListOptionValues,
  productListParamsAfterTypeSwitch,
  PRODUCT_LIST_PARAMS,
} from "./product-list-url-state";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductWithDetails } from "@/services/products";
import type { ProductType } from "@/types";

interface ProductListFiltersProps {
  /** Every product of every type; the type chips narrow it. */
  products: ProductWithDetails[];
  /** The selected type chip, or `null` for every type. */
  type: ProductType | null;
  onTypeChange: (type: ProductType | null) => void;
}

// The narrowing controls of the admin product list, and the list under them.
//
// A row of type chips comes first — every type, or one of the four — and the
// filter row under it offers what that type can be narrowed by, left to right:
//
//   consumer club      search - gedu - day - language
//   municipality club  search - gedu - day - municipality
//   camp / event       search - gedu
//   every type         search - gedu
//
// The two controls every type has come first and in the same order, so the
// columns an admin reaches for without looking stay put across a type switch; a
// type's own filters follow. Switching type clears every filter param the new
// type cannot apply — a filter it does not offer, or a value none of its
// products carries — so after a switch the URL states exactly what is applied.
//
// Every control is single-select; no selection means "all", and active filters
// AND together — a row must satisfy every one, the search box included.
// Filtering is client-side over the already loaded list; the
// day/gedu/language/municipality data all ride on the list query (gedu via
// `gedu_group_assignments`, municipality via the embedded location and its
// parent).
export function ProductListFilters({
  products,
  type,
  onTypeChange,
}: ProductListFiltersProps) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const offer = productListFilterOffer(type);

  // Each selection lives in the query string, so an admin who narrows the list,
  // opens a product and presses Back finds the row exactly as they left it. The
  // raw values are clamped against the options below before anything reads
  // them — a stale bookmark can name a gedu who has since left.
  const [dayParam, setDay] = useUrlParamState(PRODUCT_LIST_PARAMS.day);
  const [geduParam, setGeduId] = useUrlParamState(PRODUCT_LIST_PARAMS.gedu);
  const [languageParam, setLanguage] = useUrlParamState(
    PRODUCT_LIST_PARAMS.language,
  );
  const [municipalityParam, setMunicipalityId] = useUrlParamState(
    PRODUCT_LIST_PARAMS.municipality,
  );

  // The one control every type gets. The list narrows on it per keystroke; the
  // URL is mirrored a moment behind so Back restores it — see the hook.
  const [search, setSearch, flushSearch] = useDebouncedUrlParamState(
    PRODUCT_LIST_PARAMS.search,
  );

  // Fires whatever the type, including one whose rows carry no assignments and
  // whose gedu list therefore comes out empty. Left unconditional on purpose —
  // the query is cheap and cached, and gating it would mean a hook called
  // conditionally.
  const { data: gedus } = useUsersByRole("gedu");

  const languageName = useLanguageNames();

  // Each chip's count is every product of its type, whatever the filters say:
  // the chips answer "how many are there", and the count line under the filter
  // row answers "how many are showing".
  const countByType = useMemo(() => {
    const counts: Record<ProductType, number> = {
      consumer_club: 0,
      municipality_club: 0,
      camp: 0,
      event: 0,
    };
    for (const p of products) counts[p.product_type] += 1;
    return counts;
  }, [products]);

  const ofType = useMemo(
    () =>
      type === null
        ? products
        : products.filter((p) => p.product_type === type),
    [products, type],
  );

  // Resolve each club to its Finnish municipality off the row itself — the list
  // query embeds the club's location plus one level of parent, which covers
  // both shapes the schema allows (online clubs point at the municipality, in-
  // person ones at a site under it). DB CHECK constraints guarantee a
  // municipality club always has a `location_id`, so there's no "no
  // municipality" bucket here.
  const muniByProduct = useMemo(() => {
    const map = new Map<string, EmbeddedLocationNode>();
    if (!offer.municipality) return map;
    for (const p of ofType) {
      const muni = municipalityOf(p.locations);
      if (muni) map.set(p.id, muni);
    }
    return map;
  }, [ofType, offer.municipality]);

  // Each filter's options are derived from the values actually present on the
  // type's products, so a selection always yields at least one match (no dead
  // entries) — the same values a type switch keeps a param by. Day/gedu/
  // municipality sort by localized label; language keeps its canonical
  // reference order.
  const optionValues = useMemo(
    () => productListOptionValues(products, type),
    [products, type],
  );

  const dayOptions = useMemo(
    () =>
      [...optionValues.day]
        .map(Number)
        .sort((a, b) => a - b)
        .map((w) => ({
          value: String(w),
          label: formatWeekday(w, uiLocale, "long"),
        })),
    [optionValues.day, uiLocale],
  );

  const geduOptions = useMemo(() => {
    const present = optionValues.gedu;
    const nameById = new Map(
      (gedus ?? []).map((g) => [
        g.id,
        [g.first_name, g.last_name].filter(Boolean).join(" ") || g.first_name,
      ]),
    );
    return [...present]
      .map((id) => ({ value: id, label: nameById.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, formattingLocale(uiLocale)));
  }, [optionValues.gedu, gedus, uiLocale]);

  const languageOptions = useMemo(() => {
    const present = optionValues.language;
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
  }, [optionValues.language, languageName]);

  const municipalityOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const muni of muniByProduct.values()) {
      if (!byId.has(muni.id))
        byId.set(muni.id, localizedLocationName(muni, uiLocale));
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, formattingLocale(uiLocale)));
  }, [muniByProduct, uiLocale]);

  // The stored params, each narrowed to something the control can actually
  // offer — a value naming a gedu who has left, a municipality whose last club
  // was retired, or a filter this type does not offer reads as "all" rather
  // than as a filter matching nothing.
  const day = optionInRange(dayOptions, dayParam);
  const geduId = optionInRange(geduOptions, geduParam);
  const language = optionInRange(languageOptions, languageParam);
  const municipalityId = optionInRange(municipalityOptions, municipalityParam);

  const filtered = useMemo(() => {
    const dayNum = day === null ? null : Number(day);
    const needle = normalizeProductSearch(search);
    return ofType.filter((p) => {
      if (!matchesProductSearch(p, needle)) return false;
      if (dayNum !== null && !p.schedule_slots.some((s) => s.weekday === dayNum))
        return false;
      if (
        geduId !== null &&
        !p.gedu_group_assignments.some((a) => a.gedu_id === geduId)
      )
        return false;
      if (language !== null && p.spoken_language_code !== language)
        return false;
      if (
        municipalityId !== null &&
        muniByProduct.get(p.id)?.id !== municipalityId
      )
        return false;
      return true;
    });
  }, [ofType, search, day, geduId, language, municipalityId, muniByProduct]);

  const anyActive =
    normalizeProductSearch(search) !== "" ||
    day !== null ||
    geduId !== null ||
    language !== null ||
    municipalityId !== null;

  function selectType(next: ProductType | null) {
    if (next === type) return;
    onTypeChange(next);
    const kept = productListParamsAfterTypeSwitch(products, next, {
      day: dayParam,
      gedu: geduParam,
      language: languageParam,
      municipality: municipalityParam,
    });
    if (kept.day !== dayParam) setDay(kept.day);
    if (kept.gedu !== geduParam) setGeduId(kept.gedu);
    if (kept.language !== languageParam) setLanguage(kept.language);
    if (kept.municipality !== municipalityParam)
      setMunicipalityId(kept.municipality);
  }

  // Leaves the type chip alone: the type is which list this is, not a filter
  // over it.
  function clear() {
    setDay(null);
    setGeduId(null);
    setLanguage(null);
    setMunicipalityId(null);
    setSearch("");
    // One gesture with one value, so the URL takes it immediately rather than
    // waiting out a delay meant for typing.
    flushSearch();
  }

  const typeKey = type === null ? null : PRODUCT_TYPE_CONFIG[type].i18nKey;
  const emptyMessage =
    ofType.length === 0
      ? typeKey === null
        ? t("list.emptyAll")
        : t("list.empty", {
            plural: t(`types.${typeKey}.plural`),
            label: t(`types.${typeKey}.label`),
          })
      : typeKey === null
        ? t("filters.noMatchesAll")
        : t("filters.noMatches", { plural: t(`types.${typeKey}.plural`) });

  return (
    // A fragment: the page's own `space-y-4` spaces the chip row, the filter
    // row, the count line and the rows as one rhythm.
    <>
      <div
        role="group"
        aria-label={t("filters.type")}
        className="flex flex-wrap gap-1.5"
      >
        {/* Each chip is named in words with a space before its count — the
            label and the count sit in a flex row, where no space between them
            survives into the accessible name, which would read "Camps12". */}
        <FilterChip
          active={type === null}
          onClick={() => selectType(null)}
          ariaLabel={`${t("filters.allTypes")} ${products.length}`}
        >
          {t("filters.allTypes")}
          <span className="tabular-nums">{products.length}</span>
        </FilterChip>
        {PRODUCT_TYPE_ORDER.map((productType) => {
          const presentation = PRODUCT_TYPE_PRESENTATION[productType];
          const Icon = presentation.icon;
          const label = t(`types.${presentation.i18nKey}.plural`);
          return (
            <FilterChip
              key={productType}
              active={type === productType}
              onClick={() => selectType(productType)}
              ariaLabel={`${label} ${countByType[productType]}`}
              // Uninked: the chip's own fill says whether it is on, and a
              // family colour on an act fill would be two colours arguing.
              icon={<Icon className="h-3.5 w-3.5" aria-hidden />}
            >
              {label}
              <span className="tabular-nums">{countByType[productType]}</span>
            </FilterChip>
          );
        })}
      </div>

      {/* Four columns whatever the type offers, so a control is the same width
          under every chip and a type with two controls simply leaves the right
          half of the row empty. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminListSearchField
          label={t("filters.search")}
          placeholder={t("filters.searchPlaceholder")}
          value={search}
          onChange={setSearch}
          // Leaving the field settles the URL at once, so a click straight
          // from the box into a product row cannot outrun the mirror.
          onBlur={flushSearch}
        />

        <FilterCombobox
          label={t("filters.gedu")}
          placeholder={t("filters.searchGedu")}
          options={geduOptions}
          value={geduId}
          onChange={setGeduId}
          noResultsLabel={t("filters.noResults")}
        />
        {offer.day && (
          <FilterDropdown
            label={t("filters.day")}
            allLabel={t("filters.allDays")}
            options={dayOptions}
            value={day}
            onChange={setDay}
          />
        )}
        {offer.language && (
          <FilterDropdown
            label={t("filters.language")}
            allLabel={t("filters.allLanguages")}
            options={languageOptions}
            value={language}
            onChange={setLanguage}
          />
        )}
        {offer.municipality && (
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
        total={ofType.length}
        emptyMessage={emptyMessage}
        showType={type === null}
        narrowed={anyActive}
        onClear={clear}
      />
    </>
  );
}
