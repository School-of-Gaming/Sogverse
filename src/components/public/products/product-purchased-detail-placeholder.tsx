"use client";

/* eslint-disable i18next/no-literal-string -- Dev-facing placeholder for verifying webhook fulfillment landed correct DB state. Every literal is a raw column/field name or a debug note, not parent-facing copy. The whole file gets deleted when the real purchased-detail layout lands; translating these would be wasted work. */

import Link from "next/link";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { ProductDetailRow } from "@/services/products";
import type { MyParticipationRow, MyFamilySubRow } from "@/services/participations";
import type { ProductType } from "@/types";

// Intentionally unstyled placeholder for the post-purchase detail view. The
// real page is out of scope for the v2-stripe-participations branch (see
// docs/products-architecture.md), but we need *something* here to verify
// that webhook fulfillment landed the right state in the DB and to anchor
// the route shape — same `/clubs/[id]` URL, branch on whether the parent
// has a participation row for this product.
//
// Renders raw <dl> rows. No theming, no card chrome, no friendly copy.
// When the real layout lands, this file gets deleted.

interface ProductPurchasedDetailPlaceholderProps {
  product: ProductDetailRow;
  productType: ProductType;
  /** Customer's participation rows for *this* product (one per gamer). */
  participations: MyParticipationRow[];
  /**
   * ALL of the customer's family subscriptions (not filtered to this
   * product). Each item is rendered with the participation_id it covers so
   * the user can spot at a glance which item belongs to the current product
   * vs. another. Surfaces Stripe↔DB drift — if a sub is here but no item
   * covers the current participation despite `is_sub_covered`, that's the
   * inline-add atomicity gap (parent paid, link row missing, cron treats
   * them as bundle-mode).
   */
  familySubs: MyFamilySubRow[];
}

export function ProductPurchasedDetailPlaceholder({
  product,
  productType,
  participations,
  familySubs,
}: ProductPurchasedDetailPlaceholderProps) {
  const uiLocale = resolveLocale(useLocale());
  const productName =
    resolveTranslation(product.product_translations, uiLocale)?.name ??
    "(no translation)";

  // Used by the family-subs section to tag each item as "[this product]" vs.
  // "[other product]" so the user can see at a glance which sub items cover
  // the participations on the current page.
  const thisProductParticipationIds = new Set(participations.map((p) => p.id));

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
              product.schedule_slots.length === 0
                ? "(none)"
                : product.schedule_slots
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
              product.product_prices.length === 0
                ? "(none)"
                : product.product_prices
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
            participations.map((p) => {
              // Drift detector: any sub item linking to this participation?
              // If `is_sub_covered` is false but a sub here has an item
              // pointing at this participation_id, the join lost a status
              // somewhere. If `is_sub_covered` is true but NO item exists,
              // that's the inline-add gap.
              const linkedItems = familySubs.flatMap((sub) =>
                sub.family_subscription_items
                  .filter((item) => item.participation_id === p.id)
                  .map((item) => ({ sub, item })),
              );
              const driftWarning =
                p.is_sub_covered && linkedItems.length === 0
                  ? "is_sub_covered=true but no link row — DRIFT"
                  : !p.is_sub_covered && linkedItems.length > 0
                    ? "link row exists but is_sub_covered=false — DRIFT"
                    : null;

              return (
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
                  {linkedItems.length > 0 && (
                    <Row
                      label="linked_sub_items"
                      value={linkedItems
                        .map(
                          ({ sub, item }) =>
                            `${item.stripe_subscription_item_id} (sub ${sub.frequency} ${sub.currency} ${sub.status})`,
                        )
                        .join(", ")}
                      mono
                    />
                  )}
                  {driftWarning !== null && (
                    <Row label="⚠ drift" value={driftWarning} />
                  )}
                </div>
              );
            })
          )}
        </Section>

        <Section title={`Family subscriptions (${familySubs.length})`}>
          {familySubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              (this customer has no family subscriptions)
            </p>
          ) : (
            familySubs.map((sub) => (
              <div
                key={sub.id}
                className="space-y-2 border-l-2 border-muted py-2 pl-3"
              >
                <SubHeadline sub={sub} />
                <div className="space-y-1 pt-1">
                  <Row label="id" value={sub.id} mono />
                  <Row label="status" value={sub.status} />
                  <Row label="frequency" value={sub.frequency} />
                  <Row label="currency" value={sub.currency} />
                  <Row
                    label="current_period_end"
                    value={sub.current_period_end ?? "(null)"}
                  />
                  <Row
                    label="stripe_subscription_id"
                    value={sub.stripe_subscription_id}
                    mono
                  />
                  <Row
                    label="stripe_customer_id"
                    value={sub.stripe_customer_id}
                    mono
                  />
                  <Row label="created_at" value={sub.created_at} />
                </div>
                <SubItemsBlock
                  items={sub.family_subscription_items}
                  thisProductParticipationIds={thisProductParticipationIds}
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

function browseHref(productType: ProductType): string {
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

function SubHeadline({ sub }: { sub: MyFamilySubRow }) {
  // Total + currency from Stripe pricing (live, not local cache). If any
  // item failed to price, total_cents is null and we render a notice.
  const itemsCurrency = sub.family_subscription_items.find(
    (i) => i.stripe_price_currency !== null,
  )?.stripe_price_currency ?? sub.currency;
  const intervalLabel = labelForInterval(
    sub.family_subscription_items.find(
      (i) => i.recurring_interval !== null,
    )?.recurring_interval ?? null,
  );
  const billingDate = sub.current_period_end
    ? new Date(sub.current_period_end).toISOString().slice(0, 10)
    : "(no period_end)";
  return (
    <div className="rounded bg-muted/40 px-3 py-2 text-sm">
      <div className="font-semibold">
        {sub.total_cents === null ? (
          <>(pricing unavailable — Stripe lookup failed)</>
        ) : (
          <>
            {formatMoney(sub.total_cents, itemsCurrency)}
            {intervalLabel && (
              <span className="text-muted-foreground"> / {intervalLabel}</span>
            )}
          </>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Next charge: {billingDate} · {sub.status}
      </div>
    </div>
  );
}

function SubItemsBlock({
  items,
  thisProductParticipationIds,
}: {
  items: MyFamilySubRow["family_subscription_items"];
  thisProductParticipationIds: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        items: (none — sub charging without coverage)
      </p>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        items ({items.length})
      </div>
      {items.map((item) => {
        const onThisProduct = thisProductParticipationIds.has(
          item.participation_id,
        );
        const price =
          item.unit_amount_cents !== null && item.stripe_price_currency
            ? formatMoney(item.unit_amount_cents, item.stripe_price_currency)
            : "(no price)";
        return (
          <div
            key={item.id}
            className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:gap-2"
          >
            <span className="w-24 shrink-0 font-medium">{price}</span>
            <span className="font-mono text-muted-foreground">
              {item.stripe_subscription_item_id}
            </span>
            <span className="text-muted-foreground">
              → participation {item.participation_id.slice(0, 8)}…{" "}
              {onThisProduct ? "[this product]" : "[other product]"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatMoney(cents: number, currency: string): string {
  // Best-effort Intl format. If currency is something Intl rejects, render
  // a raw "1234 xyz" so the page never throws over a debug placeholder.
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function labelForInterval(interval: string | null): string | null {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    case "week":
      return "week";
    case "day":
      return "day";
    case null:
      return null;
    default:
      return interval;
  }
}
