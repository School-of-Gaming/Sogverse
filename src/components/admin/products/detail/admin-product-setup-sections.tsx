"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Coins,
  ExternalLink,
  Globe2,
  Landmark,
  Languages,
  MapPin,
  Palmtree,
  Shapes,
  Tag,
  Ticket,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { formatCurrencyFromCents, formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useLanguageNames } from "@/hooks/use-language-names";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { formatClubTermDates } from "@/components/public/products/format-product-term-dates";
import { formatWeekday } from "@/components/public/products/format-product-schedule";
import { productTagLabelKey } from "@/components/public/products/product-tag";
import { countryDisplayName } from "@/components/public/products/region-lock/region-gate";
import { SiteNotesPanel, type SiteNotesDraft } from "@/components/gedu/session-details/SiteNotesPanel";
import type { ProductSite } from "@/components/gedu/session-details/GeduProductPageBody";
import type { ProductAdminDetailRow } from "@/services/products";
import { joinParts } from "../join-parts";
import { PRODUCT_TYPE_CONFIG } from "../product-type-config";
import { Fact, FactGrid } from "./admin-product-fact";

/**
 * **How it runs** — every operational fact about the product's schedule, its
 * calendar, its registration window and the place it happens.
 *
 * These are all stored columns, and every one of them is here rather than on the
 * edit form alone. The rule the redesign works to is that an admin should never
 * have to open a form to *read* something: an edit page is a set of controls in
 * the order they are convenient to fill in, which is a terrible order to answer a
 * question from, and it makes reading a fact indistinguishable from being about
 * to change it.
 *
 * The venue's two standing notes are edited **in place**, because they are the
 * one thing here that a gedu can already edit and an admin could not even see.
 * The panel is the gedu's own, caveat and all: these notes belong to the site,
 * so a save touches every product running there, and that sentence has to be on
 * screen while somebody types into it.
 */
