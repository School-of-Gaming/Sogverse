"use client";

import { Brain, Rocket, Sprout, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ProductTag } from "./product-tag";

// ---------- The product chip vocabulary ----------
//
// The chips a family meets on a picture of a product: the tag bottom-left, the
// audience-or-age fact top-right. Three things leave this module — the resolved
// tag shape, the overlaid treatment as one piece, and the tag's bare glyph —
// and the chips themselves stay private.
//
// They are purpose-built rather than one generic chip plus an icon map, so
// nothing can pair the tag's icon with the audience's ink: which chip means
// which fact is the whole point of having two. Keeping them here is what stops
// a third surface from assembling its own arrangement of them.

/** A tag, resolved for display: the value drives the icon, the label the word. */
export interface ProductCardTag {
  /** Drives the icon — which is why the value travels, not only its label. */
  value: ProductTag;
  /** Already translated by the adapter; the bodies render no message keys. */
  label: string;
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

/**
 * A chip that sits on a photograph.
 *
 * **It is a chip, on glass.** It used to be a solid brand fill, on the argument
 * that a fill is the only thing legible over a bright sky and a night scene
 * alike — but a fill is what a hand presses, and neither of these is pressed;
 * each names a fact about the picture it is lying on. So the shape is the
 * figure chip the rest of the app draws — a neutral edge, the word and its
 * glyph in ink or in one colour — and what carries it over a photograph is the
 * library's `glass`, which is the page's own ground at high opacity behind a
 * blur. The blur destroys the detail underneath while keeping the colour, so
 * the chip reads as a small panel belonging to the page rather than as a
 * sticker belonging to the photograph, and its edge has a real ground to sit
 * on. No shadow: glass is already a surface, and a drop shadow under it is a
 * second answer to the question the blur has answered.
 *
 * Deliberately **not** positioned: the card absolutely-positions these into two
 * corners of its image and the detail hero does the same in its own media box,
 * so the caller supplies the placement. Everything that says *which fact this
 * is* — ink and icon — is fixed by the two wrappers below.
 */
function MediaChip({
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
        "glass inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium",
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
 * **The corner exclusivity rule lives in `whoLabel`:** the top-right slot is
 * the audience badge when there is one and the age range otherwise — never
 * both. The caller resolves it (`audienceLabel ?? ageLine`) so the card and the
 * detail hero cannot show different halves of the pair.
 *
 * Opposite corners, one fact each, so neither chip reserves room for the other
 * and a picture wearing only one of them has no hole where the other would be.
 * Render it inside a `relative` media box; it positions itself. No scrim: each
 * chip carries its own glass, which is what makes it legible over a bright sky
 * and a night scene alike without dimming the picture underneath.
 */
export function ProductMediaChips({
  tag,
  whoLabel,
}: {
  tag: ProductCardTag | null;
  whoLabel: string | null;
}) {
  return (
    <>
      {tag !== null && (
        <TagChip
          tag={tag}
          className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)]"
        />
      )}
      {whoLabel !== null && (
        <WhoChip
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

/**
 * Who the product is designed for — the card's one highlight, so it keeps the
 * act colour on its word and its glyph. It is the only coloured thing on a
 * picture, which is what makes it read as the fact worth noticing.
 */
function TagChip({
  tag,
  className,
}: {
  tag: ProductCardTag;
  className?: string;
}) {
  return (
    <MediaChip
      className={cn("text-act", className)}
      icon={TAG_ICON[tag.value]}
    >
      {tag.label}
    </MediaChip>
  );
}

/**
 * Who may hold the seat, or how old they should be — the exclusive pair. The
 * caller resolves which of the two it is; this only guarantees that both read
 * the same way wherever they appear, so the corner keeps meaning one thing.
 *
 * **It is neutral, in ink.** An age band is a fact on every card, and a fact on
 * every card is not a colour: a hue spent on something that is always there
 * says nothing, and it takes the eye off the tag, which is the one thing here
 * that is not always there. It wore world, which it could not keep in any
 * case — world is not an ink, it is measured under the glyph floor on every
 * ground the theme ships.
 */
function WhoChip({ label, className }: { label: string; className?: string }) {
  return (
    <MediaChip
      className={cn("text-foreground", className)}
      icon={UserRound}
    >
      {label}
    </MediaChip>
  );
}
