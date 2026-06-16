"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The "privacy screen" — a frosted-glass blur laid over a locked zone's member
 * area for outsiders. It conceals nothing on its own (the real privacy is the
 * separate Daily room); it's UI grammar that signals "this is private". Insiders
 * see each other without it.
 */
export function PrivacyScreen({ className }: { className?: string }) {
  const t = useTranslations("voice");
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg",
        "bg-background/30 backdrop-blur-md",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Lock className="h-3 w-3" />
        {t("privateZoneHint")}
      </span>
    </div>
  );
}
