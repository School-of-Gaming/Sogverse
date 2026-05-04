"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Clock, Globe, MapPin, Sparkles, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LanguageFlag } from "@/components/ui/language-flag";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type {
  ProductV2BrowseRow,
  ProductTypeV2,
  TagTranslationV2,
} from "@/types";
import { formatInTimeZone } from "date-fns-tz";
import { computeProductSessions } from "@/components/calendar/compute-product-sessions";
import { SessionCalendarView } from "@/components/calendar/session-calendar-view";
import { formatProductLocation } from "./format-product-location";
import {
  formatProductSchedule,
  type ProductScheduleSummary,
} from "./format-product-schedule";
import type { RegistrationState } from "./derive-registration-state";
import { SignupPanel } from "./signup-panel";
import type { AuthState } from "./signup-panel-view";

// Page body — same role as the cards' "View": layout + presentation,
// with sub-adapters handling their own state. Owns nothing about
// fetching. The route-level adapter (`ProductDetailPage`) and the
// mockup preview route both render this directly.
//
// Layout: full-width container, image hero (1:1 product image), name +
// tagline, then a 2-column grid on desktop (3:1 main : panel) that
// stacks on mobile. Right panel is sticky on desktop so a scrolling
// parent never loses the CTA.

export interface ProductDetailPageBodyProps {
  product: ProductV2BrowseRow & {
    holidays?: { date: string; reason: string }[];
  };
  state: RegistrationState;
  authState: AuthState;
  /** Render the panel frozen at this instant for deterministic mocks. */
  fixedNowMs?: number;
  /** Mockup preview banner is shown if this is true (preview route). */
  previewBanner?: boolean;
}

export function ProductDetailPageBody({
  product,
  state,
  authState,
  fixedNowMs,
  previewBanner,
}: ProductDetailPageBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2,
    uiLocale,
  );

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        {previewBanner && (
          <div className="mb-4 rounded-md border border-warning/60 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
            {t("preview.banner")}
          </div>
        )}

        <BackLink productType={product.product_type} />

        <div className="mt-6 grid grid-cols-[96px_1fr] items-start gap-x-4 gap-y-3 sm:grid-cols-[140px_1fr] sm:gap-x-6">
          <ProductThumbnail
            imagePath={product.image_path ?? ""}
            alt={tr?.name ?? ""}
            size="aspect-square w-full"
            className="rounded-lg [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
          />

          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`typeLabel.${product.product_type}`)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {tr?.name}
            </h1>
            {/* Description on its own row at mobile width — squeezing it
                next to a 96px thumbnail makes it 4-5 cramped lines.
                Spans both columns from sm+ via the `sm:hidden` swap. */}
            {tr?.description && (
              <p className="mt-2 hidden text-muted-foreground sm:block">
                {tr.description}
              </p>
            )}
          </div>

          {tr?.description && (
            <p className="col-span-2 text-muted-foreground sm:hidden">
              {tr.description}
            </p>
          )}
        </div>

        {/* `minmax(0,…)` on every breakpoint (via `grid-cols-1` on
            mobile, which is shorthand for `minmax(0,1fr)`, and the
            explicit form on lg+) lets the main column shrink below
            its content's intrinsic width. Required because the
            calendar inside is a horizontal scroller whose children
            would otherwise expand the grid track and blow out the
            page width. Without this on mobile the default implicit
            track is `auto`, which sizes to content. */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <MainColumn product={product} topicLabel={topicTr?.name ?? null} />
          <div className="lg:sticky lg:top-6 lg:self-start">
            <SignupPanel
              product={product}
              state={state}
              authState={authState}
              fixedNowMs={fixedNowMs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({ productType }: { productType: ProductTypeV2 }) {
  const t = useTranslations("productDetail.back");
  const href = backHref(productType);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t(productType)}
    </Link>
  );
}

function backHref(productType: ProductTypeV2): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "/clubs";
    case "camp":
      return "/camps";
    case "event":
      return "/events";
  }
}

function MainColumn({
  product,
  topicLabel,
}: {
  product: ProductDetailPageBodyProps["product"];
  topicLabel: string | null;
}) {
  const t = useTranslations("productDetail");
  const uiLocale = resolveLocale(useLocale());

  const tagLabels = resolveTagLabels(product.product_tags_v2, uiLocale);
  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const scheduleLines = renderScheduleLinesForDetail(schedule);
  const location = formatProductLocation(product);

  return (
    <div className="space-y-6">
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

      <CalendarCard product={product} />

      {(topicLabel || tagLabels.length > 0) && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("sections.tags")}
            </h2>
            {topicLabel && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">
                  {t("sections.topicsLabel")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {topicLabel}
                  </span>
                </div>
              </div>
            )}
            {tagLabels.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">
                  {t("sections.tagsLabel")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tagLabels.map((label) => (
                    <Badge key={label} variant="outline" className="text-[10px]">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CalendarCard({
  product,
}: {
  product: ProductDetailPageBodyProps["product"];
}) {
  const t = useTranslations("productDetail.sections");
  const uiLocale = resolveLocale(useLocale());

  const result = computeProductSessions({
    productType: product.product_type,
    startDate: product.start_date,
    endDate: product.end_date,
    scheduleSlots: product.schedule_slots_v2,
    holidays: product.holidays ?? [],
  });
  if (!result) return null;

  // "Today" must be derived from the product's timezone — using UTC
  // (`new Date().toISOString().slice(0, 10)`) lands on the wrong day for
  // any non-UTC viewer near midnight. See CLAUDE.md "Date & Time".
  const todayIso = formatInTimeZone(new Date(), product.timezone, "yyyy-MM-dd");

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar")}
        </h2>
        <div className="mt-4">
          <SessionCalendarView
            rangeStart={result.rangeStart}
            rangeEnd={result.rangeEnd}
            sessions={result.sessions}
            skips={result.skips}
            locale={uiLocale}
            todayIso={todayIso}
          />
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

function resolveTagLabels(
  productTags: ProductV2BrowseRow["product_tags_v2"],
  uiLocale: ReturnType<typeof resolveLocale>,
): string[] {
  return productTags
    .map((pt) => {
      if (!pt.tags_v2) return null;
      const tr = resolveTranslation<TagTranslationV2>(
        pt.tags_v2.tag_translations_v2,
        uiLocale,
      );
      return tr?.name ?? pt.tags_v2.slug;
    })
    .filter((s): s is string => Boolean(s));
}
