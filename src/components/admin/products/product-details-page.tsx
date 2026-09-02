"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  Coins,
  Copy,
  FileCheck,
  Landmark,
  Link2,
  MapPin,
  Pencil,
  Shapes,
  Sparkles,
  Tag,
  Ticket,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ROUTES, SUPPORTED_CURRENCIES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { municipalityOf } from "@/lib/locations/embedded-chain";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import { cn, formatCurrencyFromCents, formatDate } from "@/lib/utils";
import { ProductBanner } from "@/components/ui/product-banner";
import { productImageSrc } from "@/lib/images/product-image-url";
import { productAudience } from "@/components/public/products/product-audience";
import { ProductOverviewCard } from "@/components/public/products/product-overview-card";
import { formatClubTermDates } from "@/components/public/products/format-product-term-dates";
import { productTagLabelKey } from "@/components/public/products/product-tag";
import { countryDisplayName } from "@/components/public/products/region-lock/region-gate";
import {
  consentDocumentMeta,
  describeRequiredConsents,
} from "@/lib/constants/consent-documents";
import {
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
import { GroupsPanel } from "./groups/groups-panel";
import { ProductStatusChip } from "./product-status-chip";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductDetailsPageProps {
  productType: ProductType;
  productId: string;
}

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
      <div className="space-y-6" data-reserve-scroll-gutter>
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
      <div className="space-y-6" data-reserve-scroll-gutter>
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
  const status = effectiveStatus(product, now, 0);
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
    <div className="space-y-6" data-reserve-scroll-gutter>
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
        isVisible={product.is_visible}
        listedLabel={t("detailsPage.listed")}
        unlistedLabel={t("detailsPage.unlisted")}
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

      {/* What happened *inside* a group — its standing notes, its site's, its
          roster and its whole session record — is no longer re-composed at the
          foot of this page. Each group's header above links to its own page,
          which renders the gedu's workspace for that group unchanged. */}
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
  editHref: string;
  editLabel: string;
  cloneHref: string;
  cloneLabel: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        {/* The project ratio here too (owner rule — one aspect ratio wherever
            a product image shows), shaped the way the shop card shapes it —
            rounded, borderless: this header is where an admin looks at a
            product they manage, and it must show the same crop the family
            surfaces paint. w-40 lands near the old square's 112px height. */}
        <ProductBanner
          src={productImageSrc(imagePath)}
          className="w-40 shrink-0 rounded-md"
          // `w-40` in both arrangements — the card stacks below `sm` but the
          // width is fixed, not fluid, so one length covers every breakpoint.
          sizes="160px"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {kicker}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProductStatusChip status={statusKey} />
            {/* Neutral in both states, because the amber fill it used to wear
                sat directly beside the status chip's own amber fill for a
                running product — two identical pills, two unrelated facts, in
                the one row an admin scans first. Amber is the act colour and a
                listing is a state, so the visibility mark converges on the list
                row's own treatment: quiet, and readable as a pair. */}
            <Badge variant={isVisible ? "outline" : "secondary"}>
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
  );
}

