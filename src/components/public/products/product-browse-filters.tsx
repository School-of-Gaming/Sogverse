"use client";

import { useLocale, useTranslations } from "next-intl";
import { Sliders, X, Globe, MapPin } from "lucide-react";
import { LanguageFlag } from "@/components/ui/language-flag";
import { GAME_TOPICS } from "@/lib/products/topics";
import { productAgeOptions } from "@/lib/constants/gamer-age";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useSpokenLanguages } from "@/services/users";
import type { SpokenLanguage } from "@/types";
import { cn } from "@/lib/utils";
import { productTypeSupportsDayFilter } from "./filter-products";
import { formatWeekday } from "./format-product-schedule";
import { useBrowseFilters } from "./use-browse-filters";
import { CATEGORY_TYPE, useShopCategory } from "./use-shop-category";

// Weekdays for the Clubs-only "Days" row, in fixed Mon→Sun order (0=Mon..6=Sun,
// matching `schedule_slots.weekday`). Hardcoded Monday-first: this is a filter,
// not a calendar, so the locale's first-day-of-week convention doesn't matter
// here. The per-chip labels are still localised via `formatWeekday`.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Filter strip — horizontally-scrollable chip rows (type, game, format,
// language). The game row lists the game topics; subject topics (e.g.
// Webinar) are temporarily dropped — see the TODO in the row below.
// Chips are pill-shaped with a clear active state (filled
// primary) so taps register on small phone screens; rows are scrollable
// rather than wrapping so they never push the cards down on overflow.
//
// Format is single-valued — the parent picks Online OR In-person, not
// both. Toggling the active chip clears the filter back to "either".
//
// No match-count display: the visible card grid already conveys that
// information at a glance, and surfacing a count next to a "Clear"
// button made the meta row's height jump when the button appeared.
interface ProductBrowseFiltersProps {
  /** Server-prefetched spoken-language set so the Language row paints with the
   *  rest of the strip instead of popping in after its own fetch resolves. */
  initialSpokenLanguages: SpokenLanguage[];
}

