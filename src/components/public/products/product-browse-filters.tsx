"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Sliders, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrowseFilterRows, type BrowseFilterChip } from "./browse-filter-rows";
import { useBrowseFilters } from "./use-browse-filters";
import { useShopCategories } from "./use-shop-categories";

// The filter control — the nine chip rows (type, audience, designed-for,
// subject, format, price, language, age, days), drawn from the row list in
// `browse-filter-rows.tsx`. What the rows *are* lives there; this file decides
// only how they are drawn. Chips are pill-shaped with a clear active state
// (filled act) so taps register on small phone screens.
//
// One component, one DOM instance, two places — never a phone copy and a
// desktop copy:
//   - From `lg` it is the left rail beside the cards (see
//     `<ProductBrowseResults>`).
//   - Below `lg` it is the body of a bottom sheet, opened from the trigger bar
//     that stands where the rail cannot (see `<ProductBrowseFilterPanel>`).
//     The same element moves into the sheet and back out of it; a second
//     instance would be a second writer of the same URL params.
//
// Both places give a row its own line, so both draw the same shape: the
// label above its chips, and every chip wrapping onto further lines rather
// than scrolling out of reach. That used to differ — below `lg` the rows were
// a strip above the cards with their labels beside them and most of them
// scrolling sideways — and the strip is what the sheet replaced: eight rows
// standing between a phone reader and the first product card.
//
// Type is an inclusive filter, not a choice: selecting nothing shows every
// category, selecting chips narrows to them, and toggling the last one off
// returns to everything. Being an ordinary filter, it is reset by "Clear all"
// like every other row. Format, Price and Age are single-valued — toggling the
// active chip clears the filter back to "either" / "any price" / "any age".
//
// No match-count display: the visible card grids already convey that
// information at a glance, and surfacing a count next to a "Clear"
// button made the meta row's height jump when the button appeared.
interface ProductBrowseFiltersProps {
  /** Lead with the Clubs|Camps|Events Type row — and, by owner decision, with
   *  the Audience row that shares its guard. See `useBrowseFilterRows`, which
   *  owns the reasoning along with the rows themselves. Default true. */
  showTypeFilter?: boolean;
  /**
   * Which of the two places this instance is standing in.
   *
   * `card` is the rail: its own bordered box, headed by the "Filter by"
   * eyebrow and a Clear button, because nothing around it says what the box
   * is. `sheet` is the same rows with none of that chrome — the sheet's own
   * header names it and carries the Clear, and a box drawn inside a box is
   * just a second border.
   */
  variant?: "card" | "sheet";
}

export function ProductBrowseFilters({
  showTypeFilter = true,
  variant = "card",
}: ProductBrowseFiltersProps) {
  const t = useTranslations("productBrowse.filters");
  const rows = useBrowseFilterRows(showTypeFilter);
  const { hasAny, clear } = useBrowseFilters();
  const { categories } = useShopCategories();

  // The button shows exactly when clearing would change something the user can
  // see, so it spans both state owners: `hasAny` covers the chip filters, the
  // categories cover the Type row that `clear` now resets alongside them — but
  // only where that row is rendered. A surface without the Type row (the
  // municipality page) still *reads* a stray `?category=` into `categories`,
  // and a Clear button lit by an invisible param is a control lying.
  const showClear = hasAny || (showTypeFilter && categories.length > 0);

  return (
    <div
      className={cn(
        variant === "card" && "rounded-xl border border-border bg-card p-3 sm:p-4",
      )}
    >
      {variant === "card" && (
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
              "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-hover hover:text-foreground",
              !showClear && "invisible pointer-events-none",
            )}
          >
            <X className="h-3 w-3" aria-hidden />
            {t("clearAll")}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <FilterRow key={row.id} label={row.label}>
            {row.chips.map((chip) => (
              <Chip key={chip.key} chip={chip} />
            ))}
          </FilterRow>
        ))}
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
  // Grouped for assistive tech: without `role="group"` + `aria-labelledby`,
  // the nine rows read as one undifferentiated run of ~35 toggle buttons — the
  // visual label ("Type", "Days") never reaches a screen reader.
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col items-stretch gap-1.5"
    >
      <span
        id={labelId}
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </span>
      {/* Every row wraps, in the rail and in the sheet alike: both have the
          vertical room to spend, and a chip that has scrolled out of sight is
          an option the reader never learns exists. */}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ chip }: { chip: BrowseFilterChip }) {
  return (
    <button
      type="button"
      onClick={chip.toggle}
      aria-pressed={chip.active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all",
        chip.active
          ? "bg-act text-act-foreground shadow-sm"
          : "bg-background text-foreground hover:bg-hover",
        chip.className,
      )}
    >
      {chip.icon}
      {chip.label ?? chip.text}
    </button>
  );
}
