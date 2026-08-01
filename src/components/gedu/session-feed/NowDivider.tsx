"use client";

import { ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The line between what is still to come and what has already happened — and
 * the control that reveals the first of those.
 *
 * **It is a rule, not a card.** The future sessions used to live inside a dashed
 * container that expanded downward within itself, which made them the *contents
 * of a control* rather than part of the feed: same sessions, same states, same
 * editors, rendered in a box that said "this is a widget". Now they are ordinary
 * feed entries with their own timeline markers, and this row is the only thing
 * marking the boundary they sit on. One boundary, one line, nothing framed.
 *
 * **The chevron points up, because that is where the sessions are.** The feed
 * runs newest-first, so the future is *above* this line and the reveal grows
 * upward into it. A chevron pointing down at a control that adds nothing below
 * it would be pointing at the past.
 *
 * The row says "N upcoming sessions" rather than "N later sessions": in a feed
 * that runs future-to-past, "later" is ambiguous about which direction it means,
 * and this line is exactly where that ambiguity costs the most.
 */
export function NowDivider({
  count,
  open,
  onToggle,
}: {
  /** How many future sessions sit behind the collapse. */
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div className="relative flex items-center gap-3 py-1">
      {/* A tick on the rail rather than a dot: this is not a session, and a dot
          here would read as one more point on the timeline. Same treatment the
          month boundaries get, for the same reason. */}
      <span
        aria-hidden
        className="absolute -left-6 top-1/2 h-px w-3 -translate-x-1/2 bg-border"
      />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronUp
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        {t("laterSessions", { count })}
      </button>

      {/* The rule runs out to the edge from the label, so the boundary reads
          across the whole column without a box being drawn anywhere. */}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
