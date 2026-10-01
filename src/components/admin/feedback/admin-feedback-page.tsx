"use client";

import { useMemo, type ComponentProps } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_SOURCES,
  type AdminFeedbackDataset,
  type FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import {
  buildFeedbackView,
  feedbackFilterNames,
  ofSource,
  positiveShare,
  type FeedbackFigures,
} from "./aggregate-feedback";
import {
  FEEDBACK_FILTER_DIMENSIONS,
  feedbackFilterQuery,
  hasFeedbackFilters,
  type FeedbackFilters,
} from "./feedback-filters";
import { formatShare } from "./feedback-format";
import {
  DEFAULT_FEEDBACK_RANGE,
  FEEDBACK_RANGE_PARAM,
  FEEDBACK_RANGES,
  type FeedbackRange,
} from "./feedback-range";
import { FEEDBACK_SOURCE_MESSAGE_KEYS } from "./feedback-sources";
import { FeedbackBreakdownTable, type FeedbackEntityHrefs } from "./feedback-breakdown-table";
import { FeedbackResponsesList } from "./feedback-responses-list";
import { FeedbackStatementBreakdown } from "./feedback-statement-breakdown";
import { FeedbackTrendChart } from "./feedback-trend-chart";
import { useFeedbackFilters } from "./use-feedback-filters";

/** A link target the app's own typed `Link` accepts. */
export type FeedbackHref = ComponentProps<typeof Link>["href"];

/**
 * **Feedback, the admin's read** — how sessions are landing, over one range.
 *
 * The route reads the range and hands over one dataset; everything below is a
 * pure recompute of it for the source on show and the drill-down filters the
 * admin has stacked, so a filter is instant and changing the range is the only
 * thing that goes back to the server.
 *
 * Every figure is per source. Only gamers answering after online sessions is
 * collected today, so the page shows that one and says so in its heading; a
 * second source is a switch beside the range control that picks which one the
 * rest of the page reads, and nothing under the header changes shape for it.
 */
export function AdminFeedbackPage({
  range,
  dataset,
  initialFilters,
  rangeHref = adminRangeHref,
}: {
  range: FeedbackRange;
  dataset: AdminFeedbackDataset;
  /** The filters the URL carried when the route rendered. */
  initialFilters: FeedbackFilters;
  /** Where a range choice goes; the preview scene points it at itself. */
  rangeHref?: (range: FeedbackRange, filters: FeedbackFilters) => FeedbackHref;
}) {
  const t = useTranslations("admin.feedback");
  const { filters, setFilter, clearFilters } = useFeedbackFilters(initialFilters);
  // The one source collected today. A switch slots in beside the range control
  // when a second exists, and sets this instead.
  const source: FeedbackSource = FEEDBACK_SOURCES[0];

  const view = useMemo(
    () => buildFeedbackView(dataset, source, filters),
    [dataset, source, filters],
  );
  const names = useMemo(() => feedbackFilterNames(dataset, filters), [dataset, filters]);
  const sourceHasAnswers = ofSource(dataset.responses, source).length > 0;

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AdminFeedbackHeading />
        <RangeControl range={range} filters={filters} rangeHref={rangeHref} />
      </div>

      {hasFeedbackFilters(filters) && (
        <FilterChips
          filters={filters}
          names={names}
          onRemove={(dimension) => setFilter(dimension, null)}
          onClear={clearFilters}
        />
      )}

      {!sourceHasAnswers ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : view.totals.responses === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyFiltered")}</p>
      ) : (
        <>
          <KpiRow figures={view.totals} />
          <FeedbackTrendChart view={view} />
          <FeedbackStatementBreakdown view={view} />
          <FeedbackBreakdownTable
            view={view}
            filters={filters}
            hrefs={ADMIN_ENTITY_HREFS}
            onNarrow={setFilter}
          />
          <FeedbackResponsesList view={view} hrefs={ADMIN_ENTITY_HREFS} />
        </>
      )}
    </div>
  );
}

/** Where each kind of row leads, on the admin side. */
const ADMIN_ENTITY_HREFS: FeedbackEntityHrefs = {
  product: (ref) => ROUTES.admin.product(ref.productType, ref.productId),
  group: (ref) => ROUTES.admin.productGroup(ref.productType, ref.productId, ref.groupId),
  person: (id) => ROUTES.admin.user(id),
};

