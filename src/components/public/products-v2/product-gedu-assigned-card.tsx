"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Globe, MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { cn } from "@/lib/utils";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { ProductV2BrowseRow } from "@/types";
import { formatProductLocation } from "./format-product-location";
import {
  formatProductSchedule,
  type ProductScheduleSummary,
  type ScheduleTimeGroup,
} from "./format-product-schedule";

// Gedu-facing version of the parent's purchased card — surfaces a product
// the gedu has been assigned to via gedu_group_assignments_v2. Intentionally
// smaller in surface than the parent's purchased card: no gamer chip, no
// balance line, no registration state. Step one of the Gedu product-details
// rollout (docs/products-redesign.md) — the rail entry + a click target into
// the gedu detail body.
//
// Single-file adapter + inline markup. The split-into-View-and-adapter shape
// the parent cards use is justified by the UI-Components style-guide rendering
// every state by hand; the gedu card has only one state today (assigned), so
// splitting it would be premature abstraction.

interface ProductGeduAssignedCardProps {
  product: ProductV2BrowseRow;
}

export function ProductGeduAssignedCard({ product }: ProductGeduAssignedCardProps) {
  const t = useTranslations("productBrowse.card");
  const uiLocale = resolveLocale(useLocale());

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2,
    uiLocale,
  );

  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const scheduleLine = scheduleLineForCard(schedule);
  const location = formatProductLocation(product);
  const locationLine = renderLocationLine(product.is_remote, location, t("online"));
  const isOnline = location?.kind !== "site";

  const name = tr?.name ?? "";
  const imagePath = product.image_path;
  const detailHref = detailHrefFor(product.product_type, product.id);

  return (
    <Card className="relative h-full overflow-visible border-primary/50 bg-primary/5 shadow-sm">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          {imagePath ? (
            <ProductThumbnail
              imagePath={imagePath}
              alt={name}
              size="h-20 w-20 sm:h-24 sm:w-24"
              className="rounded-md bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md bg-primary/10 font-display text-2xl font-bold text-primary sm:h-24 sm:w-24">
              {name.charAt(0)}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="line-clamp-2 text-sm font-semibold sm:text-base">
              {name}
            </h3>

            {topicTr?.name && (
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {topicTr.name}
              </p>
            )}

            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {scheduleLine && <li className="line-clamp-1">{scheduleLine}</li>}
              <li className="line-clamp-1 inline-flex items-center gap-1">
                {isOnline ? (
                  <Globe className="h-3 w-3 shrink-0" aria-hidden />
                ) : (
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                )}
                {locationLine}
                <span className="ml-1 inline-flex items-center">
                  <LanguageFlag code={product.spoken_language_code} />
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className={cn("mt-auto flex items-center justify-end gap-2 border-t border-primary/20 pt-3")}>
          <Link href={detailHref} className={buttonVariants({ size: "sm" })}>
            {t("manage")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function detailHrefFor(
  productType: ProductV2BrowseRow["product_type"],
  productId: string,
): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return `/clubs/${productId}`;
    case "camp":
      return `/camps/${productId}`;
    case "event":
      return `/events/${productId}`;
  }
}

function renderLocationLine(
  isRemote: boolean,
  location: ReturnType<typeof formatProductLocation>,
  onlineLabel: string,
): string {
  if (!location) return isRemote ? onlineLabel : "—";
  switch (location.kind) {
    case "site":
      return location.site;
    case "muni":
      return location.name;
  }
}

// Single-line schedule summary tuned for the card. Mirrors the rules in
// product-browse-card.tsx's scheduleLinesForCard but collapsed to one line:
// the gedu card never needs the multi-line camp layout — clicking through
// to the detail page surfaces the full calendar.
function scheduleLineForCard(schedule: ProductScheduleSummary): string | null {
  switch (schedule.kind) {
    case "tbd":
      return null;
    case "recurring":
      return joinGroups(schedule.groups);
    case "ranged": {
      const dateLine = `${schedule.startDate} – ${schedule.endDate}`;
      if (schedule.groups.length === 0) return dateLine;
      const timeLine =
        schedule.groups.length === 1
          ? `${schedule.groups[0].startTime}–${schedule.groups[0].endTime}`
          : joinGroups(schedule.groups);
      return `${dateLine} · ${timeLine}`;
    }
    case "single": {
      const time = schedule.time
        ? ` · ${schedule.time.start}–${schedule.time.end}`
        : "";
      return `${schedule.date}${time}`;
    }
  }
}

function joinGroups(groups: readonly ScheduleTimeGroup[]): string {
  return groups
    .map((g) => `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`)
    .join(", ");
}
