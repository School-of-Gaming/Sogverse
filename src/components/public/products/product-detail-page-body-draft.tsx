"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SogFallback } from "@/components/ui/product-thumbnail";
import { productImageUrl } from "@/lib/images/product-image-url";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { parseLongDescription } from "@/types";
import { audienceLabelKey } from "./product-audience";
import {
  DraftTagChip,
  DraftWhoChip,
} from "./product-browse-card-view-draft";
import {
  BackLink,
  MainColumn,
  type MunicipalityBackLink,
  type ProductDetailPageBodyProps,
} from "./product-detail-page-body";
import { productTagLabelKey, type ProductTag } from "./product-tag";

/**
 * **The DRAFT product-detail page body** — the second half of the browse-card
 * redesign, and the page a family lands on from a redesigned card.
 *
 * One body, two shells, and the fork is at the *arrangement*: this recomposes
 * the same children the live body composes — the same `BackLink`, the same
 * `MainColumn` (long description → overview card → topic card, in that order),
 * the same injected signup panel — into a different layout. Nothing here is a
 * second copy of a section, so a section added to the live page appears on this
 * one too. What changes is where the pieces sit:
 *
 * - **The title block leads, everywhere.** Eyebrow, h1, chips, *then* the
 *   picture. One order at every width, rather than the live page's
 *   thumbnail-beside-title that becomes title-above-blurb on a phone. A page
 *   should answer "what is this" in words before it answers it in a photograph,
 *   and a reader scrolling a stack should not meet a different sequence from
 *   the one they met on a laptop.
 * - **Nothing is vertically centred.** The title block sits at the top of its
 *   column and stays there. An earlier draft set the hero beside the text and
 *   centred the two against each other, which floated the title against a tall
 *   picture — overruled, and the fix was to dissolve the side-by-side rather
 *   than to realign inside it.
 * - **The signup panel moves into a sticky right rail** (see the width budget
 *   below), which is what dissolving the split buys: the hero gets the full
 *   reading column instead of three fifths of it, and the CTA is beside the
 *   whole page rather than beside the top of it.
 * - **The overview card explains the tag**, which is the only place on either
 *   surface that says what SOG actually does about it. That is `MainColumn`'s
 *   own doing — it takes the tag and passes it down.
 *
 * At promotion this body replaces the live one, `tag`/`imageSrc` stop being
 * overrides and become row fields, and the scene stops choosing between two
 * bodies because there is only one.
 */
export interface ProductDetailPageBodyDraftProps {
  product: ProductDetailPageBodyProps["product"];
  /** Injected exactly as the live body injects it — this moves the panel, it
   *  does not modify it. Every state it can render, it renders here. */
  signupPanel: ReactNode;
  municipality?: MunicipalityBackLink;
  /** No column for it yet, so it arrives as a prop. See `product-tag.ts`. */
  tag?: ProductTag;
  /**
   * Resolved hero URL. `undefined` means "no override, resolve the row" — which
   * is what the live page will do at promotion; an explicit `null` means "this
   * product has no picture" and paints the wordmark banner. The preview scene
   * passes it because a fixture row has no storage object behind it.
   */
  imageSrc?: string | null;
}

