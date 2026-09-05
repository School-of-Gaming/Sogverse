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
        "flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs",
        variant === "info"
          ? "bg-muted/30 text-muted-foreground"
          : "bg-primary/5 text-foreground"
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
