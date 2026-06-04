"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import type { ProductBrowseRow, ProductType } from "@/types";
import { formatInTimeZone } from "date-fns-tz";
import { computeProductSessions } from "@/components/calendar/compute-product-sessions";
import { SessionCalendarView } from "@/components/calendar/session-calendar-view";
import { ProductWhenWhereCard } from "./product-when-where-card";
import type { RegistrationState } from "./derive-registration-state";
import { SignupPanel } from "./signup-panel";
import type { AuthState, MyParticipationState } from "./signup-panel-view";

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
  product: ProductBrowseRow & {
    holidays?: { date: string; reason: string }[];
  };
  state: RegistrationState;
  authState: AuthState;
  /**
   * When set, the parent (or one of their gamers) is already on this product
   * — the panel renders the status panel instead of the signup form.
   */
  myParticipationState?: MyParticipationState | null;
  /** Render the panel frozen at this instant for deterministic mocks. */
  fixedNowMs?: number;
  /** Mockup preview banner is shown if this is true (preview route). */
  previewBanner?: boolean;
}

export function ProductDetailPageBody({
  product,
  state,
  authState,
  myParticipationState,
  fixedNowMs,
  previewBanner,
}: ProductDetailPageBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");
  const getTopicLabel = useTopicLabel();

  const tr = resolveTranslation(product.product_translations, uiLocale);

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
          <MainColumn product={product} topicLabel={getTopicLabel(product.topic)} />
          <div className="lg:sticky lg:top-6 lg:self-start">
            <SignupPanel
              product={product}
              state={state}
              authState={authState}
              myParticipationState={myParticipationState ?? null}
              fixedNowMs={fixedNowMs}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({ productType }: { productType: ProductType }) {
  const t = useTranslations("productDetail.back");
  return (
    <Link
      href={ROUTES.shopBrowse(productType)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t(productType)}
    </Link>
  );
}

function MainColumn({
  product,
  topicLabel,
}: {
  product: ProductDetailPageBodyProps["product"];
  topicLabel: string;
}) {
  const t = useTranslations("productDetail");

  return (
    <div className="space-y-6">
      <ProductWhenWhereCard product={product} />

      <CalendarCard product={product} />

      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("sections.topic")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {topicLabel}
            </span>
          </div>
        </CardContent>
      </Card>
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
    scheduleSlots: product.schedule_slots,
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
