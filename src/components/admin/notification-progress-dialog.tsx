"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
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

interface ProgressState {
  status: "sending" | "complete" | "error";
  current: number;
  total: number;
  message: string;
  errors: string[];
}

export function NotificationProgressDialog({
  open,
  onOpenChange,
  productId,
  payload,
}: NotificationProgressDialogProps) {
  const [progress, setProgress] = useState<ProgressState>({
    status: "sending",
    current: 0,
    total: 0,
    message: "Starting...",
    errors: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !payload) return;

    setProgress({ status: "sending", current: 0, total: 0, message: "Starting...", errors: [] });

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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "progress") {
                setProgress((p) => ({
                  ...p,
                  current: event.current,
                  total: event.total,
                  message: event.message,
                }));
              } else if (event.type === "sent") {
                setProgress((p) => ({
                  ...p,
                  current: event.current,
                  total: event.total,
                }));
              } else if (event.type === "complete") {
                setProgress({
                  status: "complete",
                  current: event.sent,
                  total: event.sent + event.failed,
                  message: event.failed > 0
                    ? `${event.sent} sent, ${event.failed} failed`
                    : `${event.sent} notification${event.sent !== 1 ? "s" : ""} sent`,
                  errors: event.errors ?? [],
                });
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
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
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isDone) return; // Prevent closing while sending
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sending Notifications</DialogTitle>
          <DialogDescription>
            {progress.status === "sending" && "Notifying impacted users of group changes..."}
            {progress.status === "complete" && "All notifications processed."}
            {progress.status === "error" && "An error occurred while sending notifications."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${isDone && progress.total === 0 ? 100 : percent}%` }}
            />
          </div>

          {/* Status line */}
          <div className="flex items-center gap-2 text-sm">
            {progress.status === "sending" && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            {progress.status === "complete" && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {progress.status === "error" && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="text-muted-foreground">{progress.message}</span>
          </div>

          {/* Error details */}
          {progress.errors.length > 0 && (
            <div className="max-h-32 overflow-auto rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {progress.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
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