function adminRangeHref(range: FeedbackRange, filters: FeedbackFilters): FeedbackHref {
  const query = {
    ...(range === DEFAULT_FEEDBACK_RANGE ? {} : { [FEEDBACK_RANGE_PARAM]: range }),
    ...feedbackFilterQuery(filters),
  };
  return { pathname: ROUTES.admin.feedback, query };
}

/**
 * The page's title and what it is collected from — a component because the
 * route renders it above a failed read too. The second line is read off the
 * source list, so a source added there is named here with no edit.
 */
export function AdminFeedbackHeading() {
  const t = useTranslations("admin.feedback");

  return (
    <div>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">
        {FEEDBACK_SOURCES.map((source) =>
          t(`sources.${FEEDBACK_SOURCE_MESSAGE_KEYS[source]}`),
        ).join(SCHEDULE_PART_SEPARATOR)}
      </p>
    </div>
  );
}

/** The heading over a band saying why there is nothing under it. */
export function AdminFeedbackLoadFailure({ reason }: { reason: string | null }) {
  const t = useTranslations("admin.feedback");

  return (
    <div className="space-y-4 pb-12">
      <AdminFeedbackHeading />
      <Alert variant="destructive">
        <AlertDescription>
          {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * The three spans, as links: a range is a different read, so choosing one is a
 * navigation that carries the drill-down along with it.
 */
function RangeControl({
  range,
  filters,
  rangeHref,
}: {
  range: FeedbackRange;
  filters: FeedbackFilters;
  rangeHref: (range: FeedbackRange, filters: FeedbackFilters) => FeedbackHref;
}) {
  const t = useTranslations("admin.feedback");

  return (
    <nav aria-label={t("rangeLabel")} className="flex items-center gap-1.5">
      {FEEDBACK_RANGES.map((option) => {
        const active = option === range;
        return (
          <Link
            key={option}
            href={rangeHref(option, filters)}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
              active ? "bg-lifted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`ranges.${option}`)}
          </Link>
        );
      })}
    </nav>
  );
}

/** What the page is narrowed to, one chip per dimension, in a fixed order. */
function FilterChips({
  filters,
  names,
  onRemove,
  onClear,
}: {
  filters: FeedbackFilters;
  names: Record<keyof FeedbackFilters, string | null>;
  onRemove: (dimension: keyof FeedbackFilters) => void;
  onClear: () => void;
}) {
  const t = useTranslations("admin.feedback.filters");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("label")}</span>
      {FEEDBACK_FILTER_DIMENSIONS.map((dimension) => {
        if (filters[dimension] === null) return null;
        const dimensionLabel = t(`dimensions.${dimension}`);
        const name = names[dimension] ?? t("unknown");
        return (
          <span
            key={dimension}
            className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-3 pr-1 text-xs"
          >
            <span className="text-muted-foreground">{dimensionLabel}</span>
            <span className="font-medium">{name}</span>
            <button
              type="button"
              onClick={() => onRemove(dimension)}
              aria-label={t("remove", { dimension: dimensionLabel, name })}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        className="rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("clear")}
      </button>
    </div>
  );
}

/**
 * The slice at a glance: four figures, each with what it is out of.
 *
 * No change-against-the-last-period here: the read covers one range, so a
 * comparison would need a second read, and the trend chart directly beneath
 * already says which way things are going.
 */
function KpiRow({ figures }: { figures: FeedbackFigures }) {
  const t = useTranslations("admin.feedback.kpi");
  const locale = useLocale();
  const share = positiveShare(figures.overall);

  return (
    <Card className="grid grid-cols-2 gap-y-4 p-4 lg:grid-cols-4">
      <Kpi
        label={t("responses")}
        figure={figures.responses.toLocaleString(locale)}
        detail={
          figures.eligible === null
            ? t("responsesDetailNoSessions")
            : t("responsesDetail", { eligible: figures.eligible })
        }
      />
      <Kpi
        label={t("responseRate")}
        figure={formatShare(figures.responseRate, locale)}
        detail={
          figures.eligible === null ? t("responseRateNotCounted") : t("responseRateDetail")
        }
      />
      <Kpi
        label={t("positive")}
        figure={formatShare(share, locale)}
        detail={t("positiveDetail", {
          positive: figures.overall.positive,
          count: figures.overall.n,
        })}
      />
      <Kpi
        label={t("notes")}
        figure={figures.notes.toLocaleString(locale)}
        detail={t("notesDetail", { count: figures.responses })}
      />
    </Card>
  );
}

function Kpi({ label, figure, detail }: { label: string; figure: string; detail: string }) {
  return (
    <div className="min-w-0 px-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{figure}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
