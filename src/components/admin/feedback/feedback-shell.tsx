"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn } from "@/lib/utils";
import { FEEDBACK_SOURCES } from "@/services/session-feedback/admin-feedback.contracts";
import { useFeedbackHref } from "./feedback-nav";
import type { FeedbackPlace } from "./feedback-place";
import { FEEDBACK_SOURCE_MESSAGE_KEYS } from "./feedback-sources";

/**
 * **The chrome every feedback page sits in**: the way back, the title and
 * what it is about, and the page underneath. Nothing in it waits on the read,
 * and every link inside it carries the selection on show, so it renders inside
 * the page's `FeedbackSelectionProvider`.
 */
export function FeedbackShell({
  title,
  subtitle,
  back = null,
  aside,
  children,
}: {
  title: string;
  /** Defaults to what is collected, as the overview says it. */
  subtitle?: string;
  back?: FeedbackPlace | null;
  /** A link out beside the title. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6 pb-12">
      {back !== null && <BackLink place={back} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle ?? <SourcesLine />}</p>
        </div>
        {aside}
      </div>
      {children}
    </div>
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

/** One pill of a segmented row. */
function pillClass(active: boolean): string {
  return cn(
    "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
    active ? "bg-lifted text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

/** A row of pill buttons, for a choice between views of what is already on the page. */
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
export function FeedbackLoadFailure({ title, reason }: { title: string; reason: string | null }) {
  const t = useTranslations("admin.feedback");
  return (
    <FeedbackShell title={title}>
      <Alert variant="destructive">
        <AlertDescription>
          {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
        </AlertDescription>
      </Alert>
    </FeedbackShell>
  );
}
