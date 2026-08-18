"use client";

import { Globe, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { ProductBanner } from "@/components/ui/product-banner";
import {
  BrowseCardFooter,
  StretchedCardLink,
  useBrowseCardShell,
  type ProductBrowseCardViewProps,
} from "./browse-card-shell";
import { ProductMediaChips } from "./product-chips";

// Pure presentational browse card. Takes already-resolved display props —
// the adapter (`product-browse-card.tsx`) does the locale / currency /
// schedule / price / registration-state / image / tag resolution before
// calling this.
//
// Splitting along this boundary lets the UI Components page render any
// combination of states by hand, without faking a ProductBrowseRow that
// satisfies the type checker.

/**
 * **The browse card body.**
 *
 * How it arranges its facts, and why:
 *
 * - **Media on top.** A full-card-width 3:2 image rather than a small square
 *   beside the text, which is what frees the title and the meta list to run the
 *   whole width. A product with no image gets the same wordmark treatment at
 *   the same ratio, so an imaged card and an un-imaged one are the same height
 *   on the grid.
 * - **Two overlaid chips, in two corners, one fact each.** The tag — who the
 *   product is *designed* for (`product-tag.ts`) — sits bottom-left. The
 *   top-right slot holds the audience badge, or the age range when there is no
 *   badge: **one slot, exclusive**. So a parents-only card shows "For parents",
 *   a family one "For families", and an ordinary gamers-only one "Ages 9–12" —
 *   never two of those at once, and the age line does not appear in the meta
 *   list at all.
 * - **Filled chips, not the outline `StatusChip`.** These sit on a photograph,
 *   where an outline pill with a translucent-looking ground is exactly the
 *   thing that stops being legible. Solid semantic fills instead — the shared
 *   vocabulary in `product-chips.tsx`, which the detail hero wears too, so a
 *   parent meets the same pill in the same corner on the page a card sent them
 *   to.
 * - **The description sits below the facts, not above them.** It runs beneath
 *   the meta rows at `line-clamp-3` — two lines was tried and overruled: a real
 *   short description is a sentence or two of prose, and clamping it at two
 *   cuts most of them mid-thought. The cards are free to differ in height for
 *   it; no reserved title or description height (reserved dead space was
 *   rejected).
 *
 * Everything below the rule, and everything about whether the card opens, is
 * **shared code rather than a copy**: `useBrowseCardShell` decides openability
 * and hands back the card's own class string, `BrowseCardFooter` renders the
 * footer, and `StretchedCardLink` renders the link with its `cardLink`
 * accessible name. See `browse-card-shell.tsx` for the two rules that hold
 * structurally there rather than being restated here.
 */
export function ProductBrowseCardView({
  name,
  description,
  topicLabel,
  scheduleLines,
  ageLine,
  audienceLabel,
  locationLine,
  spokenLanguageCode,
  price,
  seatBar,
  state,
  detailHref,
  tag,
  imageSrc,
}: ProductBrowseCardViewProps) {
  // Openability, the card's class string, and the footer's inputs — all of it
  // shared rather than restated here.
  const shell = useBrowseCardShell(state, detailHref);

  // The top-right slot, resolved once. The badge is the coarser fact and wins
  // when both exist; the range fills the slot on the ordinary gamers-only card,
  // which is what stops that corner reading as empty on most of the grid.
  const whoLabel = audienceLabel ?? ageLine;

  return (
    <Card className={shell.cardClassName}>
      {/* The media block. `relative` is what the two chips are positioned
          against; the card's own `overflow-hidden` is what rounds the top two
          corners of whatever is painted here. */}
      <div className="relative">
        {/* The shared 3:2 crop — the same component the detail hero and the
            confirmation summary paint, so one stored file is cropped one way
            everywhere a family meets it. A product with no picture gets the
            wordmark at the same ratio, so the grid does not develop short
            cards; the picture is decorative here (the card's accessible name
            and the title beneath already say the product's name), which is why
            the component carries no alt. */}
        {/* The card's own width, breakpoint by breakpoint, so the browser
            fetches a card-sized file rather than a viewport-sized one. Read
            off the grid in `product-browse-results.tsx`: one column in a
            `px-4` container below `sm`; two columns from `sm` inside the
            640/768 container caps (296px, then 360px); two columns from `lg`
            in the ~688–944px cards track (336–464px); three from `xl`
            (~304–330px, so 352 covers it). Rounded up, never down — an
            under-claimed width is a blurry card. */}
        <ProductBanner
          src={imageSrc}
          sizes="(min-width: 1280px) 352px, (min-width: 1024px) 464px, (min-width: 768px) 360px, (min-width: 640px) 296px, calc(100vw - 2rem)"
        />

        {/* Opposite corners, one fact each, so neither chip has to reserve room
            for the other and a card wearing only one of them has no hole where
            the other would be. Nothing else is ever overlaid — the price stays
            in the footer, where a seat bar can take its place. */}
        <ProductMediaChips tag={tag} whoLabel={whoLabel} />
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          {/* The title gets a row of its own, full card width. The clamp stays
              — a name has no upper bound — but at this width it should be rare,
              which is the point of the media-top layout and is what the
              long-name fixture on the shop scene is there to check. */}
          <h3 className="line-clamp-2 text-base font-semibold">{name}</h3>

          {/* Topic left, delivery language right — the flag stays down here
              rather than joining the chips on the image: it is a standing fact
              about the product, not a label somebody browses for. Dropped
              entirely when there is no topic and no flag to hang it on. */}
          <div className="flex items-center gap-2">
            {topicLabel !== null && (
              <p className="text-xs font-medium tracking-wide text-primary">
                {topicLabel}
              </p>
            )}
            <LanguageFlag className="ml-auto" code={spokenLanguageCode} />
          </div>

          {/* Schedule and place. The age range is deliberately absent — it is
              up in the top-right chip, or it has yielded that slot to the
              audience badge. */}
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {scheduleLines.map((line, idx) => (
              <li key={idx} className="line-clamp-1">
                {line}
              </li>
            ))}
            <li className="flex items-center gap-1 line-clamp-1">
              {locationLine.kind === "in_person" ? (
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <Globe className="h-3 w-3 shrink-0" aria-hidden />
              )}
              <span className="truncate">{locationLine.label}</span>
            </li>
          </ul>
        </div>

        {/* Truthiness, not a null check, for the same reason the image
            resolution uses it: `short_description` is a plain text column and
            an empty string is representable in it, which would otherwise render
            an empty paragraph and the flex gap above it as a hole. */}
        {description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <BrowseCardFooter shell={shell} seatBar={seatBar} price={price} />
      </CardContent>

      {/* Nothing on this card owns a click of its own — the overlaid chips are
          labels, not controls — so the shared stretched link is the whole of
          its interactivity. */}
      <StretchedCardLink shell={shell} name={name} />
    </Card>
  );
}