// ──────────────────────────────────────────────────────────────────────
// Operational facts grid — the admin-only fields the parent-facing "When &
// where" card (rendered above this on the page) doesn't carry: club term
// dates, capacity/waitlist, registration window, billing + prices and topic.
// One scan answers "is this product set up the way I expect?".
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
  // Same flag the form reads, so a type with no region-lock control has no
  // region-lock row here either — an empty "Not region locked" line on a
  // municipality club would advertise a setting that does not exist for it.
  const { regionLockable } = PRODUCT_TYPE_CONFIG[product.product_type];
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
  const tConsentBundle = useTranslations("consentDocuments.bundles");

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

  // Where a family meets this product. `null` only for a municipality club with
  // no location at all — there is no school page to point at, and a `/shop`
  // link would name a listing that deliberately excludes the type.
  const publicPath = publicProductPath(product);

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
        {/* First, and across the width: it is the one fact on this card an
            admin comes here to take away rather than to check, and a product id
            in a URL needs the room. */}
        {publicPath && (
          <Fact
            icon={Link2}
            label={t("detailsPage.fields.publicUrl")}
            className="sm:col-span-2"
          >
            <PublicProductLink path={publicPath} />
          </Fact>
        )}

        {termDates && (
          <Fact
            icon={Calendar}
            label={t("detailsPage.fields.termDates")}
            tone="when"
          >
            {termDates}
          </Fact>
        )}

        {/* The seats glyph is the list row's ticket rather than the clock it
            used to be: one fact wears one glyph on both admin surfaces, and a
            clock beside a capacity would have put the wrong grammar family's
            shape on a people fact. */}
        <Fact icon={Ticket} label={t("detailsPage.fields.seats")} tone="people">
          {seatsLine}
          {waitlistSuffix}
        </Fact>

        {/* A globe cannot say *when* registration opens, and this row says
            nothing else — so it takes the calendar-clock the schedule rows use
            and the time family with it. */}
        <Fact
          icon={CalendarClock}
          label={t("detailsPage.fields.registrationOpensAt")}
          tone="when"
        >
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

        {/* Untagged is the ordinary state rather than a gap in the setup, so it
            says so in muted text — the same word the form's picker offers —
            instead of the "not set" the topic above uses for a missing answer. */}
        <Fact icon={Tag} label={t("detailsPage.fields.tag")}>
          {product.tag === null ? (
            <span className="text-muted-foreground">{t("tagOptions.none")}</span>
          ) : (
            tTag(productTagLabelKey(product.tag))
          )}
        </Fact>

        {/* Not region locked is the ordinary state rather than a gap, so it says
            so in muted text — the same words the form's picker offers — the way
            the untagged row above does. The hint about UI-only enforcement is
            not repeated here: it belongs where the setting is made.

            The row also appears on a type that cannot be locked, if one somehow
            carries a lock: the shop enforces the column regardless of the
            product's type, so a stored value has to be visible to the admins
            answering for it rather than hidden by the setting's own
            availability. Nothing today can produce that pairing — it is one
            cheap condition against a state that would otherwise be silent. */}
        {(regionLockable || product.region_lock_country !== null) && (
          <Fact icon={MapPin} label={t("detailsPage.fields.regionLock")}>
            {regionLockName === null ? (
              <span className="text-muted-foreground">
                {t("regionLock.none")}
              </span>
            ) : (
              regionLockName
            )}
          </Fact>
        )}

        {/* The enrolment conditions. Always rendered, on every type, because
            the setting exists on every type — "None" is the ordinary answer and
            an absent row would leave an admin unable to tell "requires nothing"
            apart from "this page does not say".

            A slug this deploy cannot name renders as the raw slug, which is the
            same loud-not-broken answer the form's checkbox gives: registry rows
            arrive by migration and the name map ships with them, so an unnamed
            slug is a defect worth seeing rather than a state worth hiding.

            Bundled documents are reported as the bundle, because that is the
            unit the form offered — an admin who ticked one box should not read
            two lines back and wonder what they picked. Anything outside a
            bundle is still listed on its own. */}
        <Fact icon={FileCheck} label={t("detailsPage.fields.requiredConsents")}>
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
        </Fact>

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

        {/* The form's other staff-only field, beside the lesson link above it.
            Always rendered, for the same reason required consents is above:
            "not required" is the ordinary answer, and a row that only appears
            when the flag is on would leave an admin unable to tell "off" from
            "this page does not say". */}
        <Fact
          icon={Sparkles}
          label={t("detailsPage.fields.requiresGamerCreations")}
        >
          {product.requires_gamer_creations ? (
            t("detailsPage.requiresGamerCreations.required")
          ) : (
            <span className="text-muted-foreground">
              {t("detailsPage.requiresGamerCreations.notRequired")}
            </span>
          )}
        </Fact>
      </CardContent>
    </Card>
  );
}

/**
 * The two kinds of fact on this card that are worth finding *before* they are
 * read, and the family each one speaks.
 *
 * The card is a dozen labelled cells in two columns, and an admin arrives at it
 * with one of a few questions — when does this run, how many fit, is the money
 * filled in. Two of those are brand families with a settled word: **when** is
 * wit (the knowledge family, which owns time everywhere in the app), **how many
 * people** is harmony. Toning their glyphs turns the icon column into an index
 * an admin can sweep without reading a label.
 *
 * **Everything else stays neutral, deliberately.** Money is not a brand family
 * and keeps its status tones (a missing fee is destructive, a set one is plain);
 * place, category, tag and the consent list are one-off facts a colour would not
 * help anyone find faster. Admin surfaces get less colour than family ones by
 * standing rule, and a card where every glyph is coloured is a card where the
 * colour has stopped saying anything.
 *
 * Ink only, never a fill: this is the label strength of the axis, and wit's ink
 * is always the soft variant — the strong one cannot carry a glyph this size on
 * this ground.
 */
const FACT_TONE = {
  /** A date, a term, a registration window — time is wit. */
  when: "text-yty-wit-soft",
  /** Seats, capacity, headcount — people are harmony. */
  people: "text-yty-harmony-soft",
} as const;

function Fact({
  icon: Icon,
  label,
  tone,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Which grammar family this fact belongs to; neutral when omitted. */
  tone?: keyof typeof FACT_TONE;
  /** Grid placement for a fact that wants more than its one cell. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === undefined ? "text-muted-foreground" : FACT_TONE[tone],
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
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
    return ROUTES.shopProduct(product.id);
  }
  const municipality = municipalityOf(product.locations);
  if (municipality === null) return null;
  return ROUTES.schoolMunicipalityProduct(
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
 * in the next tab. Reading it during render needs no mount effect — this card
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
        className="min-w-0 break-all text-primary underline-offset-2 hover:underline"
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
