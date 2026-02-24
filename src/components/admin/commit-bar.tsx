"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChangeSummaryDialog } from "./change-summary-dialog";
import type { ChangeSummary } from "@/hooks/use-group-editor";

interface CommitBarProps {
  summary: ChangeSummary;
  onCommit: () => void;
  onDiscard: () => void;
  isPending: boolean;
}

export function CommitBar({ summary, onCommit, onDiscard, isPending }: CommitBarProps) {
  const [showDialog, setShowDialog] = useState(false);

  if (!summary.hasChanges) return null;

  return (
    <>
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-lg">
        <p className="text-sm text-muted-foreground">
          {summary.lines.length} pending change{summary.lines.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={isPending}>
            Discard
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)} disabled={isPending}>
            {isPending ? "Saving…" : "Commit Changes"}
          </Button>
        </div>
      </div>

      <ChangeSummaryDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        summary={summary}
        onConfirm={() => {
          setShowDialog(false);
          onCommit();
        }}
        isPending={isPending}
      />
    </>
  );
}
