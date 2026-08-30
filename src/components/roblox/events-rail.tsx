"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProductBrowseCard } from "@/components/public/products/product-browse-card";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow } from "@/types";

/**
 * How many cards the rail shows at `lg`, where each is exactly a third of a
 * container capped at `max-w-5xl`. It is stated here because two things depend
 * on it and they must not drift: the card's `lg:w-[calc((100%-3rem)/3)]` below,
 * and — because that width is exact — the server-side answer to whether the rail
 * overflows on desktop at all.
 */
const CARDS_PER_DESKTOP_ROW = 3;

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
 *    replaced, with nothing hidden behind an interaction. That the width is
 *    *exact* is what makes desktop overflow a fact about the product count, and
 *    so a fact the server already has — which is what lets the paddle row live
 *    in normal flow instead of floating above the rail.
 *  - **The paddles are in flow, under the rail, and never move.** Whether they
 *    render is decided from the product count; which of them is dimmed is
 *    measured. Those are two different questions and only the second one is
 *    allowed to change after first paint, because only the second one moves
 *    nothing when it does.
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
 *    thing the reader is reaching for. The peek and the paddles already say
 *    "more".
 */
export function EventsRail({ products, counts }: EventsRailProps) {
  const t = useTranslations("roblox.events");
  const railRef = useRef<HTMLDivElement>(null);

  // The paddle row is decided from the product count alone (see the note at its
  // JSX below), so the same arithmetic seeds the initial disabled states: a rail
  // that overflows starts parked at the left, which is back-disabled and
  // forward-enabled. Getting that right on the server is what keeps the first
  // paint from showing a briefly dead pair that lights up a frame later.
  const overflowsAtDesktop = products.length > CARDS_PER_DESKTOP_ROW;
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(overflowsAtDesktop);

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
  // answer is the same. Note what this measurement is and is not for: it decides
  // which paddle is *dimmed*, never whether the pair exists.
  useEffect(read);

  const scrollByCard = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    // The distance between two consecutive cards is one card plus one gap, with
    // no need to parse a computed gap value. A rail with fewer than two cards
    // renders no paddles at all, so the fallback is unreachable from a click.
    const first = rail.firstElementChild;
    const second = first?.nextElementSibling;
    const step =
      first instanceof HTMLElement && second instanceof HTMLElement
        ? second.offsetLeft - first.offsetLeft
        : rail.clientWidth;
    rail.scrollBy({ left: direction * step });
  };

  return (
    <div className="mx-auto mt-12 max-w-5xl">
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

      {/* The paddles, in normal flow under the rail and right-aligned to the
          same edge the cards align to — this wrapper's edge, which is what the
          rail's `-mx-4 px-4` bleed is arranged to preserve. They read as the
          rail's own controls because they are attached to it; the pair used to
          float up by the heading and did not.

          Rendering is decided on the server, from the product count and
          nothing else. In flow, a pair that appeared after a client-side
          overflow measurement would push everything below it down a frame after
          first paint — the shift the layout rule forbids — and the measurement
          buys nothing anyway: at `lg` the cards are exactly a third of a rail
          capped at `max-w-5xl`, so "overflows on desktop" *is* "more cards than
          fill one desktop row". Below `lg` the row is hidden in CSS rather than
          by sniffing for touch, which is also exactly the width at which the
          cards start peeking and the rail advertises itself without help.

          The one way the row can appear or disappear after paint is the product
          list itself crossing the boundary of three while the page is open.
          That is a data-driven change rather than a layout one, and it is
          effectively unreachable here — the shell seeds this query from the
          server prefetch, so the first render already holds the list — but it is
          named rather than left as a silent assumption.

          `mt-6` is not the gap it looks like: it collapses against the rail's
          `-mb-4`, leaving 8px, which lands on top of the 16px of rail padding
          the cards' hover shadow lives in. 24px below the cards is the number to
          reason about if this is ever retuned. */}
      {overflowsAtDesktop && (
        <div className="mt-6 hidden justify-end gap-2 lg:flex">
          <RailPaddle
            label={t("previous")}
            disabled={!canScrollBack}
            onClick={() => scrollByCard(-1)}
          >
            <ChevronLeft />
          </RailPaddle>
          <RailPaddle
            label={t("next")}
            disabled={!canScrollForward}
            onClick={() => scrollByCard(1)}
          >
            <ChevronRight />
          </RailPaddle>
        </div>
      )}
    </div>
  );
}

/**
 * One round paddle.
 *
 * A quiet filled ground rather than an outline: the paddles sit under a row of
 * bordered cards, and a third bordered shape there reads as a fourth card's
 * corner rather than as a control.
 *
 * **At an end a paddle dims; it never leaves.** The pair is a fixed landmark the
 * reader aims at, so its size and position may not depend on where the rail
 * happens to be parked — and a control that vanishes under the cursor mid-reach
 * is the same harm the layout rule is written against, at button scale.
 * `disabled` gives both halves of that for free from the shared button base:
 * `disabled:opacity-50` and `disabled:pointer-events-none`.
 */
function RailPaddle({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      className="h-11 w-11 rounded-full"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
