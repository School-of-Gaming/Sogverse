"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

/**
 * Where an arrow's centre line sits, measured down from the top of the rail.
 *
 * It lands on the middle of a card's **banner**, not the middle of the card. An
 * arrow overlapping artwork costs nothing; one overlapping the title and topic
 * line — which is exactly where a card's own centre falls — is unreadable, and
 * covering a product's name is the worst thing a control on this rail could do.
 * Centring on the media band rather than the row is why the rails this pattern
 * comes from can overlap at all.
 *
 * The arithmetic, with the wrapper declared a size container so `100cqw` is the
 * rail's own content width:
 *
 *     card width      = (100cqw - 3rem) / 3    two 1.5rem gaps removed, then
 *                                              split three ways — the same calc
 *                                              the cards take at `lg`
 *     banner width    = card width - 2px       the card's 1px border, twice
 *     banner height   = banner width * 2/3     ProductBanner's 3:2 frame
 *     centre from top = 1px + banner height/2
 *                     = 1px + (card width - 2px) / 3
 *
 * The 1px is the whole inset: the card puts its media block flush against its
 * top content edge, with no padding above it.
 *
 * **This value and `ProductBanner`'s `aspect-[3/2]` are one fact.** The `/3` on
 * the last line is that ratio halved and nothing else, so re-cropping the banner
 * moves these arrows. The card-width half is a second such coupling — it is the
 * card's own `lg:` width restated — and the two have to be changed together.
 *
 * Sanity check: `max-w-5xl` bounds the rail to 992–1024px wherever the arrows
 * are shown, which puts a ~210px banner band's centre at 105–109px. A 40px arrow
 * sits inside that with ~85px clear at either end, so drift of a pixel or two
 * here is harmless — only a changed aspect ratio is not.
 */
const ARROW_TOP = "top-[calc(1px+((100cqw-3rem)/3-2px)/3)]";

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
 *    so a fact the server already has.
 *  - **Two circular arrows flank the cards**, straddling the left and right
 *    edges of the card column — the pattern any reader has already met on a
 *    shopping or listings site, so nothing about it has to be learned here. Each
 *    one fades out when the rail cannot scroll that way and stays in the DOM
 *    while it is gone.
 *  - **They ride on the banner band, not the card's centre.** An overlaid
 *    control has to land on artwork rather than on the title beneath it, so
 *    their vertical position is derived from the card width and the banner's
 *    aspect ratio (`ARROW_TOP`) rather than from the card's own height. The
 *    banner's crop is therefore load-bearing here: change `aspect-[3/2]` and
 *    these arrows move with it.
 *  - **Existence is decided on the server; only visibility is measured.** The
 *    arrows render from the product count, on the first paint, and the scroll
 *    measurement moves nothing but their opacity. Those are deliberately two
 *    different questions: the one that could move the page is answered before
 *    the page is sent, and the one answered later cannot move anything.
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

  // Whether the arrows exist is decided from the product count alone (see the
  // note at their JSX below), and the same arithmetic seeds which of them starts
  // visible: a rail that overflows is parked at its left, so the forward arrow
  // is live and the back one is faded out. Server-rendering that correctly is
  // what keeps the first paint from showing an empty edge that an arrow fades
  // into a frame later.
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
  // which arrow is *visible*, never whether the pair exists.
  useEffect(read);

  const scrollByCard = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    // The distance between two consecutive cards is one card plus one gap, with
    // no need to parse a computed gap value. A rail with fewer than two cards
    // renders no arrows at all, so the fallback is unreachable from a click.
    const first = rail.firstElementChild;
    const second = first?.nextElementSibling;
    const step =
      first instanceof HTMLElement && second instanceof HTMLElement
        ? second.offsetLeft - first.offsetLeft
        : rail.clientWidth;
    rail.scrollBy({ left: direction * step });
  };

  return (
    /* Declared a size container so the arrows can be placed with `cqw` — see
       `ARROW_TOP`, which needs the rail's own content width and cannot get it
       from a percentage, because a percentage `top` resolves against height.
       This is a measurement the browser makes during layout, so the arrows are
       on their line in the first painted frame; a JS measurement would put them
       there a frame later, and moving them afterwards is precisely what the
       layout rule forbids.

       It also makes the wrapper an independent formatting context, so the rail's
       `-mb-4` is absorbed into the wrapper's height rather than escaping through
       its bottom edge. Nothing visible turns on that — the spacing below is the
       same either way — but the wrapper's box is then honestly the cards' box.
       Note that inline-size containment does not clip: the rail still bleeds
       past this element by `-mx-4`, and the arrows still straddle its edges. */
    <div className="relative mx-auto mt-12 max-w-5xl [container-type:inline-size]">
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

      {/* Whether the arrows exist at all is decided on the server, from the
          product count and nothing else. At `lg` a card is exactly a third of a
          rail capped at `max-w-5xl`, so "the rail overflows on desktop" *is*
          "there are more cards than fill one desktop row" — no measurement can
          say anything the count does not already. What is measured is only which
          arrow is currently reachable, and that flips nothing but opacity.

          The one way the pair can appear or disappear after paint is the product
          list itself crossing the boundary of three while the page is open. That
          is a data-driven change rather than a layout one, and it is effectively
          unreachable here — the shell seeds this query from the server prefetch,
          so the first render already holds the list — but it is named rather
          than left as a silent assumption. */}
      {overflowsAtDesktop && (
        <>
          <EdgeArrow
            side="start"
            label={t("previous")}
            inactive={!canScrollBack}
            onClick={() => scrollByCard(-1)}
          >
            <ChevronLeft />
          </EdgeArrow>
          <EdgeArrow
            side="end"
            label={t("next")}
            inactive={!canScrollForward}
            onClick={() => scrollByCard(1)}
          >
            <ChevronRight />
          </EdgeArrow>
        </>
      )}
    </div>
  );
}

