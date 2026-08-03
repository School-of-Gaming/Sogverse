"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Coins,
  Copy,
  Globe2,
  Landmark,
  Pencil,
  Shapes,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  cn,
  formatCurrencyFromCents,
  formatDate,
} from "@/lib/utils";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { ProductOverviewCard } from "@/components/public/products/product-overview-card";
import { formatClubTermDates } from "@/components/public/products/format-product-term-dates";
import {
  useProductAdmin,
  type ProductAdminDetailRow,
} from "@/services/products";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { effectiveStatus } from "@/lib/products/effective-status";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import { GroupsPanel } from "./groups/groups-panel";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductDetailsPageProps {
  productType: ProductType;
  productId: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/20 text-primary",
  running: "bg-primary text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/20 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

export function ProductDetailsPage({
  productType,
  productId,
}: ProductDetailsPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const c = useTranslations("common");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();
  const now = useNow();
  const topicLabel = useTopicLabel();
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);

  const { data: product, isLoading } = useProductAdmin(productId);

  const listHref = `/admin/${config.routeSlug}`;
  const editHref = `/admin/${config.routeSlug}/${productId}/edit`;
  const cloneHref = `/admin/${config.routeSlug}/new?cloneFrom=${productId}`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("newPage.back", { plural })}
        </Link>
        <div className="h-40 animate-pulse rounded-lg border border-input bg-muted" />
        <div className="h-24 animate-pulse rounded-lg border border-input bg-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("newPage.back", { plural })}
        </Link>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tr = resolveTranslation(product.product_translations, uiLocale);
  const status = effectiveStatus(product, new Date(), 0);
  // Every group on the product shares one schedule, so resolve the voice
  // window once here and thread it into each group's Join button. `useNow`
  // ticks so the live/locked flip happens without a reload. A room only
  // exists for a remote product with a session still ahead of it — a
  // completed product (no future occurrence) has nothing to join, so
  // `voiceAvailable` is false and GroupsPanel hides the button entirely
  // rather than render a label-less "Opens at" state.
  const voice = computeVoiceState({ product, now, locale, timeZone });
  const voiceAvailable = product.is_remote && voice.hasUpcomingSession;
  const topicName = topicLabel(product.topic);

  return (
    <div className="space-y-6">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("newPage.back", { plural })}
      </Link>

      <HeaderCard
        imagePath={product.image_path}
        kicker={label}
        title={tr?.name ?? t("list.untitled")}
        description={tr?.short_description ?? null}
        statusKey={status}
        statusLabel={t(`status.${status}`)}
        isVisible={product.is_visible}
        visibleLabel={t("detailsPage.visible")}
        hiddenLabel={t("detailsPage.hidden")}
        editHref={editHref}
        editLabel={c("edit")}
        cloneHref={cloneHref}
        cloneLabel={c("clone")}
      />

      {/* Schedule / location / age / language are the parent-facing subset —
          render the same "When & where" card the shop uses so the two never
          drift. The admin-only operational fields live in the card below. */}
      <ProductOverviewCard product={product} />

      <OperationalFacts
        product={product}
        topicName={topicName}
        uiLocale={uiLocale}
        timeZone={timeZone}
        t={t}
        c={c}
      />

      <GroupsPanel
        productId={productId}
        productType={productType}
        seatCount={product.seat_count}
        waitlistEnabled={product.waitlist_enabled}
        voiceAvailable={voiceAvailable}
        voiceIsOpen={voice.voiceIsOpen}
        opensDate={voice.opensDate}
        opensTime={voice.opensTime}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header — image, type kicker, name, description, status + visibility
