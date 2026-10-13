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
  useAdminProductList,
  type ProductListFacetsRow,
} from "@/services/products";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatWeekday } from "@/lib/products/format-product-schedule";
import { formattingLocale, resolveLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import { ProductListResults } from "./product-list-results";
import {
  useDebouncedUrlParamState,
  useUrlParamState,
} from "@/components/admin/admin-list-url-state";
import {
  optionInRange,
  productListCount,
  productListFilterOffer,
  productListMunicipalities,
  productListOptionValues,
  productListParamsAfterTypeSwitch,
  PRODUCT_LIST_PARAMS,
} from "./product-list-url-state";
import {
  isSpokenLanguageCode,
  SPOKEN_LANGUAGES,
} from "@/lib/constants/spoken-languages";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductListFiltersProps {
  /** Per type: how many products exist and what each filter can offer. */
  facets: ProductListFacetsRow[];
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
// AND together — a row must satisfy every one, the search box included. The
// filtering is the server's: the list reads one keyset page at a time with each
// filter as its own parameter, and the chip counts and the controls' options
// come from the facets the page above already read.
export function ProductListFilters({
  facets,
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

  // The one control every type gets. The list asks per keystroke; the URL is
  // mirrored a moment behind so Back restores it — see the hook.
  const [search, setSearch, flushSearch] = useDebouncedUrlParamState(
    PRODUCT_LIST_PARAMS.search,
  );

  // Names the gedu options. Fires whatever the type, including one whose
  // products carry no assignments — the query is cheap and cached, and gating
  // it would mean a hook called conditionally.
  const { data: gedus } = useUsersByRole("gedu");

  const languageName = useLanguageNames();

  // Each filter's options are the values actually present on the type's
  // products, as the facets report them, so a selection always yields at least
  // one match (no dead entries) — the same values a type switch keeps a param
  // by. Day/gedu/municipality sort by localized label; language keeps its
  // canonical reference order.
  const optionValues = useMemo(
    () => productListOptionValues(facets, type),
    [facets, type],
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

  // DB CHECK constraints guarantee a municipality club always has a
  // `location_id`, so there's no "no municipality" bucket here.
  const municipalityOptions = useMemo(() => {
    if (!offer.municipality) return [];
    return productListMunicipalities(facets, type)
      .map((muni) => ({
        value: muni.id,
        label: localizedLocationName(muni, uiLocale),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, formattingLocale(uiLocale)));
  }, [facets, type, offer.municipality, uiLocale]);

  // The stored params, each narrowed to something the control can actually
  // offer — a value naming a gedu who has left, a municipality whose last club
  // was retired, or a filter this type does not offer reads as "all" rather
  // than as a filter matching nothing. Only these clamped values reach the
  // read, never the raw URL.
  const day = optionInRange(dayOptions, dayParam);
  const geduId = optionInRange(geduOptions, geduParam);
  const language = optionInRange(languageOptions, languageParam);
  const municipalityId = optionInRange(municipalityOptions, municipalityParam);

  const list = useAdminProductList({
    type,
    search,
    weekday: day === null ? null : Number(day),
    geduId,
    spokenLanguage:
      language !== null && isSpokenLanguageCode(language) ? language : null,
    municipalityId,
  });

  const anyActive =
    search.trim() !== "" ||
    day !== null ||
    geduId !== null ||
    language !== null ||
    municipalityId !== null;

  function selectType(next: ProductType | null) {
    if (next === type) return;
    onTypeChange(next);
    const kept = productListParamsAfterTypeSwitch(facets, next, {
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

  // Each chip's count is every product of its type, whatever the filters say:
  // the chips answer "how many are there", and the count line under the filter
  // row answers "how many are showing".
  const ofTypeCount = productListCount(facets, type);
  const typeKey = type === null ? null : PRODUCT_TYPE_CONFIG[type].i18nKey;
  const emptyMessage =
    ofTypeCount === 0
      ? typeKey === null
        ? t("list.emptyAll")
        : t("list.empty", { type: typeKey })
      : typeKey === null
        ? t("filters.noMatchesAll")
        : t("filters.noMatches", { type: typeKey });

  const allCount = productListCount(facets, null);

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
          ariaLabel={`${t("filters.allTypes")} ${allCount}`}
        >
          {t("filters.allTypes")}
          <span className="tabular-nums">{allCount}</span>
        </FilterChip>
        {PRODUCT_TYPE_ORDER.map((productType) => {
          const presentation = PRODUCT_TYPE_PRESENTATION[productType];
          const Icon = presentation.icon;
          const label = t(`types.${presentation.i18nKey}.plural`);
          const count = productListCount(facets, productType);
          return (
            <FilterChip
              key={productType}
              active={type === productType}
              onClick={() => selectType(productType)}
              ariaLabel={`${label} ${count}`}
              // Uninked: the chip's own fill says whether it is on, and a
              // family colour on an act fill would be two colours arguing.
              icon={<Icon className="h-3.5 w-3.5" aria-hidden />}
            >
              {label}
              <span className="tabular-nums">{count}</span>
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
        list={list}
        total={ofTypeCount}
        emptyMessage={emptyMessage}
        showType={type === null}
        narrowed={anyActive}
        onClear={clear}
      />
    </>
  );
}
