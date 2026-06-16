"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The "privacy screen" — a *subtle* frosted-glass tint over a locked zone's
 * member area for outsiders. Deliberately light: you can still read who's in
 * there. It conceals nothing (the real privacy is the separate Daily room) —
 * it's just UI grammar signalling "this is private". A small corner pill, not a
 * centered overlay, so it doesn't cover the roster. Insiders see no screen.
 */
export function PrivacyScreen({ className }: { className?: string }) {
  const t = useTranslations("voice");
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded-lg backdrop-blur-[1.5px]",
        className,
      )}
    >
      <span className="absolute right-1 top-1 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Lock className="h-2.5 w-2.5" />
        {t("privateZone")}
      </span>
    </div>
  );
}
