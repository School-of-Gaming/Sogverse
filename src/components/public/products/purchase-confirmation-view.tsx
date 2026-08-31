"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Clock, Hourglass, Info, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductBanner } from "@/components/ui/product-banner";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { productImageSrc } from "@/lib/images/product-image-url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatCurrencyFromCents } from "@/lib/utils";
import { formatFirstChargeDate } from "@/lib/stripe/first-charge-anchor";
import { useTimezone } from "@/providers";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { ProductBrowseRow } from "@/types";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import { ProductOverviewCard } from "./product-overview-card";

// Signup summary — data-only presentational view (no fetching). A
// non-tech-savvy parent has just paid, signed up for a free event, or joined a
// waitlist, and lands here. We reassure them it worked and lay out exactly what
// happened, who for, and what's next. The page server-fetches the participation
// + product and hands them here, so it paints complete on first load: no client
// loading state, no skeleton, no layout shift.

/** Which signup outcome the summary reassures the parent about. */
export type SignupOutcome = "enrolled" | "waitlisted";

interface PurchaseConfirmationViewProps {
  product: ProductBrowseRow;
  /**
   * The participant's first name — a child's, or the buyer's own on a self
   * seat. Null falls back to "Your child" / "You" per `isSelfSeat`.
   */
  participantName: string | null;
  /**
   * True when the seat is the buyer's own (a for-parents product), which puts
   * every sentence naming the participant into the second person. Resolved from
   * the row (`participant_id = customer_id`) rather than from the viewer — see
   * the service's `isSelfSeat`.
   */
  isSelfSeat?: boolean;
  /** `enrolled` (paid/free signup) or `waitlisted` (joined the waitlist). */
  outcome?: SignupOutcome;
  /**
   * 1-based waitlist position, for the `waitlisted` outcome. Null when unknown
   * (RLS miss / no longer waitlisted) → the position line is simply omitted.
   */
  waitlistPosition?: number | null;
  /**
   * When the first subscription charge falls, as a true instant (ISO), for a
   * club bought before it started — the parent paid €0 at checkout and is owed
   * the real date. Null on every other signup, and whenever the reader is not
   * the payer (the `payments` policy is customer-only), in which case no billing
   * line renders at all.
   *
   * An instant rather than a calendar date on purpose: it is the subscription's
   * stored period end, and whether that instant is the club's own start or a
   * clamped one is exactly the question that decides how it renders. The answer
   * comes from the shared anchor helper, which the shop's signup panel asks the
   * same way — a bare start date when unclamped, the viewer's own day when not.
   */
  firstChargeAt?: string | null;
}

