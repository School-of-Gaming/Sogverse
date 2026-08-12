"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Globe, Tag, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { NavChevron } from "@/components/ui/nav-chevron";
import { SogFallback } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import { useRegistrationCta } from "./registration-cta";
import { SeatAvailabilityBar } from "./seat-availability-bar";
import { StatusChip } from "./status-chip";
import {
  PriceBlock,
  type ProductBrowseCardViewProps,
} from "./product-browse-card-view";

/**
 * **The DRAFT browse card body.** One body, two shells: this is the body that
 * replaces `ProductBrowseCardView`'s at promotion, not a third fork of it. It
 * is rendered today only by the shop preview scene's two redesign scenarios,
 * over fixtures, so the design can be signed off as a *page* — a grid of cards
 * at real widths — before the live storefront is touched.
 *
 * What changes from the live card, and why each is worth looking at:
 *
 * - **Media on top.** A full-card-width 3:2 image instead of the 80–96px
 *   square beside the text, which is what frees the title and the meta list to
 *   run the whole width. A product with no image gets the same wordmark
 *   treatment at the same ratio, so an imaged card and an un-imaged one are the
 *   same height on the grid.
 * - **A tag chip** — who the product is *designed* for (see `product-tag.ts`) —
 *   which is a different question from the audience badge that may sit beside
 *   it. Two variants place them differently and that is the main thing to
 *   judge: `overlay` puts both chips on the image, bottom-left, with no scrim
 *   (a `StatusChip` carries `bg-background`, so it stays legible over a bright
 *   photo on its own); `chip-row` leaves the image clean and gives them a row
 *   under the topic line, alongside the age and the language flag.
 * - **The audience badge and the age line may now coexist.** The live card
 *   makes the badge *replace* the age line, which was a width compromise: the
 *   badge, an age range and a flag would not fit one narrow row beside a
 *   thumbnail. A full-width layout dissolves that constraint, so the rule is
 *   deliberately reopened here — a badged card shows both — and Kyle judges it
 *   in the scene. If the answer is "still too busy", the fix is to restore the
 *   live card's rule in this body, not to narrow the layout again.
 * - **No description.** Deliberate: the detail page owns the prose, and
 *   card-scanning is facts plus an image. It is also what pays for the media
 *   block's height. `description` is still in the props (this takes the live
 *   view's props verbatim) and is deliberately unread — at promotion it comes
 *   off the interface, and `imagePath` goes with it, since a resolved
 *   `imageSrc` is what this body takes.
 *
 * Everything else is preserved exactly: the stretched link with its `cardLink`
 * accessible name, the hover / focus-within / active feedback gated on whether
 * the card actually opens, the ended card's desaturation and note, the inert
 * dead-ends, and the whole footer (price or seat bar left, CTA right) — which
 * reuses the live view's own `PriceBlock` rather than restating it.
 */
export interface ProductBrowseCardViewDraftProps
  extends ProductBrowseCardViewProps {
  /**
   * Pre-resolved tag label, or null on an untagged product — which is most of
   * them, and stays the unremarkable case.
   */
  tagLabel: string | null;
  /**
   * An already-resolved image URL, not a storage path: the adapter decides
   * where the picture comes from (a product's `image_path` in the live shop, a
   * local demo file in the preview scene), and this body only paints it. Null
   * renders the wordmark banner.
   */
  imageSrc: string | null;
  /** Where the tag and audience chips sit — see the component doc above. */
  variant: "overlay" | "chip-row";
}

