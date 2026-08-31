"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * What stands where a removed message was.
 *
 * **A tombstone, never a removal.** The row keeps its place in the log, so a
 * message deleted three screens above a reader does not pull everything they
 * are reading upward — and a conversation that plainly had something in it does
 * not silently become one that never did.
 *
 * **One mark for both ways a message goes.** A sender deleting their own and a
 * moderator removing somebody else's leave exactly the same thing on screen, so
 * nothing here tells a room which of the two happened. That is a decision, not
 * an omission: a child whose message a Gedu removed is not additionally
 * announced to everybody, and a sender who thought better of something is not
 * made to look moderated.
 *
 * A moderator sees the original underneath, dimmed — that half is the bubble's,
 * because it is a *body* being drawn rather than a mark.
 */
export function ChatTombstone({
  /** Whether the dimmed original follows, which changes what the note says. */
  withOriginal = false,
  className,
}: {
  withOriginal?: boolean;
  className?: string;
}) {
  const t = useTranslations("chat.tombstone");
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm italic text-muted-foreground",
        className,
      )}
    >
      <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t("text")}</span>
      {withOriginal && <span className="not-italic text-xs">{t("staffOnly")}</span>}
    </p>
  );
}
