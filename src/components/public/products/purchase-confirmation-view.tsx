"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  CheckCircle2,
  Clock,
  Hourglass,
  Info,
  Loader2,
  Mail,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductBanner } from "@/components/ui/product-banner";
import { SUPPORT_EMAIL } from "@/lib/constants/brand";
import { ROUTES } from "@/lib/constants/routes";
import { resolveLocale } from "@/lib/constants/locales";
import { formatDateOnly } from "@/lib/date-format";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  formatProductLocation,
  renderProductLocationLine,
} from "@/lib/products/format-product-location";
import {
  SCHEDULE_PART_SEPARATOR,
  formatProductSchedule,
  renderScheduleLinesForDetail,
} from "@/lib/products/format-product-schedule";
import { productToday } from "@/lib/products/holiday-breaks-shown";
import { formatCurrencyFromCents } from "@/lib/money";
import { formatFirstChargeDate } from "@/lib/stripe/first-charge-anchor";
import { useNow, useTimezone } from "@/providers";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { ProductBrowseRow } from "@/types";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import { ScheduleLine } from "./schedule-line";
import { Heading } from "@sog/ui";

// Signup summary — data-only presentational view (no fetching). A parent has
// just paid, signed up for a free event, or joined a waitlist, and lands here
// wanting two answers: did it go through, and is there anything left to do.
// So the page is a few seconds of reassurance — the outcome, the key facts of
// what they bought, where the confirmation email went, the one next step — and
// it fits on one screen at a phone's 360px. Everything else (the full
// schedule, holiday breaks, billing detail, the "Before the first session"
// guide, the calendar invite) is the email's job, which is the full record.
//
// The page server-fetches the participation + product and hands them here, so
// it paints complete on first load: no client loading state, no layout shift.

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
   * the payer (the `payments` policy is customer-only), in which case the money
   * line states the price alone.
   *
   * An instant rather than a calendar date on purpose: it is the subscription's
   * stored period end, and whether that instant is the club's own start or a
   * clamped one is exactly the question that decides how it renders. The answer
   * comes from the shared anchor helper, which the shop's signup panel asks the
   * same way — a bare start date when unclamped, the viewer's own day when not.
   */
  firstChargeAt?: string | null;
  /**
   * The address the confirmation email went to — the payer's own, so only
   * known when the payer is the one reading. Null for anyone else (a gamer
   * reading their own seat) and whenever it could not be read; the email line
   * then says a mail is on its way without naming where.
   */
  recipientEmail?: string | null;
}

