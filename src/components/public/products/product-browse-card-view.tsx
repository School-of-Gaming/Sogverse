"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import type { ProductPriceLine } from "./format-product-price";
import { useRegistrationCta } from "./registration-cta";
import { SeatAvailabilityBar } from "./seat-availability-bar";
import { StatusChip } from "./status-chip";
import type { RegistrationState } from "./derive-registration-state";

// Pure presentational browse card. Takes already-resolved display props —
// the adapter (`product-browse-card.tsx`) does the locale / currency /
// schedule / price / registration-state resolution before calling this.
//
// Splitting along this boundary lets the UI Components page render any
// combination of states + variants by hand, without faking a
// ProductBrowseRow that satisfies the type checker.

export interface ProductBrowseCardViewProps {
  name: string;
  description: string | null;
  imagePath: string | null;
  topicLabel: string | null;
  /**
   * Pre-formatted lines describing when the product runs. Typically 1
   * (clubs/events) or 2 (camps). The adapter — `scheduleLinesForCard`
   * in `product-browse-card.tsx` — owns the splitting rule.
   */
  scheduleLines: readonly string[];
  ageLine: string;
  /**
   * Single-line location/format label. Always present on browse cards so
   * every card carries the same meta row — the icon swaps between MapPin
   * (in-person) and Globe (online / online-muni) and the label says where
   * the session happens.
   */
  locationLine: LocationLine;
  /**
   * Spoken-language code (`fi` / `en` / `sv`) the product is delivered in.
   * Rendered as flag + uppercase code on the topic row so parents can see
   * delivery language at a glance — same flag treatment as the locale
   * picker in the site header.
   */
  spokenLanguageCode: string;
  price: ProductPriceLine;
  /**
   * Municipality clubs are externally funded, so their footer shows a
   * seat-fill bar instead of a price. Provide this (even with `total: null`)
   * for a muni club to replace the price block; a `null` total — a muni club
   * whose seat count isn't set yet — leaves the footer-left empty. Omit
   * entirely for priced products (the shop), which keep the price block.
   *
   * This bar is the *only* seat information any browse card carries, and it is
   * deliberately confined to municipality clubs: schools are the known-scarce
   * case where a family needs to see the fill before opening anything. Every
   * other card says nothing about capacity — a card once printed a product's
   * seat *count* beside the age line, which read as availability and was
   * exactly wrong on a full product. Fullness is discovered on the details
   * page, whose full panels (waitlist CTA / closed notice) already say it
   * properly. Two consequences are accepted: a full product with a waitlist
   * looks like an open one until it is clicked, and a full one without a
   * waitlist renders as an inert card whose CTA label is the only explanation.
   */
  seatBar?: SeatBarValue;
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

export type LocationLine = {
  kind: "in_person" | "online" | "online_muni";
  label: string;
};

export function ProductBrowseCardView({
  name,
  description,
  imagePath,
  topicLabel,
  scheduleLines,
  ageLine,
  locationLine,
  spokenLanguageCode,
  price,
  seatBar,
  state,
  detailHref,
}: ProductBrowseCardViewProps) {
  const t = useTranslations("productBrowse.card");
  const cta = useRegistrationCta(state);
  const isEnded = state.kind === "ended";

  // Where this card opens, or `undefined` when it opens nowhere.
  // `registrationCtaKind` already decides that: only a "primary" state has
  // somewhere worth going, while full-no-waitlist, a camp underway and an ended
  // run are deliberate dead ends ("the detail page has nothing actionable, so
  // the parent isn't sent on a round-trip").
  //
  // Every clickable affordance reads this one value — the chevron, the
  // hover/focus/active feedback, the label's colour and the stretched link — so
  // a card cannot look openable without being openable. The shape this replaced
  // gated the hover on `detailHref` alone, which the adapter always supplies, so
  // a full-no-waitlist card brightened its border under the cursor and then
  // swallowed the click. `detailHref` being required is what closes the other
  // direction: with no way to withhold it, there is no openable state that can
  // arrive here without somewhere to go.
  const openHref = cta?.kind === "primary" ? detailHref : undefined;

  return (
    <Card
      className={cn(
        // `group` is what the chevron's nudge reads; `relative` is what the
        // stretched link is positioned against.
        "group relative flex h-full flex-col overflow-hidden transition-[border-color,box-shadow]",
        isEnded && "opacity-70 grayscale-[40%]",
        openHref && [
          "cursor-pointer",
          "hover:border-primary/40 hover:shadow-lg",
          // `focus-within` so keyboard focus on the stretched link lights the
          // whole card, not just the invisible anchor. `active` is the touch
          // half of the same signal: a phone has no hover, so without it a tap
          // gets no acknowledgement until the next page paints.
          "focus-within:border-primary/40 focus-within:shadow-lg",
          "active:border-primary/40",
        ],
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          <ProductThumbnail
            imagePath={imagePath ?? ""}
            alt={name}
            size="h-20 w-20 sm:h-24 sm:w-24"
            className={cn(
              "rounded-md bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
              !imagePath && "[&>img]:hidden",
            )}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start gap-2">
              <h3 className="line-clamp-2 flex-1 text-sm font-semibold sm:text-base">
                {name}
              </h3>
            </div>

            {/* Topic label sits directly under the title. Registration
                state is surfaced by the seat-availability bar and footer
                rather than an inline pill. */}
            {topicLabel && (
              <p className="text-xs font-medium tracking-wide text-primary">
                {topicLabel}
              </p>
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
              <li className="flex flex-wrap items-center gap-x-2">
                <span>{ageLine}</span>
                {/* Delivery language sits here — short row, never
                    squeezed. Same flag treatment as the locale picker
                    in the site header so parents recognise it. */}
                <LanguageFlag code={spokenLanguageCode} />
              </li>
            </ul>
          </div>
        </div>

        {description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <div className="mt-auto border-t pt-3">
          {isEnded ? (
            <p className="text-xs italic text-muted-foreground">
              {t("endedNote")}
            </p>
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
              {/* Muni clubs swap the price for a seat-availability bar;
                  everything else keeps the price. `seatBar` present (even with a
                  null total) is the muni signal — a null total renders nothing,
                  leaving the footer-left empty. */}
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
              {/* An openable card answers with a worded hint and a chevron; a
                  dead end answers in the same place, at the same size, muted and
                  without one. The chevron's presence is the whole distinction.

                  `ml-auto` because the left-hand side is not guaranteed to be
                  there: an uncapped municipality club renders no seat bar at all,
                  leaving this the row's only child, and `justify-between` parks a
                  lone child at the start. */}
              {cta &&
                (openHref ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm font-medium text-primary">
                    {cta.labelText}
                    <NavChevron size="sm" className="text-primary" />
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
      </CardContent>

      {/* The whole card as one link — an empty anchor stretched over it, exactly
          as the gedu assignment and family enrollment cards do it. Nothing on
          this card owns a click of its own, so nothing is lifted above it with a
          `z-10` and there is no anchor nested inside another. The focus ring is
          inset because the card clips its own overflow and would otherwise shave
          it off.

          The accessible name leads with the footer's visible word. Those two
          cards name themselves with the title alone and are right to, because
          neither presents a word as the target's label; this one does, and a
          control whose visible label is absent from its accessible name is
          unreachable by voice — "click View" matches nothing (WCAG 2.5.3, Label
          in Name). The product name still carries the meaning, so it follows
          rather than being replaced. The joining goes through a message rather
          than string concatenation: the separator and the word order are as
          translatable as the words either side of them. */}
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
    case "external":
      return (
        <span className="text-xs text-muted-foreground">
          {t("externalContract")}
        </span>
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
