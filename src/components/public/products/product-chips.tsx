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
// nothing can pair the tag's icon with the audience's fill: which fill means
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
 * Deliberately not a widening of `StatusChip`: that component's whole visual
 * argument is an outline pill on the page's own background, which is right
 * beside a thumbnail and wrong on top of one. This is the opposite
 * construction — a solid semantic fill with its paired foreground token, which
 * is legible over a bright sky and a night scene alike because it does not
 * depend on what is behind it at all.
 *
 * Deliberately **not** positioned either: the card absolutely-positions these
 * into two corners of its image and the detail hero does the same in its own
 * media box, so the caller supplies the placement. Everything that says *which
 * fact this is* — fill, foreground, icon — is fixed by the two wrappers below.
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
 * **The corner exclusivity rule lives in `whoLabel`:** the top-right slot is
 * the audience badge when there is one and the age range otherwise — never
 * both. The caller resolves it (`audienceLabel ?? ageLine`) so the card and the
 * detail hero cannot show different halves of the pair.
 *
 * Opposite corners, one fact each, so neither chip reserves room for the other
 * and a picture wearing only one of them has no hole where the other would be.
 * Render it inside a `relative` media box; it positions itself. No scrim: the
 * fills are solid, which is what makes them legible over a bright sky and a
 * night scene alike.
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

/** Who the product is designed for. Primary fill, one icon per tag. */
function TagChip({
  tag,
  className,
}: {
  tag: ProductCardTag;
  className?: string;
}) {
  return (
    <MediaChip
      className={cn("bg-primary text-primary-foreground", className)}
      icon={TAG_ICON[tag.value]}
    >
      {tag.label}
    </MediaChip>
  );
}

/**
 * Who may hold the seat, or how old they should be — the exclusive pair. The
 * caller resolves which of the two it is; this only guarantees that both wear
 * the same fill wherever they appear, so the corner keeps meaning one thing.
 */
function WhoChip({ label, className }: { label: string; className?: string }) {
  return (
    <MediaChip
      // Eligibility is wit's word — the same question the region-lock strip
      // answers in wit. Label tier: neutral ground, family ink (wit ink is
      // always soft).
      className={cn("bg-muted text-yty-wit-soft", className)}
      icon={UserRound}
    >
      {label}
    </MediaChip>
  );
}
