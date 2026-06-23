"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import {
  Plus,
  Calendar,
  CalendarClock,
  Users,
  Ticket,
  Hourglass,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useProductsByType } from "@/services/products";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn, formatDate, formatDateOnly } from "@/lib/utils";
import { effectiveStatus, pendingHintKey } from "@/lib/products/effective-status";
import {
  formatProductSchedule,
  joinScheduleGroups,
  type ProductScheduleSummary,
} from "@/components/public/products/format-product-schedule";
import { ProductTypeInfoCard } from "./product-type-info-card";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductListPageProps {
  productType: ProductType;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/20 text-primary",
  running: "bg-primary text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/20 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

// `pendingHintKey` lives in effective-status.ts (UI-free decision tree). This
// thin wrapper formats the values for display: dates go through the user's
// locale formatter, counts pass through as numbers. Without current
// enrollment counts in the list query, threshold messages describe the
// rule ("starts when N sign up") rather than progress ("3 of 10").
function renderPendingHint(
  hint: ReturnType<typeof pendingHintKey>,
  locale: string,
  timeZone: string,
  t: (
    key:
      | "list.pendingHint.registrationOpens"
      | "list.pendingHint.startDate"
      | "list.pendingHint.threshold"
      | "list.pendingHint.dateAndThreshold"
      | "list.pendingHint.pastDateThreshold",
    values?: Record<string, string | number>
  ) => string
): string | null {
  if (!hint) return null;
  const formatted: Record<string, string | number> = {};
  if (hint.values.date !== undefined)
    // `registrationOpens` carries a `registration_opens_at` timestamptz
    // instant → render in the viewer's zone; every other dated hint carries
    // date-only `start_date` → UTC-pinned (a bare calendar date has no zone).
    formatted.date =
      hint.key === "registrationOpens"
        ? formatDate(hint.values.date, locale, { dateStyle: "medium", timeZone })
        : formatDateOnly(hint.values.date, locale);
  if (hint.values.count !== undefined) formatted.count = hint.values.count;
  return t(`list.pendingHint.${hint.key}`, formatted);
}

// One compact "when" line for a list row: weekday + time, no date. Two
// products can be identical except for which days/times they run — clubs that
// differ only by weekday, camps with the same date range but different days
// (Mon/Wed vs Tue/Thu), or two events on different weekdays. The row's date
// chip can't separate those, so we surface the cadence. Clubs and camps join
// their weekday groups ("Mon, Wed · 09:00–15:00"); events show their single
// day + time ("Thursday · 18:00–19:30"). The date itself stays on the date
// chip — this line is purely the day-of-week/time the chip can't convey.
function scheduleRowLine(schedule: ProductScheduleSummary): string | null {
  switch (schedule.kind) {
    case "tbd":
      return null;
    case "recurring":
    case "ranged":
      return joinScheduleGroups(schedule.groups) || null;
    case "single":
      return schedule.time
        ? `${schedule.weekday} · ${schedule.time.start}–${schedule.time.end}`
        : schedule.weekday;
  }
}

export function ProductListPage({ productType }: ProductListPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);
  const { data: products, isLoading } = useProductsByType(productType);
  // One `now` for the whole render so every row derives status from the same
  // instant — avoids a row-level boundary on the day a status flips. From
  // `useNow()` (server-seeded) so the schedule conversion is hydration-stable.
  const now = useNow();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plural}</h1>
          <p className="text-muted-foreground">
            {t("list.subtitle", { plural })}
          </p>
        </div>
        <Link
          href={`/admin/${config.routeSlug}/new`}
          className={buttonVariants()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("list.new", { label })}
        </Link>
      </div>

      <ProductTypeInfoCard productType={productType} />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-input bg-muted"
            />
          ))}
        </div>
      )}

      {!isLoading && products && products.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("list.empty", { plural, label })}
          </CardContent>
        </Card>
      )}

      {!isLoading && products && products.length > 0 && (
        <div className="space-y-2">
          {products.map((p) => {
            const tr = resolveTranslation(p.product_translations, uiLocale);
            // TODO: thread real active-participation count when participations
            // ships. Until then threshold-bearing products read as pending.
            const status = effectiveStatus(p, now, 0);
            const hint =
              status === "pending"
                ? renderPendingHint(pendingHintKey(p, now), uiLocale, timeZone, t)
                : null;
            const schedule = formatProductSchedule({
              product: p,
              locale: uiLocale,
              timeZone,
              now,
            });
            const scheduleLine = scheduleRowLine(schedule);
            // A time-bearing event is a date+time instant, so its date renders in
            // the viewer's zone (may differ from the stored start_date). Every
            // other dated value here — a camp's date range, a club term date, a
            // no-time event — is a zoneless calendar date that stays UTC-pinned.
            const dateChip =
              schedule.kind === "single" && schedule.time
                ? schedule.date
                : p.start_date
                  ? formatDateOnly(p.start_date, uiLocale) +
                    (p.end_date && p.end_date !== p.start_date
                      ? ` → ${formatDateOnly(p.end_date, uiLocale)}`
                      : "")
                  : null;
            return (
              <Link
                key={p.id}
                href={`/admin/${config.routeSlug}/${p.id}`}
                className="group flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <ProductThumbnail
                    imagePath={p.image_path ?? ""}
                    alt=""
                    size="h-14 w-14"
                    className={cn(
                      "rounded-md border bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
                      !p.image_path && "[&>img]:hidden",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {tr?.name ?? t("list.untitled")}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_STYLE[status] ?? STATUS_STYLE.draft
                        }`}
                      >
                        {t(`status.${status}`)}
                      </span>
                      {!p.is_visible && status !== "draft" && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {t("list.hidden")}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {tr?.short_description ?? ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t("list.ageRange", {
                          min: p.min_age,
                          max: p.max_age,
                        })}
                      </span>
                      {dateChip && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {dateChip}
                        </span>
                      )}
                      {scheduleLine && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {scheduleLine}
                        </span>
                      )}
                      {p.seat_count !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Ticket className="h-3 w-3" />
                          {t("list.seats", { count: p.seat_count })}
                        </span>
                      )}
                      {hint && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Hourglass className="h-3 w-3" />
                          {hint}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <NavChevron />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
