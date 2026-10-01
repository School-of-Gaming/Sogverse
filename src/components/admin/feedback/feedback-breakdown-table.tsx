"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SessionFeedbackTheme } from "@/components/voice/feedback/session-feedback-items";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn } from "@/lib/utils";
import type { AdminFeedbackGroupRef } from "@/services/session-feedback/admin-feedback.contracts";
import {
  LOW_N,
  positiveShare,
  type BreakdownDimension,
  type BreakdownRow,
  type FeedbackView,
  type RatingTally,
} from "./aggregate-feedback";
import type { FeedbackFilterDimension, FeedbackFilters } from "./feedback-filters";
import { formatShare } from "./feedback-format";
import { useThemeLabel } from "./use-feedback-labels";

type Href = ComponentProps<typeof Link>["href"];

/**
 * Where a row leads out to. A prop rather than a constant because who is
 * reading decides it: an admin opens the admin pages, and a reader with no
 * admin page for a person is handed `null` and gets no link.
 */
export interface FeedbackEntityHrefs {
  product: (ref: AdminFeedbackGroupRef) => Href | null;
  group: (ref: AdminFeedbackGroupRef) => Href | null;
  person: (id: string) => Href | null;
}

const DIMENSIONS: readonly BreakdownDimension[] = ["product", "group", "gedu", "gamer"];

type SortKey = "name" | "responses" | "responseRate" | "positive" | SessionFeedbackTheme;

/** How many rows a tab shows before it is asked for more. */
const PAGE_SIZE = 25;

/**
 * **The breakdown** — the slice cut by product, by group, by Gedu or by gamer,
 * one row each, sortable on any column.
 *
 * Groups are a tab of their own rather than rows folded under their product:
 * a group is drilled into as often as a product is, and a flat, sortable list
 * of groups answers "which group is struggling" in one click where folded rows
 * would need every product opened first.
 *
 * Pressing a row narrows the whole page to it — the drill-down — and the icon
 * at its end leaves for that thing's own page. A row resting on fewer than
 * `LOW_N` responses is drawn in the quiet ink: it is listed, but it should not
 * be read with the confidence of the rows around it.
 */
export function FeedbackBreakdownTable({
  view,
  filters,
  hrefs,
  onNarrow,
}: {
  view: FeedbackView;
  filters: FeedbackFilters;
  hrefs: FeedbackEntityHrefs;
  onNarrow: (dimension: FeedbackFilterDimension, id: string) => void;
}) {
  const t = useTranslations("admin.feedback.breakdown");
  const locale = useLocale();
  const themeLabel = useThemeLabel();
  const [dimension, setDimension] = useState<BreakdownDimension>("product");
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "responses",
    descending: true,
  });
  const [limit, setLimit] = useState(PAGE_SIZE);

  const rows = useMemo(
    () => sortRows(view.breakdowns[dimension], sort.key, sort.descending),
    [view.breakdowns, dimension, sort],
  );
  const hasRate = dimension !== "gamer";

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: key !== "name" },
    );

  const hrefOf = (row: BreakdownRow): Href | null => {
    if (dimension === "product") return row.ref === null ? null : hrefs.product(row.ref);
    if (dimension === "group") return row.ref === null ? null : hrefs.group(row.ref);
    return hrefs.person(row.id);
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "responses", label: t("columns.responses") },
    ...(hasRate ? [{ key: "responseRate" as const, label: t("columns.responseRate") }] : []),
    { key: "positive", label: t("columns.positive") },
    ...view.themes.map((theme) => ({ key: theme, label: themeLabel(theme) })),
  ];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <div role="tablist" aria-label={t("heading")} className="flex flex-wrap gap-1.5">
          {DIMENSIONS.map((option) => {
            const active = option === dimension;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setDimension(option);
                  setLimit(PAGE_SIZE);
                }}
                className={cn(
                  "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
                  active ? "bg-lifted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${option}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <SortHeader
                label={t("columns.name")}
                active={sort.key === "name"}
                descending={sort.descending}
                onSort={() => sortBy("name")}
                alignLeft
              />
              {columns.map((column) => (
                <SortHeader
                  key={column.key}
                  label={column.label}
                  active={sort.key === column.key}
                  descending={sort.descending}
                  onSort={() => sortBy(column.key)}
                />
              ))}
              <th scope="col">
                <span className="sr-only">{t("columns.open")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, limit).map((row) => {
              const href = hrefOf(row);
              const narrowed = filters[dimension] === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => onNarrow(dimension, row.id)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-hover",
                    row.responses < LOW_N && "text-muted-foreground",
                  )}
                >
                  <th scope="row" className="max-w-64 py-2 pr-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNarrow(dimension, row.id);
                      }}
                      aria-label={t("narrowTo", { name: row.name })}
                      aria-pressed={narrowed}
                      className={cn("block max-w-full truncate text-left", narrowed && "font-semibold")}
                    >
                      {row.name}
                    </button>
                    {dimension === "group" && row.ref !== null && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.ref.productName}
                      </span>
                    )}
                  </th>
                  <td className="py-2 pr-3 text-right">{row.responses.toLocaleString(locale)}</td>
                  {hasRate && (
                    <td className="py-2 pr-3 text-right">
                      {formatShare(row.responseRate, locale)}
                    </td>
                  )}
                  <ShareCell tally={row.overall} locale={locale} />
                  {view.themes.map((theme) => (
                    <ShareCell key={theme} tally={row.themes[theme]} locale={locale} />
                  ))}
                  <td className="py-2 text-right">
                    {href !== null && (
                      <Link
                        href={href}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={t("open", { name: row.name })}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {t("showing", { shown: Math.min(limit, rows.length), total: rows.length })}
          {SCHEDULE_PART_SEPARATOR}
          {t("lowN", { min: LOW_N })}
        </span>
        {rows.length > limit && (
          <Button variant="outline" size="sm" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            {t("showMore")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function SortHeader({
  label,
  active,
  descending,
  onSort,
  alignLeft = false,
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onSort: () => void;
  alignLeft?: boolean;
}) {
  const Arrow = descending ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={cn("py-2 pr-3 font-medium", alignLeft ? "text-left" : "text-right")}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </th>
  );
}

/** A positive share with the count of answers it rests on. */
function ShareCell({ tally, locale }: { tally: RatingTally; locale: string }) {
  return (
    <td className="whitespace-nowrap py-2 pr-3 text-right">
      {formatShare(positiveShare(tally), locale)}{" "}
      <span className="text-xs text-muted-foreground">{tally.n.toLocaleString(locale)}</span>
    </td>
  );
}

/**
 * Rows in the order asked. A row with no figure for the column sorts last
 * either way, because "no answers" is not the lowest score.
 */
function sortRows(rows: BreakdownRow[], key: SortKey, descending: boolean): BreakdownRow[] {
  const valueOf = (row: BreakdownRow): number | string | null => {
    switch (key) {
      case "name":
        return row.name;
      case "responses":
        return row.responses;
      case "responseRate":
        return row.responseRate;
      case "positive":
        return positiveShare(row.overall);
      default:
        return positiveShare(row.themes[key]);
    }
  };

  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null || right === null) {
      if (left === right) return a.name.localeCompare(b.name);
      return left === null ? 1 : -1;
    }
    const order =
      typeof left === "string" || typeof right === "string"
        ? String(left).localeCompare(String(right))
        : left - right;
    return (descending ? -order : order) || a.name.localeCompare(b.name);
  });
}
