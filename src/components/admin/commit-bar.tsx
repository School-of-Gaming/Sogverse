"use client";

import { Button } from "@/components/ui/button";
import type { ChangeSummary } from "@/hooks/use-group-editor";

interface CommitBarProps {
  summary: ChangeSummary;
  onReview: () => void;
  onDiscard: () => void;
}

export function CommitBar({ summary, onReview, onDiscard }: CommitBarProps) {
  if (!summary.hasChanges) return null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-lg">
      <p className="text-sm text-muted-foreground">
        {summary.lines.length} pending change{summary.lines.length !== 1 ? "s" : ""}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" onClick={onReview}>
          Commit Changes
        </Button>
      </div>
    </div>
  );
}