export function ProductBrowseCardViewDraft({
  name,
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
  tagLabel,
  imageSrc,
  variant,
}: ProductBrowseCardViewDraftProps) {
  const t = useTranslations("productBrowse.card");
  const cta = useRegistrationCta(state);
  const isEnded = state.kind === "ended";

  // Identical to the live card's rule: only a "primary" CTA has anywhere worth
  // going, so every clickable affordance — the chevron, the hover/focus/active
  // feedback, the label's colour and the stretched link — reads this one value
  // and a card cannot look openable without being openable.
  const openHref = cta?.kind === "primary" ? detailHref : undefined;

  const isOverlay = variant === "overlay";
  const hasChips = tagLabel !== null || audienceLabel !== null;

  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col overflow-hidden transition-[border-color,box-shadow]",
        isEnded && "opacity-70 grayscale-[40%]",
        openHref && [
          "cursor-pointer",
          "hover:border-primary/40 hover:shadow-lg",
          "focus-within:border-primary/40 focus-within:shadow-lg",
          "active:border-primary/40",
        ],
      )}
    >
      {/* The media block. `relative` is what the overlay chips are positioned
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

        {/* Overlay variant only: the chips ride the bottom-left of the image
            with no scrim behind them — `StatusChip` is already an opaque
            `bg-background` pill, which is what carries the contrast over a
            bright photo. The tag leads, because it is the newer fact and the
            one a family might be scanning for; the audience badge follows it.
            Nothing else is ever overlaid — the price stays in the footer where
            the seat bar can take its place. */}
        {isOverlay && hasChips && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 p-2">
            {tagLabel !== null && (
              <StatusChip tone="primary" icon={Tag}>
                {tagLabel}
              </StatusChip>
            )}
            {audienceLabel !== null && (
              <StatusChip tone="info" icon={UserRound}>
                {audienceLabel}
              </StatusChip>
            )}
          </div>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          {/* The title gets a row of its own, full card width. The clamp stays
              — a name has no upper bound — but at this width it should now be
              rare, which is the point of the media-top layout and is what the
              long-name fixture on the scene is there to check. */}
          <h3 className="line-clamp-2 text-base font-semibold">{name}</h3>

          {/* Topic left, delivery language right. In the chip-row variant the
              flag moves down into the chip row instead, so this row can be the
              topic alone — and is dropped entirely when there is neither. */}
          {(topicLabel !== null || isOverlay) && (
            <div className="flex items-center gap-2">
              {topicLabel !== null && (
                <p className="text-xs font-medium tracking-wide text-primary">
                  {topicLabel}
                </p>
              )}
              {isOverlay && (
                <LanguageFlag className="ml-auto" code={spokenLanguageCode} />
              )}
            </div>
          )}

          {/* Chip-row variant: the image stays clean and every short fact sits
              on one wrapping row — tag, audience, ages, language. The flag is
              always here, so the row always renders. */}
          {!isOverlay && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {tagLabel !== null && (
                <StatusChip tone="primary" icon={Tag}>
                  {tagLabel}
                </StatusChip>
              )}
              {audienceLabel !== null && (
                <StatusChip tone="info" icon={UserRound}>
                  {audienceLabel}
                </StatusChip>
              )}
              {ageLine !== null && (
                <span className="text-xs text-muted-foreground">{ageLine}</span>
              )}
              <LanguageFlag code={spokenLanguageCode} />
            </div>
          )}

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
            {/* Overlay variant: the age range joins the muted meta list as
                plain text, because the chips it would otherwise share a row
                with are up on the image. It renders alongside an audience
                badge rather than yielding to it — the reopened rule described
                at the top of this file. */}
            {isOverlay && ageLine !== null && <li>{ageLine}</li>}
          </ul>
        </div>

        {/* Verbatim from the live card: the ended note, or the two-piece footer
            row whose halves are anchored to the card rather than to each
            other. Changing this in a draft body would mean judging the
            redesign against a footer the shop does not have. */}
        <div className="mt-auto border-t pt-3">
          {isEnded ? (
            <p className="text-xs italic text-muted-foreground">
              {t("endedNote")}
            </p>
          ) : (
            <div className="flex items-center justify-between gap-6">
              {seatBar !== undefined ? (
                <SeatAvailabilityBar
                  className="flex-1"
                  seatCount={seatBar.total}
                  seatsLeft={
                    seatBar.total === null
                      ? 0
                      : Math.max(0, seatBar.total - seatBar.filled)
                  }
                  waitlistEnabled={seatBar.waitlistEnabled}
                />
              ) : (
                <PriceBlock price={price} />
              )}
              {cta &&
                (openHref ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm font-medium text-primary">
                    {cta.labelText}
                    <NavChevron size="sm" className="text-primary" />
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                    {cta.labelText}
                  </span>
                ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* The whole card as one link, exactly as the live card does it: an empty
          stretched anchor, an inset focus ring (the card clips its overflow and
          would shave off an outset one), and an accessible name leading with
          the footer's visible word so voice control can reach it. Nothing on
          this card owns a click of its own, so nothing is lifted above the
          anchor — including the overlaid chips, which are labels, not
          controls. */}
      {openHref && cta && (
        <Link
          href={openHref}
          aria-label={t("cardLink", { action: cta.labelText, name })}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      )}
    </Card>
  );
}