export function ProductDetailPageBodyDraft({
  product,
  signupPanel,
  municipality,
  tag,
  imageSrc,
}: ProductDetailPageBodyDraftProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const tTag = useTranslations("productTag");
  const getTopicLabel = useTopicLabel();

  const tr = resolveTranslation(product.product_translations, uiLocale);
  const topicLabel = getTopicLabel(product.topic);
  const longDescription = parseLongDescription(tr?.long_description);

  const heroSrc =
    imageSrc !== undefined
      ? imageSrc
      : product.image_path
        ? productImageUrl(product.image_path)
        : null;

  // The card's exclusive pair, resolved to the one value its top-right corner
  // shows: the audience badge when there is one, the age range otherwise. Read
  // from the same `audienceLabelKey` decision the card reads, so the chip a
  // parent tapped and the chip they land on cannot be different halves of it.
  // Deliberately not the overview card's composed "For families, ages 8–12" —
  // a chip is a label, and that string is a sentence.
  const audienceKey = audienceLabelKey(product);
  const whoLabel =
    audienceKey !== null
      ? tAudience(audienceKey)
      : product.min_age !== null && product.max_age !== null
        ? t("info.ages", { min: product.min_age, max: product.max_age })
        : null;

  return (
    // The horizontal width budget, borrowed wholesale from the shop's browse
    // grid — the same problem with the same answer, mirrored left-to-right.
    //
    // Below `lg` this is the ordinary centred page container and the page is
    // one column: title, hero, description, sections, and the signup panel last
    // (where the live page already puts it on a phone).
    //
    // From `lg` it drops the container's cap (`max-w-none`) and spends the
    // viewport on three tracks — left gutter, reading column, right gutter —
    // with the 20rem rail pinned to the *left* edge of the right gutter so it
    // sits against the column it belongs to. The reading column caps at 44rem
    // (~704px): wide enough for a 3:2 hero that reads as media-forward, narrow
    // enough that the prose under it stays a comfortable measure. Only two
    // children are placed, so the reading column has to name its track
    // explicitly (`lg:col-start-2`) — auto-placement would fill tracks 1 and 2
    // and put the rail where the left gutter belongs.
    //
    // Both gutters are `1fr`, so once each can exceed the rail's 20rem floor —
    // viewport ≥ ~1424px — they equalise and the reading column sits within
    // half a gap of dead centre. Below that the right gutter is at its floor
    // and the left takes what is left, so the column sits left of centre: 96px
    // at 1280, 0 at 1024 (where the gutter is gone entirely and the column has
    // shrunk to ~624px). That asymmetry is the same one the shop accepted in
    // the other direction, and for the same reason — legibility of the column
    // beats symmetry of the margins.
    <div className="container mx-auto px-4 py-8 sm:py-12 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_minmax(20rem,1fr)] lg:gap-6">
      <div className="lg:col-start-2 lg:min-w-0">
        <BackLink
          productType={product.product_type}
          municipality={municipality}
        />

        {/* Words first: type and topic, the name, then the two chips the browse
            card wears — in the card's order, so the tag a parent scanned for is
            the first thing they see again. */}
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`typeLabel.${product.product_type}`)}
            {/* Same treatment as the live masthead, unconditional for the same
                reason it is there: every topic resolves to a label. The middot
                separator is a CSS pseudo-element rather than a text node, so it
                stays out of the message files. */}
            <span className="normal-case text-primary before:mx-1.5 before:text-muted-foreground/50 before:content-['·']">
              {topicLabel}
            </span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {tr?.name}
          </h1>
          {(tag !== undefined || whoLabel !== null) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {tag !== undefined && (
                <DraftTagChip
                  tag={{ value: tag, label: tTag(productTagLabelKey(tag)) }}
                />
              )}
              {whoLabel !== null && <DraftWhoChip label={whoLabel} />}
            </div>
          )}
        </div>

        {/* The hero at the full width of the reading column, at the card's
            ratio and crop, so the two surfaces read as one design. A product
            with no picture gets the wordmark banner at the same ratio rather
            than a shorter page. */}
        <div className="mt-4 overflow-hidden rounded-lg border">
          {heroSrc !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- product images bypass next/image, exactly as `ProductThumbnail` does; the scene's demo art is a local file
            <img
              src={heroSrc}
              // Decorative: the h1 above already names the product, so alt text
              // here would announce the name twice.
              alt=""
              className="aspect-[3/2] w-full object-cover"
            />
          ) : (
            <SogFallback variant="banner" className="aspect-[3/2] w-full" />
          )}
        </div>

        {tr?.short_description && (
          <p className="mt-4 text-muted-foreground">{tr.short_description}</p>
        )}

        <div className="mt-8">
          <MainColumn
            product={product}
            longDescription={longDescription}
            tag={tag}
          />
        </div>
      </div>

      {/* The rail. Sticks below the site header (`--header-height`, the same
          variable the header itself is sized from) and scrolls internally if
          the panel ever outgrows the viewport — the shop's filter rail exactly,
          mirrored to the right-hand side. `self-start` is what lets it stick at
          all: a stretched grid item is already as tall as its row. The explicit
          20rem width plus `justify-self-start` keep it its own size and against
          the reading column while its track grows past it.
          `scrollbar-gutter: stable` is not decoration: the panel swaps state on
          a clock (a countdown running out re-renders it taller or shorter), and
          a scrollbar materialising at that moment would pull every control
          inside the panel sideways under a parked cursor — which is the one
          thing the panel's own no-shift work exists to prevent. Reserving the
          gutter costs a permanent ~15px of the rail's width and buys the
          guarantee. Nothing else here constrains the panel: no fixed height, no
          `overflow-hidden`, so it keeps rendering every state at its own
          natural size. */}
      <div className="mt-8 lg:col-start-3 lg:mt-0 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:w-80 lg:justify-self-start lg:self-start lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
        {signupPanel}
      </div>
    </div>
  );
}
