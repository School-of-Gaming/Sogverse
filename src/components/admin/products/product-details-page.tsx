"use client";

import { useId } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Check, Copy, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ROUTES, SUPPORTED_CURRENCIES } from "@/lib/constants";
import { formattingLocale, resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { municipalityOf } from "@/lib/locations/embedded-chain";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import { cn, formatCurrencyFromCents, formatDate, formatDateOnly } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { addCalendarDays } from "@/lib/calendar-date";
import type { PlannedSession } from "@/lib/planned-sessions";
import { formatTimezoneOptionLabel } from "@/lib/timezone";
import { ProductBanner } from "@/components/ui/product-banner";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { productAudience } from "@/lib/products/product-audience";
import {
  formatAdminTermWeeks,
  formatClubTermDates,
} from "@/lib/products/format-product-term-dates";
import {
  formatProductLocation,
  productLocationLabelIsFormat,
  renderProductLocationLine,
} from "@/lib/products/format-product-location";
import {
  formatProductSchedule,
  renderScheduleLinesForDetail,
} from "@/lib/products/format-product-schedule";
import { productWhoItsFor } from "@/lib/products/product-overview-facts";
import { ScheduleLine } from "@/components/public/products/schedule-line";
import { productTagLabelKey } from "@/components/public/products/product-tag";
import { countryDisplayName } from "@/components/public/products/region-lock/region-gate";
import {
  consentDocumentMeta,
  describeRequiredConsents,
} from "@/lib/constants/consent-documents";
import { describeMarketingConsents } from "@/lib/constants/marketing-consents";
import { describeGamerPhotoConsents } from "@/lib/constants/gamer-photo-consents";
import {
  usePlannedSessions,
  useProductAdmin,
  type ProductAdminDetailRow,
} from "@/services/products";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import {
  effectiveStatus,
  type EffectiveProductStatus,
} from "@/lib/products/effective-status";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import { personName } from "@/components/admin/person-name";
import { GroupsPanel } from "./groups/groups-panel";
import { ProductStatusChip } from "./product-status-chip";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";
import type { AppHref } from "@/lib/constants/routes";
import { sessionRequirements } from "@/lib/products/session-requirements";

interface ProductDetailsPageProps {
  productType: ProductType;
  productId: string;
}

/**
 * How much of the plan this page reads: the whole term of a dated product, and
 * on an open-ended one from its start to a year past today — or past its start,
 * when that is later — which reaches the first session and is far beyond the
 * eight upcoming ones the Join looks across.
 */
const OPEN_ENDED_PLAN_DAYS = 366;

function plannedSessionsWindow(
  product: Pick<ProductAdminDetailRow, "start_date" | "end_date" | "timezone">,
  now: Date,
): { from: string; to: string } {
  if (product.end_date !== null) {
    return { from: product.start_date, to: product.end_date };
  }
  // Product-local today: the plan's dates are in the product's zone.
  const today = formatInTimeZone(now, product.timezone, "yyyy-MM-dd");
  const reference = today > product.start_date ? today : product.start_date;
  return {
    from: product.start_date,
    to: addCalendarDays(reference, OPEN_ENDED_PLAN_DAYS),
  };
}

/**
 * The page's frame: the back link and the header span the full width, and
 * under them two columns from `xl` — groups in the main two thirds, the product
 * details in the third beside them. Below `xl` the two stack, groups first,
 * because managing groups is what an admin comes to this page for and the
 * details must never push it down. The loading state lays out the same frame,
 * so nothing it paints early lands anywhere else once the data is in. No width
 * cap of its own: the dashboard container already bounds it, and every pixel
 * that cap would hold back on a wide monitor belongs to the groups column.
 */
const PAGE_FRAME = "space-y-6";
const PAGE_COLUMNS = "grid grid-cols-1 items-start gap-6 xl:grid-cols-3";
const MAIN_COLUMN = "min-w-0 xl:col-span-2";

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

  const { data: product, isLoading: productLoading } =
    useProductAdmin(productId);
  const { data: plannedSessions, isPending: planPending } = usePlannedSessions(
    productId,
    product ? plannedSessionsWindow(product, now) : null,
  );
  // The page holds its loading state until the plan has landed too, so it
  // paints once, in its final form. The plan decides whether each group card's
  // header carries a Join button, and a button arriving after the cards have
  // painted would rewrap the group name beside it — a shift on the data's
  // schedule rather than the admin's. The product row cannot carry the plan
  // (it is a table select, not a document), so the wait is a second round trip
  // behind the first; the plan read is one bounded RPC. A failed plan read
  // ends the wait like a landed one, and the page renders with no plan.
  const isLoading = productLoading || (product != null && planPending);

  const listHref = ROUTES.admin.productList(productType);
  const editHref = ROUTES.admin.productEdit(productType, productId);
  const cloneHref = ROUTES.admin.productClone(productType, productId);
  const backLink = (
    <Link
      href={listHref}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("newPage.back", { plural })}
    </Link>
  );

  if (isLoading) {
    return (
      <div className={PAGE_FRAME} data-reserve-scroll-gutter>
        {backLink}
        <div className="h-40 animate-pulse rounded-lg border border-border bg-lifted" />
        <div className={PAGE_COLUMNS}>
          <div
            className={cn(
              MAIN_COLUMN,
              "h-48 animate-pulse rounded-lg border border-border bg-lifted",
            )}
          />
          <div className="h-96 animate-pulse rounded-lg border border-border bg-lifted" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={PAGE_FRAME} data-reserve-scroll-gutter>
        {backLink}
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tr = resolveTranslation(product.product_translations, uiLocale);
  const status = effectiveStatus(product, now);
  // Every group on the product shares one plan, so resolve the voice window
  // once here and thread it into each group's Join button. `useNow` ticks so
  // the live/locked flip happens without a reload. A room only exists for a
  // remote product with a session still ahead of it — a completed product (no
  // session still open) has nothing to join, so `voiceAvailable` is false and
  // GroupsPanel hides the button entirely rather than render a label-less
  // "Opens at" state. No group's cancellations are in view on this page, so
  // the plan goes in unmarked.
  const voice = computeVoiceState({
    plan: plannedSessions ?? [],
    openEnded: product.end_date === null,
    now,
    locale,
    timeZone,
  });
  const voiceAvailable = product.is_remote && voice.hasUpcomingSession;
  const topicName = topicLabel(product.topic);

  return (
    <div className={PAGE_FRAME} data-reserve-scroll-gutter>
      {backLink}

      <HeaderCard
        imagePath={product.image_path}
        kicker={label}
        title={tr?.name ?? t("list.untitled")}
        description={tr?.short_description ?? null}
        statusKey={status}
        isVisible={product.is_visible}
        listedLabel={t("detailsPage.listed")}
        unlistedLabel={t("detailsPage.unlisted")}
        editHref={editHref}
        editLabel={c("edit")}
        cloneHref={cloneHref}
        cloneLabel={c("clone")}
      />

      {/* Each column is its own run: the groups panel grows and shrinks as an
          admin works in it, and nothing it does can move the details card
          beside it, nor the other way round. */}
      <div className={PAGE_COLUMNS}>
        <div className={MAIN_COLUMN}>
          <GroupsPanel
            productId={productId}
            productType={productType}
            requirements={sessionRequirements(product, product.locations?.name ?? null)}
            billingMode={product.billing_mode}
            topic={product.topic}
            audience={productAudience(product)}
            seatCount={product.seat_count}
            waitlistEnabled={product.waitlist_enabled}
            voiceAvailable={voiceAvailable}
            voiceIsOpen={voice.voiceIsOpen}
            opensDate={voice.opensDate}
            opensTime={voice.opensTime}
          />
        </div>

        <ProductDetailsCard
          product={product}
          plannedSessions={plannedSessions}
          topicName={topicName}
          uiLocale={uiLocale}
          timeZone={timeZone}
          t={t}
          c={c}
        />
      </div>

      {/* What happened *inside* a group — its standing notes, its site's, its
          roster and its whole session record — is not composed on this page.
          Each group's header above links to its own page, which renders the
          gedu's workspace for that group unchanged. */}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header — image, type kicker, name, description, status + visibility
// pills, and the Clone and Edit buttons.
// ──────────────────────────────────────────────────────────────────────
function HeaderCard({
  imagePath,
  kicker,
  title,
  description,
  statusKey,
  isVisible,
  listedLabel,
  unlistedLabel,
  editHref,
  editLabel,
  cloneHref,
  cloneLabel,
}: {
  imagePath: string | null;
  kicker: string;
  title: string;
  description: string | null;
  statusKey: EffectiveProductStatus;
  isVisible: boolean;
  listedLabel: string;
  unlistedLabel: string;
  editHref: AppHref;
  editLabel: string;
  cloneHref: AppHref;
  cloneLabel: string;
}) {
  return (
    <header>
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
          {/* The project ratio here too (owner rule — one aspect ratio wherever
              a product image shows), shaped the way the shop card shapes it —
              rounded, borderless: this header is where an admin looks at a
              product they manage, and it must show the same crop the family
              surfaces paint. w-40 lands near the old square's 112px height. */}
          <ProductBanner
            src={catalogueImageSrc("product", imagePath)}
            className="w-40 shrink-0 rounded-md"
            // `w-40` in both arrangements — the card stacks below `sm` but the
            // width is fixed, not fluid, so one length covers every breakpoint.
            sizes="160px"
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
              <ProductStatusChip status={statusKey} />
              <Badge variant="outline">
                {isVisible ? listedLabel : unlistedLabel}
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
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Product details — every stored property of the product, as label/value
// rows in short named sections. One scan answers "is this product set up
// the way I expect?", and the edit form is never the read path.
// ──────────────────────────────────────────────────────────────────────

/**
 * `Wednesday, August 19, 2026` in en; `keskiviikko 19. elokuuta 2026` in fi —
 * the weekday spelled out in full and the rest left to `Intl`, because the
 * whole point of the first/last session facts is *which day of the week* a
 * family turns up, and an abbreviation is the one part of the answer a reader
 * has to decode. UTC-pinned like every bare calendar date on this page.
 */
const SESSION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};

function ProductDetailsCard({
  product,
  plannedSessions,
  topicName,
  uiLocale,
  timeZone,
  t,
  c,
}: {
  product: ProductAdminDetailRow;
  /** The product's plan; `undefined` only when the read failed. */
  plannedSessions: readonly PlannedSession[] | undefined;
  topicName: string | null;
  uiLocale: string;
  timeZone: string;
  t: ReturnType<typeof useTranslations<"admin.products">>;
  c: ReturnType<typeof useTranslations<"common">>;
}) {
  const isMuni = product.product_type === "municipality_club";
  // The invoice customer's own namespace, so the label over the row below and
  // the label over the picker that sets it are one string rather than two that
  // can drift apart.
  const tInvoiceCustomers = useTranslations("admin.invoiceCustomers");
  // Same flag the form reads, so a type with no region-lock control has no
  // region-lock row here either — an empty "Not region locked" line on a
  // municipality club would advertise a setting that does not exist for it.
  const { regionLockable, followsHolidayCalendars } =
    PRODUCT_TYPE_CONFIG[product.product_type];
  // Country names in the admin's own language, the config's English `name` as
  // the fallback, and the raw stored code as the last resort — the last one
  // covers a code no longer in the config at all, which must still be visible
  // rather than silently reading as unlocked. That whole chain lives in
  // `countryDisplayName`, shared with the shop panel: it is the same four links
  // in the same order, and it is where the two load-bearing details of the
  // `Intl` call are written down — `"en"` named as the second language so the
  // answer is the same on the server and on every visitor's machine (a bare
  // `[locale]` falls back to the *runtime* default and hydrates differently),
  // and `fallback: "none"` so the fallbacks below it are reachable at all.
  const regionLockName =
    product.region_lock_country === null
      ? null
      : countryDisplayName(product.region_lock_country, uiLocale);
  // The family-facing tag words, so this row and the shop card cannot disagree
  // about what a tag is called. Plain text, no chip: this is the admin panel,
  // and the chip treatment belongs to the surfaces families read.
  const tTag = useTranslations("productTag");
  // The document names, from the same namespace the shop panel labels its
  // checkboxes with, so the admin reading this row and the parent ticking the
  // box are looking at one name for one document.
  const tConsent = useTranslations("consentDocuments.names");
  // The admin-facing names of the two optional asks — the same labels the form's
  // rows carry, so the details page and the edit form call one thing one thing.
  const tAsks = useTranslations("admin.products.consents");
  const tConsentBundle = useTranslations("consentDocuments.bundles");
  // The words a family reads in the shop's "Good to know" card, for the values
  // of the four facts that card states — "Online", "Ages 8–12", "For
  // families" — so an admin checking what a family is told reads it verbatim.
  // The labels beside them are the admin panel's own.
  const tFamily = useTranslations("productDetail.info");
  const tAudience = useTranslations("productAudience");
  // The clock the zone label's offset is read at — request-stable, so the
  // server and the first client render agree across a DST transition.
  const now = useNow();

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
              ? "inline-flex items-center gap-1 text-destructive"
              : "text-muted-foreground"
          }
        >
          {nullStatus === "unknown" && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
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

  /**
   * The weekly schedule, through the same formatter and line renderer the
   * shop's "Good to know" card uses, so the days and times read here exactly as
   * a family reads them: clock faces in the viewer's zone, named when that is
   * not the product's own.
   *
   * Without the club term range the shop folds in under the schedule: the term
   * dates row right below states it, with the admin-only week readout beside
   * it, and folding it in as well would state the range twice.
   */
  const scheduleLines = renderScheduleLinesForDetail(
    formatProductSchedule({ product, locale: uiLocale, timeZone, now }),
  );

  // A club's term range (shared with the family surfaces via
  // `formatClubTermDates`). Camps and events carry their dates inside the
  // schedule row instead, so the helper returns null for them.
  const termDates = formatClubTermDates(product, uiLocale);

  // `wk 34–50 · 17 weeks`, appended to the term range above — see
  // `formatAdminTermWeeks` for why it is not part of the range itself.
  const termWeeks =
    termDates === null ? null : formatAdminTermWeeks(product, c);

  /**
   * The first and last days a family actually turns up.
   *
   * `start_date`/`end_date` and the weekly pattern are stored independently, so
   * an admin could save a Monday start for a Wednesday club and every surface
   * reading the column told families it "starts Monday" when the first session
   * was two days later. These two facts are the audit: the derived dates are
   * readable on the details page, so checking what a family is told costs a
   * glance rather than opening the edit form (a write surface) to infer it.
   *
   * Both are read off the product's plan, the same dates every other surface
   * lists. Events are excluded because their single date *is* the session —
   * it would restate the date the schedule row already gives.
   *
   * Whether each row exists is decided from the product row alone, so a plan
   * read that failed leaves the rows in place with no date in them.
   */
  const showSessionDates =
    product.product_type !== "event" && product.schedule_slots.length > 0;
  const showFirstSession = showSessionDates;
  const showLastSession = showSessionDates && product.end_date !== null;
  const formatSessionDate = (session: PlannedSession | undefined) =>
    session === undefined
      ? null
      : formatDateOnly(session.date, uiLocale, SESSION_DATE_FORMAT);
  const firstSession = formatSessionDate(plannedSessions?.[0]);
  const lastSession = formatSessionDate(plannedSessions?.at(-1));

  // Where the product happens, and who it is for — the shop card's own rules
  // (`formatProductLocation`, `productWhoItsFor`), so the label each row wears
  // follows the same shape: "Format" for a genuinely remote product and "Where"
  // for one with a place behind it; "Age range" where the answer is a range and
  // "Audience" where it leads with the audience word.
  const location = formatProductLocation(product, uiLocale);
  const labelIsFormat = productLocationLabelIsFormat(product.is_remote, location);
  const whoItsFor = productWhoItsFor(product);

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

  // `null` when the embed came back empty — the creator's profile is gone or
  // not readable — and an admin who has left is, by the owner's ruling, an
  // unknown creator rather than a gap in the record.
  const creator = product.creator;
  const creatorName = personName(creator);
  const publicPath = publicProductPath(product);
  const headingId = useId();

  return (
    // Laid out by its own width rather than the screen's: from `xl` it is the
    // reference column, one section under another; below that it spans the
    // page, and there its sections pair up two by two rather than run as one
    // long thin list.
    <section aria-labelledby={headingId} className="min-w-0">
      <Card className="@container">
        <CardContent className="p-4 sm:p-5">
          <h2 id={headingId} className="text-base font-semibold">
            {t("detailsPage.title")}
          </h2>
          <div className="mt-3 grid grid-cols-1 items-start gap-x-8 gap-y-5 @3xl:grid-cols-2">
            <DetailsSection title={t("detailsPage.sections.schedule")}>
              <DetailRow label={t("labels.schedule")}>
                {scheduleLines.length === 1 ? (
                  <ScheduleLine line={scheduleLines[0]} />
                ) : (
                  <ul className="space-y-0.5">
                    {scheduleLines.map((line, idx) => (
                      <li key={idx}>
                        <ScheduleLine line={line} />
                      </li>
                    ))}
                  </ul>
                )}
              </DetailRow>

              {termDates && (
                <DetailRow label={t("detailsPage.fields.termDates")}>
                  {termDates}
                  {termWeeks && (
                    <span className="tabular-nums text-muted-foreground">
                      {` · ${termWeeks}`}
                    </span>
                  )}
                </DetailRow>
              )}

              {/* Directly after the term range: the same span, read as the days
                  a family is actually expected. */}
              {showFirstSession && (
                <DetailRow label={t("detailsPage.fields.firstSession")}>
                  {firstSession}
                </DetailRow>
              )}

              {showLastSession && (
                <DetailRow label={t("detailsPage.fields.lastSession")}>
                  {lastSession}
                </DetailRow>
              )}

              {/* After the session dates, because a break is dates missing from
                  that same span. Clubs only, on the flag the form reads: no other
                  type may follow a calendar, so an empty row on a camp would
                  advertise a setting that does not exist for it. The names ride
                  on the product read itself, so nothing here arrives late. */}
              {followsHolidayCalendars && (
                <DetailRow label={t("holidayCalendars.label")}>
                  {product.product_holiday_calendars.length === 0 ? (
                    <span className="text-muted-foreground">
                      {t("holidayCalendars.none")}
                    </span>
                  ) : (
                    <ul className="space-y-0.5">
                      {/* By name, as the calendar list orders them: the embed
                          arrives in no order of its own. */}
                      {product.product_holiday_calendars
                        .map((link) => link.holiday_calendars)
                        .sort((a, b) =>
                          a.name.localeCompare(b.name, formattingLocale(uiLocale)),
                        )
                        .map((calendar) => (
                          <li key={calendar.id}>
                            <Link
                              href={ROUTES.admin.holidayCalendar(calendar.id)}
                              className="underline-offset-2 hover:underline"
                            >
                              {calendar.name}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  )}
                </DetailRow>
              )}

              {/* The zone the schedule is authored in — the stored property, as
                  distinct from the viewer-converted times the schedule row above
                  shows. Same label the edit form's dropdown uses, so the two
                  cannot disagree about what a zone is called. */}
              <DetailRow label={t("detailsPage.fields.timezone")}>
                {formatTimezoneOptionLabel(product.timezone, now)}
              </DetailRow>
            </DetailsSection>

            <DetailsSection title={t("detailsPage.sections.placeAndAudience")}>
              <DetailRow
                label={
                  labelIsFormat
                    ? t("detailsPage.fields.format")
                    : t("sections.where")
                }
              >
                {renderProductLocationLine({
                  location,
                  isRemote: product.is_remote,
                  online: tFamily("online"),
                  tbd: tFamily("tbd"),
                })}
              </DetailRow>

              {/* Null only for a row carrying neither an audience label nor an
                  age range, which the schema's CHECKs make unreachable — the row
                  is left out rather than rendered empty. */}
              {whoItsFor !== null && (
                <DetailRow
                  label={
                    whoItsFor.label === "ageRange"
                      ? t("detailsPage.fields.ageRange")
                      : t("sections.audience")
                  }
                >
                  {whoItsFor.value.kind === "ages"
                    ? tFamily("ages", whoItsFor.value)
                    : whoItsFor.value.kind === "parents"
                      ? tAudience("parents")
                      : whoItsFor.value.kind === "families"
                        ? tAudience("families")
                        : tAudience("familiesWithAges", whoItsFor.value)}
                </DetailRow>
              )}

              <DetailRow label={t("labels.spokenLanguage")}>
                <LanguageFlag code={product.spoken_language_code} />
              </DetailRow>

              <DetailRow label={t("detailsPage.fields.topic")}>
                {topicName ?? (
                  <span className="text-muted-foreground">{c("notSet")}</span>
                )}
              </DetailRow>

              {/* Untagged is the ordinary state rather than a gap in the setup, so
                  it says so in muted text — the same word the form's picker
                  offers — instead of the "not set" the topic above uses for a
                  missing answer. */}
              <DetailRow label={t("detailsPage.fields.tag")}>
                {product.tag === null ? (
                  <span className="text-muted-foreground">{t("tagOptions.none")}</span>
                ) : (
                  tTag(productTagLabelKey(product.tag))
                )}
              </DetailRow>

              {/* Not region locked is the ordinary state rather than a gap, so it
                  says so in muted text — the same words the form's picker offers —
                  the way the untagged row above does. The hint about UI-only
                  enforcement is not repeated here: it belongs where the setting
                  is made.

                  The row also appears on a type that cannot be locked, if one
                  somehow carries a lock: the shop enforces the column regardless
                  of the product's type, so a stored value has to be visible to the
                  admins answering for it rather than hidden by the setting's own
                  availability. Nothing today can produce that pairing — it is one
                  cheap condition against a state that would otherwise be
                  silent. */}
              {(regionLockable || product.region_lock_country !== null) && (
                <DetailRow label={t("detailsPage.fields.regionLock")}>
                  {regionLockName === null ? (
                    <span className="text-muted-foreground">
                      {t("regionLock.none")}
                    </span>
                  ) : (
                    regionLockName
                  )}
                </DetailRow>
              )}
            </DetailsSection>

            <DetailsSection title={t("detailsPage.sections.seatsAndRegistration")}>
              <DetailRow label={t("detailsPage.fields.seats")}>
                {seatsLine}
                {waitlistSuffix}
              </DetailRow>

              <DetailRow label={t("detailsPage.fields.registrationOpensAt")}>
                {formatDate(product.registration_opens_at, uiLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                })}
              </DetailRow>
            </DetailsSection>

            <DetailsSection title={t("detailsPage.sections.pricing")}>
              <DetailRow label={t("detailsPage.fields.billingMode")}>
                <span>{t(`detailsPage.billingMode.${product.billing_mode}`)}</span>
                {priceLines.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {priceLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </DetailRow>

              <DetailRow label={t("detailsPage.fields.primaryGeduFee")}>
                {renderFee(product.primary_gedu_fee_cents, "unknown")}
              </DetailRow>

              <DetailRow label={t("detailsPage.fields.assistantGeduFee")}>
                {renderFee(product.assistant_gedu_fee_cents, "none")}
              </DetailRow>

              {isMuni && (
                <DetailRow label={t("detailsPage.fields.municipalityFee")}>
                  {renderFee(product.municipality_fee_cents, "unknown")}
                </DetailRow>
              )}

              {/* Under the fee, because the two are one arrangement: what a
                  session is worth, and who is billed for it. The label is the
                  picker's own, so the form and this page call one thing one thing.

                  The customer's name and number arrive embedded in the product
                  read, so the row paints whole with everything around it. */}
              {isMuni && (
                <DetailRow label={tInvoiceCustomers("picker.label")}>
                  {product.invoice_customer === null ? (
                    <span className="text-muted-foreground">{c("notSet")}</span>
                  ) : (
                    <Link
                      href={ROUTES.admin.invoiceCustomer(product.invoice_customer.id)}
                      className="underline-offset-2 hover:underline"
                    >
                      {tInvoiceCustomers("picker.option", {
                        name: product.invoice_customer.invoice_name,
                        number: product.invoice_customer.fennoa_customer_no,
                      })}
                    </Link>
                  )}
                </DetailRow>
              )}
            </DetailsSection>

            <DetailsSection title={t("detailsPage.sections.requirements")}>
              {/* The enrolment conditions. Always rendered, on every type,
                  because the setting exists on every type — "None" is the
                  ordinary answer and an absent row would leave an admin unable to
                  tell "requires nothing" apart from "this page does not say".

                  A slug this deploy cannot name renders as the raw slug, which is
                  the same loud-not-broken answer the form's checkbox gives:
                  registry rows arrive by migration and the name map ships with
                  them, so an unnamed slug is a defect worth seeing rather than a
                  state worth hiding.

                  Bundled documents are reported as the bundle, because that is
                  the unit the form offered — an admin who ticked one box should
                  not read two lines back and wonder what they picked. Anything
                  outside a bundle is still listed on its own. */}
              <DetailRow label={t("detailsPage.fields.requiredConsents")}>
                {product.product_required_consents.length === 0 ? (
                  <span className="text-muted-foreground">{t("consents.none")}</span>
                ) : (
                  <ul>
                    {describeRequiredConsents(
                      product.product_required_consents.map((c) => c.document_slug),
                    ).map((row) => {
                      if (row.kind === "bundle") {
                        return (
                          <li key={row.key}>{tConsentBundle(row.bundle.labelKey)}</li>
                        );
                      }
                      const meta = consentDocumentMeta(row.slug);
                      return (
                        <li key={row.key}>
                          {meta === null ? row.slug : tConsent(meta.nameKey)}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </DetailRow>

              {/* The two optional asks, in the order the signup panel asks them
                  and directly under the conditions they sit beside on that panel.

                  **Always rendered, both of them, and that is the rule rather than
                  a preference**: an admin must be able to read every stored
                  property of a product off this page, because the edit form is a
                  write surface and opening it to answer "is this asked?" costs a
                  form that can be accidentally submitted. "None" is the ordinary
                  answer on nearly every product, and it is a different answer
                  from a row that is not here.

                  A stored type this deploy cannot name is dropped rather than
                  shown raw — the opposite of what the required row above does with
                  an unknown slug, and the same asymmetry the family-facing
                  describe helpers make. A required document that vanished from
                  the app is a legal condition nobody can see; an ask that vanished
                  simply goes unasked, and a bare enum value would say less than
                  the count does. */}
              <DetailRow label={t("detailsPage.fields.gamerPhotoConsents")}>
                {product.product_gamer_photo_consents.length === 0 ? (
                  <span className="text-muted-foreground">{t("consents.none")}</span>
                ) : (
                  <ul>
                    {describeGamerPhotoConsents(
                      product.product_gamer_photo_consents.map((c) => c.consent_type),
                    ).map((row) => (
                      <li key={row.type}>
                        {tAsks(`gamerPhoto.${row.ask.sentenceKey}.label`)}
                      </li>
                    ))}
                  </ul>
                )}
              </DetailRow>

              <DetailRow label={t("detailsPage.fields.marketingConsents")}>
                {product.product_marketing_consents.length === 0 ? (
                  <span className="text-muted-foreground">{t("consents.none")}</span>
                ) : (
                  <ul>
                    {describeMarketingConsents(
                      product.product_marketing_consents.map((c) => c.consent_type),
                    ).map((row) => (
                      <li key={row.type}>
                        {tAsks(`marketing.${row.ask.sentenceKey}.label`)}
                      </li>
                    ))}
                  </ul>
                )}
              </DetailRow>

              {/* Staff-only, and it lives on its own embedded row for exactly
                  that reason — `products` is anon-readable by column selection,
                  so the lesson link cannot be a column on it. */}
              {product.product_staff_details?.material_url && (
                <DetailRow label={t("detailsPage.fields.materialUrl")}>
                  <a
                    href={product.product_staff_details.material_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-act underline-offset-2 hover:underline"
                  >
                    {product.product_staff_details.material_url}
                  </a>
                </DetailRow>
              )}

              {/* The form's other staff-only field, beside the lesson link above
                  it. Always rendered, for the same reason required consents is
                  above: "not required" is the ordinary answer, and a row that only
                  appears when the flag is on would leave an admin unable to tell
                  "off" from "this page does not say". */}
              <DetailRow label={t("detailsPage.fields.requiresGamerCreations")}>
                {product.requires_gamer_creations ? (
                  t("detailsPage.requiresGamerCreations.required")
                ) : (
                  <span className="text-muted-foreground">
                    {t("detailsPage.requiresGamerCreations.notRequired")}
                  </span>
                )}
              </DetailRow>
            </DetailsSection>

            <DetailsSection title={t("detailsPage.sections.record")}>
              {/* First in the record: where a family meets this product, the
                  one fact here an admin copies away rather than checks. It is
                  a row like the rest so the header stays the product's name and
                  status; the URL breaks anywhere, so a long product id wraps
                  inside the value rather than widening the column. */}
              {publicPath !== null && (
                <DetailRow label={t("detailsPage.fields.publicLink")}>
                  <PublicProductLink path={publicPath} />
                </DetailRow>
              )}

              <DetailRow label={t("detailsPage.fields.createdBy")}>
                {creator !== null && creatorName !== null ? (
                  <Link
                    href={ROUTES.admin.user(creator.id)}
                    className="underline-offset-2 hover:underline"
                  >
                    {creatorName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    {t("detailsPage.unknownCreator")}
                  </span>
                )}
              </DetailRow>

              {/* An instant, so the date is the one it was in the viewer's zone. */}
              <DetailRow label={t("detailsPage.fields.createdOn")}>
                {formatDate(product.created_at, uiLocale, {
                  dateStyle: "medium",
                  timeZone,
                })}
              </DetailRow>
            </DetailsSection>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * One named run of facts. The heading is furniture — small, muted, caps and
 * tracked — and every section's heading wears the same treatment.
 *
 * Each section is its own size container, so its rows are laid out by the
 * width of the column they are in: when the card pairs its sections up, a row
 * answers to its half, not to the whole card.
 */
function DetailsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="@container min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h3>
      <dl className="mt-1 divide-y divide-border">{children}</dl>
    </section>
  );
}

/**
 * One fact, laid out by its section's width.
 *
 * In a narrow section — the rail beside the groups, or one half of a narrow
 * two-up card — the label sits above the value as a small muted line and the
 * value takes the full width, because a fixed label column there would leave
 * the value a sliver to wrap in. From `@md` (28rem) the label moves into a
 * fixed 8rem column beside the value, which still leaves the value at least
 * ~300px; there the two share a type size, so their first lines sit on one
 * baseline whichever of them wraps.
 */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 @md:grid-cols-[8rem_minmax(0,1fr)] @md:items-baseline @md:gap-x-3 @md:gap-y-0">
      <dt className="text-xs text-muted-foreground @md:text-sm">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * The path a family meets this product at.
 *
 * Every type but one is sold from the storefront's single `/shop/[id]` route. A
 * municipality club is not in the shop at all: it is listed on its town's own
 * `/schools/<slug>` page, and its link has to carry that slug. The slug is
 * derived from the municipality's **canonical** name rather than the admin's
 * locale rendering of it, because this URL is written down and sent to somebody
 * else — a link should not depend on which language the person who copied it had
 * their panel in. Both spellings resolve to the same town when the page reads
 * them back, so the canonical one is simply the stable choice.
 *
 * `null` when a municipality club carries no location: there is no school page
 * for it, and the `/shop` path would name a listing that excludes the type.
 * Nothing today can save such a club — the DB CHECK demands the location — so
 * this is the cheap branch against a state that would otherwise render a link
 * to nowhere.
 */
function publicProductPath(product: ProductAdminDetailRow): string | null {
  if (product.product_type !== "municipality_club") {
    return ROUTES.shopProductPath(product.id);
  }
  const municipality = municipalityOf(product.locations);
  if (municipality === null) return null;
  return ROUTES.schoolMunicipalityProductPath(
    municipalitySlug(municipality.name),
    product.id,
  );
}

/**
 * The product's public URL in full, and a button that puts it on the clipboard.
 *
 * Shown rather than hidden behind a bare "Copy link" button because the two
 * things an admin does with this are paste it and *check* it — a municipality
 * club's path carries a town slug, and getting that wrong is a link that 404s
 * for a whole town.
 *
 * The origin comes from `window.location`: the admin is reading the page on the
 * very deployment the link belongs to, so what they copy is what they can open
 * in the next tab. Reading it during render needs no mount effect — the details card
 * paints only after the admin product query resolves, which cannot happen
 * server-side because nothing prefetches it — and no mount effect means no
 * post-paint swap from a bare path to an absolute URL under the reader's eyes.
 */
function PublicProductLink({ path }: { path: string }) {
  const t = useTranslations("admin.products");
  const { copied, copy } = useCopyToClipboard();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}${path}`;
  const copyLabel = copied ? t("detailsPage.copied") : t("detailsPage.copyLink");

  return (
    <span className="flex items-start gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all text-act underline-offset-2 hover:underline"
      >
        {url}
      </a>
      {/* The confirmation is an icon swap inside a fixed-size button, so it
          lands in exactly the footprint the copy icon had: nothing on the card
          moves, and the URL beside it does not reflow. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6 shrink-0", copied && "text-success")}
        onClick={() => void copy(url)}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {copied ? (
          <Check aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Copy aria-hidden className="h-3.5 w-3.5" />
        )}
      </Button>
    </span>
  );
}
