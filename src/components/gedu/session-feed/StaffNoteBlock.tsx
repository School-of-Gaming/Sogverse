"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The staff-only half of a session write-up.
 *
 * Two audiences read a session entry — families read the public note, the team
 * reads this — and the whole risk of the feature is a gedu typing something for
 * one audience while picturing the other. So the staff block never looks like
 * body copy: it is a recessed, dashed, muted panel behind a padlock, and it
 * keeps that exact treatment in the editor too, so the boundary is visible at
 * the moment of writing and not only at the moment of reading.
 */
export function StaffNoteBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-border bg-muted/60 p-3",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
        {t("staffNoteLabel")}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
