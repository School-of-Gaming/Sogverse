"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useApplyGroupChangesV2 } from "@/services/groups-v2";
import type { ChangeSummary } from "@/hooks/use-group-editor-v2";
import type { BatchGroupChangesV2 } from "@/services/groups-v2";

interface CommitSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
  productId: string;
  batchPayload: BatchGroupChangesV2;
  onSuccess: () => void;
}

export function CommitSummaryDialog({
  open,
  onOpenChange,
  summary,
  productId,
  batchPayload,
  onSuccess,
}: CommitSummaryDialogProps) {
  const t = useTranslations("admin.productsV2.groupsPanel.summary");
  const c = useTranslations("common");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const apply = useApplyGroupChangesV2(productId);

  const handleOpenChange = (next: boolean) => {
    if (apply.isPending) return; // can't close while applying
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  const handleApply = async () => {
    setErrorMessage(null);
    try {
      await apply.mutateAsync(batchPayload);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("genericError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ul className="my-4 max-h-72 space-y-2 overflow-auto pr-1 text-sm">
          {summary.lines.map((segments, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  segments.some((s) => s.type === "warning")
                    ? "bg-warning"
                    : "bg-primary"
                }`}
              />
              <span>
                {segments.map((seg, j) => {
                  if (seg.type === "warning") {
                    return (
                      <span key={j} className="font-medium text-warning">
                        {seg.value}
                      </span>
                    );
                  }
                  if (seg.type === "gamer") {
                    return (
                      <span key={j} className="font-medium text-info">
                        {seg.value}
                      </span>
                    );
                  }
                  if (seg.type === "gedu") {
                    return (
                      <span key={j} className="font-medium text-secondary">
                        {seg.value}
                      </span>
                    );
                  }
                  if (seg.type === "group") {
                    return (
                      <span key={j} className="font-medium text-primary">
                        {seg.value}
                      </span>
                    );
                  }
                  return <span key={j}>{seg.value}</span>;
                })}
              </span>
            </li>
          ))}
        </ul>

        {errorMessage && (
          <Alert variant="destructive">
            <p>{errorMessage}</p>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={apply.isPending}
          >
            {c("cancel")}
          </Button>
          <Button onClick={handleApply} disabled={apply.isPending}>
            {apply.isPending ? t("applying") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