export function ProductBrowseFilters({
  initialSpokenLanguages,
}: ProductBrowseFiltersProps) {
  const t = useTranslations("productBrowse.filters");
  const locale = useLocale();
  const topicLabel = useTopicLabel();
  const { data: spokenLanguages } = useSpokenLanguages({
    initialData: initialSpokenLanguages,
  });
  // Product category (Clubs | Camps) is a required, mutually-exclusive choice
  // — it leads the filter card as the "Type" row. Unlike the other filters it
  // lives in its own URL param (useShopCategory) and is never empty; Clear
  // below leaves it untouched.
  const { category, setCategory } = useShopCategory();
  const {
    topics: selectedTopics,
    format: selectedFormat,
    languages: selectedLanguages,
    age: selectedAge,
    days: selectedDays,
    hasNonDayFilters,
    toggleTopic,
    toggleFormat,
    toggleLanguage,
    setAge,
    toggleDay,
    clear,
  } = useBrowseFilters();

  const hasLanguageRow = (spokenLanguages?.length ?? 0) > 0;
  const ageOptions = productAgeOptions();

  // The Days row only applies to clubs (same gate as the row's visibility
  // below). A `?days=` carried over from Clubs lingers in the URL on Camps by
  // design, but it shouldn't light up Clear there — so only count selected days
  // toward Clear when the filter is actually active in this context.
  const daysActive = productTypeSupportsDayFilter(CATEGORY_TYPE[category]);
  const showClear = hasNonDayFilters || (daysActive && selectedDays.length > 0);

  return (
    <div className="rounded-xl border bg-card/50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sliders className="h-3.5 w-3.5" aria-hidden />
          {t("filterBy")}
        </div>
        {/* Clear is always rendered so the row's height doesn't shift
            when a filter becomes active — `invisible` keeps the box,
            hides the pixels. */}
        <button
          type="button"
          onClick={clear}
          aria-hidden={!showClear}
          tabIndex={showClear ? 0 : -1}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-input px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            !showClear && "invisible pointer-events-none",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
          {t("clearAll")}
        </button>
      </div>

      <div className="space-y-2">
        <FilterRow label={t("type")}>
          <Chip
            label={t("typeClubs")}
            active={category === "clubs"}
            onToggle={() => setCategory("clubs")}
          />
          <Chip
            label={t("typeCamps")}
            active={category === "camps"}
            onToggle={() => setCategory("camps")}
          />
        </FilterRow>

        <FilterRow label={t("topic")}>
          {GAME_TOPICS.map((topic) => (
            <Chip
              key={topic}
              label={topicLabel(topic)}
              active={selectedTopics.includes(topic)}
              onToggle={() => toggleTopic(topic)}
            />
          ))}
          {/* TODO: Re-introduce subject topics (e.g. Webinar) here when we
              bring them back. Render SUBJECT_TOPICS after a divider:
                {SUBJECT_TOPICS.length > 0 && GAME_TOPICS.length > 0 && (
                  <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
                )}
                {SUBJECT_TOPICS.map((topic) => ( <Chip ... /> ))}
              and add SUBJECT_TOPICS back to the topics import above. */}
        </FilterRow>

        <FilterRow label={t("format")}>
          <Chip
            icon={<Globe className="h-3 w-3" aria-hidden />}
            label={t("formatOnline")}
            active={selectedFormat === "online"}
            onToggle={() => toggleFormat("online")}
          />
          <Chip
            icon={<MapPin className="h-3 w-3" aria-hidden />}
            label={t("formatInPerson")}
            active={selectedFormat === "in_person"}
            onToggle={() => toggleFormat("in_person")}
          />
        </FilterRow>

        {hasLanguageRow && (
          <FilterRow label={t("language")}>
            {spokenLanguages!.map((lang) => (
              <Chip
                key={lang.code}
                icon={<LanguageFlag code={lang.code} showCode={false} title={lang.name} />}
                label={lang.code.toUpperCase()}
                active={selectedLanguages.includes(lang.code.toLowerCase())}
                onToggle={() => toggleLanguage(lang.code)}
              />
            ))}
          </FilterRow>
        )}

        {/* Age is single-valued (a gamer has one age) — like the Format row,
            tapping the active chip clears it back to "any age". The chips span
            the product age band from @/lib/constants/gamer-age, the same source
            the Add Gamer enrollment window derives from. */}
        <FilterRow label={t("age")}>
          {ageOptions.map((a) => (
            <Chip
              key={a}
              // Fixed min-width + centered tabular digits so single-digit ages
              // (7–9) match the width of the two-digit ones (10–17).
              className="min-w-[2.5rem] justify-center tabular-nums"
              label={String(a)}
              active={selectedAge === a}
              onToggle={() => setAge(selectedAge === a ? null : a)}
            />
          ))}
        </FilterRow>

        {/* Days is a Clubs-only filter: clubs meet on a recurring weekly
            schedule, camps run over a date range. Rendered last so toggling
            the Type chip to Camps removes the row without shifting any row
            above it. Chip labels show the short weekday on phones and the full
            name from `sm:` up — both come from Intl via `formatWeekday`. */}
        {daysActive && (
          <FilterRow label={t("days")}>
            {WEEKDAYS.map((w) => (
              <Chip
                key={w}
                // Fixed, centered width so all seven chips line up like the Age
                // row. Two widths because the label is responsive: ~3-char
                // short form on phones, full weekday name from `sm:` up. 5.5rem
                // fits the en/sv full names; the longest fi name ("keskiviikko")
                // slightly exceeds it and that one chip grows past the floor.
                className="min-w-[2.75rem] justify-center sm:min-w-[5.5rem]"
                active={selectedDays.includes(w)}
                onToggle={() => toggleDay(w)}
                label={
                  <>
                    <span className="sm:hidden">
                      {formatWeekday(w, locale, "short")}
                    </span>
                    <span className="hidden sm:inline">
                      {formatWeekday(w, locale, "long")}
                    </span>
                  </>
                }
              />
            ))}
          </FilterRow>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-14">
        {label}
      </span>
      <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onToggle,
  icon,
  className,
}: {
  label: React.ReactNode;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-background text-foreground/80 hover:border-primary/40 hover:bg-accent",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
