"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import {
  CalendarOff,
  Clock,
  Globe,
  Languages,
  MapPin,
  UserRound,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/cn";
import type { HolidayBreak } from "@/lib/holiday-breaks";
import {
  holidayBreakLines,
  productToday,
} from "@/lib/products/holiday-breaks-shown";
import type { ProductBrowseRow } from "@/types";
import { HolidayBreaksList } from "./holiday-breaks-list";
import {
  formatProductLocation,
  productLocationLabelIsFormat,
  renderProductLocationLine,
} from "@/lib/products/format-product-location";
import {
  productScheduleDisplayLines,
  productWhoItsFor,
} from "@/lib/products/product-overview-facts";
import { ScheduleLine } from "./schedule-line";
import { Heading } from "@sog/ui";

// Shared "Good to know" overview card. Renders schedule (day/time),
// location/format, who the product is for (its audience, its age range, or
// both in one cell), and spoken language — the at-a-glance facts.
// Used by the shop detail body, so the layout lives here as the single source
// of truth.

interface ProductOverviewCardProps {
  // Structural subset of the fields this card actually reads, so any product
  // row carrying these logistics columns/joins satisfies it.
  product: Pick<
    ProductBrowseRow,
    | "product_type"
    | "start_date"
    | "end_date"
    | "timezone"
    | "schedule_slots"
    | "delivery_mode"
    | "locations"
    | "min_age"
    | "max_age"
    | "for_gamers"
    | "for_parents"
    | "spoken_language_code"
  >;
  /**
   * **A class switch, nothing else.** From `2xl` the product detail page moves
   * this card out of the reading column into a 16rem facts rail, where a
   * two-up grid would give each fact about 110px. This collapses the grid back
   * to a single stacked column at exactly that breakpoint, and only for the
   * instance that moves.
   *
   * A prop rather than a breakpoint the card decides for itself, because the
   * card cannot know how wide its column is — `sm:` and friends measure the
   * viewport, and a 1920px viewport says nothing about a 256px rail. The prop
   * names the arrangement its caller put it in, which is why it stays a prop:
   * the detail page puts it in a rail only from `2xl`.
   */
  railFrom2xl?: boolean;
  /**
   * The club's holiday breaks, as `holiday_breaks_document` returned them over
   * the span `holidayBreaksSpan` names. Which of them are listed is the shared
   * rule's call, and a list that comes out empty draws nothing.
   *
   * **They arrive with the card, never after it.** The section is the card's
   * last row, and below `2xl` the card sits in the reading column above the
   * topic card — so a list landing a round trip late would push that card
   * down. The caller holds them in the page's initial data instead.
   */
  holidayBreaks?: readonly HolidayBreak[];
}

