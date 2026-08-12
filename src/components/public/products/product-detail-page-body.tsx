"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { productImageUrl } from "@/lib/images/product-image-url";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { parseLongDescription } from "@/types";
import type {
  ProductBrowseRow,
  ProductLongDescription,
  ProductType,
} from "@/types";
import { LongDescription } from "./long-description";
import { audienceLabelKey } from "./product-audience";
import { ProductDetailMastheadDraft } from "./product-detail-masthead-draft";
import { ProductOverviewCard } from "./product-overview-card";
import { productTagLabelKey, type ProductTag } from "./product-tag";
import { TopicInfoCard } from "./topic-info-card";

// Page body — pure layout + presentation. Owns nothing about fetching, and is
// agnostic to the signup panel: the panel is injected as a slot, so the
// route-level adapter (`ProductDetailPage`) passes the live `SignupPanel` while
// the mockup preview passes a navigating one. Both render this directly.
//
// Layout: full-width container, image hero (1:1 product image), name +
// tagline, then a 2-column grid on desktop (3:1 main : panel) that
// stacks on mobile. Right panel is sticky on desktop so a scrolling
// parent never loses the CTA.

/**
 * Identifies the `/schools/<slug>` listing a detail page was opened from, so
 * the back link can return there (labelled with the municipality) instead of
 * the storefront. Threaded unchanged through `ProductDetailPage` → this body →
 * `BackLink`; single source of truth for that shape.
 */
export interface MunicipalityBackLink {
  slug: string;
  name: string;
}

export interface ProductDetailPageBodyProps {
  product: ProductBrowseRow & {
    holidays?: { date: string; reason: string }[];
  };
  /** The right-column signup panel, injected so the body stays panel-agnostic.
   *  Prod passes the live `SignupPanel`; the preview passes a navigating one. */
  signupPanel: ReactNode;
  /** When opened from a `/schools/<slug>` listing, sends the back link there
   *  (labelled with the municipality) instead of the storefront. */
  municipality?: MunicipalityBackLink;
  /**
   * **Draft-redesign switch, and the whole of this page's part in it.** Absent
   * — which is what both live routes pass — the page renders exactly as it
   * always has, down to the DOM. Present, it renders the draft masthead (3:2
   * banner, the browse card's two chips) in place of the thumbnail one, and
   * hands the tag to the overview card so the who-it's-for area can explain
   * what SOG actually does about it.
   *
   * A prop rather than a second page, because everything below the masthead is
   * unchanged and a forked page would fork all of it; a *fork* of the masthead
   * itself, because that piece's redesign is a different grid with different
   * children, and expressing both inside one component would thread draft
   * styling through live code. At promotion the draft masthead becomes the
   * masthead and this prop disappears.
   *
   * The preview scene is its only caller. `imageSrc` is there for the same
   * reason the browse card's override is: a fixture row has no storage object,
   * so a scene that let the row decide would show the fallback banner on every
   * page and leave the hero unjudged.
   */
  draft?: {
    tag?: ProductTag;
    /** Resolved URL; `null` deliberately paints the wordmark banner. */
    imageSrc?: string | null;
  };
}

