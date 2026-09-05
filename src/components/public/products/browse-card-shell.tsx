"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { NavChevron } from "@/components/ui/nav-chevron";
import { cn } from "@/lib/utils";
import type { SpokenLanguageCode } from "@/types";
import type { ProductPriceLine } from "./format-product-price";
import type { ProductCardTag } from "./product-chips";
import { useRegistrationCta, type RegistrationCta } from "./registration-cta";
import { SeatAvailabilityBar } from "./seat-availability-bar";
import { StatusChip } from "./status-chip";
import type { RegistrationState } from "./derive-registration-state";

// ---------- What a browse card *is* ----------
//
// This module holds the parts that are not about how a card arranges its facts:
// the props every body takes, whether the card opens, the footer that says so,
// and the link that makes it true. They live apart from the body deliberately —
// they outlive any one arrangement of it, and the two rules here that are not
// merely stylistic hold structurally rather than being asserted in a comment in
// each copy: **a card may not look openable without being openable**, and **a
// control's visible label must appear in its accessible name**.
//
// A future card variant composes these; it does not restate them.

export interface ProductBrowseCardViewProps {
  name: string;
  description: string | null;
  /**
   * An already-resolved image URL, not a storage path: the adapter decides
   * where the picture comes from and the body only paints it. `null` renders
   * the wordmark banner at the same ratio, so an imaged card and an un-imaged
   * one are the same height on the grid.
   */
  imageSrc: string | null;
  /**
   * The product's tag, resolved for display, or `null` on an untagged product
   * — which is most of them, and stays the unremarkable case (no chip, no
   * hole where one would be).
   */
  tag: ProductCardTag | null;
  topicLabel: string | null;
  /**
   * Pre-formatted lines describing when the product runs. Typically 1
   * (clubs/events) or 2 (camps). Already split by the shared schedule
   * formatter the adapter calls — the splitting rule lives with the
   * formatter, beside the separator it splits on, not here.
   */
  scheduleLines: readonly string[];
  /**
   * Null on a product with no age range — an adults-only product has none.
   * Rendered only when `audienceLabel` is null: a badged card shows the badge
   * instead (see the corner-exclusivity note on the media chips), so a family
   * product's range appears on its detail page, not its card.
   */
  ageLine: string | null;
  /**
   * Audience badge, or `null` on the ordinary gamers-only product.
   *
   * Deliberately withheld from gamers-only cards: that is what every card on
   * the grid was before audiences existed, so badging it would put a label on
   * the whole catalog to mark the absence of news. The badge appears exactly
   * where the meaning is new — a product a parent can attend themselves — and
   * on any badged card it is also the only audience-and-ages fact shown: the
   * age line yields to it (an adult range like "18+" was rejected as saying
   * something else entirely, and a family card carrying badge + range + flag
   * wraps ugly at card width).
   */
  audienceLabel: string | null;
  /**
   * Single-line location/format label. Always present on browse cards so
   * every card carries the same meta row — the icon swaps between MapPin
   * (in-person) and Globe (online / online-muni) and the label says where
   * the session happens.
   */
  locationLine: LocationLine;
  /**
   * The `spoken_language` the product is delivered in. Rendered as flag +
   * uppercase code so parents can see delivery language at a glance — same flag
   * treatment as the locale picker in the site header.
   */
  spokenLanguageCode: SpokenLanguageCode;
  footerLeft: BrowseCardFooterLeft;
  state: RegistrationState;
  /**
   * Detail-page URL. Required, and deliberately so: whether the card opens is
   * this component's decision, taken from `state`, not the caller's. On a
   * dead-end state the card is inert and this goes unused — so passing it is
   * never a promise that the card will open, and withholding it was never a way
   * to stop one. Making it optional only created a fourth combination (an
   * openable state with no href) that would render as inert with the wrong
   * word; required, that combination cannot be expressed.
   */
  detailHref: string;
}

export type SeatBarValue = {
  filled: number;
  total: number | null;
  waitlistEnabled: boolean;
};