export function PurchaseConfirmationView({
  product,
  participantName,
  isSelfSeat = false,
  outcome = "enrolled",
  waitlistPosition = null,
  firstChargeAt = null,
  recipientEmail = null,
}: PurchaseConfirmationViewProps) {
  const t = useTranslations("purchaseConfirmation");
  const tSelf = useTranslations("purchaseConfirmation.self");
  const tProduct = useTranslations("productDetail");
  const locale = resolveLocale(useLocale());
  const viewerTimezone = useTimezone();
  const now = useNow();

  const isWaitlist = outcome === "waitlisted";
  const tr = resolveTranslation(product.product_translations, locale);
  const productName = tr?.name ?? "";
  const participant =
    participantName ?? (isSelfSeat ? tSelf("fallbackName") : t("fallbackGamer"));

  // The schedule as the detail surfaces print it, minus the club's term range:
  // the start date below covers what a parent needs from it on this page, and
  // the email states the full term. A schedule not yet set states nothing
  // here rather than a placeholder dash.
  const schedule = formatProductSchedule({
    product,
    locale,
    timeZone: viewerTimezone,
    now,
  });
  const scheduleLines =
    schedule.kind === "tbd" ? [] : renderScheduleLinesForDetail(schedule);
  const where = renderProductLocationLine({
    location: formatProductLocation(product, locale),
    isRemote: product.is_remote,
    online: tProduct("info.online"),
    tbd: tProduct("info.tbd"),
  });

  // A club's start, while it is still ahead. Camps and events carry their
  // dates in the schedule line already, and a club already running has no
  // start worth announcing to someone who joined mid-term.
  const isClub =
    product.product_type === "consumer_club" ||
    product.product_type === "municipality_club";
  const startsLine =
    isClub && product.start_date > productToday(product.timezone, now)
      ? t("card.starts", { date: formatDateOnly(product.start_date, locale) })
      : null;

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
  const price = isWaitlist ? null : priceText(pricingOption, locale, t);
  // One money line. A club bought before it starts completed checkout at €0,
  // so the parent is owed the date the first payment really falls on beside
  // the monthly price — which date that is is the shared anchor rule's call.
  const moneyLine =
    price !== null && firstChargeAt !== null
      ? t("card.firstCharge", {
          price,
          date: formatFirstChargeDate(
            firstChargeAt,
            product.start_date,
            product.timezone,
            locale,
            viewerTimezone,
          ),
        })
      : price;

  const lastLine = isWaitlist
    ? waitlistPosition !== null
      ? t("waitlist.position", { position: waitlistPosition })
      : null
    : [startsLine, moneyLine]
        .filter((part): part is string => part !== null)
        // The schedule's own separator, so the renderer below keeps each
        // part whole and the line wraps only between them.
        .join(SCHEDULE_PART_SEPARATOR) || null;

  const subheading = isWaitlist
    ? isSelfSeat
      ? tSelf("waitlist.subheading", { product: productName })
      : t("waitlist.subheading", { gamer: participant, product: productName })
    : isSelfSeat
      ? tSelf(`subheading.${product.product_type}`, { product: productName })
      : t(`subheading.${product.product_type}`, {
          gamer: participant,
          product: productName,
        });

  const nextLine = isWaitlist
    ? t("waitlist.next")
    : isSelfSeat
      ? tSelf("nextPlacement")
      : t("next.placement", { gamer: participant });

  return (
    <div className="container mx-auto px-4 py-6 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-act bg-lifted">
            {isWaitlist ? (
              <Hourglass className="h-6 w-6 text-act" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-act" />
            )}
          </div>
          <div className="mt-3">
            <Heading level={1} step="section" align="center">
              {isWaitlist ? t("waitlist.heading") : t("heading")}
            </Heading>
          </div>
          <p className="mt-1 text-muted-foreground">{subheading}</p>
        </div>

        <Card className="mt-6">
          <CardContent className="flex gap-4 p-4">
            {/* The picture at the 3:2 crop the browse card and the detail hero
                paint — the photograph the parent clicked — as a fixed inline
                thumb, so it identifies the product without growing the card. */}
            <ProductBanner
              src={catalogueImageSrc("product", product.image_path)}
              className="w-24 shrink-0 self-start rounded-lg"
              sizes="96px"
            />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{productName}</p>
              <div className="mt-1 space-y-0.5 text-muted-foreground">
                {scheduleLines.map((line, idx) => (
                  <p key={idx}>
                    <ScheduleLine line={line} />
                  </p>
                ))}
                <p>{where}</p>
                {lastLine !== null && (
                  <p>
                    <ScheduleLine line={lastLine} />
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <ul className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">
              {recipientEmail !== null
                ? t.rich("email.sentTo", {
                    email: recipientEmail,
                    strong: (chunks) => (
                      <strong className="font-semibold">{chunks}</strong>
                    ),
                  })
                : t("email.sent")}
            </span>
          </li>
          <li className="flex gap-3">
            {isWaitlist ? (
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">{nextLine}</span>
          </li>
        </ul>

        {/* One button and a quiet link under it — a primary action plus an
            escape hatch, not a pair, so plain column order with the link
            below (`src/CLAUDE.md`, "Button Order"). */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link
            href={ROUTES.customer.dashboard}
            className={buttonVariants({ className: "w-full sm:w-auto sm:min-w-[220px]" })}
          >
            {t("goToDashboard")}
          </Link>
          <Link
            href={ROUTES.shop}
            className={buttonVariants({ variant: "link" })}
          >
            {t("keepBrowsing")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// The price for the card's money line. Subscriptions read "€X / month",
// one-time camps/events read "€X (one-time)", free reads "Free", and a
// municipality registration names who bears the cost. Unavailable never
// reaches a paid confirmation at all.
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
      return t("price.external");
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
 *   end here by construction, not by bad luck — and no confirmation email is
 *   sent either, so this state's copy promises none.
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
    <div className="container mx-auto px-4 py-6 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-act bg-lifted">
            {isFinalizing ? (
              <Loader2 className="h-6 w-6 animate-spin text-act" />
            ) : kind === "timedOut" ? (
              <Clock className="h-6 w-6 text-act" />
            ) : (
              <Info className="h-6 w-6 text-act" />
            )}
          </div>
          <div className="mt-3">
            <Heading level={1} step="section" align="center">
              {copy.heading}
            </Heading>
          </div>
          <p className="mt-1 text-muted-foreground">{copy.subheading}</p>
        </div>

        {isFinalizing ? (
          <>
            {/* Ghosts shaped like the summary card that replaces them: the
                picture and the lines beside it. */}
            <Card className="mt-6">
              <CardContent className="flex gap-4 p-4">
                <div className="aspect-[3/2] w-24 shrink-0 animate-pulse rounded-lg bg-lifted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-lifted" />
                  <div className="h-3 animate-pulse rounded bg-lifted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-lifted" />
                </div>
              </CardContent>
            </Card>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {copy.body}
            </p>
          </>
        ) : (
          <>
            <Card className="mt-6">
              <CardContent className="space-y-3 p-4 text-sm sm:p-5">
                <p>{copy.body}</p>
                <p className="text-muted-foreground">
                  {t.rich("supportLine", {
                    email: SUPPORT_EMAIL,
                    link: (chunks) => (
                      <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="text-act hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </CardContent>
            </Card>

            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                href={ROUTES.customer.dashboard}
                className={buttonVariants({
                  className: "w-full sm:w-auto sm:min-w-[220px]",
                })}
              >
                {t("goToDashboard")}
              </Link>
              <Link
                href={ROUTES.shop}
                className={buttonVariants({ variant: "link" })}
              >
                {t("keepBrowsing")}
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
          <Heading level={2} step="card-title" align="center">
            {t("notFound.title")}
          </Heading>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <Link href={ROUTES.customer.dashboard} className={buttonVariants()}>
              {t("notFound.cta")}
            </Link>
            <Link
              href={ROUTES.shop}
              className={buttonVariants({ variant: "link" })}
            >
              {t("keepBrowsing")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
