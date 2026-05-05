"use client";

/* eslint-disable i18next/no-literal-string -- Dev-facing placeholder for verifying webhook fulfillment landed correct DB state. Every literal is a raw column/field name or a debug note, not parent-facing copy. The whole file gets deleted when the real purchased-detail layout lands; translating these would be wasted work. */

import Link from "next/link";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { ProductV2DetailRow } from "@/services/products-v2";
import type { MyParticipationRow } from "@/services/participations";
import type { ProductTypeV2 } from "@/types";

// Intentionally unstyled placeholder for the post-purchase detail view. The
// real page is out of scope for the v2-stripe-participations branch (see
// docs/products-v2-architecture.md), but we need *something* here to verify
// that webhook fulfillment landed the right state in the DB and to anchor
// the route shape — same `/clubs/[id]` URL, branch on whether the parent
// has a participation row for this product.
//
// Renders raw <dl> rows. No theming, no card chrome, no friendly copy.
// When the real layout lands, this file gets deleted.

interface ProductPurchasedDetailPlaceholderProps {
  product: ProductV2DetailRow;
  productType: ProductTypeV2;
  /** Customer's participation rows for *this* product (one per gamer). */
  participations: MyParticipationRow[];
}

export function ProductPurchasedDetailPlaceholder({
  product,
  productType,
  participations,
}: ProductPurchasedDetailPlaceholderProps) {
  const uiLocale = resolveLocale(useLocale());
  const productName =
    resolveTranslation(product.product_translations_v2, uiLocale)?.name ??
    "(no translation)";

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <PlaceholderBanner />

        <header>
          <Link
            href={browseHref(productType)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            ← back to browse
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{productName}</h1>
        </header>

        <Section title="Product">
          <Row label="id" value={product.id} mono />
          <Row label="product_type" value={product.product_type} />
          <Row label="billing_mode" value={product.billing_mode} />
          <Row label="status" value={product.status} />
          <Row label="start_date" value={product.start_date ?? "(null)"} />
          <Row label="end_date" value={product.end_date ?? "(null)"} />
          <Row label="seat_count" value={String(product.seat_count)} />
          <Row label="signup_threshold" value={String(product.signup_threshold)} />
          <Row label="timezone" value={product.timezone} />
          <Row
            label="schedule_slots"
            value={
              product.schedule_slots_v2.length === 0
                ? "(none)"
                : product.schedule_slots_v2
                    .map(
                      (s) =>
                        `wk${s.weekday} @ ${s.start_time} (${s.duration_minutes}m)`,
                    )
                    .join(", ")
            }
          />
          <Row
            label="location"
            value={
              product.locations
                ? `${product.locations.name}${
                    product.locations.parent
                      ? ` / ${product.locations.parent.name}`
                      : ""
                  }`
                : "(none)"
            }
          />
          <Row
            label="prices"
            value={
              product.product_prices_v2.length === 0
                ? "(none)"
                : product.product_prices_v2
                    .map(
                      (p) =>
                        `${p.currency} ${p.price_per_session}/session, ${p.price_per_month}/mo`,
                    )
                    .join("; ")
            }
          />
        </Section>

        <Section title={`Participations (${participations.length})`}>
          {participations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              (no rows — placeholder shown by mistake?)
            </p>
          ) : (
            participations.map((p) => (
              <div
                key={p.id}
                className="space-y-1 border-l-2 border-muted py-1 pl-3"
              >
                <Row label="id" value={p.id} mono />
                <Row label="gamer_id" value={p.gamer_id} mono />
                <Row label="status" value={p.status} />
                <Row label="group_id" value={p.group_id ?? "(unassigned)"} mono />
                <Row
                  label="credits_remaining"
                  value={String(p.credits_remaining)}
                />
                <Row
                  label="waitlist_position"
                  value={
                    p.waitlist_position === null
                      ? "(null)"
                      : String(p.waitlist_position)
                  }
                />
                <Row label="signed_up_at" value={p.signed_up_at} />
                <Row
                  label="is_sub_covered"
                  value={p.is_sub_covered ? "true" : "false"}
                />
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function PlaceholderBanner() {
  return (
    <div className="rounded-md border border-dashed border-warning/60 bg-warning/10 px-4 py-3 text-sm text-warning">
      <p className="font-semibold">[placeholder — real layout pending]</p>
      <p className="mt-1 text-xs">
        Raw participation + product data so we can verify webhook fulfillment
        landed correctly. Route is{" "}
        <code className="rounded bg-background/40 px-1">/clubs/[id]</code>{" "}
        (and equivalents for camps/events) — same URL the browse grid points
        at; the page branches on whether the parent owns the product.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs sm:text-sm" : ""}>{value}</dd>
    </div>
  );
}

function browseHref(productType: ProductTypeV2): string {
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
