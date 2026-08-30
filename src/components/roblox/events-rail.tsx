"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProductBrowseCard } from "@/components/public/products/product-browse-card";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow } from "@/types";

interface EventsRailProps {
  /** The programme's products, already narrowed. Never empty — the section
   *  above renders its own empty state instead of mounting a rail. */
  products: readonly ProductBrowseRow[];
  /** Seat counts covering those products, in any order — built into a per-id
   *  map here rather than taken as one, so this stays a plain-array boundary a
   *  server component could cross. */
  counts: readonly ParticipationCounts[];
}

/**
 * The "What's On" cards as a horizontal snap-scroller.
 *
 * The interactive half of the section, split out so the section itself keeps no
 * hooks beyond translations: the scroll state only exists while there are cards
 * to scroll, and the frame around them (heading, empty state) stays free of a
 * client directive.
 *
 * How it is built, and why each piece is load-bearing:
 *
 *  - **CSS scroll-snap, no carousel library.** `snap-x snap-mandatory` on the
 *    rail plus `snap-start` on each card is the whole mechanism; there is no
 *    "current slide" index anywhere, so nothing can disagree with where the
 *    rail actually is. `overscroll-x-contain` keeps a swipe past the last card
 *    from chaining to the document and triggering the browser's back gesture.
 *  - **The peek is the affordance.** Below `sm` a card is 85% of the rail, so
 *    the next one is always visibly cut off at the edge. That sliver is what
 *    tells a reader there is more, and it is why the rail is full-bleed
 *    (`-mx-4` against the section's `px-4`): the peeking card runs off the
 *    screen rather than stopping politely in a gutter, which reads as "more",
 *    not as "ragged".
 *  - **`px-4` + `scroll-px-4` together.** The padding gives the first and last
 *    card the same inset as the rest of the section, and the matching
 *    scroll-padding is what stops a snapped — or tabbed-to — card from landing
 *    under that padding. `pb-4 -mb-4` is the same trick vertically: `overflow-x`
 *    makes the block axis clip too, so without it a card's hover shadow is
 *    sheared off; the negative margin gives the space straight back so nothing
 *    below moves.
 *  - **At `lg` three cards fill the rail exactly** ((100% − two 1.5rem gaps)/3),
 *    so a programme with three or fewer events looks like the plain grid this
 *    replaced, with nothing hidden behind an interaction.
 *  - **Reduced motion is handled in CSS, not JS.** `scrollBy` is called with no
 *    `behavior`, which per CSSOM means "use the element's `scroll-behavior`" —
 *    so `scroll-smooth motion-reduce:scroll-auto` decides it, and there is no
 *    `matchMedia` to keep in step with a media query.
 *  - **No `tabIndex` on the rail.** Every card is a link, so tabbing already
 *    walks the whole list and the browser scrolls each one into view against
 *    the scroll-padding above. Adding a tab stop would only insert an unnamed
 *    focusable region ahead of the cards. This is a scrolling list, not an ARIA
 *    carousel: no `aria-roledescription`, no live region, nothing to announce.
 *  - **No edge fade.** The one on the session calendar works because it fades
 *    into a card of known colour; here it would sit over cards whose whole
 *    hover feedback is a brightened border and a shadow, dimming exactly the
 *    thing the reader is reaching for. The peek and the arrows already say
 *    "more".
 */
export function EventsRail({ products, counts }: EventsRailProps) {
  const t = useTranslations("roblox.events");
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const countsByProduct = new Map<string, ParticipationCounts>();
  for (const c of counts) {
    countsByProduct.set(c.productId, c);
  }

  // Two boolean states rather than one object: an unchanged boolean makes React
  // bail out of the re-render, so a scroll that does not cross either end costs
  // nothing. The 1px slack absorbs sub-pixel scroll positions, which fractional
  // card widths produce at most viewport sizes.
  const read = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setCanScrollBack(rail.scrollLeft > 1);
    setCanScrollForward(rail.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", read, { passive: true });
    // Catches the viewport resizing under a rail whose contents did not change.
    const observer = new ResizeObserver(read);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, [read]);

  // Deliberately un-keyed, so it also catches the other direction: the product
  // list arriving or changing alters `scrollWidth` without altering the rail's
  // own box, which a ResizeObserver cannot see. Re-measuring after every render
  // is two reads, and the bail-out above means it re-renders nothing when the
  // answer is the same.
  useEffect(read);

  const scrollByCard = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    // The distance between two consecutive cards is one card plus one gap, with
    // no need to parse a computed gap value. A single card cannot overflow, so
    // the fallback is only ever reached with the buttons already hidden.
    const first = rail.firstElementChild;
    const second = first?.nextElementSibling;
    const step =
      first instanceof HTMLElement && second instanceof HTMLElement
        ? second.offsetLeft - first.offsetLeft
        : rail.clientWidth;
    rail.scrollBy({ left: direction * step });
  };

  return (
    <div className="relative mx-auto mt-12 max-w-5xl">
      {/* Whether the rail overflows is unknowable on the server, so the buttons
          arrive a frame after the cards do. They are absolutely positioned into
          the gap the heading block already leaves above the rail, which is what
          makes that arrival — and every later disabled/enabled flip — move
          nothing. Hidden below `lg` in CSS rather than by sniffing for touch:
          that is also exactly the width at which the cards stop peeking and the
          rail stops advertising itself. */}
      {(canScrollBack || canScrollForward) && (
        <div className="absolute -top-12 right-0 hidden gap-2 lg:flex">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("previous")}
            disabled={!canScrollBack}
            onClick={() => scrollByCard(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("next")}
            disabled={!canScrollForward}
            onClick={() => scrollByCard(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <div
        ref={railRef}
        className="-mx-4 -mb-4 flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-4 scroll-px-4 motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-4.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            <ProductBrowseCard
              product={product}
              counts={countsByProduct.get(product.id) ?? null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
