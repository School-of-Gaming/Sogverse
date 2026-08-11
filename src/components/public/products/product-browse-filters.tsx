"use client";

import { useId } from "react";
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
import { useShopCategories } from "./use-shop-categories";

// Weekdays for the "Days" row, in fixed Mon→Sun order (0=Mon..6=Sun, matching
// `schedule_slots.weekday`). Hardcoded Monday-first: this is a filter, not a
// calendar, so the locale's first-day-of-week convention doesn't matter here.
// The per-chip labels are still localised via `formatWeekday`.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// The filter control — chip rows (type, subject, format, language, age, days).
// Chips are pill-shaped with a clear active state (filled primary) so taps
// register on small phone screens.
//
// One component, two shapes, one DOM instance — never a phone copy and a
// desktop copy:
//   - Below `lg` it is a strip above the cards. Each row puts its label to the
//     left of the chips, and most rows scroll horizontally rather than wrapping
//     so they never push the cards down on overflow. The Subject row is the
//     exception and wraps at every viewport — that filter matters enough that
//     every option should be visible without a gesture.
//   - From `lg` it is the left rail beside the cards (see
//     `<ProductBrowseResults>`). Labels move above their chips and every group
//     wraps: the scroll treatment suppresses its own scrollbar, which is fine
//     for a thumb and undiscoverable with a mouse, and a rail has the vertical
//     room to spend.
//
// Type is an inclusive filter, not a choice: selecting nothing shows every
// category, selecting chips narrows to them, and toggling the last one off
// returns to everything. Being an ordinary filter, it is reset by "Clear all"
// like every other row. Format and Age are single-valued — toggling the active
// chip clears the filter back to "either" / "any age".
//
// No match-count display: the visible card grids already convey that
// information at a glance, and surfacing a count next to a "Clear"
// button made the meta row's height jump when the button appeared.
interface ProductBrowseFiltersProps {
  /** Server-prefetched spoken-language set so the Language row paints with the
   *  rest of the filters instead of popping in after its own fetch resolves. */
  initialSpokenLanguages: SpokenLanguage[];
  /** Lead with the Clubs|Camps|Events Type row. The shop does; the
   *  per-municipality page hides it (everything there is a club). Default true. */
  showTypeFilter?: boolean;
}

