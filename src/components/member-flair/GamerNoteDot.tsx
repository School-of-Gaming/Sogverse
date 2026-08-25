"use client";

import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The "this member has a Gedu note" marker: a small filled dot straddling the
 * top-right corner of the member's avatar.
 *
 * It sits *over the person* rather than at the row's far end because the
 * surfaces it serves are dense lists where the eye is on the faces — a Gedu
 * scanning a roster or a voice room should catch "that one has a note" without
 * reading each row to its end. The parent must be `relative` and not clip
 * overflow; the dot is positioned like the shared card-corner badge, scaled to
 * an avatar.
 *
 * It is an indicator, not a control — the click target that opens the note is
 * whatever wraps the avatar, so the dot stays decorative (`aria-hidden`) and
 * the wrapper carries the accessible name. Most members have no note, and for
 * them nothing renders at all: absence is the resting state.
 */
export function GamerNoteDot({ className }: { className?: string }) {
  const t = useTranslations("memberFlair");
  return (
    <span
      title={t("hasNote")}
      className={cn(
        "absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-info ring-2 ring-card",
        className,
      )}
    >
      <StickyNote className="h-2 w-2 text-info-foreground" aria-hidden />
      <span className="sr-only">{t("hasNote")}</span>
    </span>
  );
}
