"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChangeSummaryList, StepProgressPanel } from "@/components/admin/commit-flow-parts";
import type { StepItem } from "@/components/admin/commit-flow-parts";
import type { ChangeSummary, NotifyPayload } from "@/hooks/use-group-editor";
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

export function CommitFlowDialog({
  open,
  onOpenChange,
  summary,
  productId,
  batchPayload,
  notifyPayload,
  onComplete,
}: CommitFlowDialogProps) {
  const t = useTranslations('admin.groups');
  const c = useTranslations('common');
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
          setErrorMessage(data.error || t('serverError', { status: String(response.status) }));
          setDone(true);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setErrorMessage(t('noResponseStream'));
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
                  setErrorMessage(event.error || t('failedToSaveChanges'));
                }
              } else if (event.type === "complete") {
                setDone(true);
                if (!event.success) {
                  setErrorMessage(event.error || t('operationFailed'));
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
        setErrorMessage((err as Error).message || t('networkError'));
        setDone(true);
      }
    })();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const showProgress = steps.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {/* --- Review (stays visible until server sends the plan) --- */}
        {!showProgress && (
          <>
            <DialogHeader>
              <DialogTitle>{t('confirmGroupChanges')}</DialogTitle>
              <DialogDescription>
                {t('changesWillBeApplied')}
              </DialogDescription>
            </DialogHeader>
            <ChangeSummaryList lines={summary.lines} />
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={running}>
                {c('cancel')}
              </Button>
              <Button onClick={handleConfirm} disabled={running}>
                {running ? t('saving') : c('confirm')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* --- Progress --- */}
        {showProgress && (
          <>
            <DialogHeader>
              <DialogTitle>{t('applyingChanges')}</DialogTitle>
              <DialogDescription>
                {done
                  ? errorMessage ? t('errorOccurred') : t('allChangesApplied')
                  : t('savingAndNotifying')}
              </DialogDescription>
            </DialogHeader>

            <StepProgressPanel steps={steps} errorMessage={errorMessage} done={done} />

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} disabled={!done}>
                {done ? c('close') : t('working')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
