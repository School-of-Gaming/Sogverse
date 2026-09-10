"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sliders, X } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useBrowseFilterRows } from "./browse-filter-rows";
import { ProductBrowseFilters } from "./product-browse-filters";
import { useBrowseFilters } from "./use-browse-filters";
import { useShopCategories } from "./use-shop-categories";

// The filters, in whichever of their two places the viewport calls for.
//
// From `lg` up nothing here is doing anything: the rows render inline, in the
// rail the results grid holds open for them, exactly as they always have.
//
// Below `lg` there is no rail to render into, and the rows used to stand as a
// strip above the cards — nine of them, taking most of a phone's first screen
// before a single product appeared. So they move into a bottom sheet, and what
// stands in their place is one line: a button that opens the sheet, and beside
// it the filters that are currently narrowing the grid, each tappable to drop
// just that one. The summary is the part that earns the sheet: a strip showed
// the reader their filters without a tap, and hiding the rows would have taken
// that away.
//
// **The rows are one element, and it moves.** It renders inline or in the
// sheet, never both — two mounted copies would be two writers of the same URL
// params, and the reader would be looking at whichever one happened to be
// visible. Nothing is lost in the move: the component holds no state of its
// own, because every filter it draws lives in the URL.
export function ProductBrowseFilterPanel({
  showTypeFilter = true,
}: {
  showTypeFilter?: boolean;
}) {
  const t = useTranslations("productBrowse.filters");
  const rows = useBrowseFilterRows(showTypeFilter);
  const { hasAny, clear } = useBrowseFilters();
  const { categories } = useShopCategories();
  const [open, setOpen] = useState(false);

  // The trigger only exists below `lg`, so the sheet can only ever be opened
  // there — a display:none button takes neither a tap nor a focus ring. But a
  // window can be widened while it is up, and the rail behind it would then be
  // standing empty waiting for its rows back. Widening past the breakpoint
  // therefore closes it, and the rows return to the rail the reader can now
  // see. The literal is Tailwind's `lg`, which is what `lg:hidden` on the bar
  // above resolves to; the two have to move together.
  useEffect(() => {
    if (!open) return;
    const rail = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    rail.addEventListener("change", onChange);
    return () => rail.removeEventListener("change", onChange);
  }, [open]);

  // Every lit chip, in row order, each carrying the row it belongs to so the
  // summary can say "Age 7–9" where the chip alone says "7–9". Only chips that
  // are actually *rendered* are here — the municipality page draws no Type row
  // — which is what makes the count below span both state owners while still
  // ignoring a stray hand-edited `?category=` on a page with no Type row to
  // show for it.
  const lit = rows.flatMap((row) =>
    row.chips.filter((chip) => chip.active).map((chip) => ({ row, chip })),
  );

  // Clear's own condition is the filter card's, unchanged: it appears whenever
  // clearing would change something, including the rare filter that is live in
  // the URL with no chip on this surface to show it. That is precisely the case
  // the summary cannot offer a way out of, so the button is the way out.
  const showClear = hasAny || (showTypeFilter && categories.length > 0);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-hover"
        >
          <Sliders className="h-4 w-4" aria-hidden />
          {t("title")}
          {lit.length > 0 && (
            <>
              <span
                aria-hidden
                className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-act px-1 text-xs font-semibold tabular-nums text-act-foreground"
              >
                {lit.length}
              </span>
              <span className="sr-only">
                {t("activeCount", { count: lit.length })}
              </span>
            </>
          )}
        </button>

        {/* The summary scrolls sideways rather than wrapping: this bar is one
            line above the cards, and a set of filters that grew it to three
            would be pushing the grid down to say what the sheet already
            says. The scrollbar is suppressed, which is the right trade on the
            only viewports this bar exists on — a thumb needs no scrollbar to
            find the end of a row. */}
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {lit.map(({ row, chip }) => (
              <button
                key={`${row.id}:${chip.key}`}
                type="button"
                onClick={chip.toggle}
                aria-label={t("removeFilter", {
                  label: `${row.label} ${chip.text}`,
                })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-act px-3 py-1.5 text-xs font-medium text-act-foreground shadow-sm"
              >
                {chip.icon}
                {chip.label ?? chip.text}
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        {/* Rendered whether or not it is showing, so the bar's height cannot
            change as filters come and go — `invisible` keeps the box and hides
            the pixels, the same way the filter card's own Clear does. */}
        <button
          type="button"
          onClick={clear}
          aria-hidden={!showClear}
          tabIndex={showClear ? 0 : -1}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-hover",
            !showClear && "invisible pointer-events-none",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
          {t("clearAll")}
        </button>
      </div>

      {!open && (
        <div className="hidden lg:block">
          <ProductBrowseFilters showTypeFilter={showTypeFilter} />
        </div>
      )}

      {/* The sheet exists only while it is up. A sheet portals into
          `document.body`, which a server render has none of, so one standing
          permanently in this tree would have to be taught to wait for the
          browser — and there is nothing for it to do while closed anyway. The
          cost is that it arrives without its slide, since it mounts already
          open; the scrim and the panel appear together, which on a phone reads
          as the sheet being where the thumb put it. */}
      {open && (
        <Sheet open onOpenChange={setOpen} side="bottom">
          <SheetContent>
            <SheetHeader onClose={() => setOpen(false)}>
              <SheetTitle>{t("title")}</SheetTitle>
              {/* Clear all belongs in here too: the bar that carries it is
                  behind the scrim while the sheet is up, and a reader who has
                  just looked at nine rows of chips is exactly the reader most
                  likely to want them all off. */}
              <button
                type="button"
                onClick={clear}
                aria-hidden={!showClear}
                tabIndex={showClear ? 0 : -1}
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-hover",
                  !showClear && "invisible pointer-events-none",
                )}
              >
                <X className="h-3 w-3" aria-hidden />
                {t("clearAll")}
              </button>
            </SheetHeader>
            {/* Chips apply as they are tapped — no Apply, no Cancel. Each one
                rewrites the URL in place and the grid behind the sheet answers
                immediately, so a reader can watch a filter take effect through
                the gap above the panel rather than committing to it blind. */}
            {/* Nine rows of chips outgrow a phone, so the rows scroll and the
                header stays put. The cap is on the rows rather than on the
                panel because it is also what leaves part of the grid showing
                above the sheet, dimmed but moving, so a tapped chip is visibly
                doing something. The page behind cannot scroll while the sheet
                is up — the sheet holds the document still. */}
            <SheetBody className="max-h-[65vh]">
              <ProductBrowseFilters
                showTypeFilter={showTypeFilter}
                variant="sheet"
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