/**
 * The footer's left-hand slot — one value, not two props that have to agree.
 *
 * A municipality club is funded off-platform and says how full it is; every
 * other product says what it costs. Those are alternatives, and they used to be
 * modelled as a required `price` plus an optional `seatBar` whose *presence*
 * was documented as "the muni signal" — a comment doing a type's job, and one
 * that left a price line sitting unread behind every muni card. As a union the
 * slot holds exactly one of the two, and `ProductPriceLine` no longer carries
 * an external shape at all: a product whose cost we do not state cannot be
 * handed to the price block, because there is no line to hand it.
 *
 * The seat bar is the *only* seat information any browse card carries, and it
 * is deliberately confined to municipality clubs: schools are the known-scarce
 * case where a family needs to see the fill before opening anything. Every
 * other card says nothing about capacity — a card once printed a product's seat
 * *count* beside the age line, which read as availability and was exactly wrong
 * on a full product. Fullness is discovered on the details page, whose full
 * panels (waitlist CTA / closed notice) already say it properly. Two
 * consequences are accepted: a full product with a waitlist looks like an open
 * one until it is clicked, and a full one without a waitlist renders as an
 * inert card whose CTA label is the only explanation.
 *
 * A `seats` slot whose `total` is null — a muni club with no cap set — renders
 * nothing, leaving the footer-left empty. That is a real state, unlike the
 * price line it replaced.
 */
export type BrowseCardFooterLeft =
  | { kind: "seats"; seats: SeatBarValue }
  | { kind: "price"; price: ProductPriceLine };

export type LocationLine = {
  kind: "in_person" | "online" | "online_muni";
  label: string;
};

export interface BrowseCardShell {
  /** Null when the card shows no CTA at all (an ended run). */
  cta: RegistrationCta | null;
  /** Where the card opens, or undefined when it opens nowhere. */
  openHref: string | undefined;
  isEnded: boolean;
  /** The `<Card>`'s complete class string, openable feedback included. */
  cardClassName: string;
}

/**
 * Whether this card opens, and everything that follows from the answer.
 *
 * `registrationCtaKind` decides it: only a "primary" state has somewhere worth
 * going, while full-no-waitlist, a camp underway and an ended run are
 * deliberate dead ends ("the detail page has nothing actionable, so the parent
 * isn't sent on a round-trip").
 *
 * Every clickable affordance reads the one `openHref` this returns — the
 * chevron, the hover/focus/active feedback, the label's colour and the
 * stretched link — so a card cannot look openable without being openable. The
 * shape this replaced gated the hover on `detailHref` alone, which the adapter
 * always supplies, so a full-no-waitlist card brightened its border under the
 * cursor and then swallowed the click. `detailHref` being required is what
 * closes the other direction: with no way to withhold it, there is no openable
 * state that can arrive here without somewhere to go.
 */
export function useBrowseCardShell(
  state: RegistrationState,
  detailHref: string,
): BrowseCardShell {
  const cta = useRegistrationCta(state);
  const isEnded = state.kind === "ended";
  const openHref = cta?.kind === "primary" ? detailHref : undefined;

  return {
    cta,
    openHref,
    isEnded,
    cardClassName: cn(
      // `group` is what the chevron's nudge reads; `relative` is what the
      // stretched link is positioned against.
      "group relative flex h-full flex-col overflow-hidden transition-[box-shadow]",
      isEnded && "opacity-70 grayscale-[40%]",
      openHref && [
        "cursor-pointer",
        "hover:shadow-lg",
        // `focus-within` so keyboard focus on the stretched link lights the
        // whole card, not just the invisible anchor.
        "focus-within:shadow-lg",
      ],
    ),
  };
}

/**
 * The card's bottom rule and the row under it: what the product costs or how
 * full it is on the left, whether you can open it on the right.
 *
 * Nothing above the rule is this component's business, which is what lets the
 * body above it be rearranged wholesale — as it has been once already — without
 * this changing at all.
 */
