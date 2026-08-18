"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductBanner } from "@/components/ui/product-banner";
import { ROUTES } from "@/lib/constants";
import { productImageSrc } from "@/lib/images/product-image-url";
import { scrollToAnchor } from "@/lib/navigation/scroll-to-anchor";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { municipalityOf } from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { topicHasInfoCard } from "@/lib/products/topics";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import type { ProductDetailRow } from "@/services/products";
import type { ProductType } from "@/types";
import { LongDescription } from "./long-description";
import { audienceLabelKey } from "./product-audience";
import { ProductMediaChips } from "./product-chips";
import { ProductOverviewCard } from "./product-overview-card";
import { productTagLabelKey } from "./product-tag";
import { ProductTagNote } from "./product-tag-note";
import { TopicInfoCard } from "./topic-info-card";

// Page body — pure layout + presentation. Owns nothing about fetching, and is
// agnostic to the signup panel: the panel is injected as a slot, so the
// route-level adapter (`ProductDetailPage`) passes the live `SignupPanel` while
// the preview scene passes a navigating one. Both render this directly.

/**
 * The `/schools/<slug>` listing a detail page returns to: where the link goes
 * and what it reads. Single source of truth for that shape, consumed by
 * `BackLink`.
 *
 * The two halves come from different places on purpose. The **slug** is the one
 * that appeared in the URL, so the link stays in the namespace the viewer
 * arrived through (`helsingfors` never becomes `helsinki` under them). The
 * **name** is resolved from the product's own embedded location, in the
 * viewer's locale — which is why this page needs no locations read at all.
 */
export interface MunicipalityBackLink {
  slug: string;
  name: string;
}

/**
 * The signup panel's anchor. One constant, because a jump is two halves that
 * have to agree — the button naming a target and the target carrying the id —
 * and two string literals is how they stop agreeing.
 */
const SIGNUP_PANEL_ANCHOR_ID = "product-signup";

export interface ProductDetailPageBodyProps {
  /**
   * The detail row, not the browse row: this page renders the authored long
   * description, which the browse listing deliberately does not fetch. Holidays
   * stay optional — a caller that has no calendar to draw simply omits them.
   */
  product: Omit<ProductDetailRow, "holidays"> & {
    holidays?: { date: string; reason: string }[];
  };
  /** The signup panel, injected so the body stays panel-agnostic. Prod passes
   *  the live `SignupPanel`; the preview passes a navigating one. Every state
   *  it can render, it renders here. */
  signupPanel: ReactNode;
  /** Whether the panel currently offers an action to take — the caller derives
   *  it from the registration state (`registrationCtaKind(state) ===
   *  "primary"`), the same source the browse card's openability reads, so the
   *  two surfaces cannot disagree. Gates the phone jump button below: a
   *  full-width "{verb} now!" pointing at a panel whose whole content is "not
   *  open right now" is a control promising what it cannot deliver, so on a
   *  closed or ended product the button is withdrawn, not disabled — exactly
   *  as it is withdrawn at `lg` where the panel is already on screen.
   *  Required, so a caller cannot forget to decide. */
  signupActionable: boolean;
  /** When opened from a `/schools/<slug>` listing, the slug out of that URL —
   *  sends the back link there (labelled with the municipality) instead of the
   *  storefront. The slug alone: the label's name is read off `product` below,
   *  so no caller has to resolve it. */
  municipalitySlug?: string;
}

/**
 * **The product detail page a family lands on from a browse card.**
 *
 * Three tracks and a band, and where the pieces sit:
 *
 * - **The page names itself in a band across the top**, each element above the
 *   column it belongs to: back link right-aligned over the facts rail, title
 *   left-aligned over the hero, type · topic eyebrow left-aligned over the
 *   signup panel. The band spans the content tracks (never the gutters) and
 *   mirrors their template, so its cells share the columns' edges. On a phone
 *   the band is just the top of the stack in the order it always had: back,
 *   eyebrow, title, hero. No column alignment at that width; there is nothing
 *   to align to.
 * - **The hero wears the card's two chips**, in the card's corners, from the
 *   shared chip vocabulary: tag bottom-left, audience-or-age top-right. A
 *   parent who tapped a card carrying "Neuroinclusive" bottom-left meets the
 *   same pill in the same corner here. The wordmark banner wears them the same
 *   way.
 * - **Nothing is vertically centred.** The title sits at the top of its column
 *   and stays there. (Centring it, and a full-width hero banner, were both
 *   tried and rejected — a 5xl-wide 3:2 banner stands ~680px tall and pushes
 *   the title below the fold.)
 * - **The signup panel lives in a sticky right rail**, and from `2xl` the
 *   overview card moves into a sticky left one — the width budget below.
 */
