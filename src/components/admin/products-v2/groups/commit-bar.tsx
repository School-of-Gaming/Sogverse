"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ChangeSummary } from "@/hooks/use-group-editor-v2";

interface CommitBarProps {
  summary: ChangeSummary;
  onReview: () => void;
  onDiscard: () => void;
  disabled?: boolean;
  /** Block Review while there's invalid local state (e.g. a blank group name). */
  reviewDisabled?: boolean;
  /** Reason shown next to the count when reviewDisabled is true. */
  reviewDisabledReason?: string;
}

export function CommitBar({
  summary,
  onReview,
  onDiscard,
  disabled,
  reviewDisabled,
  reviewDisabledReason,
}: CommitBarProps) {
  const t = useTranslations("admin.productsV2.groupsPanel.commitBar");

  if (!summary.hasChanges) return null;

  return (
    <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-lg">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm text-muted-foreground">
          {t("summary", { count: summary.lines.length })}
        </p>
        {reviewDisabled && reviewDisabledReason && (
          <p className="text-xs text-destructive">{reviewDisabledReason}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDiscard}
          disabled={disabled}
        >
          {t("discard")}
        </Button>
        <Button
          size="sm"
          onClick={onReview}
          disabled={disabled || reviewDisabled}
          title={reviewDisabled ? reviewDisabledReason : undefined}
        >
          {t("review")}
        </Button>
      </div>
    </div>
  );
}
