"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import { Clock, Globe, Languages, MapPin, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import type { ProductBrowseRow } from "@/types";
import { formatProductLocation } from "./format-product-location";
import { audienceLabelKey } from "./product-audience";
import { formatClubTermDates } from "./format-product-term-dates";
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
    | "for_gamers"
    | "for_parents"
    | "spoken_language_code"
  >;
}

export function ProductOverviewCard({ product }: ProductOverviewCardProps) {
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const schedule = formatProductSchedule({ product, locale: uiLocale, timeZone, now });
  const scheduleLines = renderScheduleLinesForDetail(schedule);
  const location = formatProductLocation(product, uiLocale);

  // A club's term range ("13 Jan – 30 May 2026") isn't in its weekly schedule
  // line — camps/events already fold their dates into the schedule, so the
  // helper returns null for them. Fold the club range in as an extra schedule
  // line (rather than a 5th overview Fact) to keep the 2×2 grid intact.
  // Same restraint the browse card shows: a gamers-only product states its
  // audience through the age range beside it, so an extra "For gamers" fact
  // would be a row every existing product page grew for no news. The row
  // appears exactly where the meaning is new — and on a parents-only page it is
  // the fact that replaces the age range rather than sitting beside it, which
  // is why it renders whether or not there is an age row above. The
  // badge-or-nothing decision itself lives in product-audience.ts.
  const audienceLabelMessageKey = audienceLabelKey(product);
  const audienceLabel =
    audienceLabelMessageKey === null ? null : tAudience(audienceLabelMessageKey);

  const termRange = formatClubTermDates(product, uiLocale);
  const scheduleDisplayLines = termRange
    ? [...scheduleLines, termRange]
    : scheduleLines;

  return (
    <Card>
      <CardContent className="space-y-3 p-5 sm:p-6 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sections.overview")}
        </h2>
        {/* Two-up on wider widths and a single stacked column on mobile, where
            there isn't room. The common shape is Schedule | Format, then
            Age | Language; an Audience fact joins the flow when it is news
            (mixed products carry five facts and leave the last cell empty,
            parents-only products swap Audience in where Age would have been). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <DetailRow icon={Clock} label={t("info.schedule")}>
            {scheduleDisplayLines.length === 1 ? (
              scheduleDisplayLines[0]
            ) : (
              <ul className="space-y-0.5">
                {scheduleDisplayLines.map((line, idx) => (
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
          {/* No range, no row: a product with no gamer audience has no age to
              state, and an adult range ("18+") would say something else
              entirely. Nothing survives this change to be pushed around — the
              grid simply has three facts instead of four. */}
          {product.min_age !== null && product.max_age !== null && (
            <DetailRow icon={Users} label={t("info.ageRange")}>
              {t("info.ages", { min: product.min_age, max: product.max_age })}
            </DetailRow>
          )}
          {audienceLabel !== null && (
            <DetailRow icon={UserRound} label={t("info.audience")}>
              {audienceLabel}
            </DetailRow>
          )}
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
