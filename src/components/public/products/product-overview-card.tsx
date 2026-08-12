"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import { Clock, Globe, Languages, MapPin, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import type { ProductBrowseRow } from "@/types";
import { formatProductLocation } from "./format-product-location";
import { audienceLabelKey } from "./product-audience";
import { DraftTagChip } from "./product-browse-card-view-draft";
import { productTagLabelKey, type ProductTag } from "./product-tag";
import { formatClubTermDates } from "./format-product-term-dates";
import {
  formatProductSchedule,
  renderScheduleLinesForDetail,
} from "./format-product-schedule";

// Shared "Good to know" overview card. Renders schedule (day/time),
// location/format, who the product is for (its audience, its age range, or
// both in one cell), and spoken language — the at-a-glance facts.
// Used by the shop detail body, the purchase-confirmation view, and the
// admin product details page, so the layout lives here as the single
// source of truth.

interface ProductOverviewCardProps {
  // Structural subset of the fields this card actually reads, so both the
  // parent browse row and the admin detail row satisfy it. Neither named
  // type is assignable to the other (admin selects a narrower
  // product_prices), but both carry these logistics columns/joins.
  product: Pick<
    ProductBrowseRow,
    | "product_type"
    | "start_date"
    | "end_date"
    | "timezone"
    | "schedule_slots"
    | "is_remote"
    | "locations"
    | "min_age"
    | "max_age"
    | "for_gamers"
    | "for_parents"
    | "spoken_language_code"
  >;
  /**
   * **Draft-redesign only, and additive.** No live caller passes it — not the
   * shop detail body, not the confirmation view, not the admin product page —
   * so this card renders exactly as it always has for all three. Given a tag,
   * it grows one block beneath the 2×2 grid: the same chip the browse card and
   * the draft masthead wear, plus a sentence or two on what SOG actually does
   * about it.
   *
   * Below the grid rather than inside it, deliberately. The four facts are a
   * filled 2×2 whatever the product's shape is — that invariant is why the
   * audience and the age range already share one cell — and this is prose, not
   * a fact: a paragraph in a `dd` sized for "Tuesdays 15:30" would wreck the
   * row it sits in. It stays in the who-it's-for *area* by sitting directly
   * under it, which is where a parent reading "For families, ages 8–12" looks
   * next.
   */
  tag?: ProductTag;
}

