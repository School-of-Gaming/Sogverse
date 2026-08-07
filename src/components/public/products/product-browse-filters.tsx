"use client";

import { useLocale, useTranslations } from "next-intl";
import { Sliders, X, Globe, MapPin } from "lucide-react";
import { LanguageFlag } from "@/components/ui/language-flag";
import { TOPIC_FILTER_CHIPS } from "@/lib/products/topics";
import { PRODUCT_AGE_BANDS } from "@/lib/constants/gamer-age";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useSpokenLanguages } from "@/services/users";
import type { SpokenLanguage } from "@/types";
import { cn } from "@/lib/utils";
import { formatWeekday } from "./format-product-schedule";
import { useBrowseFilters } from "./use-browse-filters";
import { useShopCategory } from "./use-shop-category";

// Weekdays for the Clubs-only "Days" row, in fixed Mon→Sun order (0=Mon..6=Sun,
// matching `schedule_slots.weekday`). Hardcoded Monday-first: this is a filter,
// not a calendar, so the locale's first-day-of-week convention doesn't matter
// here. The per-chip labels are still localised via `formatWeekday`.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Filter strip — chip rows (type, subject, format, language, age, days).
// Chips are pill-shaped with a clear active state (filled primary) so taps
// register on small phone screens. Most rows scroll horizontally rather than
// wrapping so they never push the cards down on overflow; the Subject row is
// the exception and wraps at every viewport — that filter matters enough that
// every option should be visible without a gesture, and the scroll treatment
// hides its own overflow (no scrollbar, no fade) on a mouse-driven desktop.
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
  /** Lead with the Clubs|Camps|Events Type row. The shop does; the
   *  per-municipality page hides it (everything there is a club). Default true. */
  showTypeFilter?: boolean;
  /** Whether the Days row applies, forwarded from `<ProductBrowseResults>`'s
   *  `supportsDays` (its single source). True for clubs, false for camps and
   *  events. */
  daysFilter: boolean;
}

export function ProductBrowseFilters({
  initialSpokenLanguages,
  showTypeFilter = true,
  daysFilter,
}: ProductBrowseFiltersProps) {
  const t = useTranslations("productBrowse.filters");
  const locale = useLocale();
  const topicLabel = useTopicLabel();
  const { data: spokenLanguages } = useSpokenLanguages({
    initialData: initialSpokenLanguages,
  });
  // Product category (Clubs | Camps | Events) is a required, mutually-exclusive
  // choice — it leads the filter card as the "Type" row. Unlike the other filters it
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
    toggleTopics,
    toggleFormat,
    toggleLanguage,
    setAge,
    toggleDay,
    clear,
  } = useBrowseFilters();

  const hasLanguageRow = (spokenLanguages?.length ?? 0) > 0;

  // The Days row only applies to clubs (`daysFilter`, from the host's
  // `supportsDays`). A `?days=` carried over from Clubs lingers in the URL on
  // Camps/Events by design, but it shouldn't light up Clear there — so only count
  // selected days toward Clear when the filter is actually active here.
  const showClear = hasNonDayFilters || (daysFilter && selectedDays.length > 0);

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
        {showTypeFilter && (
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
            <Chip
              label={t("typeEvents")}
              active={category === "events"}
              onToggle={() => setCategory("events")}
            />
          </FilterRow>
        )}

        {/* Wraps instead of scrolling: every subject should be visible without
            a gesture, on any device. */}
        <FilterRow label={t("subject")} wrap>
          {TOPIC_FILTER_CHIPS.map((chip) => (
            <Chip
              key={chip.key}
              // A multi-topic group (Minecraft) carries a literal brand label;
              // a single-topic chip resolves its label from the topic.
              label={chip.label ?? topicLabel(chip.topics[0])}
              // `some`, not `every`: a URL carrying a lone edition (an old
              // shared link, or a hand-edited param) still filters the grid,
              // and a chip that stays dark while its filter is on is a control
              // lying about the results. Toggling a partially-selected group
              // completes it; toggling a full group clears it.
              active={chip.topics.some((tp) => selectedTopics.includes(tp))}
              onToggle={() => toggleTopics(chip.topics)}
            />
          ))}
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

        {/* Age is single-valued — like the Format row, tapping the active chip
            clears it back to "any age". The chips are the coarse age bands from
            @/lib/constants/gamer-age (PRODUCT_AGE_BANDS); a band matches any
            product whose age range overlaps it. */}
        <FilterRow label={t("age")}>
          {PRODUCT_AGE_BANDS.map((band) => {
            const active =
              selectedAge?.min === band.min && selectedAge.max === band.max;
            return (
              <Chip
                key={`${band.min}-${band.max}`}
                // Centered tabular digits so the band labels line up evenly.
                className="justify-center tabular-nums"
                label={`${band.min}–${band.max}`}
                active={active}
                onToggle={() => setAge(active ? null : band)}
              />
            );
          })}
        </FilterRow>

        {/* Days is a Clubs-only filter: clubs meet on a recurring weekly
            schedule, camps run over a date range, events happen once. Rendered
            last so toggling the Type chip to Camps or Events removes the row
            without shifting any row above it. Chip labels show the short
            weekday on phones and the full name from `sm:` up — both come from
            Intl via `formatWeekday`. */}
        {daysFilter && (
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
  wrap = false,
  children,
}: {
  label: string;
  /** Wrap the chips onto further lines instead of scrolling horizontally.
   *  The scroll treatment suppresses its own scrollbar, so overflowing chips
   *  are undiscoverable on a mouse-driven desktop — a wrapping row keeps every
   *  option visible at the cost of pushing content below it down as it grows.
   *  With multiple lines the label can't centre against the chip area any
   *  more; baseline alignment ties it to the first line's text instead. */
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", wrap ? "items-baseline" : "items-center")}>
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-14">
        {label}
      </span>
      <div
        className={cn(
          "flex flex-1 gap-1.5",
          wrap
            ? "flex-wrap"
            : "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
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