export function BrowseCardFooter({
  shell,
  footerLeft,
}: {
  shell: BrowseCardShell;
  footerLeft: BrowseCardFooterLeft;
}) {
  const t = useTranslations("productBrowse.card");
  const { cta, openHref, isEnded } = shell;

  return (
    <div className="mt-auto border-t border-border pt-3">
      {isEnded ? (
        <p className="text-xs italic text-muted-foreground">{t("endedNote")}</p>
      ) : (
        /* Two pieces, and neither takes its position from the other. The
           left states what the product costs or how full it is; the right
           states whether you can open it. Both are anchored to the card —
           centred in this row, at their own end of it — so the layout does
           not change shape when the left slot swaps a price for a two-row
           seat bar, or holds nothing at all.

           Aligning them to *each other* was the mistake this replaces.
           Baselines are exact when both sides are type, but they stop being
           available the moment one side is a block, which forces the rule to
           branch on what the data happens to be — and worse, it anchors the
           CTA to the price, so the two read as one phrase that has drifted
           apart. They are not one phrase. */
        <div className="flex items-center justify-between gap-6">
          {/* Seats or a price — the slot's own type says it is exactly one of
              them, so there is no third combination for this branch to get
              wrong. A `seats` slot with no cap set renders nothing, leaving the
              footer-left empty. */}
          {footerLeft.kind === "seats" ? (
            <SeatAvailabilityBar
              className="flex-1"
              seatCount={footerLeft.seats.total}
              seatsLeft={
                footerLeft.seats.total === null
                  ? 0
                  : Math.max(0, footerLeft.seats.total - footerLeft.seats.filled)
              }
              waitlistEnabled={footerLeft.seats.waitlistEnabled}
            />
          ) : (
            <PriceBlock price={footerLeft.price} />
          )}
          {/* An openable card answers with a worded hint and a chevron; a
              dead end answers in the same place, at the same size, muted and
              without one. The chevron's presence is the whole distinction.

              `ml-auto` because the left-hand side is not guaranteed to be
              there: an uncapped municipality club renders no seat bar at all,
              leaving this the row's only child, and `justify-between` parks a
              lone child at the start. */}
          {cta &&
            (openHref ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm font-medium text-act">
                {cta.labelText}
                <NavChevron size="sm" className="text-act" />
              </span>
            ) : (
              /* A dead end states a fact rather than offering an action, so
                 it is not shaped like one. The label has to stay, though: the
                 seat bar deliberately prints no "Full" chip of its own, on
                 the grounds that the label beside it already says so. */
              <span className="ml-auto shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                {cta.labelText}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The whole card as one link — an empty anchor stretched over it, exactly as
 * the gedu assignment and family enrollment cards do it. Nothing on a browse
 * card owns a click of its own, so nothing is lifted above this with a `z-10`
 * and there is no anchor nested inside another. The focus ring is inset because
 * the card clips its own overflow and would otherwise shave it off.
 *
 * The accessible name leads with the footer's visible word. Those two cards
 * name themselves with the title alone and are right to, because neither
 * presents a word as the target's label; this one does, and a control whose
 * visible label is absent from its accessible name is unreachable by voice —
 * "click View" matches nothing (WCAG 2.5.3, Label in Name). The product name
 * still carries the meaning, so it follows rather than being replaced. The
 * joining goes through a message rather than string concatenation: the
 * separator and the word order are as translatable as the words either side of
 * them.
 *
 * It takes the whole shell rather than an href and a label, so the link and the
 * word it names itself with are the same decision the footer already made — two
 * loose props could be handed values that disagree.
 */
export function StretchedCardLink({
  shell,
  name,
}: {
  shell: BrowseCardShell;
  name: string;
}) {
  const t = useTranslations("productBrowse.card");
  const { cta, openHref } = shell;
  if (openHref === undefined || cta === null) return null;

  return (
    <Link
      href={openHref}
      aria-label={t("cardLink", { action: cta.labelText, name })}
      className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act"
    />
  );
}

/**
 * The footer's left-hand slot on a priced product.
 *
 * Private to this module: the four branches are the footer's business and
 * nothing outside it has a reason to reach for one, so a second copy could
 * only ever drift from this one. There were five until the externally-funded
 * one was removed — no card could reach it, because a municipality club takes
 * the seat-bar half of the slot instead, and it now cannot be expressed.
 */
function PriceBlock({ price }: { price: ProductPriceLine }) {
  const t = useTranslations("productBrowse.card");

  switch (price.kind) {
    case "free":
      // Outline chip (no icon) to match the Full/Waitlist seat-bar chips,
      // sized up to sit on the price row.
      return (
        <StatusChip tone="primary" size="md">
          {t("free")}
        </StatusChip>
      );
    case "subscription":
      // Consumer clubs bill as a flat monthly subscription.
      return (
        <span className="text-base font-semibold text-foreground">
          {t("perMonth", { price: price.perMonth })}
        </span>
      );
    case "upfront":
      return (
        <span className="text-base font-semibold text-foreground">
          {t("upfrontTotal", { price: price.total })}
        </span>
      );
    case "unavailable":
      return (
        <span className="text-xs text-muted-foreground">
          {t("notAvailableInCurrency", { currency: price.currency })}
        </span>
      );
  }
}