export function ProductDetailPageBody({
  product,
  signupPanel,
  signupActionable,
  municipalitySlug,
}: ProductDetailPageBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const tTag = useTranslations("productTag");
  // The browse card's chip strings — shared, not copied; see whoLabel below.
  const tCardChip = useTranslations("productBrowse.card");
  // **The jump button's verb is the panel's verb, read from the panel's own
  // keys.** The panel composes its live CTA as "{verb} now" from exactly these
  // strings (see `useVerb` in `signup-panel-view.tsx`), so taking the same
  // namespace here means the word a parent taps in the reading column is the
  // word waiting on the button they land on — a club says Enrol in both places,
  // an event says Join in both, a municipality club says Register. Composing
  // rather than writing a phrase per type is what makes that a guarantee
  // instead of a promise: there is no second copy of the verb to drift.
  const tVerb = useTranslations("productDetail.signupPanel.verb");
  const getTopicLabel = useTopicLabel();

  const tr = resolveTranslation(product.product_translations, uiLocale);
  const topicLabel = getTopicLabel(product.topic);
  // Authored markdown, and the empty string is the ordinary "no blurb" state:
  // most products carry none, and the card below withdraws itself for it.
  const longDescription = tr?.long_description ?? "";

  const verb = tVerb(product.product_type);

  // The shared row-level resolution owns the empty-string-means-no-image rule;
  // null paints the wordmark banner at the hero's own ratio.
  const heroSrc = productImageSrc(product.image_path);

  // Untagged is the ordinary state and renders nothing at all — no chip here,
  // no explanation block below. The value travels with the label so the chip
  // cannot pair one tag's word with another's icon.
  const tag =
    product.tag === null
      ? null
      : { value: product.tag, label: tTag(productTagLabelKey(product.tag)) };

  // The card's exclusive pair, resolved to the one value its top-right corner
  // shows: the audience badge when there is one, the age range otherwise. Read
  // from the same `audienceLabelKey` decision the card reads, so the chip a
  // parent tapped and the chip they land on cannot be different halves of it.
  // Deliberately not the overview card's composed "For families, ages 8–12" —
  // a chip is a label, and that string is a sentence. The ages wording comes
  // from the CARD's key for the same reason the decision does: chip and hero
  // are one pill in two places, and two keys with identical copy today would
  // let a translator split them tomorrow. (`productDetail.info.ages` stays the
  // overview card's facts-rail string — a different construct.)
  const audienceKey = audienceLabelKey(product);
  const whoLabel =
    audienceKey !== null
      ? tAudience(audienceKey)
      : product.min_age !== null && product.max_age !== null
        ? tCardChip("ages", { min: product.min_age, max: product.max_age })
        : null;

  // **The back link's municipality, read off the product rather than looked
  // up.** The row already embeds its location plus one level of parent, and a
  // municipality club sits at exactly one of those two depths — the
  // municipality itself when online, a site inside it when in person — so the
  // name the link is labelled with is derivable from data already in flight.
  // That is why the `/schools/<slug>/[id]` route makes no locations read at
  // all, and it costs nothing in latency: this body does not render until the
  // product query resolves, so a server-resolved name could not have painted
  // any sooner.
  //
  // Resolved, never compared: an in-person club's `locations` is the school
  // site, and matching its id against a municipality would keep only the online
  // half.
  //
  // `null` is a real answer — a club anchored to a region or a country (legacy
  // rows the DB trigger still permits) has no municipality — and the whole
  // back link falls back to the type's sibling listing there, label *and*
  // destination. A "{name} Clubs" heading with no name is not an option, and
  // neither is the generic label pointed at one municipality's listing, which
  // would name a destination it does not go to.
  const municipalityNode = municipalityOf(product.locations);
  const municipality =
    municipalitySlug !== undefined && municipalityNode !== null
      ? {
          slug: municipalitySlug,
          name: localizedLocationName(municipalityNode, uiLocale),
        }
      : undefined;

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
    // Placement is explicit because auto-placement cannot express this. Every
    // row is named, and the counts are worth reading before moving anything:
    //
    //            lg (3 tracks)                 2xl (5 tracks)
    //   row 1    header band, content cols     header band, content cols
    //   row 2    hero block   | signup rail    facts | hero block | signup rail
    //   row 3    facts card   |   "            facts | topic card |   "
    //   row 4    topic card   |   "            —
    //
    // Each rail has to **span every row below the band**, because a sticky
    // element travels only within its own grid area: parked in one row it comes
    // unstuck the moment that row scrolls past. So both rails start at row 2 —
    // the band owns row 1 across every content column, and the gutter beside it
    // stays empty — and span 3 at `lg`, 2 at `2xl` where the facts card has
    // left the reading column.
    //
    // The spans are **counted** rather than written `2 / -1`, because these rows
    // are implicit: with no `grid-template-rows`, line `-1` is line 1 and the
    // span silently collapses to nothing. **A fourth block in the reading column
    // means bumping both counts and adding a row above.**
    <div className="container mx-auto space-y-6 px-4 py-8 sm:py-12 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_20rem] lg:gap-6 lg:space-y-0 2xl:grid-cols-[minmax(0,1fr)_16rem_minmax(0,44rem)_20rem_minmax(0,1fr)]">
      {/* The header band: row 1, spanning the CONTENT tracks only — from the
          facts rail's left edge to the signup rail's right edge, the same
          container that holds the two panels. Never the gutter tracks: a band
          that includes them anchors the title to the viewport edge while every
          column below starts hundreds of pixels further in, which reads as the
          page coming apart (owner-flagged, and how the first cut shipped).

          Each header element sits above the column it belongs to (owner
          ruling): the back link right-aligned over the facts rail, the title
          left-aligned over the hero, the type · topic eyebrow left-aligned
          over the signup panel. The band is an inner grid whose template and
          gap MIRROR the outer content tracks exactly — the band item spans
          those same tracks, so equal templates distribute equal widths and the
          cells align with the columns beneath without subgrid. Change the
          outer tracks and these must change with them.

          At `lg` the facts column does not exist yet (the card is still in the
          reading flow), so the back link keeps the inline spot left of the
          title; from `2xl` it moves to its own cell. That parent swap cannot
          be expressed with one node, so the link renders once per range —
          mobile / lg-inline / 2xl-cell, each copy `display:none` outside its
          range and so absent from the accessibility tree. Side cells are
          optically centred on the title's FIRST line (an `h-9` box, the h1's
          text-3xl line height), never its baseline and never the whole block:
          a wrapping name must not drag them down.

          Below `lg` it is not a band at all, just the top of the single stack
          in the order it has always been: back link, eyebrow, title — which is
          the DOM order; desktop placement is explicit per cell. */}
      <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:grid lg:grid-cols-[minmax(0,44rem)_20rem] lg:gap-6 2xl:col-start-2 2xl:col-span-3 2xl:grid-cols-[16rem_minmax(0,44rem)_20rem]">
        {/* Mobile copy: its own line at the top of the stack, as always. */}
        <div className="lg:hidden">
          <BackLink
            productType={product.product_type}
            municipality={municipality}
          />
        </div>

        {/* 2xl copy: right-aligned over the facts rail, hugging the title. */}
        <div className="hidden 2xl:col-start-1 2xl:row-start-1 2xl:flex 2xl:h-9 2xl:items-center 2xl:justify-self-end">
          <BackLink
            productType={product.product_type}
            municipality={municipality}
          />
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:col-start-2 lg:row-start-1 lg:mt-0 lg:flex lg:h-9 lg:items-center lg:justify-self-start 2xl:col-start-3">
          <span>
            {t(`typeLabel.${product.product_type}`)}
            {/* Unconditional, because every topic resolves to a label. The
                middot separator is a CSS pseudo-element rather than a text
                node, so it stays out of the message files. */}
            <span className="normal-case text-primary before:mx-1.5 before:text-muted-foreground/50 before:content-['·']">
              {topicLabel}
            </span>
          </span>
        </p>

        <div className="lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:items-start lg:gap-6 2xl:col-start-2">
          {/* lg-only inline copy — quiet and gapped so it cannot read as a
              clickable prefix of the product's name. */}
          <div className="hidden lg:flex lg:h-9 lg:shrink-0 lg:items-center 2xl:hidden">
            <BackLink
              productType={product.product_type}
              municipality={municipality}
            />
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl lg:mt-0 lg:min-w-0 lg:flex-1">
            {tr?.name}
          </h1>
        </div>
      </div>

      {/* Reading block 1: the hero and everything under it. */}
      <div className="lg:col-start-2 lg:row-start-2 lg:min-w-0 2xl:col-start-3">
        {/* The hero at the full width of the reading column, at the card's
            ratio, crop and chip treatment, so the two surfaces read as one
            design. `relative` is what the chips position against. A product with
            no picture gets the wordmark banner at the same ratio — and wears the
            chips on it, exactly as an un-imaged card does. */}
        <div className="relative overflow-hidden rounded-lg border">
          {/* Eager: the hero is the page's picture and reliably above the
              fold — the one banner that must not wait for a scroll. */}
          {/* The reading column's width: capped at 44rem from `lg`, and below
              that the `px-4` container — which itself caps at 768 and 640 on
              the two breakpoints under it. */}
          <ProductBanner
            src={heroSrc}
            sizes="(min-width: 1024px) 704px, (min-width: 768px) 736px, (min-width: 640px) 608px, calc(100vw - 2rem)"
            eager
          />
          <ProductMediaChips tag={tag} whoLabel={whoLabel} />
        </div>

        {tr?.short_description && (
          <p className="mt-4 text-muted-foreground">{tr.short_description}</p>
        )}

        {/* The tag, explained, at the reading column's full width — directly
            under the blurb, which is where a parent who just read the chip on
            the picture above looks next. Deliberately *not* in the facts rail
            with the overview card: at 16rem this paragraph runs twenty-seven
            characters to the line, and prose does not belong in a rail of
            facts. Absent entirely on an untagged product, which is most of
            them: no chip above, no block here. */}
        {product.tag !== null && (
          <div className="mt-4">
            <ProductTagNote tag={product.tag} />
          </div>
        )}

        {/* **The way down to the signup panel on a phone.**
            From `lg` the panel is in the rail beside this column and this would
            be pointing at something already on screen, so it is withdrawn there
            rather than disabled — hence `lg:hidden` and nothing else.

            Below that the panel is the last thing in the document, under the
            blurb, the facts and the topic card, which is the right place for it
            to *live* (a parent reads before they buy) and a long way to scroll
            for a parent who has already decided. This is the shortcut, and it is
            on every product, tagged or not: what it offers has nothing to do
            with tags.

            Text only — no icon. The label is the whole affordance: it names the
            action the parent is going to take, in the word they will meet on the
            panel's own button, so a downward arrow beside it would be decorating
            a sentence that already says where it goes.

            It renders with the page: no measurement, no post-mount reveal, no
            appearing once something has been scrolled past. Its scroll is the
            direct result of the tap, which is the one thing the layout rules ask
            of a jump like this.

            And only while the panel has an action to offer: on a full, started
            or ended product the panel's whole content is a closed note, and a
            primary "{verb} now!" pointing at that would promise what the page
            cannot deliver — the same rule the browse card enforces by not
            looking openable without being openable. `signupActionable` reads
            the card's own state source, so the two cannot drift. (The state
            re-derives on the clock tick, so a product opening or closing under
            an open tab adds or withdraws the button in place — permitted, and
            it sits at the reading column's end where nothing below it but the
            blurb can shift.) */}
        {signupActionable && (
          <Button
            type="button"
            size="lg"
            // Full width at phone width: it is the only action in the reading
            // column, and a thumb should not have to find it. Natural width from
            // `sm`, where a full-width button starts reading as a banner.
            className="mt-6 w-full sm:w-auto lg:hidden"
            onClick={() => scrollToAnchor(SIGNUP_PANEL_ANCHOR_ID)}
          >
            {t("jumpToSignup", { verb })}
          </Button>
        )}

        {/* Marketing blurb — the expanded pitch under the hero, ahead of the
            logistics. Authored markdown, optional, and absent on most
            products, so the spacing is withdrawn with the card rather than
            left behind as a hole at the foot of the reading column. */}
        {longDescription.trim() !== "" && (
          <div className="mt-8">
            <LongDescription markdown={longDescription} />
          </div>
        )}
      </div>

      {/* The facts. One instance, moved between tracks by breakpoint: in the
          reading column's flow below `2xl`, and in the left rail from `2xl`,
          sticky under the site header like the signup rail.

          `self-start` at both, so the card is only as tall as its facts — as a
          grid item it would otherwise stretch to its row, and at `lg` its row is
          as tall as the signup rail spanning beside it, which would draw the
          card's border a long way past the last thing in it.

          **No reserved scrollbar gutter here**, unlike the signup rail, and the
          difference is the point: that rail reserves one because the panel
          re-renders on a clock and a scrollbar appearing mid-swap would shift
          its controls sideways. Nothing in this card has a clock — four facts
          resolved at render — so a scrollbar cannot arrive on its own schedule,
          and 15px of a 256px rail held open for one that can never appear is
          just dead space. `max-h` + `overflow-y-auto` stay as the safety valve
          for a short viewport, where the scrollbar would be a response to the
          reader's own window rather than a surprise. */}
      <div className="lg:col-start-2 lg:row-start-3 lg:min-w-0 lg:self-start 2xl:col-start-2 2xl:row-start-2 2xl:row-span-2 2xl:sticky 2xl:top-[calc(var(--header-height)+1.5rem)] 2xl:max-h-[calc(100vh-var(--header-height)-3rem)] 2xl:overflow-y-auto">
        <ProductOverviewCard product={product} railFrom2xl />
      </div>

      {/* Reading block 2: what is left below the facts.

          The wrapper is conditional, not just its contents. Several topics name
          subject matter rather than one piece of software and carry no info
          card at all, and below `lg` an empty wrapper is not free: the
          container is `space-y-6`, whose sibling margin lands on the empty
          element just the same, so a wrapper around nothing opened ~24px of
          hole under the facts card. Nothing survives that reveal to be pushed
          around — the card is either here or it never was — so there is nothing
          to reserve space for, and reserving it anyway would be the defect.

          From `lg` it changes nothing, and it is worth being exact about that
          rather than claiming a fix twice: this row exists whether or not the
          card does, because the signup rail spans it (`lg:row-span-3`, and
          `2xl:row-span-2` on the facts card), and an empty grid item is
          zero-height anyway. Any trailing gap up there belongs to those spans,
          not to this wrapper, and is not worth two more conditional class
          strings to chase — the row-count tripwire above stays far easier to
          reason about while these placements are static.

          Both this check and the card's own early return read the same
          predicate, so they cannot disagree. */}
      {topicHasInfoCard(product.topic) && (
        <div className="lg:col-start-2 lg:row-start-4 lg:min-w-0 2xl:col-start-3 2xl:row-start-3">
          <TopicInfoCard topic={product.topic} />
        </div>
      )}

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
          keeps rendering every state at its own natural size.

          It is also the jump button's target. The landing offset is CSS's job,
          not the scroll helper's — `scroll-mt` reads the same
          `--header-height` the header is sized from, which is the site-wide
          rule for hash anchors, with a rem of breathing room so the panel's own
          top edge is not tucked against the header. Harmless from `lg`, where
          the panel is sticky and nothing jumps to it. */}
      <div
        id={SIGNUP_PANEL_ANCHOR_ID}
        className="scroll-mt-[calc(var(--header-height)+1rem)] lg:col-start-3 lg:row-start-2 lg:row-span-3 lg:self-start lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:overflow-y-auto lg:[scrollbar-gutter:stable] 2xl:col-start-4 2xl:row-span-2"
      >
        {signupPanel}
      </div>
    </div>
  );
}

/**
 * The link back to wherever the page was opened from.
 *
 * A shared export rather than a private piece of this file: the header band
 * renders it three times over (one copy per breakpoint range, because the cell
 * it belongs to changes parent between `lg` and `2xl`), and the loading
 * skeleton has no use for it at all — nothing on `/shop/[id]`'s band is
 * route-static, since the label derives from the product row. Keeping it
 * exported is what lets a future surface that *does* know its own back
 * destination reuse the same link rather than restating it.
 */
export function BackLink({
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
