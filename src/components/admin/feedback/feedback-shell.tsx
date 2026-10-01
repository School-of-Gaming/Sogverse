"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn } from "@/lib/utils";
import { FEEDBACK_SOURCES } from "@/services/session-feedback/admin-feedback.contracts";
import { FEEDBACK_RANGES, type FeedbackRange } from "./feedback-range";
import { FeedbackRangeProvider, useFeedbackHref, useFeedbackRange } from "./feedback-nav";
import { adminFeedbackHref, type FeedbackHref, type FeedbackPlace } from "./feedback-place";
import { FEEDBACK_SOURCE_MESSAGE_KEYS } from "./feedback-sources";

/**
 * **The chrome every feedback page sits in**: the way back, the title and
 * what it is about, the range control, and the page underneath. Nothing in it
 * waits on the read, and every link inside it carries the range on show.
 */
export function FeedbackShell({
  range,
  place,
  title,
  subtitle,
  back = null,
  aside,
  children,
}: {
  range: FeedbackRange;
  /** The page itself, so the range control can point at it at another range. */
  place: FeedbackPlace;
  title: string;
  /** Defaults to what is collected, as the overview says it. */
  subtitle?: string;
  back?: FeedbackPlace | null;
  /** A link out beside the title. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FeedbackRangeProvider range={range}>
      <div className="space-y-6 pb-12">
        {back !== null && <BackLink place={back} />}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle ?? <SourcesLine />}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {aside}
            <RangeControl place={place} />
          </div>
        </div>
        {children}
      </div>
    </FeedbackRangeProvider>
  );
}

/** Who answered and when, read off the source list so a new source names itself. */
function SourcesLine() {
  const t = useTranslations("admin.feedback.sources");
  return FEEDBACK_SOURCES.map((source) => t(FEEDBACK_SOURCE_MESSAGE_KEYS[source])).join(
    SCHEDULE_PART_SEPARATOR,
  );
}

function BackLink({ place }: { place: FeedbackPlace }) {
  const t = useTranslations("admin.feedback.back");
  const href = useFeedbackHref();
  const label =
    place.view === "overview"
      ? t("overview")
      : place.view === "list"
        ? t(`list.${place.dimension}`)
        : place.view === "responses"
          ? t("responses")
          : t(`detail.${place.scope.kind}`);

  return (
    <Link
      href={href(place)}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

/** The three spans, as links: a range is a different read, so choosing one is a navigation. */
function RangeControl({ place }: { place: FeedbackPlace }) {
  const t = useTranslations("admin.feedback");
  const current = useFeedbackRange();

  return (
    <SegmentedLinks
      label={t("rangeLabel")}
      options={FEEDBACK_RANGES.map((option) => ({
        key: option,
        label: t(`ranges.${option}`),
        href: adminFeedbackHref(place, option),
      }))}
      current={current}
    />
  );
}

/** One pill of a segmented row, drawn the same whether it navigates or switches a view. */
function pillClass(active: boolean): string {
  return cn(
    "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
    active ? "bg-lifted text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

/** A row of pill links, one of them the page on show. */
function SegmentedLinks<K extends string>({
  label,
  options,
  current,
}: {
  label: string;
  options: { key: K; label: string; href: FeedbackHref }[];
  current: K;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = option.key === current;
        return (
          <Link
            key={option.key}
            href={option.href}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={pillClass(active)}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The same row as buttons, for a choice between views of what is already on the page. */
export function SegmentedButtons<K extends string>({
  label,
  options,
  current,
  onChoose,
}: {
  label: string;
  options: { key: K; label: string }[];
  current: K;
  onChoose: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = option.key === current;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(option.key)}
            className={pillClass(active)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The shell over a band saying why there is nothing under it. */
export function FeedbackLoadFailure({
  range,
  place,
  title,
  reason,
}: {
  range: FeedbackRange;
  place: FeedbackPlace;
  title: string;
  reason: string | null;
}) {
  const t = useTranslations("admin.feedback");
  return (
    <FeedbackShell range={range} place={place} title={title}>
      <Alert variant="destructive">
        <AlertDescription>
          {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
        </AlertDescription>
      </Alert>
    </FeedbackShell>
  );
}
