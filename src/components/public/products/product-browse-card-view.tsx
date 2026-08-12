"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Globe, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import type { ProductPriceLine } from "./format-product-price";
import { useRegistrationCta, type RegistrationCta } from "./registration-cta";
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
  /**
   * Null on a product with no age range — an adults-only product has none.
   * Rendered only when `audienceLabel` is null: a badged card shows the badge
   * instead (see the meta-row comment), so a family product's range appears on
   * its detail page, not its card.
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
  audienceLabel,
  locationLine,
  spokenLanguageCode,
  price,
  seatBar,
  state,
  detailHref,
}: ProductBrowseCardViewProps) {
  const shell = useBrowseCardShell(state, detailHref);

  return (
    <Card className={shell.cardClassName}>
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
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* The audience badge leads this row when there is one: it is
                    the coarser fact than an age range, and on a parents-only
                    card it stands where the age line would otherwise be. A
                    chip rather than another line of muted text, because it is
                    the one thing here a parent might be scanning the grid
                    *for*; it reuses the card's existing chip vocabulary (the
                    "Free" price badge) rather than inventing a second one.
                    A badged card shows the badge INSTEAD of the age line —
                    owner ruling: badge + range + flag overflows this row at
                    card width and wraps ugly, and the coarser fact wins on a
                    card. The range is not lost, it lives in the detail page's
                    who-it's-for cell. Enforced here rather than in each
                    adapter so the shop and the style guide cannot disagree. */}
                {audienceLabel !== null && (
                  <StatusChip tone="info" icon={UserRound}>
                    {audienceLabel}
                  </StatusChip>
                )}
                {audienceLabel === null && ageLine !== null && (
                  <span>{ageLine}</span>
                )}
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

        <BrowseCardFooter shell={shell} seatBar={seatBar} price={price} />
      </CardContent>

      <StretchedCardLink shell={shell} name={name} />
    </Card>
  );
}

// ---------- Shared card machinery ----------
//
// The three pieces below are what a browse card *is*, as opposed to how it
// arranges its facts: whether it opens, the footer that says so, and the link
// that makes it true. They are shared with the draft media-top body
// (`product-browse-card-view-draft.tsx`) rather than copied into it, so the two
// bodies cannot answer differently about the same product while the redesign is
// being compared against the live grid — and so the two rules that are not
// merely stylistic (a card may not look openable without being openable; a
// control's visible label must appear in its accessible name) hold structurally
// instead of being asserted in a comment in each copy.
//
// They live in this file because this is where they were, and because the live
// body is their only other reader today. At promotion the draft body replaces
// the one above it — that is the moment to give these three their own module,
// since they will outlive the body they are currently filed under.

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
    ),
  };
}

/**
 * The card's bottom rule and the row under it: what the product costs or how
 * full it is on the left, whether you can open it on the right.
 *
 * Shared verbatim by both bodies. Nothing above the rule is this component's
 * business, which is exactly why the redesign could change everything above it
 * without touching this.
 */
export function BrowseCardFooter({
  shell,
  seatBar,
  price,
}: {
  shell: BrowseCardShell;
  seatBar: SeatBarValue | undefined;
  price: ProductPriceLine;
}) {
  const t = useTranslations("productBrowse.card");
  const { cta, openHref, isEnded } = shell;

  return (
    <div className="mt-auto border-t pt-3">
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
      className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    />
  );
}

/**
 * The footer's left-hand slot on a priced product.
 *
 * Exported for the draft browse card, which keeps this footer verbatim: the
 * media-top redesign changes what is *above* the rule and nothing below it, so
 * a second copy of these five branches could only ever drift from this one.
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
