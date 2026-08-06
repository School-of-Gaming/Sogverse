"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, MapPin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /** Pre-formatted "{count} seats", or null when there's no capacity to show. */
  seatsHint: SeatsHint | null;
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
   */
  seatBar?: SeatBarValue;
  state: RegistrationState;
  /**
   * Detail-page URL. The whole card surface links here — but only when `state`
   * is one the detail page can do something with; on a dead-end state the card
   * is inert and this is ignored, so passing it is never a promise that the
   * card will open.
   */
  detailHref?: string;
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

export type SeatsHint = { kind: "capacity"; count: number };

export function ProductBrowseCardView({
  name,
  description,
  imagePath,
  topicLabel,
  scheduleLines,
  ageLine,
  seatsHint,
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
  // the parent isn't sent on a round-trip"). One value drives all four of the
  // card's clickable affordances — the chevron, the hover/active feedback, the
  // button's fill and the stretched link — so a card can never *look* openable
  // without being openable. Today's card gets that wrong in exactly one place:
  // a full-no-waitlist card still brightens its border on hover and then
  // swallows the click.
  const openHref =
    !isEnded && cta?.kind === "primary" ? detailHref : undefined;

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
                <SeatsHintLine hint={seatsHint} />
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
            /* `min-h-9` is the disabled Button's own height, held by the row
               whatever lands in it. The openable cards now answer with a line
               of text, and nothing makes a line of text as tall as a button —
               so without this a card that opens would stand shorter than the
               "Full" card beside it. Inside a stretched grid row that is
               invisible (the row equalises and the difference lands as
               padding), which is exactly how it goes unnoticed; it shows up on
               the card left alone on the last row, where there is nothing to
               stretch against. Same reservation, and for the same reason, as
               the gedu assignment card's footer. */
            <div className="flex min-h-9 items-end justify-between gap-6">
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
              {/* An openable card answers with a worded hint and a chevron,
                  not a button. A filled button is the loudest thing on the card
                  and it says "click *me*" — which is precisely the claim being
                  withdrawn now that the whole surface is the target. "View ›"
                  makes the softer, truer claim: there is more this way, and
                  here is roughly where to aim. It is deliberately not an
                  anchor — the stretched link over the card is the only one, so
                  a grid of twenty cards is twenty tab stops rather than forty
                  with every destination announced twice.

                  A dead end keeps its real Button, because there the slot is
                  not an action at all — it is the only place the card says
                  "Full" or "Already started". A muni club has the seat bar to
                  say that; a camp or an event has nothing else. */}
              {cta &&
                (openHref ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
                    {cta.labelText}
                    <NavChevron size="sm" className="text-primary" />
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={cta.kind === "disabled" ? "outline" : "default"}
                    disabled={cta.kind === "disabled"}
                    className="whitespace-nowrap"
                  >
                    {cta.labelText}
                  </Button>
                ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* The whole card as one link — an empty anchor stretched over it, named
          by the product it opens, exactly as the gedu assignment and family
          enrollment cards do it. Nothing on this card owns a click of its own,
          so nothing is lifted above it with a `z-10` and there is no anchor
          nested inside another. The focus ring is inset because the card clips
          its own overflow and would otherwise shave it off. */}
      {openHref && (
        <Link
          href={openHref}
          aria-label={name}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      )}
    </Card>
  );
}

function SeatsHintLine({ hint }: { hint: SeatsHint | null }) {
  const t = useTranslations("productBrowse.card");
  if (!hint) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Users className="h-3 w-3" aria-hidden />
      {t("seatsCapacity", { count: hint.count })}
    </span>
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
