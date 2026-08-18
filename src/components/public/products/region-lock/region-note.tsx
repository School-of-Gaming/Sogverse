"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * **The one block all three region-lock candidates are built out of.**
 *
 * Every candidate says the same two things — a short title and a sentence — and
 * differs only in where that block is put and what sits under it. Keeping the
 * block itself shared is what makes the three variants comparable: a difference
 * a reviewer sees between two preview scenes is a difference in the *shape*
 * being proposed, never in how somebody happened to style a paragraph that
 * afternoon.
 *
 * Two tones, and they are a real distinction rather than two shades:
 *
 * - `"ask"` — we need something from the reader and they can give it here. It
 *   carries the info accent, because it is the one thing in the panel asking
 *   to be acted on.
 * - `"closed"` — nothing to do. It is the muted, bordered note the panel
 *   already uses for its other dead ends (the wrong-role note, the closed
 *   panel), so a "not sold here" note reads as the same kind of statement
 *   rather than as an error. Deliberately not destructive: nothing has gone
 *   wrong, and a red panel would say it had.
 *
 * The block reserves nothing. `action` is mounted only when a variant offers
 * one, because a variant that offers none has nothing that could ever appear
 * there — an empty slot held open under the sentence would be dead space in a
 * 20rem rail.
 */
export type RegionNoteTone = "ask" | "closed";

interface RegionNoteProps {
  tone: RegionNoteTone;
  /** Decorative — the title beside it says everything the glyph does. */
  icon: LucideIcon;
  title: string;
  body: string;
  /** An action under the sentence, where the variant offers one. */
  action?: ReactNode;
}

export function RegionNote({
  tone,
  icon: Icon,
  title,
  body,
  action,
}: RegionNoteProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "ask"
          ? "border-info/40 bg-info/10"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "ask" ? "text-info" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-semibold",
              tone === "closed" && "text-muted-foreground",
            )}
          >
            {title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}
