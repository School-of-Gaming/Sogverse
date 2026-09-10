"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { BrowseSurface } from "./browse-surface";
import { ProductBrowseFilters } from "./product-browse-filters";
import { useOfferedBrowseFilters } from "./use-browse-filters";

// The filters, in whichever of their two places the viewport calls for.
//
// From `lg` up nothing here is doing anything: the rows render inline, in the
// rail the results grid holds open for them, exactly as they always have.
//
// Below `lg` there is no rail to render into, and the rows used to stand as a
// strip above the cards, taking most of a phone's first screen before a single
// product appeared. So they move into a bottom sheet, and what stands in their
// place is a bar: a button that opens the sheet, and beneath it the filters
// that are currently narrowing the grid, each tappable to drop just that one.
// The summary is the part that earns the sheet: the strip showed the reader
// their filters without a tap, and hiding the rows would have taken that away.
//
// **The rows are mounted in one place at a time.** They render inline or in
// the sheet, never both — two mounted copies would be two writers of the same
// URL params, and the reader would be looking at whichever one happened to be
// visible. One piece of state says where the rows are and both places read it,
// so no render can put them in both: the commit that mounts them in the sheet
// is the commit that takes them out of the rail, and the commit that brings
// them back to the rail is the one that takes them out of the sheet. What
// decides *when* they go back is the sheet's slide rather than the tap that
// closed it: a panel sliding down with nothing in it reads as something having
// broken, so the rows ride the panel down and return once it is gone. Nothing
// is lost in either swap: the rows hold no state of their own, because every
// filter they draw lives in the URL.
export function ProductBrowseFilterPanel({
  surface,
}: {
  /** Which page the filters are for — see `browse-surface.ts`. */
  surface: BrowseSurface;
}) {
  const t = useTranslations("productBrowse.filters");
  const rows = useBrowseFilterRows(surface);
  // Clear appears whenever clearing would change something this page applies,
  // which is exactly when the summary below has a chip in it: both are read
  // from the page's offer, and every value a param can parse to lights a chip.
  const { hasAny: showClear, clear } = useOfferedBrowseFilters(surface);
  const [open, setOpen] = useState(false);
  // Where the rows are. It agrees with `open` except for the length of the
  // slide down, when the sheet is closed but still on its way off the screen
  // with the rows in it — which is why it is a second piece of state rather
  // than something read off the first.
  const [rowsInSheet, setRowsInSheet] = useState(false);
  const returnRowsToRail = useCallback(() => setRowsInSheet(false), []);

  const openSheet = () => {
    setRowsInSheet(true);
    setOpen(true);
  };

  // The trigger only exists below `lg`, so the sheet can only ever be opened
  // there — a display:none button takes neither a tap nor a focus ring. But a
  // window can be widened while it is up, and the rail behind it would then be
  // standing empty waiting for its rows back. Widening past the breakpoint
  // therefore closes it, and once it has slid away the rows return to the rail
  // the reader can now see. The literal is Tailwind's `lg`, which is what
  // `lg:hidden` on the bar below resolves to; the two have to move together.
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
  // summary can say "Age 7–9" where the chip alone says "7–9". The rows are
  // only those this page offers, so the count spans both state owners while a
  // param for a row the page does not draw — a school page's `?audience=` —
  // lights nothing here, just as it narrows nothing in the grid.
  const lit = rows.flatMap((row) =>
    row.chips.filter((chip) => chip.active).map((chip) => ({ row, chip })),
  );

  return (
    <>
      {/* The bar is as tall as what is lit. With nothing narrowing the grid it
          is the Filters button alone; lighting a filter adds Clear to the end
          of that line and the summary on a row of its own beneath it, and the
          summary wraps to as many lines as the selection needs, so every
          filter a reader has chosen is in view at a glance rather than
          scrolled out of sight behind the button.

          That growth moves the grid below, and it is not the shift the layout
          rule forbids: it is the direct result of the reader's own action.
          Filters are lit from the sheet, which covers the page while the bar
          grows underneath it, and the bar shrinks only when a chip here is
          tapped to remove the filter it names. */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openSheet}
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

          {/* Rendered only while there is something to clear, rather than held
              open invisibly the way the rail card's Clear is. There, the
              button is what gives the card's header its height; here, the
              Filters button already sets this line's height, so a reserved
              Clear would be an empty slot standing beside the one bar it can
              never share the line with — the unfiltered one. It arrives at the
              end of the line, so the button at the start does not move. */}
          {showClear && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-hover"
            >
              <X className="h-3 w-3" aria-hidden />
              {t("clearAll")}
            </button>
          )}
        </div>

        {lit.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
        )}
      </div>

      {!rowsInSheet && (
        <div className="hidden lg:block">
          <ProductBrowseFilters surface={surface} />
        </div>
      )}

      {/* The sheet stays mounted, so opening and closing it are a change to a
          panel already on the page — which is what lets it slide up from the
          bottom edge and back down to it, where mounting it on the tap would
          have had it appear already open and vanish on close.

          What it holds is mounted only while the rows are in it. A closed
          sheet waits below the bottom of the screen, and anything left inside
          it would be a second copy of the rows beside the rail's, and a Close
          and a Clear a keyboard could tab to without ever seeing them. */}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        onExitComplete={returnRowsToRail}
      >
        {rowsInSheet && (
          <SheetContent>
            <SheetHeader onClose={() => setOpen(false)}>
              <SheetTitle>{t("title")}</SheetTitle>
              {/* Clear all belongs in here too: the bar that carries it is
                  behind the scrim while the sheet is up, and a reader who has
                  just looked through every row of chips is exactly the reader
                  most likely to want them all off. It is held open while
                  hidden, unlike the bar's: it sits above the rows, so its
                  arriving on the first tapped chip would push every row down
                  under the thumb that tapped it. */}
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
            {/* The rows of chips outgrow a phone, so the rows scroll and the
                header stays put. The cap is on the rows rather than on the
                panel because it is also what leaves part of the grid showing
                above the sheet, dimmed but moving, so a tapped chip is visibly
                doing something. The page behind cannot scroll while the sheet
                is up — the sheet holds the document still. */}
            <SheetBody className="max-h-[65vh]">
              <ProductBrowseFilters surface={surface} variant="sheet" />
            </SheetBody>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