export function ProductDetailPageBody({
  product,
  signupPanel,
  municipality,
  draft,
}: ProductDetailPageBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const tTag = useTranslations("productTag");
  const getTopicLabel = useTopicLabel();

  const tr = resolveTranslation(product.product_translations, uiLocale);
  const topicLabel = getTopicLabel(product.topic);
  const longDescription = parseLongDescription(tr?.long_description);

  const draftTag =
    draft?.tag === undefined
      ? null
      : { value: draft.tag, label: tTag(productTagLabelKey(draft.tag)) };

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <BackLink
          productType={product.product_type}
          municipality={municipality}
        />

        {draft === undefined ? (
          <LiveMasthead
            imagePath={product.image_path}
            typeLabel={t(`typeLabel.${product.product_type}`)}
            topicLabel={topicLabel}
            name={tr?.name ?? ""}
            shortDescription={tr?.short_description ?? null}
          />
        ) : (
          <ProductDetailMastheadDraft
            typeLabel={t(`typeLabel.${product.product_type}`)}
            topicLabel={topicLabel}
            name={tr?.name ?? ""}
            shortDescription={tr?.short_description ?? null}
            // `undefined` means "no override, resolve the row" — the same
            // distinction the draft browse card's adapter draws, and the line
            // that survives as the live resolution at promotion.
            imageSrc={
              draft.imageSrc !== undefined
                ? draft.imageSrc
                : product.image_path
                  ? productImageUrl(product.image_path)
                  : null
            }
            tag={draftTag}
            // The card's exclusive pair, resolved to one value here so the
            // masthead and the corner of the card that sent the reader here
            // cannot pick differently.
            whoLabel={resolveWhoLabel(product, t, tAudience)}
          />
        )}

        {/* `minmax(0,…)` on every breakpoint (via `grid-cols-1` on
            mobile, which is shorthand for `minmax(0,1fr)`, and the
            explicit form on lg+) lets the main column shrink below
            its content's intrinsic width — so a wide child (a long
            unbroken word, a code block in the long description) can't
            expand the grid track and blow out the page width. Without
            this on mobile the default implicit track is `auto`, which
            sizes to content. */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <MainColumn
            product={product}
            longDescription={longDescription}
            tag={draft?.tag}
          />
          {/* Pin the whole panel just below the sticky site header (64px) with
              a 1rem comfort gap — matches the --header-height offset convention
              used elsewhere. Without the offset the card's top tucks under the
              header. */}
          <div className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
            {signupPanel}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({
  productType,
  municipality,
}: {
  productType: ProductType;
  municipality?: MunicipalityBackLink;
}) {
  const t = useTranslations("productDetail.back");
  // Reuse the listing page's own heading copy ("{name} Clubs") so the back link
  // and the page it returns to always read identically.
  const tm = useTranslations("schools.municipality");
  const href = municipality
    ? ROUTES.schoolMunicipality(municipality.slug)
    : ROUTES.shopBrowse(productType);
  const label = municipality
    ? tm("heading", { name: municipality.name })
    : t(productType);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function MainColumn({
  product,
  longDescription,
  tag,
}: {
  product: ProductDetailPageBodyProps["product"];
  longDescription: ProductLongDescription;
  /** Draft-only; undefined on both live routes. See the `draft` prop above. */
  tag?: ProductTag;
}) {
  // The topic card renders itself only when the topic carries an `info` block
  // (all current topics do); a hypothetical info-less topic gets no card.
  return (
    <div className="space-y-6">
      {/* Marketing blurb first — the expanded pitch under the hero, ahead of
          the logistics cards. Omitted when the admin left it empty. */}
      <LongDescription blocks={longDescription} />

      <ProductOverviewCard product={product} tag={tag} />

      <TopicInfoCard topic={product.topic} />
    </div>
  );
}

/**
 * The live masthead, unchanged — lifted into a component of its own only so the
 * draft can stand beside it in a legible ternary. Same markup, same classes,
 * same DOM; the props are the values the body had already resolved.
 */
function LiveMasthead({
  imagePath,
  typeLabel,
  topicLabel,
  name,
  shortDescription,
}: {
  imagePath: string | null;
  typeLabel: string;
  topicLabel: string | null;
  name: string;
  shortDescription: string | null;
}) {
  return (
    <div className="mt-6 grid grid-cols-[96px_1fr] items-start gap-x-4 gap-y-3 sm:grid-cols-[140px_1fr] sm:gap-x-6">
      <ProductThumbnail
        imagePath={imagePath ?? ""}
        alt={name}
        size="aspect-square w-full"
        className="rounded-lg [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
      />

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {typeLabel}
          {/* Topic (game brand / subject) sits beside the type label as the
              most scannable "what's this about" attribute — surfaced here in
              the hero rather than its own near-empty card lower down. The
              middot separator is a CSS pseudo-element, not a text node, so it
              stays out of the translation system. */}
          <span className="normal-case text-primary before:mx-1.5 before:text-muted-foreground/50 before:content-['·']">
            {topicLabel}
          </span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {name}
        </h1>
        {/* Short description on its own row at mobile width — squeezing it
            next to a 96px thumbnail makes it 4-5 cramped lines.
            Spans both columns from sm+ via the `sm:hidden` swap. */}
        {shortDescription && (
          <p className="mt-2 hidden text-muted-foreground sm:block">
            {shortDescription}
          </p>
        )}
      </div>

      {shortDescription && (
        <p className="col-span-2 text-muted-foreground sm:hidden">
          {shortDescription}
        </p>
      )}
    </div>
  );
}

/**
 * The single "who" value the draft masthead's chip shows: the audience badge
 * when the product carries one, the age range otherwise — the browse card's
 * exclusivity rule, resolved from the same `audienceLabelKey` decision so the
 * card and the page it opens cannot show different halves of the pair.
 *
 * Draft-only, and it deliberately does *not* use the overview card's composed
 * "For families, ages 8–12": a chip is a label, and that string is a sentence.
 */
function resolveWhoLabel(
  product: ProductDetailPageBodyProps["product"],
  t: ReturnType<typeof useTranslations<"productDetail">>,
  tAudience: ReturnType<typeof useTranslations<"productAudience">>,
): string | null {
  const audienceKey = audienceLabelKey(product);
  if (audienceKey !== null) return tAudience(audienceKey);
  if (product.min_age === null || product.max_age === null) return null;
  return t("info.ages", { min: product.min_age, max: product.max_age });
}
