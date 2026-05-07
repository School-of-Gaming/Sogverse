"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Globe2,
  Languages,
  MapPin,
  Pencil,
  Tag as TagIcon,
  Users,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { productImageUrl } from "@/lib/images/product-image-url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { DAYS_OF_WEEK, formatDate } from "@/lib/utils";
import {
  useProductV2Admin,
  type ProductV2AdminDetailRow,
} from "@/services/products-v2";
import { effectiveStatus } from "./effective-status";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface ProductV2DetailsPageProps {
  productType: ProductTypeV2;
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

export function ProductV2DetailsPage({
  productType,
  productId,
}: ProductV2DetailsPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.productsV2");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);

  const { data: product, isLoading } = useProductV2Admin(productId);

  const listHref = `/admin/${config.routeSlug}`;
  const editHref = `/admin/${config.routeSlug}/${productId}/edit`;

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

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2 ?? [],
    uiLocale,
  );
  const status = effectiveStatus(product, new Date(), 0);
  const imageUrl = product.image_path
    ? productImageUrl(product.image_path)
    : null;
  const topicName = topicTr?.name ?? product.topics_v2?.slug ?? null;

  const tags = product.product_tags_v2
    .map((pt) => {
      if (!pt.tags_v2) return null;
      const ttr = resolveTranslation(pt.tags_v2.tag_translations_v2, uiLocale);
      return ttr?.name ?? pt.tags_v2.slug;
    })
    .filter((n): n is string => n !== null);

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
        imageUrl={imageUrl}
        kicker={label}
        title={tr?.name ?? t("list.untitled")}
        description={tr?.description ?? null}
        statusKey={status}
        statusLabel={t(`status.${status}`)}
        isVisible={product.is_visible}
        visibleLabel={t("detailsPage.visible")}
        hiddenLabel={t("detailsPage.hidden")}
        editHref={editHref}
        editLabel={c("edit")}
      />

      <KeyFacts product={product} topicName={topicName} tags={tags} uiLocale={uiLocale} t={t} c={c} />

      <FuturePlaceholder
        icon={Users}
        title={t("detailsPage.placeholders.groups.title")}
        body={t("detailsPage.placeholders.groups.body")}
      />
      <FuturePlaceholder
        icon={Clock}
        title={t("detailsPage.placeholders.waitlist.title")}
        body={t("detailsPage.placeholders.waitlist.body")}
      />
      <FuturePlaceholder
        icon={Wallet}
        title={t("detailsPage.placeholders.metrics.title")}
        body={t("detailsPage.placeholders.metrics.body")}
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
  imageUrl,
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
}: {
  imageUrl: string | null;
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
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
          ) : null}
        </div>
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
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                isVisible
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isVisible ? visibleLabel : hiddenLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <Link href={editHref}>
            <Button>
              <Pencil className="mr-1 h-4 w-4" />
              {editLabel}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Key facts grid. Same data the list row shows, expanded — schedule,
// location, audience, registration window, billing, topic. One scan
// answers "what is this product, and is it set up the way I expect?"
// without paging through form-shaped sections.
// ──────────────────────────────────────────────────────────────────────
function KeyFacts({
  product,
  topicName,
  tags,
  uiLocale,
  t,
  c,
}: {
  product: ProductV2AdminDetailRow;
  topicName: string | null;
  tags: string[];
  uiLocale: string;
  t: ReturnType<typeof useTranslations<"admin.productsV2">>;
  c: ReturnType<typeof useTranslations<"common">>;
}) {
  const scheduleLines = product.schedule_slots_v2.map((s) =>
    t("detailsPage.scheduleRow", {
      day: DAYS_OF_WEEK[s.weekday],
      time: s.start_time.slice(0, 5),
      duration: s.duration_minutes,
    }),
  );

  const locationLine = (() => {
    if (product.is_remote) {
      return product.locations
        ? t("detailsPage.onlineWithin", { name: product.locations.name })
        : t("detailsPage.online");
    }
    if (!product.locations) return null;
    return product.locations.parent?.name
      ? `${product.locations.name}, ${product.locations.parent.name}`
      : product.locations.name;
  })();

  const dateRange = (() => {
    if (!product.start_date) return null;
    if (product.end_date && product.end_date !== product.start_date) {
      return `${formatDate(product.start_date, uiLocale)} → ${formatDate(product.end_date, uiLocale)}`;
    }
    return formatDate(product.start_date, uiLocale);
  })();

  const seatsLine =
    product.seat_count !== null
      ? t("list.seats", { count: product.seat_count })
      : t("detailsPage.uncapped");

  const waitlistSuffix = product.waitlist_enabled
    ? ` · ${t("detailsPage.waitlistOn")}`
    : "";

  const priceLines = SUPPORTED_CURRENCIES.flatMap((cur) => {
    const row = product.product_prices_v2.find((p) => p.currency === cur);
    if (!row) return [];
    const session = (row.price_per_session / 100).toFixed(2);
    const month =
      row.price_per_month > 0
        ? ` · ${t("detailsPage.perMonth", {
            amount: (row.price_per_month / 100).toFixed(2),
          })}`
        : "";
    return [`${cur.toUpperCase()} ${session}${month}`];
  });

  return (
    <Card>
      <CardContent className="grid gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
        <Fact icon={Calendar} label={t("detailsPage.fields.schedule")}>
          {scheduleLines.length > 0 ? (
            <ul className="space-y-0.5">
              {scheduleLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            dateRange ?? <span className="text-muted-foreground">{c("notSet")}</span>
          )}
          {dateRange && scheduleLines.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{dateRange}</p>
          )}
        </Fact>

        <Fact icon={MapPin} label={t("detailsPage.fields.location")}>
          {locationLine ?? <span className="text-muted-foreground">{c("notSet")}</span>}
        </Fact>

        <Fact icon={Users} label={t("detailsPage.fields.ageRange")}>
          {t("list.ageRange", { min: product.min_age, max: product.max_age })}
        </Fact>

        <Fact icon={Languages} label={t("detailsPage.fields.spokenLanguage")}>
          {product.spoken_language_code.toUpperCase()}
        </Fact>

        <Fact icon={Clock} label={t("detailsPage.fields.seats")}>
          {seatsLine}
          {waitlistSuffix}
        </Fact>

        <Fact icon={Globe2} label={t("detailsPage.fields.registrationOpensAt")}>
          {formatDate(product.registration_opens_at, uiLocale, {
            dateStyle: "medium",
            timeStyle: "short",
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

        <Fact icon={TagIcon} label={t("detailsPage.fields.topic")}>
          {topicName ?? <span className="text-muted-foreground">{c("notSet")}</span>}
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((name) => (
                <span
                  key={name}
                  className="rounded-full border px-2 py-0.5 text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
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

// ──────────────────────────────────────────────────────────────────────
// Placeholder card for sections that surface later (groups + gedu
// assignment, waitlist, business metrics). Rendered with dashed border
// so they don't read as broken empty states — the admin can see what's
// coming and where it'll land.
// ──────────────────────────────────────────────────────────────────────
function FuturePlaceholder({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}
