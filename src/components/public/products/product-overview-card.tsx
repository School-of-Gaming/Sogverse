"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import { Clock, Globe, Languages, MapPin, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import type { ProductBrowseRow } from "@/types";
import {
  formatProductLocation,
  productLocationLabelIsFormat,
  renderProductLocationLine,
} from "@/lib/products/format-product-location";
import {
  productScheduleDisplayLines,
  productWhoItsFor,
} from "@/lib/products/product-overview-facts";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";

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
   * the detail page is the only caller in a rail, while the purchase
   * confirmation view and the admin product page render this card at full
   * width and leave it unset.
   */
  railFrom2xl?: boolean;
}

export function ProductOverviewCard({
  product,
  railFrom2xl,
}: ProductOverviewCardProps) {
  const t = useTranslations("productDetail");
  const tAudience = useTranslations("productAudience");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const location = formatProductLocation(product, uiLocale);
  const labelIsFormat = productLocationLabelIsFormat(product.is_remote, location);

  // The three-shape "who is this for" answer, and the club term range folded
  // into the schedule, are both shared rules — the mail that mirrors the
  // purchase confirmation states them in the same words, so the composition
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
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("sections.overview")}
        </h2>
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
              isRemote: product.is_remote,
              online: t("info.online"),
              tbd: t("info.tbd"),
            })}
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

/**
 * A schedule line, with its parts kept whole.
 *
 * The formatter joins a line's parts with `SCHEDULE_PART_SEPARATOR` — "Mon, Wed,
 * Fri · 10:00–14:00 (EEST)" — and at rail width that wraps wherever the browser
 * likes, which is routinely *inside* the time: a clock face broken across two
 * lines is briefly unreadable and looks like a rendering fault. So each part
 * becomes a no-wrap span and only the separator between them may break, which
 * puts the fold where a reader would put it: after the days, before the time.
 *
 * **A line with no separator is returned untouched, and that is the whole of the
 * care needed here.** Several lines carry no parts to keep together — a camp's
 * date range, a club's term range, the "—" placeholder — and wrapping one of
 * those in a no-wrap span would not be preserving a clock face, it would be
 * taking away the wrapping the line had before anybody thought about this. The
 * split runs first and the one-part case exits before any span is added.
 *
 * **It runs in both presentations on purpose.** Scoping it to the rail would
 * mean two renderings of the same string, and on a multi-part line the spans are
 * inert wherever there is width: a part is at most as wide as the line it came
 * from, and every other surface rendering these lines (the live detail page's
 * overview card at ~300px+, the confirmation page, the admin product page) gives
 * them a column several times a part's width.
 */
function ScheduleLine({ line }: { line: string }) {
  const parts = line.split(SCHEDULE_PART_SEPARATOR);
  if (parts.length === 1) return line;
  return (
    <>
      {parts.map((part, idx) => (
        <span key={idx}>
          {idx > 0 && SCHEDULE_PART_SEPARATOR}
          <span className="whitespace-nowrap">{part}</span>
        </span>
      ))}
    </>
  );
}
