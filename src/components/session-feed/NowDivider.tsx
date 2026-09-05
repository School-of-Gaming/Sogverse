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
 * **It is the single most important row in the column, and it is drawn like
 * it.** This was a hairline rule and an 11px muted label — the same treatment
 * the month boundaries get — and in a scroll of near-identical dated cards it
 * was simply missed: readers went past the boundary between the future and the
 * past without registering that they had crossed one, which is the one mistake
 * this feed can make. So the rule is two pixels and tinted, the label is a
 * bordered pill at body size rather than a whisper, and the whole row carries
 * the **info** family — the same blue every future session's tag wears, because
 * this is the edge of exactly that territory. It stays a rule and a pill: no
 * background, no border around the row, nothing that could be taken for one
 * more session card.
 *
 * **The chevron points up, because that is where the sessions are.** The feed
 * runs newest-first, so the future is *above* this line and the reveal grows
 * upward into it. A chevron pointing down at a control that adds nothing below
 * it would be pointing at the past.
 *
 * **The count says "N more upcoming sessions", and every word of that is load-
 * bearing.** "Later sessions" was the first attempt and it fails on direction: in
 * a feed that runs future-to-past, "later" is ambiguous about which way it
 * points, and this line is exactly where that ambiguity costs the most. Naming
 * the direction fixed that and left a second ambiguity behind it — the next
 * session is already on screen *below* this row, so a bare "3 upcoming sessions"
 * is read by half the people who see it as three including the one they can see.
 * "More" is what settles it: the number counts what is hidden, and the row is a
 * control that reveals exactly that many.
 */
export function NowDivider({
  count,
  open,
  controls,
  onToggle,
}: {
  /** How many future sessions sit behind the collapse. */
  count: number;
  open: boolean;
  /**
   * Id of the list this toggle changes the contents of. The revealed sessions
   * are ordinary rows in the feed's one keyed run rather than the children of a
   * container, so what the control names is the run itself.
   */
  controls: string;
  onToggle: () => void;
}) {
  const t = useTranslations("sessionFeed");

  return (
    <div className="relative flex items-center gap-3 py-2">
      {/* A tick on the rail rather than a dot: this is not a session, and a dot
          here would read as one more point on the timeline. Toned and thicker
          than the month ticks, so the rail says where the boundary is too. */}
      <span
        aria-hidden
        className="absolute -left-6 top-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-info/70"
      />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-info/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-info transition-colors hover:bg-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronUp
          aria-hidden
          className={cn(
            "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        {t("laterSessions", { count })}
      </button>

      {/* The rule runs out to the edge from the label, so the boundary reads
          across the whole column without a box being drawn anywhere. */}
      <span aria-hidden className="h-0.5 flex-1 rounded-full bg-info/40" />
    </div>
  );
}
