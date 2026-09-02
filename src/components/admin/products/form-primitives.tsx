"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
 * One info construct, everywhere — the admin forms' copy of the shape the shared
 * alert primitive spells and the shop's topic note and the schools page draw: a
 * **full-value family edge on a solid `bg-muted` ground, under that family's
 * ink**.
 *
 * Both variants were off the ruled shape. The info one drew a dashed neutral
 * edge over a `bg-muted/30` wash — a ground at an alpha step and an edge doing
 * no work, which is the add-affordance idiom rather than a status one. The warn
 * one edged in `border-primary`: amber is the *act* family, and a warning has a
 * token of its own, so the two meanings were sharing one line.
 *
 * The glyph is the same `Info` in both because the callout is one construct
 * saying one kind of thing; what changes between the variants is which family
 * says it.
 */
export function InfoCallout({
  text,
  variant = "info",
}: {
  text: string;
  variant?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-xs",
        // Ink and edge together, exactly as the alert primitive pairs them. Wit
        // ink is always soft — `--info` *is* wit-strong, so an info-toned mark
        // spells the soft variant while the edge keeps the semantic token.
        variant === "info"
          ? "border-info text-yty-wit-soft"
          : "border-warning text-warning",
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