export function AdminProductHowItRuns({
  product,
  site,
  municipalityName,
  siteNotesEditing,
  onSiteNotesEditingChange,
  onSaveSiteNotes,
}: {
  product: ProductAdminDetailRow;
  site: ProductSite | null;
  municipalityName: string | null;
  siteNotesEditing: boolean;
  onSiteNotesEditingChange: (editing: boolean) => void;
  onSaveSiteNotes: (draft: SiteNotesDraft) => void | Promise<void>;
}) {
  const t = useTranslations("admin.products");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const languageName = useLanguageNames();

  const termDates = formatClubTermDates(product, uiLocale);
  // The junction's `calendar_id` is a NOT-NULL FK, so the embedded calendar is
  // never null — no filtering, and no optional chain to imply otherwise.
  const calendars = product.product_holiday_calendars.map(
    (link) => link.holiday_calendars.name,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <FactGrid>
            <Fact icon={CalendarClock} label={t("detail.fields.slots")}>
              {product.schedule_slots.length === 0 ? (
                <span className="text-muted-foreground">{c("notSet")}</span>
              ) : (
                <ul className="space-y-0.5">
                  {[...product.schedule_slots]
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((slot, index) => (
                      <li key={index}>
                        {joinParts([
                          `${formatWeekday(slot.weekday, uiLocale, "long")} ${slot.start_time.slice(0, 5)}`,
                          t("detailsPage.minutes", {
                            count: slot.duration_minutes,
                          }),
                        ])}
                      </li>
                    ))}
                </ul>
              )}
            </Fact>

            {/* The authoring zone, spelled out. Every clock face above is in the
                product's own zone; every clock face elsewhere on this page is in
                the viewer's. Saying which is which once, here, is what stops the
                two being read as the same number. */}
            <Fact icon={Globe2} label={t("detail.fields.timezone")}>
              {product.timezone}
            </Fact>

            {termDates !== null && (
              <Fact icon={CalendarRange} label={t("detailsPage.fields.termDates")}>
                {termDates}
              </Fact>
            )}

            <Fact icon={CalendarDays} label={t("detail.fields.dates")}>
              {product.start_date === null ? (
                <span className="text-muted-foreground">{c("notSet")}</span>
              ) : (
                <>
                  {product.start_date}
                  {product.end_date !== null && ` – ${product.end_date}`}
                </>
              )}
            </Fact>

            <Fact icon={Palmtree} label={t("detailsPage.fields.holidayCalendars")}>
              {calendars.length === 0 ? (
                <span className="text-muted-foreground">{t("detail.noCalendars")}</span>
              ) : (
                calendars.join(", ")
              )}
            </Fact>

            <Fact icon={Users} label={t("detailsPage.fields.signupThreshold")}>
              {product.signup_threshold === null ? (
                <span className="text-muted-foreground">{t("detail.noThreshold")}</span>
              ) : (
                t("detail.thresholdValue", { count: product.signup_threshold })
              )}
            </Fact>

            <Fact icon={Timer} label={t("detailsPage.fields.registrationOpensAt")}>
              {formatDate(product.registration_opens_at, uiLocale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              })}
            </Fact>

            <Fact icon={Ticket} label={t("detailsPage.fields.seats")}>
              {product.seat_count === null
                ? t("detailsPage.uncapped")
                : t("list.seats", { count: product.seat_count })}
              {product.waitlist_enabled && ` · ${t("detailsPage.waitlistOn")}`}
            </Fact>

            <Fact icon={Languages} label={t("filters.language")}>
              {languageName(
                product.spoken_language_code,
                product.spoken_language_code.toUpperCase(),
              )}
            </Fact>

            <Fact icon={MapPin} label={t("detail.fields.where")}>
              <p>
                {product.is_remote
                  ? t("catalogue.online")
                  : product.locations === null
                    ? c("notSet")
                    : localizedLocationName(product.locations, uiLocale)}
              </p>
              {municipalityName !== null && (
                <p className="text-muted-foreground">{municipalityName}</p>
              )}
              {site?.address != null && (
                <p className="text-muted-foreground">{site.address}</p>
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
          </FactGrid>
        </CardContent>
      </Card>

      {/* A remote product has no building, and the whole panel is absent rather
          than present-and-empty: nothing here survives its arrival, so there is
          no reader's place to protect and a held-open slot would be a hole. */}
      {site !== null && (
        <SiteNotesPanel
          siteName={site.name}
          address={site.address}
          publicNote={site.publicNote}
          staffNote={site.staffNote}
          editing={siteNotesEditing}
          onEditingChange={onSiteNotesEditingChange}
          onSave={onSaveSiteNotes}
        />
      )}
    </div>
  );
}

/**
 * **Money** — what families pay, what the gedus are paid, what the municipality
 * pays us, and the three settings that ride alongside them.
 *
 * A section of its own rather than four rows in a longer grid, because these are
 * the facts with a different *audience*: they are the ones a finance question
 * lands on, and they are the ones an admin is asked to confirm before a term is
 * invoiced. Grouping them is also what makes a missing fee visible as a gap in a
 * short block rather than one amber word in a field of twenty.
 */
export function AdminProductMoney({ product }: { product: ProductAdminDetailRow }) {
  const t = useTranslations("admin.products");
  const tTag = useTranslations("productTag");
  const uiLocale = resolveLocale(useLocale());
  const topicLabel = useTopicLabel();

  const isMuni = product.product_type === "municipality_club";
  const { regionLockable } = PRODUCT_TYPE_CONFIG[product.product_type];

  // Country names in the admin's own language, with the config's English name
  // and then the raw stored code behind it — the whole chain lives in
  // `countryDisplayName`, shared with the shop panel.
  const regionLockName =
    product.region_lock_country === null
      ? null
      : countryDisplayName(product.region_lock_country, uiLocale);

  const topicName = topicLabel(product.topic);

  // A per-session fee's state is derived from its value: null = not set (the
  // `nullStatus` label — "unknown" draws the eye, "none" is informational),
  // 0 = volunteer, > 0 = an amount in the viewer's locale.
  const renderFee = (cents: number | null, nullStatus: "unknown" | "none") => {
    if (cents == null) {
      return (
        <span
          className={
            nullStatus === "unknown" ? "text-warning" : "text-muted-foreground"
          }
        >
          {t(`fees.status.${nullStatus}`)}
        </span>
      );
    }
    if (cents === 0) {
      return <span className="text-muted-foreground">{t("fees.status.volunteer")}</span>;
    }
    return formatCurrencyFromCents(cents, "eur", uiLocale);
  };

  const priceLines = SUPPORTED_CURRENCIES.flatMap((cur) => {
    const row = product.product_prices.find((p) => p.currency === cur);
    if (!row) return [];
    // Consumer clubs charge a monthly subscription; camps and events an upfront
    // total. Either way it is the single `price_cents`; only the label differs.
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
      <CardContent className="p-5 sm:p-6">
        <FactGrid>
          <Fact icon={Wallet} label={t("detailsPage.fields.billingMode")}>
            <span>{t(`detailsPage.billingMode.${product.billing_mode}`)}</span>
            {priceLines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {priceLines.map((line) => (
                  <li key={line}>{line}</li>
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

          {/* The row also appears on a type that cannot be locked, if one somehow
              carries a lock: the shop enforces the column regardless of type, so
              a stored value has to be visible to the admins answering for it. */}
          {(regionLockable || product.region_lock_country !== null) && (
            <Fact icon={MapPin} label={t("detailsPage.fields.regionLock")}>
              {regionLockName === null ? (
                <span className="text-muted-foreground">{t("regionLock.none")}</span>
              ) : (
                regionLockName
              )}
            </Fact>
          )}

          <Fact icon={Shapes} label={t("detailsPage.fields.topic")}>
            {topicName}
          </Fact>

          {/* Untagged is the ordinary state rather than a gap in the setup, so
              it says so in muted text — the same word the form's picker offers. */}
          <Fact icon={Tag} label={t("detailsPage.fields.tag")}>
            {product.tag === null ? (
              <span className="text-muted-foreground">{t("tagOptions.none")}</span>
            ) : (
              tTag(productTagLabelKey(product.tag))
            )}
          </Fact>
        </FactGrid>
      </CardContent>
    </Card>
  );
}
