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
 * How many cards a row holds at each width tier — one card on a phone, two from
 * `sm`, three from `lg`.
 *
 * Everything else on this rail is derived from these three numbers, which is why
 * they are named rather than inlined: each tier's card-width calc splits the rail
 * this many ways, whether that tier needs a peek allowance is "are there more
 * cards than this", whether the arrows can ever be useful is the same question
 * asked at the narrowest tier that shows them, and whether the forward arrow may
 * be painted by the server is that question at the widest. Change a number here
 * and every one of those has to move with it.
 *
 * One wrinkle worth stating, because two breakpoints are involved and they do not
 * line up: the card width switches at `sm` and the arrows appear at `md`, so the
 * `md` tier shows `sm`'s two cards. Anything reasoning about the arrows' narrowest
 * tier therefore asks about `sm`.
 */
const CARDS_PER_ROW = { base: 1, sm: 2, lg: 3 } as const;

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
 *     card width      = the tier's own width calc, restated
 *     banner width    = card width - 2px       the card's 1px border, twice
 *     banner height   = banner width * 2/3     ProductBanner's 3:2 frame
 *     centre from top = 1px + banner height/2
 *                     = 1px + (card width - 2px) / 3
 *
 * The 1px is the whole inset: the card puts its media block flush against its
 * top content edge, with no padding above it.
 *
 * **There are two values because the arrows span two tiers**, and a card is a
 * different width in each — two-up from `md` (where the arrows first appear),
 * three-up from `lg`. Each line therefore restates the card width that tier
 * actually uses; a single value tuned for `lg` would still land on artwork at
 * `md`, but visibly high on it.
 *
 * **This and `ProductBanner`'s `aspect-[3/2]` are one fact.** The trailing `/3`
 * is that ratio halved and nothing else, so re-cropping the banner moves these
 * arrows. The card-width halves are a second such coupling — they are the card's
 * own `sm:`/`lg:` widths restated, in their peek-allowance form, which is the
 * only form in play when arrows render at all.
 *
 * Sanity check, at the two tiers:
 *   - `md` (768–1023px): the rail is 736px, the card 332px, so a 220px banner
 *     band has its centre at 111px.
 *   - `lg`+ : `max-w-5xl` bounds the rail to 992–1024px, the card to 315–325px,
 *     so a ~210px band has its centre at 105–109px.
 * A 40px arrow sits inside either band with ~85px clear at both ends, so drift
 * of a pixel or two here is harmless — only a changed aspect ratio is not.
 */
