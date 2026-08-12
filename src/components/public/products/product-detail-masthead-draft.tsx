"use client";

import { SogFallback } from "@/components/ui/product-thumbnail";
import {
  DraftTagChip,
  DraftWhoChip,
  type DraftCardTag,
} from "./product-browse-card-view-draft";

/**
 * **The DRAFT product-detail masthead** — the top of the page a family lands on
 * from a redesigned browse card, and the second half of that redesign.
 *
 * Why this is a fork of the live masthead rather than a prop on it: the change
 * is *the layout*. The live masthead is a 96/140px square thumbnail with the
 * type, title and blurb in a column beside it; this is a 3:2 banner with the
 * text beside (or below) it, which is a different grid with different children.
 * Expressing both inside one component would mean two layouts behind a boolean
 * and draft styling threaded through the live page — the thing the seam rules
 * exist to prevent. Everything *else* on the detail page is untouched and
 * shared: the back link, the long description, the overview card, the topic
 * card and the signup panel all render exactly as they do live.
 *
 * It is presentational to the point of taking only strings: the body above it
 * already resolved the translation, the topic label and the type label, and
 * doing any of that again here would be a second copy of the page's own
 * resolution.
 *
 * **Continuity is the point of the chips.** They are the same two pills the
 * card wears, in the same fills, with the same icons — the tag and then the
 * audience-or-age — because a parent who tapped a card carrying "Neuroinclusive"
 * has to find that word again on the page they land on, not a differently
 * worded restatement of it. Here they are not overlaid: the media block is
 * large enough that a chip on it competes with the picture, so they sit under
 * the title where the eye lands next.
 *
 * At promotion this body replaces the live masthead inside
 * `ProductDetailPageBody` and the `draft` prop that selects it goes away.
 */
export interface ProductDetailMastheadDraftProps {
  /** "Club" / "Camp" / "Event" — already resolved by the page body. */
  typeLabel: string;
  /** Game or subject, or null on a product whose topic has no label. */
  topicLabel: string | null;
  name: string;
  shortDescription: string | null;
  /** Resolved URL, or null to paint the wordmark banner at the same ratio. */
  imageSrc: string | null;
  tag: DraftCardTag | null;
  /**
   * The audience badge, or the age range when there is no badge — resolved by
   * the caller to the same single value the card puts in its top-right corner,
   * so the two surfaces cannot disagree about which of the pair is shown.
   */
  whoLabel: string | null;
}

export function ProductDetailMastheadDraft({
  typeLabel,
  topicLabel,
  name,
  shortDescription,
  imageSrc,
  tag,
  whoLabel,
}: ProductDetailMastheadDraftProps) {
  return (
    // Mobile-first, as every family surface is: one column with the banner on
    // top. From `sm` the media takes three fifths and the text two, which keeps
    // the picture media-forward without letting it become a billboard — a 3:2
    // banner across the page's full 5xl would stand 680px tall and push the
    // title below the fold on a laptop.
    //
    // `items-center`, not `items-start`: the text column is usually shorter
    // than the 3:2 hero beside it, and top-aligned it left all its slack
    // pooled beneath the description — an awkward hole under the shortest
    // content (owner-flagged). Centering splits the slack above and below, the
    // ordinary hero composition. On the rare product whose text outgrows the
    // hero, the same rule centers the image instead, which is symmetric and
    // reads just as deliberately. Moot below `sm`, where each row hugs its own
    // content.
    <div className="mt-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:gap-6">
      <div className="overflow-hidden rounded-lg border">
        {imageSrc !== null ? (
          // eslint-disable-next-line @next/next/no-img-element -- product images bypass next/image, exactly as `ProductThumbnail` does; the scene's demo art is a local file
          <img
            src={imageSrc}
            // Decorative: the page's own h1 names the product immediately
            // below, so alt text here would announce the name twice.
            alt=""
            className="aspect-[3/2] w-full object-cover"
          />
        ) : (
          <SogFallback variant="banner" className="aspect-[3/2] w-full" />
        )}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {typeLabel}
          {/* Same treatment as the live masthead: the topic sits beside the
              type label, and the middot separator is a CSS pseudo-element
              rather than a text node, so it stays out of the message files. */}
          {topicLabel !== null && (
            <span className="normal-case text-primary before:mx-1.5 before:text-muted-foreground/50 before:content-['·']">
              {topicLabel}
            </span>
          )}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {name}
        </h1>

        {/* The card's two chips, in the card's order. A wrapping row rather
            than a fixed pair: at the narrow end of this column a long tag and a
            long audience label do not sit on one line, and the second one
            dropping beneath the first is the right answer there. */}
        {(tag !== null || whoLabel !== null) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tag !== null && <DraftTagChip tag={tag} />}
            {whoLabel !== null && <DraftWhoChip label={whoLabel} />}
          </div>
        )}

        {shortDescription !== null && (
          <p className="mt-3 text-muted-foreground">{shortDescription}</p>
        )}
      </div>
    </div>
  );
}
