"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, Hourglass, MapPin, Globe } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import type { ProductPriceLine } from "./format-product-price";
import { RegistrationPill, useRegistrationCta } from "./registration-pill";
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
  /** Pre-formatted "{count} seats" / "Waitlist available" / null. */
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
  state: RegistrationState;
  /** Detail-page URL. The card's CTA + the whole card surface link here. */
  detailHref?: string;
}

export type LocationLine = {
  kind: "in_person" | "online" | "online_muni";
  label: string;
};

export type SeatsHint =
  | { kind: "capacity"; count: number }
  | { kind: "waitlist" };

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
  state,
  detailHref,
}: ProductBrowseCardViewProps) {
  const t = useTranslations("productBrowse.card");
  const cta = useRegistrationCta(state);
  const isEnded = state.kind === "ended";

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden transition-colors",
        isEnded && "opacity-70 grayscale-[40%]",
        detailHref && !isEnded && "hover:border-primary/40",
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

            {/* Topic label + registration pill share the row directly under
                the title (option B per the spec). The pill keeps a
                consistent right-edge anchor regardless of topic length. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {topicLabel && (
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  {topicLabel}
                </p>
              )}
              <RegistrationPill state={state} />
            </div>

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
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <div className="mt-auto border-t pt-3">
          {isEnded ? (
            <p className="text-xs italic text-muted-foreground">
              {t("endedNote")}
            </p>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <PriceBlock price={price} />
              {cta &&
                (cta.kind === "primary" && detailHref ? (
                  <Link
                    href={detailHref}
                    className={buttonVariants({ size: "sm" })}
                  >
                    {cta.labelText}
                  </Link>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={cta.kind === "disabled" ? "outline" : "default"}
                    disabled={cta.kind === "disabled"}
                  >
                    {cta.labelText}
                  </Button>
                ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SeatsHintLine({ hint }: { hint: SeatsHint | null }) {
  const t = useTranslations("productBrowse.card");
  if (!hint) return null;
  if (hint.kind === "capacity") {
    return (
      <span className="inline-flex items-center gap-1">
        <Users className="h-3 w-3" aria-hidden />
        {t("seatsCapacity", { count: hint.count })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Hourglass className="h-3 w-3" aria-hidden />
      {t("waitlistAvailable")}
    </span>
  );
}

function PriceBlock({ price }: { price: ProductPriceLine }) {
  const t = useTranslations("productBrowse.card");

  switch (price.kind) {
    case "free":
      return (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {t("free")}
        </span>
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