const ARROW_TOP = cn(
  "top-[calc(1px+((100cqw-4.5rem)/2-2px)/3)]",
  "lg:top-[calc(1px+((100cqw-3rem)/3-2px)/3)]",
);

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
 *  - **A tier reserves peek room only when there is something to peek at.** The
 *    allowance is real space — 15% of the rail below `sm`, 3rem at `sm` — and
 *    held open beside a card that is the last one, it is a hole, not a hint. So
 *    every tier's width is exact when the products fit it and makes room for the
 *    next card only when there is a next card. One event, the likeliest state at
 *    launch, is a full-width card on a phone and a half-width one at `sm`, which
 *    is exactly what the grid this replaced did.
 *  - **The peek is the affordance.** Below `sm`, with more than one event, a card
 *    is 85% of the rail, so
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
 *  - **They appear from `md`, not `lg`.** A 900px window is a pointer context,
 *    not a thumb one, and between `md` and `lg` the rail can overflow with no
 *    other way into it: the scrollbar is hidden, a vertical wheel does nothing,
 *    and the peek advertises content the reader then cannot reach. The
 *    breakpoint is where the *input* changes, not where the layout does.
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
 *    the page is sent, and the one answered later cannot move anything. Because
 *    the count answers the first question at *some* tier and the viewport
 *    decides which, a pair can render and be permanently inactive — three events
 *    at `lg` — which `disabled:opacity-0` renders invisible and inert. Two spare
 *    buttons in the DOM is the whole cost of not having to know the viewport.
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

  // Two questions the product count answers, at two different tiers, and it
  // matters which tier each one asks.
  //
  // **Whether the arrows exist at all** asks the *narrowest* tier that shows
  // them. That is `md`, which takes `sm`'s two-up width, so any count past two
  // can overflow somewhere an arrow would be on screen and the pair has to be
  // in the markup. It renders once and stays; the viewport then decides whether
  // either half is ever live.
  const arrowsCanBeUseful = products.length > CARDS_PER_ROW.sm;

  // **Whether the forward arrow is already visible in the server's HTML** asks
  // the *widest* tier, and that asymmetry is the point. The server cannot know
  // the viewport, so it has to guess, and the two ways of being wrong are not
  // equally bad: seed it visible where the client then finds no overflow and an
  // arrow the reader has already looked at fades out from under them; seed it
  // hidden where the client finds overflow and an arrow fades in, which is
  // opacity alone and moves no geometry. So seed only what is true at *every*
  // tier the pair can appear at — more events than fill the widest row — and let
  // the narrower tiers fade theirs in. The one combination that pays for this is
  // exactly three events between `md` and `lg`, which fades in a frame after
  // paint; that is the cheap half of the trade, taken deliberately.
  //
  // The back arrow needs no such care: a rail parks at its left at every tier,
  // so starting hidden is right everywhere and it can only ever fade in.
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(
    products.length > CARDS_PER_ROW.lg,
  );

  // The card's width per tier. Each tier splits the rail as many ways as it
  // shows cards; what varies is whether it *also* gives up room for the edge of
  // the next one. That allowance is only ever paid for when there is a next card
  // to spend it on — held open beside the last card it is dead space, and one
  // event is the likeliest state this page ships in.
  //
  // Below `sm`: one card, so 85% (leaving a ~25px sliver at 360px) against a
  // full-width card when it is the only one. At `sm`: two cards either side of
  // one 1.5rem gap, plus a further 3rem of gap-and-sliver when a third exists.
  // At `lg`: three cards and two gaps, exactly, with no allowance in either
  // case — a fourth card is reached by the arrows, which is why this tier is the
  // one whose width is a fact the server can reason about.
  const cardWidth = cn(
    products.length > CARDS_PER_ROW.base ? "w-[85%]" : "w-full",
    products.length > CARDS_PER_ROW.sm
      ? "sm:w-[calc((100%-4.5rem)/2)]"
      : "sm:w-[calc((100%-1.5rem)/2)]",
    "lg:w-[calc((100%-3rem)/3)]",
  );

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
            // `min-w-0` because a flex item's automatic minimum size is its
            // min-content width, which would let one unbreakable 30-character
            // word in a product name push the card past the width declared
            // beside it — and a card wider than the snap step misaligns every
            // stop after it. The grid this replaced got the same clamp for free
            // from `minmax(0, 1fr)`.
            className={cn("shrink-0 snap-start min-w-0", cardWidth)}
          >
            <ProductBrowseCard
              product={product}
              counts={countsByProduct.get(product.id) ?? null}
            />
          </div>
        ))}
      </div>

      {/* Whether the arrows exist at all is decided on the server, from the
          product count and nothing else — every tier's card width is exact, so
          "does this rail overflow" is a fact about how many cards there are and
          no measurement can add to it. The count cannot say *which* tier is on
          screen, so the pair renders whenever it could be useful at any of them
          (see `arrowsCanBeUseful`), and the measurement then decides which half
          is live. That flips nothing but opacity.

          The one way the pair can appear or disappear after paint is the product
          list itself crossing that boundary while the page is open. That is a
          data-driven change rather than a layout one, and it is effectively
          unreachable here — the shell seeds this query from the server prefetch,
          so the first render already holds the list — but it is named rather
          than left as a silent assumption. */}
      {arrowsCanBeUseful && (
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
 * scrolls. The overhang is 12px rather than a true half: at the bottom of any
 * container tier the section's own `px-4` is the entire budget outside the card
 * column, and a 20px overhang there puts the right-hand arrow past the viewport
 * — at `lg` that is widths 1024–1032px — which is a horizontal document
 * scrollbar, never acceptable. 12px clears the tightest width of every tier the
 * arrows appear at and still reads as sitting on the edge line.
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
        // `hidden md:inline-flex` rather than a touch check, and `md` rather
        // than `lg` because that is where the input changes, not where the
        // layout does. Below it the reader is on a phone, swiping a rail whose
        // peek already advertises itself, and an overlaid control would be worth
        // little to a thumb. Above it there is a pointer and no other way in —
        // the scrollbar is hidden and a vertical wheel does nothing — so an
        // overflowing rail with no arrows would be advertising content it does
        // not hand over.
        "absolute z-10 hidden -translate-y-1/2 rounded-full bg-card shadow-md md:inline-flex",
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
