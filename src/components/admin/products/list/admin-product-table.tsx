"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { cn, formatDateRange } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import {
  formatProductSchedule,
  joinScheduleGroups,
} from "@/components/public/products/format-product-schedule";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import { joinParts } from "../join-parts";
import { ProductStatusChip } from "../product-status-chip";
import type {
  AdminProductListRow,
  ProductSortKey,
  SortDirection,
} from "./admin-product-list-data";

/**
 * What a cell shows when the product has no answer for that column.
 *
 * A dash rather than a translated "not set": these are three cells in a grid of
 * two hundred, and a sentence in one of them would be the loudest thing in the
 * table while saying the least. It is punctuation, which is why it is a constant
 * rather than a message key.
 */
const EM_DASH = "—";

/**
 * The catalogue as a **table**, because an admin reads down a column.
 *
 * Cards were the wrong primitive here and the picture was the loudest thing in
 * them: an admin comparing thirty products is comparing *fields* — which of them
 * has no educator, which are full, which run on Tuesdays — and a card forces
 * every one of those comparisons to be made by eye across a wrapped block. A
 * table puts each fact in the same place on every line, which is the whole
 * reason a table exists, and the thumbnail is gone with it (an admin approving a
 * picture opens the product; nobody scans a list of thirty by their artwork).
 *
 * Four columns sort. The rest do not, and that is not an omission: an admin
 * sorts by name to find something, by status or by when to plan, and by seats to
 * see what needs filling. Sorting by educator or by venue is a *filter*
 * disguised as a sort, and the filter is one control away.
 *
 * **On a phone the table scrolls sideways inside its own box** rather than
 * collapsing to cards. Admin surfaces are desktop-default; the honest mobile
 * answer for a comparison grid is the grid, moved.
 */
export function AdminProductTable({
  rows,
  sortKey,
  sortDirection,
  onSort,
}: {
  rows: readonly AdminProductListRow[];
  sortKey: ProductSortKey;
  sortDirection: SortDirection;
  /** Ask for a column; the body decides how a repeat click flips direction. */
  onSort: (key: ProductSortKey) => void;
}) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  // One `now` for the whole table so every row's schedule converts against the
  // same instant — a per-row clock would put two identical clubs on different
  // weekdays across a midnight boundary.
  const now = useNow();

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[62rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">{t("catalogue.columns.type")}</span>
            </th>
            <SortableHeader
              label={t("catalogue.columns.name")}
              column="name"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label={t("catalogue.columns.status")}
              column="status"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label={t("catalogue.columns.when")}
              column="when"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
              {t("catalogue.columns.where")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
              {t("catalogue.columns.gedus")}
            </th>
            <SortableHeader
              label={t("catalogue.columns.seats")}
              column="seats"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">
                {t("catalogue.columns.attention")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[row.productType];
            const Icon = presentation.icon;
            const href = ROUTES.admin.product(row.productType, row.id);
            const typeLabel = t(`types.${presentation.i18nKey}.label`);

            return (
              <tr
                key={row.id}
                // `relative` is what gives the name cell's stretched anchor a
                // box to stretch over — the whole row becomes the link, with one
                // tab stop for it, rather than only the words of the name.
                className="group relative border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50 focus-within:bg-accent/50"
              >
                <td className="px-3 py-2.5 align-middle">
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-md",
                      presentation.tint,
                    )}
                    title={typeLabel}
                  >
                    <Icon
                      aria-hidden
                      className={cn("h-4 w-4", presentation.text)}
                    />
                    <span className="sr-only">{typeLabel}</span>
                  </span>
                </td>

                <td className="px-3 py-2.5 align-middle">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* The whole row is the link target via the stretched
                        anchor: one tab stop per product, and every cell to the
                        right of the name is still selectable text. */}
                    <Link
                      href={href}
                      className="truncate font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.name}
                    </Link>
                    {!row.isVisible && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t("list.unlisted")}
                      </span>
                    )}
                  </span>
                </td>

                <td className="px-3 py-2.5 align-middle">
                  <ProductStatusChip status={row.status} />
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 align-middle text-muted-foreground">
                  {whenLine(row, uiLocale, timeZone, now)}
                </td>

                <td className="px-3 py-2.5 align-middle text-muted-foreground">
                  {whereLine(row, t)}
                </td>

                <td className="px-3 py-2.5 align-middle">
                  {row.geduFirstNames.length === 0 ? (
                    <span className="text-warning">
                      {t("catalogue.noGedu")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {row.geduFirstNames.join(", ")}
                    </span>
                  )}
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums">
                  <SeatsCell row={row} />
                </td>

                <td className="px-3 py-2.5 align-middle">
                  {row.attention.length > 0 && (
                    <span
                      // One glyph however many things are wrong, and the list of
                      // them on the pointer. A column that spelled every reason
                      // out would be wider than the name column and would still
                      // be read as "something's wrong here" and clicked.
                      title={row.attention
                        .map((reason) => t(`catalogue.attention.${reason}`))
                        .join("\n")}
                      className="inline-flex text-warning"
                    >
                      <AlertTriangle aria-hidden className="h-4 w-4" />
                      <span className="sr-only">
                        {row.attention
                          .map((reason) => t(`catalogue.attention.${reason}`))
                          .join(". ")}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  column: ProductSortKey;
  sortKey: ProductSortKey;
  sortDirection: SortDirection;
  onSort: (key: ProductSortKey) => void;
}) {
  const active = sortKey === column;
  const Glyph = !active ? ChevronsUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
      }
      className="px-3 py-2 font-medium text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {label}
        {/* The glyph is present on every sortable header, in all three states,
            so turning a column on adds no width and moves no neighbour. */}
        <Glyph aria-hidden className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

/**
 * The seats cell: filled of capacity, with the queue and the unplaced beneath it
 * only when there are any.
 *
 * Both extra counts are genuinely absent rather than rendered as zero. Nothing
 * survives their appearance — the line below the seats is either there or the
 * row is one line shorter — so there is no reader's place to lose and no reason
 * to hold a slot open for a number most rows will never have.
 */
function SeatsCell({ row }: { row: AdminProductListRow }) {
  const t = useTranslations("admin.products");

  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {row.seatCount === null
          ? t("catalogue.seatsUncapped", { filled: row.filledSeats })
          : t("catalogue.seatsOf", {
              filled: row.filledSeats,
              total: row.seatCount,
            })}
      </span>
      {(row.waitlistCount > 0 || row.unplacedCount > 0) && (
        <span className="text-xs text-muted-foreground">
          {joinParts([
            row.waitlistCount > 0
              ? t("catalogue.waitingCount", { count: row.waitlistCount })
              : null,
            row.unplacedCount > 0
              ? t("catalogue.unplacedCount", { count: row.unplacedCount })
              : null,
          ])}
        </span>
      )}
    </span>
  );
}

