"use client";

import { useLocale, useTranslations } from "next-intl";
import { Clock, Globe, MapPin, Sparkles, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import type { ProductBrowseRow } from "@/types";
import { formatProductLocation } from "./format-product-location";
import {
  formatProductSchedule,
  type ProductScheduleSummary,
} from "./format-product-schedule";

// Shared "When & where" card. Renders schedule (day/time), location/format,
// age range, and spoken language. Used by both the parent-facing detail
// body and the gedu detail body — same product row, identical layout, so
// the panel lives here as the single source of truth.

interface ProductWhenWhereCardProps {
  product: ProductBrowseRow;
}

export function ProductWhenWhereCard({ product }: ProductWhenWhereCardProps) {
  const t = useTranslations("productDetail");
  const uiLocale = resolveLocale(useLocale());

  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const scheduleLines = renderScheduleLinesForDetail(schedule);
  const location = formatProductLocation(product);

  return (
    <Card>
      <CardContent className="space-y-3 p-5 sm:p-6 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sections.whenWhere")}
        </h2>
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
        <DetailRow icon={Sparkles} label={t("info.language")}>
          <LanguageFlag code={product.spoken_language_code} />
        </DetailRow>
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

// Detail page has the room to break per-time-group lines apart, so a
// multi-day camp ("Apr 30 – May 5" + "Mon, Wed, Fri · 09:00–15:00") and a
// rare multi-time club (one line per group) both surface their full
// shape here, with the card carrying the typical-case summary.
//
// Timezone label appears once on the lead line — repeating it on each
// group reads as noise; readers infer same-tz for the whole schedule.
function renderScheduleLinesForDetail(
  schedule: ProductScheduleSummary,
): string[] {
  switch (schedule.kind) {
    case "tbd":
      return ["—"];
    case "recurring":
      return schedule.groups.map((g, idx) => {
        const line = `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`;
        return idx === 0 ? withTz(line, schedule.tz) : line;
      });
    case "ranged": {
      const dateLine = withTz(
        `${schedule.startDate} – ${schedule.endDate}`,
        schedule.tz,
      );
      const groupLines = schedule.groups.map(
        (g) => `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`,
      );
      return [dateLine, ...groupLines];
    }
    case "single": {
      const time = schedule.time
        ? ` · ${schedule.time.start}–${schedule.time.end}`
        : "";
      return [withTz(`${schedule.date}${time}`, schedule.tz)];
    }
  }
}

function withTz(line: string, tz: string): string {
  return tz ? `${line} (${tz})` : line;
}