export function PurchaseConfirmationView({
  product,
  participantName,
  isSelfSeat = false,
  outcome = "enrolled",
  waitlistPosition = null,
  firstChargeAt = null,
}: PurchaseConfirmationViewProps) {
  const t = useTranslations("purchaseConfirmation");
  const tSelf = useTranslations("purchaseConfirmation.self");
  const tProduct = useTranslations("productDetail");
  const locale = resolveLocale(useLocale());
  const viewerTimezone = useTimezone();

  const isWaitlist = outcome === "waitlisted";
  const tr = resolveTranslation(product.product_translations, locale);
  const productName = tr?.name ?? "";
  // The summary row keeps naming the person even on a self seat — the reader's
  // own first name is what they recognise beside "Enrolled", and it is the one
  // place a name is a value rather than a subject. Only the *sentences* move
  // into the second person, and each of those is a separate key rather than an
  // interpolated pronoun, because a possessive that agrees with a name in
  // English does not in Finnish or Swedish.
  const participant =
    participantName ?? (isSelfSeat ? tSelf("fallbackName") : t("fallbackGamer"));

  // Price is recomputed from the product's *current* prices, not stored as a
  // receipt of what was charged. For the fresh post-checkout view that's
  // correct. Honest caveat: the page is RLS-revisitable (no consumed flag), so
  // if an admin later changes the product's price, a parent reopening an old
  // confirmation link sees the new price on a summary captioned as their order.
  // Accepted — this is a "what you signed up for" confirmation, not a billing
  // receipt; the authoritative record lives in Stripe / My SOG.
  const pricingOption = buildPricingOption({
    prices: product.product_prices,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency: DEFAULT_CURRENCY,
    currencyLabel: CURRENCY_CONFIG[DEFAULT_CURRENCY].label,
  });
  const price = priceText(pricingOption, locale, t);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {isWaitlist ? (
              <Hourglass className="h-7 w-7 text-primary" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-primary" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            {isWaitlist ? t("waitlist.heading") : t("heading")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isWaitlist
              ? isSelfSeat
                ? tSelf("waitlist.subheading", { product: productName })
                : t("waitlist.subheading", {
                    gamer: participant,
                    product: productName,
                  })
              : isSelfSeat
                ? tSelf(`subheading.${product.product_type}`, {
                    product: productName,
                  })
                : t(`subheading.${product.product_type}`, {
                    gamer: participant,
                    product: productName,
                  })}
          </p>
        </div>

        <Card className="mt-8">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold tracking-wider text-muted-foreground">
              {isWaitlist ? t("waitlist.summaryTitle") : t("summaryTitle")}
            </h2>
            {/* The picture, at the 3:2 crop the card and the detail hero paint
                — the parent is looking at the same photograph they clicked and
                then read a page of, so it must be the same crop of it.
                Deliberately *not* a full-width banner on top of this card: at
                this column's width that stands over 400px tall, and it would
                push the facts this card exists to state — who the seat is for,
                what it costs — off a phone screen. So the picture stays inline
                and identifying, and keeps the row's existing 64px height (96px
                wide at 3:2) rather than growing the summary. Centred against
                the two text lines, which a wide short frame wants where a
                square did not. */}
            <div className="mt-4 flex items-center gap-4">
              <ProductBanner
                src={productImageSrc(product.image_path)}
                className="w-24 shrink-0 rounded-lg"
                // `w-24` at every breakpoint — a fixed inline thumb, so one
                // length with no media conditions.
                sizes="96px"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {tProduct(`typeLabel.${product.product_type}`)}
                </p>
                <p className="mt-0.5 font-semibold">{productName}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <SummaryRow
                label={
                  isWaitlist
                    ? t("waitlist.forLabel")
                    : t(`forLabel.${product.product_type}`)
                }
                value={participant}
              />
              {/* "You're #N in line" — the reassuring number. Omitted if the
                  position couldn't be read (e.g. a stale revisit). */}
              {isWaitlist && waitlistPosition != null && (
                <SummaryRow
                  label={t("waitlist.positionLabel")}
                  value={t("waitlist.positionValue", {
                    position: waitlistPosition,
                  })}
                />
              )}
              {/* No charge yet on a waitlist join — the "what's next" list
                  explains billing only happens if a seat opens and is accepted. */}
              {!isWaitlist && price && (
                <SummaryRow label={t("priceLabel")} value={price} />
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="mt-6">
          <ProductOverviewCard product={product} />
        </div>

        <Card className="mt-6">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold tracking-wider text-muted-foreground">
              {t("nextTitle")}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {isWaitlist ? (
                <>
                  <li>{t("waitlist.next1")}</li>
                  {/* The one term-shaped line in the waitlist copy, so the one
                      keyed by product type. A club (consumer or municipality)
                      runs a term and keeps that wording; a camp and an event
                      are each a single run and say so. Everything else in this
                      block — the heading, the email promise, the My SOG
                      pointer — is true of all four types and stays neutral.
                      The type comes off the product row the page already
                      passes in, so nothing extra had to be threaded here. */}
                  <li>
                    {isSelfSeat
                      ? tSelf(`waitlist.next2.${product.product_type}`)
                      : t(`waitlist.next2.${product.product_type}`, {
                          gamer: participant,
                        })}
                  </li>
                  <li>{t("waitlist.next3")}</li>
                </>
              ) : (
                <>
                  <li>
                    {isSelfSeat
                      ? tSelf("nextPlacement")
                      : t("next.placement", { gamer: participant })}
                  </li>
                  {/* Before the general "you'll be billed monthly" line, and
                      only when the first charge has genuinely been deferred:
                      the parent has just seen €0 due on Stripe's page and is
                      owed the real date in the same breath. Which date that is
                      is the shared rule's call, not this component's — a charge
                      landing on the club's own start renders as that bare
                      calendar date (the same one shown further up this page), a
                      clamped one as the day it hits the reader's statement. */}
                  {firstChargeAt !== null && (
                    <li>
                      {t("next.firstCharge", {
                        date: formatFirstChargeDate(
                          firstChargeAt,
                          product.start_date,
                          product.timezone,
                          locale,
                          viewerTimezone,
                        ),
                      })}
                    </li>
                  )}
                  {pricingOption.kind === "subscription" && (
                    <li>{t("next.subscription")}</li>
                  )}
                  {pricingOption.kind === "upfront" && (
                    <li>{t("next.oneTime")}</li>
                  )}
                </>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* The app-wide button order shape — root `CLAUDE.md`, "Button Order".
            My SOG is the affirmative (last in the DOM, so right in a row and
            top in a stack); Keep browsing is the negative, on the left. */}
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <Link
            href={ROUTES.shop}
            className={buttonVariants({
              variant: "outline",
              className: "sm:min-w-[180px]",
            })}
          >
            {t("keepBrowsing")}
          </Link>
          <Link
            href={ROUTES.customer.dashboard}
            className={buttonVariants({ className: "sm:min-w-[180px]" })}
          >
            {t("goToDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

// The price line for the summary. Subscriptions read "€X / month", one-time
// camps/events read "€X (one-time)". External (municipality) shows no price
// line — it never claimed one, and a page that has said nothing about the cost
// has said nothing wrong; the emailed twin carries a line here only because it
// had a false one to replace. Unavailable never reaches a paid confirmation at
// all.
function priceText(
  option: PricingOption,
  locale: string,
  t: ReturnType<typeof useTranslations<"purchaseConfirmation">>,
): string | null {
  switch (option.kind) {
    case "subscription":
      return t("price.subscription", {
        amount: formatCurrencyFromCents(
          option.totalCents,
          DEFAULT_CURRENCY,
          locale,
        ),
      });
    case "upfront":
      return t("price.upfront", {
        amount: formatCurrencyFromCents(
          option.totalCents,
          DEFAULT_CURRENCY,
          locale,
        ),
      });
    case "free":
      return t("price.free");
    case "external":
    case "unavailable":
      return null;
  }
}

/**
 * Which of the three "paid, but no order to show" states the page is in. All
 * three follow a Stripe payment that succeeded, so none of them may read as an
 * error, and none of them may suggest the money is at risk.
 *
 * - `finalizing` — the webhook that creates the seat hasn't landed yet. Stripe
 *   waits up to ten seconds on it before redirecting, so this needs the endpoint
 *   to have failed or run long. Resolves on its own, usually within a frame or
 *   two of arriving.
 * - `timedOut` — it still hasn't landed after the wait the wrapper allows.
 *   Spinning forever under "this only takes a moment" would be a lie, so the
 *   page stops and says where to look instead.
 * - `duplicatePayment` — the seat was already taken, so the payment was refused
 *   as a duplicate and no row will ever carry this session. Waiting is a dead
 *   end here by construction, not by bad luck.
 *
 * This component takes only which state it is — there is no row and therefore
 * no participant to name — so its copy says "the person this was for" rather
 * than "this child". A seat can be the buyer's own now, and a notice with no
 * participant in reach must not guess which.
 */
export type ConfirmationNoticeKind =
  | "finalizing"
  | "timedOut"
  | "duplicatePayment";

/**
 * The presentational half of those states: data-only, no fetching and no
 * timers, so it renders identically from a page and from a fixture. The waiting
 * and the deciding live in `PurchaseConfirmationFinalizing`.
 *
 * Mirrors the confirmed layout — same container, same width, same card rhythm.
 * Nothing here survives into the confirmed view; the whole panel is replaced, so
 * there is no position for anything to shift from.
 */
export function PurchaseConfirmationNotice({
  kind,
}: {
  kind: ConfirmationNoticeKind;
}) {
  const t = useTranslations("purchaseConfirmation");
  const isFinalizing = kind === "finalizing";

  // Written out per kind rather than built from the kind string, so every
  // message key in this component is greppable from the messages files.
  const copy =
    kind === "finalizing"
      ? {
          heading: t("finalizing.heading"),
          subheading: t("finalizing.subheading"),
          body: t("finalizing.reassurance"),
        }
      : kind === "timedOut"
        ? {
            heading: t("timedOut.heading"),
            subheading: t("timedOut.subheading"),
            body: t("timedOut.body"),
          }
        : {
            heading: t("duplicatePayment.heading"),
            subheading: t("duplicatePayment.subheading"),
            body: t("duplicatePayment.body"),
          };

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {isFinalizing ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : kind === "timedOut" ? (
              <Clock className="h-7 w-7 text-primary" />
            ) : (
              <Info className="h-7 w-7 text-primary" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            {copy.heading}
          </h1>
          <p className="mt-2 text-muted-foreground">{copy.subheading}</p>
        </div>

        {isFinalizing ? (
          <>
            {/* Ghosts shaped like the summary card that replaces them. */}
            <Card className="mt-8">
              <CardContent className="space-y-3 p-5 sm:p-6">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {copy.body}
            </p>
          </>
        ) : (
          <>
            <Card className="mt-8">
              <CardContent className="space-y-3 p-5 sm:p-6 text-sm">
                <p>{copy.body}</p>
                <p className="text-muted-foreground">
                  {t.rich("supportLine", {
                    email: SUPPORT_EMAIL,
                    link: (chunks) => (
                      <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="text-primary hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </CardContent>
            </Card>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <Link
                href={ROUTES.shop}
                className={buttonVariants({
                  variant: "outline",
                  className: "sm:min-w-[180px]",
                })}
              >
                {t("keepBrowsing")}
              </Link>
              <Link
                href={ROUTES.customer.dashboard}
                className={buttonVariants({ className: "sm:min-w-[180px]" })}
              >
                {t("goToDashboard")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Direct-link / stale-link case (no id, RLS miss, or load error). Kept
// deliberately minimal — a real purchaser never sees this; we only need to not
// crash and to offer a way onward.
export function PurchaseConfirmationFallback() {
  const t = useTranslations("purchaseConfirmation");
  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-lg font-semibold">{t("notFound.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row">
            <Link
              href={ROUTES.shop}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("keepBrowsing")}
            </Link>
            <Link href={ROUTES.customer.dashboard} className={buttonVariants()}>
              {t("notFound.cta")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
