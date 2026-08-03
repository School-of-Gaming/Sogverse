"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import { REPORT_CLAMP_REM, reportOverflows } from "./report-clamp";

/**
 * A session report in the feed: markdown, rendered formatted, clamped to a few
 * lines with an expand-in-place control underneath.
 *
 * **Clamped rather than truncated.** The whole report stays in the DOM and stays
 * rendered — the box around it is short. So expanding costs no second fetch, no
 * re-render of the body, and no reflow of anything above it: the card grows
 * *downward*, exactly the way the inline editor does.
 *
 * **The clamp always says it is a clamp.** A block of text ending flush against
 * an invisible edge reads as a report that happens to stop there, and a reader
 * who thinks they have finished does not look for a control. So a collapsed
 * report that has more to give fades out over its last line — a mask, not a
 * painted gradient, so it works on whatever surface the card is drawn on.
 *
 * **The control sits *above* the body, not under it.** It used to sit
 * underneath, which is where the eye finishes reading and is exactly why it was
 * wrong: expanding inserts several lines between the text and the button, so the
 * button the reader had just clicked shot down the page and whatever was beneath
 * it went with it. A control above its own region is the only arrangement where
 * a reveal grows away from everything already painted — the same arrangement the
 * attendance disclosure on this card uses, so the two behave alike.
 *
 * **Nothing here measures anything.** Whether a control is offered is decided
 * from the markdown source, by arithmetic the server and the browser both run,
 * and it is never revised afterwards. This component used to seed that decision
 * from an estimate and correct it from a measured height in a layout effect,
 * which is the textbook shape and was wrong for this surface: the *server's*
 * HTML is on screen long before any of it runs, so a borderline report grew its
 * "Read more" a whole hydration after the reader was already reading the text
 * it belonged to — and shoved the rest of the feed down as it landed. A control
 * that is occasionally a line eager or a line late beats one that appears out
 * from under the cursor, so the estimate is the only authority and the whole
 * correction path is gone.
 *
 * **Expanding is instant, and deliberately not animated.** Animating it would
 * mean knowing the report's natural height — which means measuring it, which is
 * the thing this component no longer does. The reveal grows downward under a
 * control the reader just clicked, which is the one direction a reflow is
 * allowed to go.
 */
export function SessionReport({
  markdown,
  clamped = true,
  className,
}: {
  markdown: string;
  /**
   * Whether this report may be collapsed at all.
   *
   * The **most recent past session** passes `false`: it is the one entry the
   * weekly loop actually reads — what happened last time, read while writing up
   * or prepping the next one — and making the reader spend a click to see the
   * thing they came for is a toll on the common path. Every older report keeps
   * the clamp, which is what stops a term of them becoming a wall.
   */
  clamped?: boolean;
  className?: string;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const overflowing = clamped && reportOverflows(markdown);
  const clipped = overflowing && !expanded;

  return (
    <div className={className}>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="mb-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t("showLess") : t("readMore")}
          {/* The chevron points at where the change lands: down into the body
              this control sits above, up to fold it back away. */}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}

      <div
        id={bodyId}
        // A fixed rem length while clipped and no ceiling at all otherwise —
        // never a measured pixel height, because measuring is what this
        // component exists not to do.
        style={clipped ? { maxHeight: `${REPORT_CLAMP_REM}rem` } : undefined}
        className={cn(
          // The `black` in the mask is not a colour and is not themed: a
          // mask-image is read for its **alpha** only, so the stop means "fully
          // opaque here" and the transparent one means "fully faded there". Any
          // opaque value would do the same job; nothing of it is ever painted,
          // which is the whole reason a mask is used instead of a gradient
          // overlay that would have to know the card's own background.
          clipped &&
            "overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-2.25rem),transparent)]",
        )}
      >
        <Markdown>{markdown}</Markdown>
      </div>
    </div>
  );
}
