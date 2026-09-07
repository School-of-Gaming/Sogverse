"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * A note under a field: a quiet block on the lifted grey, a mark and a
 * sentence.
 *
 * **There is one shape.** A second, louder variant existed — the same box
 * washed in a tint of act — and no section ever asked for it, so the app
 * carried an act-tinted callout nobody had seen. A field hint is something the
 * reader reads through, which is ink beside a mark, and the one thing that
 * would make a hint louder is a short label in colour above the sentence.
 * Nothing needs that today; when something does, it arrives with the label
 * rather than as a ground.
 */
export function InfoCallout({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-lifted px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