/**
 * One circular arrow, straddling the edge of the card column.
 *
 * **Elevated, not flat.** A round `bg-card` ground with a border and a shadow,
 * because this control overlaps the cards rather than sitting beside them: an
 * overlaid button needs its own edge and its own lift or it reads as a smudge on
 * whatever it covers. That is the whole reason it does not share the flat fill a
 * button standing on the page background would take.
 *
 * **Vertically it sits on the middle of the card's banner**, not the middle of
 * the card — see `ARROW_TOP` for the arithmetic and for what a re-cropped banner
 * would do to it. The card's own centre falls on its title and topic line, which
 * is the one place on the card an overlaid control must not go.
 *
 * **Horizontally it straddles the card column's edge**, half of the standard
 * pattern's appeal being that the control is visibly attached to the row it
 * scrolls. The overhang is 12px rather than a true half: the section's own
 * `px-4` is the entire budget outside the card column at the `lg` tier, and a
 * 20px overhang there puts the right-hand arrow past the viewport for widths
 * between 1024 and 1032px — a horizontal document scrollbar, which is never
 * acceptable. 12px keeps clearance at the tightest width and still reads as
 * sitting on the edge line.
 *
 * **At an end the arrow fades out rather than disappearing.** `disabled` is the
 * single source for all three of the states that need to agree — invisible
 * (`disabled:opacity-0`, replacing the shared button base's `disabled:opacity-50`
 * by name so the two cannot both apply), inert (`disabled:pointer-events-none`,
 * already in the base) and unfocusable (the attribute itself). The element stays
 * in the DOM throughout, so nothing reflows when it goes, and the transition is
 * opacity alone — nothing moves, which is what keeps it honest under
 * `prefers-reduced-motion` without needing to be switched off there.
 */
function EdgeArrow({
  side,
  label,
  inactive,
  onClick,
  children,
}: {
  side: "start" | "end";
  label: string;
  /** True when the rail cannot scroll this way — the arrow fades out and stops
   *  taking pointer or keyboard input, without leaving the DOM. */
  inactive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        // `hidden lg:inline-flex` rather than a touch check: below `lg` the
        // cards peek past the edge and advertise the rail without help, and a
        // control overlapping a card is worth far less to a thumb than to a
        // pointer.
        "absolute z-10 hidden -translate-y-1/2 rounded-full bg-card shadow-md lg:inline-flex",
        ARROW_TOP,
        // The transition list is stated explicitly so it replaces — rather than
        // races — the `transition-colors` the button base sets.
        "transition-[opacity,color,background-color] disabled:opacity-0",
        side === "start" ? "left-0 -translate-x-3" : "right-0 translate-x-3",
      )}
      aria-label={label}
      disabled={inactive}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