// pills, Edit button. The one element on the page that lets the admin
// take action right now; everything below is read-only or placeholder.
// ──────────────────────────────────────────────────────────────────────
function HeaderCard({
  imagePath,
  kicker,
  title,
  description,
  statusKey,
  statusLabel,
  isVisible,
  visibleLabel,
  hiddenLabel,
  editHref,
  editLabel,
  cloneHref,
  cloneLabel,
}: {
  imagePath: string | null;
  kicker: string;
  title: string;
  description: string | null;
  statusKey: string;
  statusLabel: string;
  isVisible: boolean;
  visibleLabel: string;
  hiddenLabel: string;
  editHref: string;
  editLabel: string;
  cloneHref: string;
  cloneLabel: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        <ProductThumbnail
          imagePath={imagePath ?? ""}
          alt=""
          size="h-28 w-28"
          className={cn(
            "rounded-md border bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
            !imagePath && "[&>img]:hidden",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {kicker}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                STATUS_STYLE[statusKey] ?? STATUS_STYLE.draft
              }`}
            >
              {statusLabel}
            </span>
            <Badge variant={isVisible ? "default" : "secondary"}>
              {isVisible ? visibleLabel : hiddenLabel}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={cloneHref}
            className={buttonVariants({ variant: "outline" })}
          >
            <Copy className="mr-1 h-4 w-4" />
            {cloneLabel}
          </Link>
          <Link href={editHref} className={buttonVariants()}>
            <Pencil className="mr-1 h-4 w-4" />
            {editLabel}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Operational facts grid — the admin-only fields the parent-facing "When &
// where" card (rendered above this on the page) doesn't carry: club term
// dates, capacity/waitlist, registration window, billing + prices, topic,
// Padlet. One scan answers "is this product set up the way I expect?".
// ──────────────────────────────────────────────────────────────────────
function OperationalFacts({
  product,
  topicName,
  uiLocale,
  timeZone,
  t,
  c,
}: {
  product: ProductAdminDetailRow;
  topicName: string | null;
  uiLocale: string;
  timeZone: string;
  t: ReturnType<typeof useTranslations<"admin.products">>;
  c: ReturnType<typeof useTranslations<"common">>;
}) {
  const isMuni = product.product_type === "municipality_club";

  // Render a per-session fee from its stored cents. The state is derived from
  // the value: null = "not set" (the `nullStatus` label — "unknown" draws the
  // eye, "none" is just informational), 0 = volunteer (free), > 0 = a EUR
  // amount in the viewer's locale.
  const renderFee = (cents: number | null, nullStatus: "unknown" | "none") => {
    if (cents == null) {
      return (
        <span
          className={
            nullStatus === "unknown"
              ? "text-destructive"
              : "text-muted-foreground"
          }
        >
          {t(`fees.status.${nullStatus}`)}
        </span>
      );
    }
    if (cents === 0) {
      return (
        <span className="text-muted-foreground">{t("fees.status.volunteer")}</span>
      );
    }
    return formatCurrencyFromCents(cents, "eur", uiLocale);
  };

  // A club's term range (shared with the parent overview card via
  // `formatClubTermDates`). Camps/events fold their dates into the schedule
  // card instead, so the helper returns null for them.
  const termDates = formatClubTermDates(product, uiLocale);

  const seatsLine =
    product.seat_count !== null
      ? t("list.seats", { count: product.seat_count })
      : t("detailsPage.uncapped");

  const waitlistSuffix = product.waitlist_enabled
    ? ` · ${t("detailsPage.waitlistOn")}`
    : "";

  const priceLines = SUPPORTED_CURRENCIES.flatMap((cur) => {
    const row = product.product_prices.find((p) => p.currency === cur);
    if (!row) return [];
    // Consumer clubs charge a monthly subscription; camps/events an upfront
    // total. Either way it's the single `price_cents`; only the label differs.
    if (product.product_type === "consumer_club") {
      return [
        `${cur.toUpperCase()} ${t("detailsPage.perMonth", {
          amount: (row.price_cents / 100).toFixed(2),
        })}`,
      ];
    }
    return [`${cur.toUpperCase()} ${(row.price_cents / 100).toFixed(2)}`];
  });

  return (
    <Card>
      <CardContent className="grid gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
        {termDates && (
          <Fact icon={Calendar} label={t("detailsPage.fields.termDates")}>
            {termDates}
          </Fact>
        )}

        <Fact icon={Clock} label={t("detailsPage.fields.seats")}>
          {seatsLine}
          {waitlistSuffix}
        </Fact>

        <Fact icon={Globe2} label={t("detailsPage.fields.registrationOpensAt")}>
          {formatDate(product.registration_opens_at, uiLocale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone,
          })}
        </Fact>

        <Fact icon={Wallet} label={t("detailsPage.fields.billingMode")}>
          <span>{t(`detailsPage.billingMode.${product.billing_mode}`)}</span>
          {priceLines.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {priceLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </Fact>

        <Fact icon={Coins} label={t("detailsPage.fields.primaryGeduFee")}>
          {renderFee(product.primary_gedu_fee_cents, "unknown")}
        </Fact>

        <Fact icon={Coins} label={t("detailsPage.fields.assistantGeduFee")}>
          {renderFee(product.assistant_gedu_fee_cents, "none")}
        </Fact>

        {isMuni && (
          <Fact icon={Landmark} label={t("detailsPage.fields.municipalityFee")}>
            {renderFee(product.municipality_fee_cents, "unknown")}
          </Fact>
        )}

        <Fact icon={Shapes} label={t("detailsPage.fields.topic")}>
          {topicName ?? <span className="text-muted-foreground">{c("notSet")}</span>}
        </Fact>

        {product.padlet_url && (
          <Fact icon={ExternalLink} label={t("detailsPage.fields.padletUrl")}>
            <a
              href={product.padlet_url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-primary underline-offset-2 hover:underline"
            >
              {product.padlet_url}
            </a>
          </Fact>
        )}

        {/* Staff-only, and it lives on its own embedded row for exactly that
            reason — `products` is anon-readable by column selection, so the
            lesson link cannot be a column on it. */}
        {product.product_staff_details?.material_url && (
          <Fact icon={ExternalLink} label={t("detailsPage.fields.materialUrl")}>
            <a
              href={product.product_staff_details.material_url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-primary underline-offset-2 hover:underline"
            >
              {product.product_staff_details.material_url}
            </a>
          </Fact>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
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
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}
