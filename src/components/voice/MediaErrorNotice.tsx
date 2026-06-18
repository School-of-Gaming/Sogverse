"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaErrorCategory } from "@/lib/voice/media-error";

interface MediaErrorNoticeProps {
  /** The classified failure. Drives which body copy renders. */
  category: MediaErrorCategory;
  className?: string;
}

/**
 * Shown wherever a mic/camera acquisition fails — the instant-room lobby
 * (pre-join) and the in-call mic-settings popover. Replaces the old silent
 * flash-off + the inferred "blocked" guess with the *actual* categorized
 * problem, so the user sees why their mic isn't working and what to do.
 *
 * The Reload button is the recovery path for the cases a page reload can clear:
 * a denial the user has since re-allowed in site settings, or a device freed up
 * in another app. It's harmless (if useless) for the others, so it always shows.
 *
 * The `denied` copy is a conditional ("if you blocked it…"), never an
 * accusation: a `NotAllowedError` can't distinguish an explicit deny from a
 * remembered one (see `media-error.ts`), and the browser-settings path is the
 * same either way.
 */
export function MediaErrorNotice({ category, className }: MediaErrorNoticeProps) {
  const t = useTranslations("voice.mediaError");
  return (
    <div
      className={cn(
        "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
      role="alert"
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t(category)}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 gap-1.5"
        onClick={() => window.location.reload()}
      >
        <RotateCw className="h-3.5 w-3.5" />
        {t("reload")}
      </Button>
    </div>
  );
}