export function ProductOverviewCard({
  product,
  railFrom2xl,
  holidayBreaks = [],
}: ProductOverviewCardProps) {
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const location = formatProductLocation(product, uiLocale);
  const labelIsFormat = productLocationLabelIsFormat(product.delivery_mode, location);

  // The three-shape "who is this for" answer, and the club term range folded
  // into the schedule, are both shared rules — the signup confirmation mail
  // states them in the same words, so the composition
  // lives in `@/lib/products/product-overview-facts` and each surface only
  // renders it. The label follows the shape: "Age range" where the cell is a
  // range, "Audience" where it leads with the audience word.
  const whoItsFor = productWhoItsFor(product);
  const scheduleDisplayLines = productScheduleDisplayLines({
    product,
    locale: uiLocale,
    timeZone,
    now,
  });
  const breakLines = holidayBreakLines(holidayBreaks, {
    today: productToday(product.timezone, now),
    locale: uiLocale,
  });

  return (
    <Card>
      <CardContent
        className={cn(
          "space-y-3 p-5 sm:p-6 text-sm",
          // A step tighter in the rail: 16rem is not a place to spend 24px a
          // side, and the 16px this frees goes straight into the values.
          railFrom2xl && "2xl:p-4",
        )}
      >
        <Heading level={2} step="card-title">
          {t("sections.overview")}
        </Heading>
        {/* Two-up on wider widths and a single stacked column on mobile, where
            there isn't room. Exactly four facts on every audience — Schedule |
            Format, then who-it's-for | Language — so the grid is a filled 2×2
            whatever the product's shape is. That invariant is why the audience
            and the age range share one cell above rather than taking one
            each. */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4",
            // The rail is 16rem: two columns there are ~110px each, which is
            // narrower than half these values need. Back to one column, and
            // back to the tighter single-column gap that goes with it.
            railFrom2xl && "2xl:grid-cols-1 2xl:gap-3",
          )}
        >
          <DetailRow
            icon={Clock}
            label={t("info.schedule")}
            railFrom2xl={railFrom2xl}
          >
            {scheduleDisplayLines.length === 1 ? (
              <ScheduleLine line={scheduleDisplayLines[0]} />
            ) : (
              <ul className="space-y-0.5">
                {scheduleDisplayLines.map((line, idx) => (
                  <li key={idx}>
                    <ScheduleLine line={line} />
                  </li>
                ))}
              </ul>
            )}
          </DetailRow>
          <DetailRow
            icon={labelIsFormat ? Globe : MapPin}
            label={labelIsFormat ? t("info.format") : t("info.where")}
            railFrom2xl={railFrom2xl}
          >
            {renderProductLocationLine({
              location,
              deliveryMode: product.delivery_mode,
              online: t("info.online"),
              tbd: t("info.tbd"),
            })}
            {/* The site is half of a hybrid product's answer; the other half
                is that the group also meets in the voice room. */}
            {product.delivery_mode === "hybrid" && (
              <div className="text-muted-foreground">{t("info.hybrid")}</div>
            )}
          </DetailRow>
          {/* Null only for a row carrying neither an audience label nor an age
              range, which the schema's CHECKs make unreachable — the grid
              would fall back to three facts rather than render an empty
              cell. */}
          {whoItsFor !== null && (
            <DetailRow
              icon={whoItsFor.value.kind === "parents" ? UserRound : Users}
              label={
                whoItsFor.label === "ageRange"
                  ? t("info.ageRange")
                  : t("info.audience")
              }
              railFrom2xl={railFrom2xl}
            >
              {whoItsFor.value.kind === "ages"
                ? t("info.ages", whoItsFor.value)
                : whoItsFor.value.kind === "parents"
                  ? tAudience("parents")
                  : whoItsFor.value.kind === "families"
                    ? tAudience("families")
                    : tAudience("familiesWithAges", whoItsFor.value)}
            </DetailRow>
          )}
          <DetailRow
            icon={Languages}
            label={t("info.language")}
            railFrom2xl={railFrom2xl}
          >
            <LanguageFlag code={product.spoken_language_code} />
          </DetailRow>
        </div>
        {/* Below the four-fact grid rather than in it, so the grid stays a
            filled 2×2: a list of dates is a fact of its own length, and only
            clubs have one. Absent entirely when nothing is listed. */}
        {breakLines.length > 0 && (
          <DetailRow
            icon={CalendarOff}
            label={t("info.holidayBreaks")}
            railFrom2xl={railFrom2xl}
          >
            <HolidayBreaksList lines={breakLines} />
          </DetailRow>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One fact.
 *
 * In the ordinary card the icon sits in a gutter to the left of the label and
 * the value, which is right at 300px-plus a column: the indent gives the four
 * facts a shared spine to line up on.
 *
 * In the rail that gutter is 28px off a ~207px measure, spent on decoration
 * while "Tapiolan koulu, Espoo" wraps beside it. So from `2xl` the icon joins
 * the label on its own line — small, uppercase and tracked, the treatment every
 * field label in the app wears. It is furniture, scanned as structure, so caps
 * are right here and wrong on the card's own heading above, which is the page
 * speaking and stays sentence case with no tracking. Same elements, same order,
 * same words; the icon simply stops indenting the only thing in the row that
 * needs the room.
 */
function DetailRow({
  icon: Icon,
  label,
  children,
  railFrom2xl,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  railFrom2xl?: boolean;
}) {
  return (
    <div className={cn("flex gap-3", railFrom2xl && "2xl:block")}>
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground",
          railFrom2xl && "2xl:mt-0 2xl:hidden",
        )}
      />
      <div className="min-w-0">
        <dt
          className={cn(
            "text-xs text-muted-foreground",
            railFrom2xl &&
              "2xl:flex 2xl:items-center 2xl:gap-1.5 2xl:text-[10px] 2xl:font-medium 2xl:uppercase 2xl:tracking-wider",
          )}
        >
          {railFrom2xl === true && (
            <Icon className="hidden h-3 w-3 shrink-0 2xl:block" />
          )}
          {label}
        </dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}
