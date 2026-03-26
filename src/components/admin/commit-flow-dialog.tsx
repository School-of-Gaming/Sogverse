"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ChangeSummary, ChangeSegment, NotifyPayload } from "@/hooks/use-group-editor";
import type { BatchGroupChanges } from "@/services/groups";

interface CommitFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
  productId: string;
  batchPayload: BatchGroupChanges;
  notifyPayload: NotifyPayload;
  onComplete: () => void;
}

interface StepItem {
  label: string;
  status: "pending" | "active" | "done" | "failed";
}

function StepIcon({ status }: { status: StepItem["status"] }) {
  switch (status) {
    case "pending":
      return <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40" />;
    case "active":
      return <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />;
  }
}

export function CommitFlowDialog({
  open,
  onOpenChange,
  summary,
  productId,
  batchPayload,
  notifyPayload,
  onComplete,
}: CommitFlowDialogProps) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const completeCalled = useRef(false);

  const reset = () => {
    setRunning(false);
    setSteps([]);
    setDone(false);
    setErrorMessage(null);
    completeCalled.current = false;
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && running && !done) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const handleConfirm = () => {
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await fetch(`/api/admin/products/${productId}/groups/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: batchPayload, notify: notifyPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setErrorMessage(data.error || `Server error: ${response.status}`);
          setDone(true);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setErrorMessage("No response stream");
          setDone(true);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let chunk = await reader.read();

        while (!chunk.done) {
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "plan") {
                setSteps(
                  event.steps.map((s: { description: string }, i: number) => ({
                    label: s.description,
                    status: i === 0 ? "active" : "pending",
                  })),
                );
              } else if (event.type === "step_done") {
                setSteps((prev) => {
                  const next = [...prev];
                  next[event.index] = { ...next[event.index], status: "done" };
                  // Activate the next pending step
                  const nextPending = next.findIndex((s) => s.status === "pending");
                  if (nextPending !== -1) next[nextPending] = { ...next[nextPending], status: "active" };
                  return next;
                });
                // DB save (index 0) succeeded — notify parent to reset state
                if (event.index === 0 && !completeCalled.current) {
                  completeCalled.current = true;
                  onComplete();
                }
              } else if (event.type === "step_error") {
                setSteps((prev) => {
                  const next = [...prev];
                  next[event.index] = { ...next[event.index], status: "failed" };
                  const nextPending = next.findIndex((s) => s.status === "pending");
                  if (nextPending !== -1) next[nextPending] = { ...next[nextPending], status: "active" };
                  return next;
                });
                if (event.index === 0) {
                  setErrorMessage(event.error || "Failed to save group changes");
                }
              } else if (event.type === "complete") {
                setDone(true);
                if (!event.success) {
                  setErrorMessage(event.error || "Operation failed");
                }
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
          chunk = await reader.read();
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMessage((err as Error).message || "Network error");
        setDone(true);
      }
    })();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const showProgress = steps.length > 0;
  const doneCount = steps.filter((s) => s.status === "done").length;
  const percent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {/* --- Review (stays visible until server sends the plan) --- */}
        {!showProgress && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Group Changes</DialogTitle>
              <DialogDescription>
                The following changes will be applied:
              </DialogDescription>
            </DialogHeader>
            <ul className="my-4 space-y-2 text-sm">
              {summary.lines.map((segments, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${segments.some((s: ChangeSegment) => s.type === "warning") ? "bg-warning" : "bg-primary"}`} />
                  <span>
                    {segments.map((seg: ChangeSegment, j: number) => {
                      if (seg.type === "warning") {
                        return <span key={j} className="font-medium text-warning">{seg.value}</span>;
                      }
                      if (seg.type === "gamer") {
                        return <span key={j} className="font-medium text-info">{seg.value}</span>;
                      }
                      if (seg.type === "gedu") {
                        return <span key={j} className="font-medium text-secondary">{seg.value}</span>;
                      }
                      return <span key={j}>{seg.value}</span>;
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={running}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={running}>
                {running ? "Saving…" : "Confirm"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* --- Progress --- */}
        {showProgress && (
          <>
            <DialogHeader>
              <DialogTitle>Applying Changes</DialogTitle>
              <DialogDescription>
                {done
                  ? errorMessage ? "An error occurred." : "All changes applied."
                  : "Saving and notifying impacted users..."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="max-h-52 overflow-auto rounded border border-border bg-muted/50 p-3 text-sm space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <StepIcon status={step.status} />
                    <span className={step.status === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {done && errorMessage && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-muted-foreground">{errorMessage}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} disabled={!done}>
                {done ? "Close" : "Working..."}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
