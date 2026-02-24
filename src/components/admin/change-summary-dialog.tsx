"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ChangeSummary, ChangeSegment } from "@/hooks/use-group-editor";

interface ChangeSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
  onConfirm: () => void;
  isPending: boolean;
}

export function ChangeSummaryDialog({
  open,
  onOpenChange,
  summary,
  onConfirm,
  isPending,
}: ChangeSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Group Changes</DialogTitle>
          <DialogDescription>
            The following changes will be applied:
          </DialogDescription>
        </DialogHeader>
        <ul className="my-4 space-y-2 text-sm">
          {summary.lines.map((segments, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${segments.some((s: ChangeSegment) => s.type === "warning") ? "bg-amber-400" : "bg-primary"}`} />
              <span>
                {segments.map((seg: ChangeSegment, j: number) => {
                  if (seg.type === "warning") {
                    return <span key={j} className="font-medium text-amber-400">{seg.value}</span>;
                  }
                  if (seg.type === "gamer") {
                    return <span key={j} className="font-medium text-blue-400">{seg.value}</span>;
                  }
                  if (seg.type === "gedu") {
                    return <span key={j} className="font-medium text-purple-400">{seg.value}</span>;
                  }
                  return <span key={j}>{seg.value}</span>;
                })}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
