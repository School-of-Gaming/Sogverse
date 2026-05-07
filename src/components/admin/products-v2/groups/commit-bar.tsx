"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ChangeSummary } from "@/hooks/use-group-editor-v2";

interface CommitBarProps {
  summary: ChangeSummary;
  onReview: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}

export function CommitBar({
  summary,
  onReview,
  onDiscard,
  disabled,
}: CommitBarProps) {
  const t = useTranslations("admin.productsV2.groupsPanel.commitBar");

  if (!summary.hasChanges) return null;

  return (
    <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-lg">
      <p className="text-sm text-muted-foreground">
        {t("summary", { count: summary.lines.length })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDiscard}
          disabled={disabled}
        >
          {t("discard")}
        </Button>
        <Button size="sm" onClick={onReview} disabled={disabled}>
          {t("review")}
        </Button>
      </div>
    </div>
  );
}