export function ProductOverviewCard({ product, tag }: ProductOverviewCardProps) {
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  // DRAFT COPY. See `productTagDetail` in the message files: the product owner
  // is writing the real source text and these strings are placeholders that get
  // replaced wholesale, in every locale, when it lands.
  const tTagDetail = useTranslations("productTagDetail");
  const tTag = useTranslations("productTag");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const schedule = formatProductSchedule({ product, locale: uiLocale, timeZone, now });
  const scheduleLines = renderScheduleLinesForDetail(schedule);
  const location = formatProductLocation(product, uiLocale);

  const ages =
    product.min_age !== null && product.max_age !== null
      ? { min: product.min_age, max: product.max_age }
      : null;

  // One cell answers "who is this for", in whichever of the three shapes the
  // product has — which is what keeps the grid 2×2 for every audience instead
  // of a family product growing a fifth fact and a third row.
  //
  //   - Gamers-only: the age range alone, unchanged and unlabelled by
  //     audience. That is the assumed default, so a "For gamers" fact would be
  //     a row every existing product page grew for no news — the same
  //     restraint the browse card's badge shows.
  //   - Parents-only: the audience label alone. No age range exists to state
  //     (an adult "18+" was rejected as saying something else entirely), so
  //     this is the fact that *replaces* the ages rather than joining them.
  //   - Family: both, composed by one message ("For families, ages 8–12")
  //     rather than concatenated from two — a comma is grammar, and grammar is
  //     the translator's to own.
  //
  // The label follows the same split: "Age range" where the cell is a range,
  // "Audience" where it leads with the audience word. The
  // badge-or-nothing decision itself lives in product-audience.ts.
  const whoItsFor = ((): {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
  } | null => {
    switch (audienceLabelKey(product)) {
      case null:
        return ages === null
          ? null
          : {
              icon: Users,
              label: t("info.ageRange"),
              value: t("info.ages", ages),
            };
      case "parents":
        return {
          icon: UserRound,
          label: t("info.audience"),
          value: tAudience("parents"),
        };
      case "families":
        return {
          icon: Users,
          label: t("info.audience"),
          // The CHECK ties a range to the gamer audience, so a family product
          // always has one; the fallback is the shape of the data, not a case
          // anyone should see.
          value:
            ages === null
              ? tAudience("families")
              : tAudience("familiesWithAges", ages),
        };
    }
  })();

  // A club's term range ("13 Jan – 30 May 2026") isn't in its weekly schedule
  // line — camps/events already fold their dates into the schedule, so the
  // helper returns null for them. Fold the club range in as an extra schedule
  // line (rather than a 5th overview Fact) to keep the 2×2 grid intact.
  const termRange = formatClubTermDates(product, uiLocale);
  const scheduleDisplayLines = termRange
    ? [...scheduleLines, termRange]
    : scheduleLines;

  return (
    <Card>
      <CardContent className="space-y-3 p-5 sm:p-6 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("sections.overview")}
        </h2>
        {/* Two-up on wider widths and a single stacked column on mobile, where
            there isn't room. Exactly four facts on every audience — Schedule |
            Format, then who-it's-for | Language — so the grid is a filled 2×2
            whatever the product's shape is. That invariant is why the audience
            and the age range share one cell above rather than taking one
            each. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
          <DetailRow icon={Clock} label={t("info.schedule")}>
            {scheduleDisplayLines.length === 1 ? (
              scheduleDisplayLines[0]
            ) : (
              <ul className="space-y-0.5">
                {scheduleDisplayLines.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </DetailRow>
          <DetailRow
            icon={product.is_remote && location?.kind !== "muni" ? Globe : MapPin}
            label={
              product.is_remote && location?.kind !== "muni"
                ? t("info.format")
                : t("info.where")
            }
          >
            {renderLocationLine({
              location,
              isRemote: product.is_remote,
              tOnline: t("info.online"),
              tTbd: t("info.tbd"),
            })}
          </DetailRow>
          {/* Null only for a row carrying neither an audience label nor an age
              range, which the schema's CHECKs make unreachable — the grid
              would fall back to three facts rather than render an empty
              cell. */}
          {whoItsFor !== null && (
            <DetailRow icon={whoItsFor.icon} label={whoItsFor.label}>
              {whoItsFor.value}
            </DetailRow>
          )}
          <DetailRow icon={Languages} label={t("info.language")}>
            <LanguageFlag code={product.spoken_language_code} />
          </DetailRow>
        </div>

        {/* The tag, explained. The chip alone is a promise with no content
            behind it — "Neuroinclusive" tells a parent the product claims
            something, not what the claim is — so wherever a family can stop and
            read, the claim is spelled out. The card and the masthead carry the
            label; this is the only place that says what SOG does about it. */}
        {tag !== undefined && (
          <div className="space-y-2 border-t pt-3">
            <DraftTagChip tag={{ value: tag, label: tTag(productTagLabelKey(tag)) }} />
            <p className="text-muted-foreground">
              {tTagDetail(productTagLabelKey(tag))}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
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
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

function renderLocationLine({
  location,
  isRemote,
  tOnline,
  tTbd,
}: {
  location: ReturnType<typeof formatProductLocation>;
  isRemote: boolean;
  tOnline: string;
  tTbd: string;
}): string {
  if (!location) return isRemote ? tOnline : tTbd;
  switch (location.kind) {
    case "site":
      return location.parent
        ? `${location.site}, ${location.parent}`
        : location.site;
    case "muni":
      return location.name;
  }
}