/**
 * The "when" column, one line, in whatever grammar the type has.
 *
 * A club is a cadence — "Tue 17:00–18:30, Thu 17:00–18:30" — because two clubs
 * on the shelf can be identical but for the weekday, and the date they started
 * says nothing about which is which. A camp is a date range: it runs once. An
 * event is a date and a clock face, converted to the viewer's zone like every
 * other time of day on the platform.
 */
function whenLine(
  row: AdminProductListRow,
  locale: string,
  timeZone: string,
  now: Date,
): string {
  const schedule = formatProductSchedule({
    product: row.schedule,
    locale,
    timeZone,
    now,
  });

  switch (schedule.kind) {
    // A camp's dates and an unscheduled product's are the same answer read two
    // ways, so both come from the row's own columns through the shared range
    // helper. The summary's `startDate`/`endDate` are already *formatted* — a
    // convenience for the shop's lines and a trap here, because handing a
    // formatted date back to a date formatter throws on the first camp.
    case "tbd":
    case "ranged":
      return rawRange(row, locale);
    case "recurring":
      return joinScheduleGroups(schedule.groups) || EM_DASH;
    case "single":
      return joinParts([schedule.date, schedule.time?.start ?? null]);
  }
}

/** The product's own start/end columns as one range, or a dash for neither. */
function rawRange(row: AdminProductListRow, locale: string): string {
  if (row.schedule.start_date === null) return EM_DASH;
  return formatDateRange(row.schedule.start_date, row.schedule.end_date, locale);
}

/**
 * The "where" column.
 *
 * **A municipality club always names its municipality**, online or not. The tie
 * is to the Finnish kunta that funds it rather than to a building, so "Online"
 * alone would drop the single most identifying fact about such a row — and an
 * admin scanning for Espoo's clubs would find only the ones that meet in a
 * school hall.
 */
function whereLine(
  row: AdminProductListRow,
  t: ReturnType<typeof useTranslations<"admin.products">>,
): string {
  const place = row.isRemote ? t("catalogue.online") : (row.siteName ?? EM_DASH);
  return joinParts([place, row.municipalityName]);
}
