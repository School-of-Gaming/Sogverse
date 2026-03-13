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
import type { NotifyPayload } from "@/hooks/use-group-editor";

interface NotificationProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  payload: NotifyPayload | null;
}

interface JobItem {
  description: string;
  recipient: string;
  status: "pending" | "sending" | "sent" | "failed";
  error?: string;
}

interface ProgressState {
  status: "connecting" | "sending" | "complete" | "error";
  jobs: JobItem[];
  message: string;
}

export function NotificationProgressDialog({
  open,
  onOpenChange,
  productId,
  payload,
}: NotificationProgressDialogProps) {
  const [progress, setProgress] = useState<ProgressState>({
    status: "connecting",
    jobs: [],
    message: "Connecting...",
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !payload) return;

    setProgress({ status: "connecting", jobs: [], message: "Connecting..." });

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const response = await fetch(`/api/admin/products/${productId}/groups/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setProgress((p) => ({
            ...p,
            status: "error",
            message: data.error || `Server error: ${response.status}`,
          }));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setProgress((p) => ({ ...p, status: "error", message: "No response stream" }));
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
                const jobs: JobItem[] = event.jobs.map((j: { description: string; recipient: string }) => ({
                  description: j.description,
                  recipient: j.recipient,
                  status: "pending" as const,
                }));
                // Mark the first job as sending
                if (jobs.length > 0) jobs[0].status = "sending";
                setProgress({
                  status: "sending",
                  jobs,
                  message: `Sending 0 of ${jobs.length}...`,
                });
              } else if (event.type === "sent") {
                setProgress((p) => {
                  const jobs = [...p.jobs];
                  jobs[event.index] = { ...jobs[event.index], status: "sent" };
                  // Mark the next pending job as sending
                  const next = jobs.findIndex((j) => j.status === "pending");
                  if (next !== -1) jobs[next] = { ...jobs[next], status: "sending" };
                  const done = jobs.filter((j) => j.status === "sent" || j.status === "failed").length;
                  return { ...p, jobs, message: `Sending ${done} of ${jobs.length}...` };
                });
              } else if (event.type === "failed") {
                setProgress((p) => {
                  const jobs = [...p.jobs];
                  jobs[event.index] = { ...jobs[event.index], status: "failed", error: event.error };
                  const next = jobs.findIndex((j) => j.status === "pending");
                  if (next !== -1) jobs[next] = { ...jobs[next], status: "sending" };
                  const done = jobs.filter((j) => j.status === "sent" || j.status === "failed").length;
                  return { ...p, jobs, message: `Sending ${done} of ${jobs.length}...` };
                });
              } else if (event.type === "complete") {
                setProgress((p) => ({
                  ...p,
                  status: "complete",
                  message: event.failed > 0
                    ? `${event.sent} sent, ${event.failed} failed`
                    : `${event.sent} email${event.sent !== 1 ? "s" : ""} sent successfully`,
                }));
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
          chunk = await reader.read();
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setProgress((p) => ({
          ...p,
          status: "error",
          message: (err as Error).message || "Network error",
        }));
      }
    })();

    return () => {
      controller.abort();
    };
  }, [open, payload, productId]);

  const isDone = progress.status === "complete" || progress.status === "error";
  const sentCount = progress.jobs.filter((j) => j.status === "sent").length;
  const total = progress.jobs.length;
  const percent = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isDone) return;
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sending Emails</DialogTitle>
          <DialogDescription>
            {progress.status === "connecting" && "Preparing emails..."}
            {progress.status === "sending" && "Emailing impacted users about group changes..."}
            {progress.status === "complete" && "All emails processed."}
            {progress.status === "error" && "An error occurred while sending emails."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress bar */}
          {total > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${isDone && total === 0 ? 100 : percent}%` }}
              />
            </div>
          )}

          {/* Job list */}
          {progress.jobs.length > 0 && (
            <div className="max-h-52 overflow-auto rounded border border-border bg-muted/50 p-3 text-sm space-y-2">
              {progress.jobs.map((job, i) => (
                <div key={i} className="flex items-start gap-2">
                  {job.status === "pending" && (
                    <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40" />
                  )}
                  {job.status === "sending" && (
                    <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-primary" />
                  )}
                  {job.status === "sent" && (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  )}
                  {job.status === "failed" && (
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  )}
                  <span className={job.status === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}>
                    {job.description}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Status line */}
          {(progress.status === "connecting" || progress.status === "error") && (
            <div className="flex items-center gap-2 text-sm">
              {progress.status === "connecting" && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {progress.status === "error" && (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-muted-foreground">{progress.message}</span>
            </div>
          )}

          {/* Summary line when complete */}
          {progress.status === "complete" && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">{progress.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={!isDone}>
            {isDone ? "Close" : "Sending..."}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
