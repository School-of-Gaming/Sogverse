"use client";

import {
  Brain,
  Globe,
  MapPin,
  Rocket,
  Sprout,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { SogFallback } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import {
  BrowseCardFooter,
  StretchedCardLink,
  useBrowseCardShell,
  type ProductBrowseCardViewProps,
} from "./product-browse-card-view";
import type { ProductTag } from "./product-tag";

/**
 * **The DRAFT browse card body.** One body, two shells: this is the body that
 * replaces `ProductBrowseCardView`'s at promotion, not a third fork of it. It
 * is rendered today only by the shop preview scene's `redesign` scenario, over
 * fixtures, so the design can be signed off as a *page* — a grid of cards at
 * real widths — before the live storefront is touched.
 *
 * What changes from the live card:
 *
 * - **Media on top.** A full-card-width 3:2 image instead of the 80–96px square
 *   beside the text, which is what frees the title and the meta list to run the
 *   whole width. A product with no image gets the same wordmark treatment at
 *   the same ratio, so an imaged card and an un-imaged one are the same height
 *   on the grid.
 * - **Two overlaid chips, in two corners, one fact each.** The tag — who the
 *   product is *designed* for (`product-tag.ts`) — sits bottom-left. The
 *   top-right slot holds the audience badge, or the age range when there is no
 *   badge: **one slot, exclusive**, which is the live card's rule kept rather
 *   than reopened. So a parents-only card shows "For parents", a family one
 *   "For families", and an ordinary gamers-only one "Ages 9–12" — never two of
 *   those at once, and the age line no longer appears in the meta list at all.
 * - **Filled chips, not the outline `StatusChip`.** These sit on a photograph,
 *   where an outline pill with a translucent-looking ground is exactly the
 *   thing that stops being legible. Solid semantic fills instead, and local to
 *   this file: the draft owns its own chip vocabulary until promotion decides
 *   whether it is worth pushing back into the shared component.
 * - **The description sits below the facts, not above them.** It returns
 *   beneath the meta rows at `line-clamp-3`, the same three lines the live card
 *   allows — two was tried and overruled: a real short description is a
 *   sentence or two of prose, and clamping it at two lines cuts most of them
 *   mid-thought.
 *
 * Everything below the rule, and everything about whether the card opens, is
 * **shared code rather than a copy**: `useBrowseCardShell` decides openability
 * and hands back the card's own class string, `BrowseCardFooter` renders the
 * footer, and `StretchedCardLink` renders the link with its `cardLink`
 * accessible name. So the two bodies cannot drift on the rules that matter, and
 * this file has no opinion about them at all.
 *
 * One caveat on what the scene can actually show: the ended treatment (the
 * desaturated card and the note in place of the footer row) is implemented —
 * it comes with the shared shell and footer — but is **not reachable in the
 * preview**, because the fixtures re-base their calendar onto the live clock
 * and no shop-scene scenario is authored as finished. Judge that state on the
 * `camp-ended` product scene, or trust the shared code; it is not on this grid.
 *
 * `imagePath` stays in the props because this takes the live view's props
 * verbatim, and is deliberately unread: a resolved `imageSrc` is what this body
 * takes, and the path prop comes off the interface at promotion.
 */
export interface DraftCardTag {
  /** Drives the icon — which is why the value travels, not only its label. */
  value: ProductTag;
  /** Already translated by the adapter; this body renders no message keys. */
  label: string;
}

export interface ProductBrowseCardViewDraftProps
  extends ProductBrowseCardViewProps {
  /** The product's tag, or null on an untagged product — which is most of them,
   *  and stays the unremarkable case. */
  tag: DraftCardTag | null;
  /**
   * An already-resolved image URL, not a storage path: the adapter decides
   * where the picture comes from (a product's `image_path` in the live shop, a
   * local demo file in the preview scene), and this body only paints it. Null
   * renders the wordmark banner.
   */
  imageSrc: string | null;
}

/**
 * One icon per tag, and the reason the tag's *value* is carried alongside its
 * label. A generic tag icon was tried first and read as a price tag — a sale
 * sticker on a club — which is the opposite of what these say.
 *
 * **`Puzzle` is never the neuroinclusive icon.** The puzzle piece is a
 * contested symbol in the neurodivergent community and is not ours to reclaim
 * on a shop card; `Brain` is deliberate and is not to be "fixed" back to a
 * puzzle by anybody reading this later.
 */
const TAG_ICON: Record<ProductTag, LucideIcon> = {
  neuroinclusive: Brain,
  beginner: Sprout,
  advanced: Rocket,
};

export function ProductBrowseCardViewDraft({
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
}: ProductBrowseCardViewDraftProps) {
  // Openability, the card's class string, and the footer's inputs — all of it
  // shared with the live body rather than restated here.
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
        {imageSrc !== null ? (
          // eslint-disable-next-line @next/next/no-img-element -- product images bypass next/image, exactly as `ProductThumbnail` does; the scene's demo art is a local file
          <img
            src={imageSrc}
            // Empty on purpose. The picture is decorative here: the card's own
            // accessible name already carries the product name (and the title
            // is the next thing in the DOM), so alt text would read the name
            // twice to a screen reader for no added meaning.
            alt=""
            className="aspect-[3/2] w-full object-cover"
          />
        ) : (
          // Same ground, same wordmark, same ratio as a photo — so the grid
          // does not develop short cards where a product has no image.
          <SogFallback variant="banner" className="aspect-[3/2] w-full" />
        )}

        {/* Opposite corners, one fact each, so neither chip has to reserve room
            for the other and a card wearing only one of them has no hole where
            the other would be. Nothing else is ever overlaid — the price stays
            in the footer, where a seat bar can take its place. */}
        <DraftMediaChips tag={tag} whoLabel={whoLabel} />
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          {/* The title gets a row of its own, full card width. The clamp stays
              — a name has no upper bound — but at this width it should now be
              rare, which is the point of the media-top layout and is what the
              long-name fixture on the scene is there to check. */}
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

        {/* Three lines, as the live card allows. Two was tried and rejected:
            a short description is prose, and two lines cuts most real ones off
            mid-thought. The cards are free to differ in height for it. */}
        {description !== null && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        {/* The same footer the live card renders — the same component, not the
            same markup twice. The redesign is a change above the rule only. */}
        <BrowseCardFooter shell={shell} seatBar={seatBar} price={price} />
      </CardContent>

      {/* Nothing on this card owns a click of its own — the overlaid chips are
          labels, not controls — so the shared stretched link is the whole of
          its interactivity. */}
      <StretchedCardLink shell={shell} name={name} />
    </Card>
  );
}

// ---------- The draft's chip vocabulary ----------
//
// Exported because the redesign is not only the card any more: the product
// detail page wears the same two chips in its masthead, and a family arriving
// there from a card must meet the same pill saying the same thing. They are
// exported as two *purpose-built* chips rather than one generic chip plus an
// icon map, so a caller cannot pair the tag's icon with the audience's fill —
// which fill means which fact is the whole point of having two.
//
// They live in this file because the card is where the vocabulary was invented
// and is still its main reader. At promotion they want a module of their own
// (beside the shared card machinery), since by then nothing will be a "draft".

/**
 * A chip that sits on a photograph.
 *
 * Local to the draft rather than a widening of `StatusChip`, deliberately: that
 * component's whole visual argument is an outline pill on the page's own
 * background, which is right beside a thumbnail and wrong on top of one. This
 * is the opposite construction — a solid semantic fill with its paired
 * foreground token, which is legible over a bright sky and a night scene alike
 * because it does not depend on what is behind it at all. If the redesign
 * ships, that is the moment to decide whether the shared component grows a
 * filled tone; until then the draft carries its own.
 *
 * Deliberately **not** positioned: the card absolutely-positions these into two
 * corners of its image and the detail masthead sets them in ordinary flow, so
 * the caller supplies the placement. Everything that says *which fact this is*
 * — fill, foreground, icon — is fixed by the two wrappers below.
 */
function DraftChip({
  className,
  icon: Icon,
  children,
}: {
  className?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * **The two chips in their corners** — the whole overlaid treatment, exported
 * as one piece rather than as two chips plus a pair of corner offsets for the
 * next surface to restate.
 *
 * The detail page's hero wears exactly this, and "exactly" is the requirement:
 * a parent who tapped a card with "Neuroinclusive" bottom-left has to meet the
 * same pill in the same corner on the page they land on. Two call sites copying
 * `absolute bottom-2 left-2` would agree today and drift the first time either
 * is nudged.
 *
 * Opposite corners, one fact each, so neither chip reserves room for the other
 * and a picture wearing only one of them has no hole where the other would be.
 * Render it inside a `relative` media box; it positions itself. No scrim: the
 * fills are solid, which is what makes them legible over a bright sky and a
 * night scene alike.
 */
export function DraftMediaChips({
  tag,
  whoLabel,
}: {
  tag: DraftCardTag | null;
  whoLabel: string | null;
}) {
  return (
    <>
      {tag !== null && (
        <DraftTagChip
          tag={tag}
          className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)]"
        />
      )}
      {whoLabel !== null && (
        <DraftWhoChip
          label={whoLabel}
          className="absolute right-2 top-2 max-w-[calc(100%-1rem)]"
        />
      )}
    </>
  );
}

/**
 * The tag's icon alone, for the one surface that speaks the tag in running text
 * rather than as a pill: the tag note leads with icon + name inline, because a
 * second pill an inch under the hero's chip read as double-labeling
 * (owner-flagged). Routing it through here keeps the glyph and the chips on the
 * same map — a caller cannot pair a tag with the wrong icon.
 */
export function TagGlyph({
  tag,
  className,
}: {
  tag: ProductTag;
  className?: string;
}) {
  const Icon = TAG_ICON[tag];
  return <Icon className={className} aria-hidden />;
}

/** Who the product is designed for. Primary fill, one icon per tag. */
export function DraftTagChip({
  tag,
  className,
}: {
  tag: DraftCardTag;
  className?: string;
}) {
  return (
    <DraftChip
      className={cn("bg-primary text-primary-foreground", className)}
      icon={TAG_ICON[tag.value]}
    >
      {tag.label}
    </DraftChip>
  );
}

/**
 * Who may hold the seat, or how old they should be — the exclusive pair. The
 * caller resolves which of the two it is (`audienceLabel ?? ageLine`); this
 * only guarantees that both wear the same secondary fill wherever they appear,
 * so the corner keeps meaning one thing.
 */
export function DraftWhoChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <DraftChip
      className={cn("bg-secondary text-secondary-foreground", className)}
      icon={UserRound}
    >
      {label}
    </DraftChip>
  );
}
