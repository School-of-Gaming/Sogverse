"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SogFallback } from "@/components/ui/product-thumbnail";
import { productImageUrl } from "@/lib/images/product-image-url";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { parseLongDescription } from "@/types";
import { LongDescription } from "./long-description";
import { audienceLabelKey } from "./product-audience";
import { DraftMediaChips } from "./product-browse-card-view-draft";
import {
  BackLink,
  type MunicipalityBackLink,
  type ProductDetailPageBodyProps,
} from "./product-detail-page-body";
import { ProductOverviewCard } from "./product-overview-card";
import { productTagLabelKey, type ProductTag } from "./product-tag";
import { ProductTagNote } from "./product-tag-note";
import { TopicInfoCard } from "./topic-info-card";

/**
 * **The DRAFT product-detail page body** — the second half of the browse-card
 * redesign, and the page a family lands on from a redesigned card.
 *
 * One body, two shells, and the fork is at the *arrangement*: this renders the
 * same components the live body renders — the same `BackLink`, the same
 * `LongDescription` → `ProductOverviewCard` → `TopicInfoCard`, the same
 * injected signup panel — in a different layout. What changes is where the
 * pieces sit:
 *
 * - **The title block leads, everywhere.** Eyebrow, h1, *then* the picture. One
 *   order at every width, rather than the live page's thumbnail-beside-title
 *   that becomes title-above-blurb on a phone.
 * - **The hero wears the card's two chips**, in the card's corners, from the
 *   card's own exported treatment: tag bottom-left, audience-or-age top-right.
 *   A parent who tapped a card carrying "Neuroinclusive" bottom-left meets the
 *   same pill in the same corner here. The wordmark banner wears them the same
 *   way — the grid's un-imaged card already proves that combination.
 * - **Nothing is vertically centred.** The title sits at the top of its column
 *   and stays there.
 * - **The signup panel lives in a sticky right rail**, and from `2xl` the
 *   overview card moves into a sticky left one — the width budget below.
 *
 * At promotion this body replaces the live one, `tag`/`imageSrc` stop being
 * overrides and become row fields, and the scene stops choosing between two
 * bodies because there is only one.
 *
 * **The one thing this does not share with the live body is `MainColumn`.** The
 * facts rail needs the overview card to be a grid item in its own right at
 * `2xl`, and a component cannot be inside another component's flow at one
 * breakpoint and a sibling at the next — so the three sections are composed
 * here instead of behind that wrapper. The components are still the shared
 * ones; only the wrapper is not. The cost is real and worth writing down: a
 * fourth section added to the live page's `MainColumn` will not appear here,
 * and whoever adds it has to add it twice until promotion.
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
    // ---- The width budget ----
    //
    // Borrowed from the shop's browse grid — the same problem with the same
    // answer — and grown a second rail.
    //
    // **Below `lg`** this is the ordinary centred page container and the page is
    // one column in DOM order: title, hero, description, long description,
    // overview card, topic card, signup panel. `space-y-6` spaces the four
    // blocks and is cancelled from `lg` up, where the grid's own gap takes over.
    //
    // **From `lg`**, three tracks — left gutter, reading column, signup rail —
    // with the container's cap dropped (`max-w-none`) so the rails can live in
    // the viewport's margins instead of eating the reading measure. The reading
    // column caps at 44rem (~704px): wide enough for a 3:2 hero that reads as
    // media-forward, narrow enough that the prose under it stays a comfortable
    // measure. Measured: at 1024 the gutter is gone and the column has shrunk to
    // ~624px; at 1280 the column is at its 704px cap, 96px left of centre, with
    // the rail flush right; from ~1424 both gutters equalise and the column sits
    // within half a gap of dead centre.
    //
    // **From `2xl`** (1536px — the point at which a 1080p screen has ~570px of
    // dead left gutter) the overview card moves out of the reading flow into a
    // 16rem facts rail on the left, and the grid becomes
    // gutter | facts | reading | signup | gutter. Both gutters are `1fr`, so the
    // reading column sits a constant 32px left of centre — exactly half the
    // 64px by which the signup rail out-widths the facts rail — at 1536, at
    // 1920 and at everything between: at 1536 the gutters are 64px each, at 1920
    // 256px each, and the reading column holds its 704px cap throughout.
    //
    // Placement is explicit because auto-placement cannot express this. The
    // grid holds four items — three reading blocks in one column and the signup
    // rail beside them — and each rail has to **span every row**, because a
    // sticky element travels only within its own grid area: parked in row 1 it
    // would come unstuck the moment that row scrolled past. The spans are
    // counted (`row-span-3` at `lg`, `row-span-2` at `2xl`, where the overview
    // card has left the reading column) rather than written `1 / -1`, because
    // these rows are implicit — with no `grid-template-rows`, line `-1` is line
    // 1 and the span collapses to nothing. **A fourth block in the reading
    // column means bumping both counts.** At `2xl` the reading blocks also name
    // their rows, because with the overview card gone from their column an
    // auto-placed topic card would leave the empty row behind it as a 3rem hole.
    <div className="container mx-auto space-y-6 px-4 py-8 sm:py-12 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_20rem] lg:gap-6 lg:space-y-0 2xl:grid-cols-[minmax(0,1fr)_16rem_minmax(0,44rem)_20rem_minmax(0,1fr)]">
      {/* Reading block 1: everything above the facts. */}
      <div className="lg:col-start-2 lg:min-w-0 2xl:col-start-3 2xl:row-start-1">
        <BackLink
          productType={product.product_type}
          municipality={municipality}
        />

        {/* Words first: type and topic, then the name. The chips are not here —
            they are on the picture below, where the card puts them. */}
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
        </div>

        {/* The hero at the full width of the reading column, at the card's
            ratio, crop and chip treatment, so the two surfaces read as one
            design. `relative` is what the chips position against. A product with
            no picture gets the wordmark banner at the same ratio — and wears the
            chips on it, exactly as the grid's un-imaged card does. */}
        <div className="relative mt-4 overflow-hidden rounded-lg border">
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
          <DraftMediaChips
            tag={
              tag === undefined
                ? null
                : { value: tag, label: tTag(productTagLabelKey(tag)) }
            }
            whoLabel={whoLabel}
          />
        </div>

        {tr?.short_description && (
          <p className="mt-4 text-muted-foreground">{tr.short_description}</p>
        )}

        {/* The tag, explained, at the reading column's full width — directly
            under the blurb, which is where a parent who just read the chip on
            the picture above looks next. Deliberately *not* in the facts rail
            with the overview card: at 16rem this paragraph runs twenty-seven
            characters to the line, and prose does not belong in a rail of
            facts. */}
        {tag !== undefined && (
          <div className="mt-4">
            <ProductTagNote tag={tag} />
          </div>
        )}

        {/* Marketing blurb — the expanded pitch under the hero, ahead of the
            logistics. Omitted when the admin left it empty. */}
        <div className="mt-8">
          <LongDescription blocks={longDescription} />
        </div>
      </div>

      {/* The facts. One instance, moved between tracks by breakpoint: in the
          reading column's flow below `2xl` (where it is an ordinary grid row in
          column 2, exactly where the live page puts it), and in the left rail
          from `2xl`. Sticky there with the signup rail's mechanics — see that
          rail's note for why the gutter is reserved. */}
      <div className="lg:col-start-2 lg:min-w-0 2xl:col-start-2 2xl:row-start-1 2xl:row-span-2 2xl:self-start 2xl:sticky 2xl:top-[calc(var(--header-height)+1.5rem)] 2xl:max-h-[calc(100vh-var(--header-height)-3rem)] 2xl:overflow-y-auto 2xl:[scrollbar-gutter:stable]">
        <ProductOverviewCard product={product} railFrom2xl />
      </div>

      {/* Reading block 2: what is left below the facts. */}
      <div className="lg:col-start-2 lg:min-w-0 2xl:col-start-3 2xl:row-start-2">
        <TopicInfoCard topic={product.topic} />
      </div>

      {/* The signup rail. Sticks below the site header (`--header-height`, the
          same variable the header itself is sized from) and scrolls internally
          if the panel ever outgrows the viewport — the shop's filter rail
          exactly, mirrored to the right-hand side. `self-start` is what lets it
          stick at all: a stretched grid item is already as tall as its row.
          `scrollbar-gutter: stable` is not decoration: the panel swaps state on
          a clock (a countdown running out re-renders it), and a scrollbar
          materialising at that moment would pull every control inside the panel
          sideways under a parked cursor — which is the one thing the panel's own
          no-shift work exists to prevent. Reserving the gutter costs a permanent
          ~15px of the rail's width and buys the guarantee. Nothing else here
          constrains the panel: no fixed height, no `overflow-hidden`, so it
          keeps rendering every state at its own natural size. */}
      <div className="lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:overflow-y-auto lg:[scrollbar-gutter:stable] 2xl:col-start-4 2xl:row-span-2">
        {signupPanel}
      </div>
    </div>
  );
}
