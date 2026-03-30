import { CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";
import type { ChangeSegment } from "@/hooks/use-group-editor";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StepItem {
  label: string;
  status: "pending" | "active" | "done" | "failed";
}

/* ------------------------------------------------------------------ */
/*  Step Icon                                                          */
/* ------------------------------------------------------------------ */

export function StepIcon({ status }: { status: StepItem["status"] }) {
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

/* ------------------------------------------------------------------ */
/*  Change Summary List                                                */
/* ------------------------------------------------------------------ */

export function ChangeSummaryList({ lines }: { lines: ChangeSegment[][] }) {
  return (
    <ul className="my-4 space-y-2 text-sm">
      {lines.map((segments, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${segments.some((s) => s.type === "warning") ? "bg-warning" : "bg-primary"}`} />
          <span>
            {segments.map((seg, j) => {
              if (seg.type === "warning") return <span key={j} className="font-medium text-warning">{seg.value}</span>;
              if (seg.type === "gamer") return <span key={j} className="font-medium text-info">{seg.value}</span>;
              if (seg.type === "gedu") return <span key={j} className="font-medium text-secondary">{seg.value}</span>;
              return <span key={j}>{seg.value}</span>;
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Progress Panel                                                */
/* ------------------------------------------------------------------ */

export function StepProgressPanel({
  steps,
  errorMessage,
  done,
}: {
  steps: StepItem[];
  errorMessage?: string | null;
  /** Whether the flow has finished. Defaults to true when all steps are done/failed. */
  done?: boolean;
}) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const percent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
  const finished = done ?? steps.every((s) => s.status === "done" || s.status === "failed");

  return (
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

      {finished && errorMessage && (
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-muted-foreground">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