export function ProductBrowseFilters({
  initialSpokenLanguages,
  showTypeFilter = true,
}: ProductBrowseFiltersProps) {
  const t = useTranslations("productBrowse.filters");
  // The audience chips share their labels with the card badge and the overview
  // card's audience row — one vocabulary for the whole concept.
  const tAudience = useTranslations("productAudience");
  const locale = useLocale();
  const topicLabel = useTopicLabel();
  const { data: spokenLanguages } = useSpokenLanguages({
    initialData: initialSpokenLanguages,
  });
  // Product category (Clubs | Camps | Events) leads the filter card as the
  // "Type" row. Unlike the other filters it lives in its own URL param
  // (useShopCategories) and drives which sections render rather than which
  // cards survive a predicate — but it is still an ordinary filter to the
  // parent, so Clear below resets it too (the delete rides along inside
  // `clear`'s single write).
  const { categories, toggleCategory } = useShopCategories();
  const {
    topics: selectedTopics,
    format: selectedFormat,
    languages: selectedLanguages,
    audiences: selectedAudiences,
    age: selectedAge,
    days: selectedDays,
    hasAny,
    toggleTopics,
    toggleFormat,
    toggleLanguage,
    toggleAudience,
    setAge,
    toggleDay,
    clear,
  } = useBrowseFilters();

  const hasLanguageRow = (spokenLanguages?.length ?? 0) > 0;

  // The button shows exactly when clearing would change something the user can
  // see, so it spans both state owners: `hasAny` covers the chip filters, the
  // categories cover the Type row that `clear` now resets alongside them — but
  // only where that row is rendered. A surface without the Type row (the
  // municipality page) still *reads* a stray `?category=` into `categories`,
  // and a Clear button lit by an invisible param is a control lying.
  const showClear = hasAny || (showTypeFilter && categories.length > 0);

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

      <div className="space-y-2 lg:space-y-4">
        {showTypeFilter && (
          <FilterRow label={t("type")}>
            <Chip
              label={t("typeClubs")}
              active={categories.includes("clubs")}
              onToggle={() => toggleCategory("clubs")}
            />
            <Chip
              label={t("typeCamps")}
              active={categories.includes("camps")}
              onToggle={() => toggleCategory("camps")}
            />
            <Chip
              label={t("typeEvents")}
              active={categories.includes("events")}
              onToggle={() => toggleCategory("events")}
            />
          </FilterRow>
        )}

        {/* Audience sits directly under Type because it is the same coarse cut:
            both answer "which shelf am I looking at" before anything about the
            product itself. Multi-select with OR semantics like Subject and
            Language, and a mixed product answers to either chip — so lighting
            both is a wider query than lighting one, not a narrower one. The
            labels are the card's own audience words, reused rather than
            re-authored so a chip and the card it surfaces say the same thing.
            The row ships before any for-parents product exists; a chip with an
            empty result set for a few days is accepted (see the plan). */}
        <FilterRow label={t("audience")}>
          <Chip
            label={tAudience("gamers")}
            active={selectedAudiences.includes("gamers")}
            onToggle={() => toggleAudience("gamers")}
          />
          <Chip
            label={tAudience("parents")}
            active={selectedAudiences.includes("parents")}
            onToggle={() => toggleAudience("parents")}
          />
        </FilterRow>

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

        {/* Days matches any product whose schedule touches a selected weekday —
            a club's recurring slot, a camp's day, an event's date all carry
            one. Chip labels are responsive in both directions: the short
            weekday on phones, the full name once the strip has the width for
            it, and the short form again inside the rail, where a Finnish
            "keskiviikko" would blow the column open. Both come from Intl via
            `formatWeekday`. */}
        <FilterRow label={t("days")}>
          {WEEKDAYS.map((w) => (
            <Chip
              key={w}
              // Fixed, centered width so all seven chips line up like the Age
              // row. One width per label form: ~3-char short, or the full
              // weekday name. 5.5rem fits the en/sv full names; the longest fi
              // name slightly exceeds it and that one chip grows past the floor.
              className="min-w-[2.75rem] justify-center sm:min-w-[5.5rem] lg:min-w-[2.75rem]"
              active={selectedDays.includes(w)}
              onToggle={() => toggleDay(w)}
              label={
                <>
                  <span className="sm:hidden lg:inline">
                    {formatWeekday(w, locale, "short")}
                  </span>
                  <span className="hidden sm:inline lg:hidden">
                    {formatWeekday(w, locale, "long")}
                  </span>
                </>
              }
            />
          ))}
        </FilterRow>
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
  /** Wrap the chips onto further lines instead of scrolling horizontally,
   *  below `lg`. The scroll treatment suppresses its own scrollbar, so
   *  overflowing chips are undiscoverable on a mouse-driven desktop — a
   *  wrapping row keeps every option visible at the cost of pushing content
   *  below it down as it grows. With multiple lines the label can't centre
   *  against the chip area any more; baseline alignment ties it to the first
   *  line's text instead. Moot from `lg` up, where the rail wraps every row. */
  wrap?: boolean;
  children: React.ReactNode;
}) {
  // Grouped for assistive tech: without `role="group"` + `aria-labelledby`,
  // the six rows read as one undifferentiated run of ~30 toggle buttons — the
  // visual label ("Type", "Days") never reaches a screen reader.
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(
        // Label beside the chips as a strip, above them in the rail.
        "flex gap-3 lg:flex-col lg:items-stretch lg:gap-1.5",
        wrap ? "items-baseline" : "items-center",
      )}
    >
      <span
        id={labelId}
        className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-14 lg:w-auto"
      >
        {label}
      </span>
      <div
        className={cn(
          "flex flex-1 gap-1.5 lg:flex-wrap lg:overflow-x-visible lg:pb-0",
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
