"use client";

import { useLocale, useTranslations } from "next-intl";
import { Clock, Globe, Languages, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import type { ProductBrowseRow } from "@/types";
import { formatProductLocation } from "./format-product-location";
import {
  formatProductSchedule,
  renderScheduleLinesForDetail,
} from "./format-product-schedule";

// Shared "Good to know" overview card. Renders schedule (day/time),
// location/format, age range, and spoken language — the at-a-glance facts.
// Used by the shop detail body, the purchase-confirmation view, and the
// admin product details page, so the layout lives here as the single
// source of truth.

interface ProductOverviewCardProps {
  // Structural subset of the fields this card actually reads, so both the
  // parent browse row and the admin detail row satisfy it. Neither named
  // type is assignable to the other (admin selects a narrower
  // product_prices), but both carry these logistics columns/joins.
  product: Pick<
    ProductBrowseRow,
    | "product_type"
    | "start_date"
    | "end_date"
    | "timezone"
    | "schedule_slots"
    | "is_remote"
    | "locations"
    | "min_age"
    | "max_age"
    | "spoken_language_code"
  >;
}

export function ProductOverviewCard({ product }: ProductOverviewCardProps) {
  const t = useTranslations("productDetail");
  const uiLocale = resolveLocale(useLocale());

  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const scheduleLines = renderScheduleLinesForDetail(schedule);
  const location = formatProductLocation(product);

  return (
    <Card>
      <CardContent className="space-y-3 p-5 sm:p-6 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sections.overview")}
        </h2>
        {/* Two-up on wider widths — Schedule | Format, then Age | Language —
            and a single stacked column on mobile, where there isn't room. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <DetailRow icon={Clock} label={t("info.schedule")}>
            {scheduleLines.length === 1 ? (
              scheduleLines[0]
            ) : (
              <ul className="space-y-0.5">
                {scheduleLines.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </DetailRow>
          <DetailRow
            icon={product.is_remote && location?.kind !== "muni" ? Globe : MapPin}
            label={
              product.is_remote && location?.kind !== "muni"
                ? t("info.format")
                : t("info.where")
            }
          >
            {renderLocationLine({
              location,
              isRemote: product.is_remote,
              tOnline: t("info.online"),
              tTbd: t("info.tbd"),
            })}
          </DetailRow>
          <DetailRow icon={Users} label={t("info.ageRange")}>
            {t("info.ages", { min: product.min_age, max: product.max_age })}
          </DetailRow>
          <DetailRow icon={Languages} label={t("info.language")}>
            <LanguageFlag code={product.spoken_language_code} />
          </DetailRow>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

function renderLocationLine({
  location,
  isRemote,
  tOnline,
  tTbd,
}: {
  location: ReturnType<typeof formatProductLocation>;
  isRemote: boolean;
  tOnline: string;
  tTbd: string;
}): string {
  if (!location) return isRemote ? tOnline : tTbd;
  switch (location.kind) {
    case "site":
      return location.parent
        ? `${location.site}, ${location.parent}`
        : location.site;
    case "muni":
      return location.name;
  }
}
