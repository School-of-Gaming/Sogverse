"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import {
  REPORT_CLAMP_REM,
  reportOverflows,
} from "./report-clamp";

/**
 * A session report in the feed: markdown, rendered formatted, clamped to a few
 * lines with an expand-in-place control underneath.
 *
 * **Clamped rather than truncated.** The whole report stays in the DOM and stays
 * rendered — the box around it is short. So expanding is a height animation on
 * content that is already laid out, with no second fetch, no re-render of the
 * body, and no reflow of the cards above: the card grows *downward*, exactly the
 * way the inline editor does.
 *
 * **The clamp always says it is a clamp.** A block of text ending flush against
 * an invisible edge reads as a report that happens to stop there, and a reader
 * who thinks they have finished does not look for a control. So a collapsed
 * report that has more to give fades out over its last line — a mask, not a
 * painted gradient, so it works on whatever surface the card is drawn on — and
 * the control sits directly beneath it.
 *
 * **A short report gets no control at all.** Whether one is offered comes from
 * measuring the rendered body against the height the clamp resolved to, not from
 * counting characters: markdown means the same 400 characters can be four lines
 * or fourteen depending on how many headings and list items are in it. The
 * measurement happens in a layout effect, before paint, so the control is never
 * seen to appear after the text it belongs to.
 */
export function SessionReport({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState(0);
  /**
   * The height the clamp resolves to, captured the first time this measures
   * while collapsed and then kept. It cannot be re-read once expanded (the shell
   * is by then as tall as its content), and it never changes — it is a fixed rem
   * length that only the root font size could move.
   */
  const [clampHeight, setClampHeight] = useState(0);

  const measure = useCallback(() => {
    const shell = shellRef.current;
    const body = bodyRef.current;
    if (shell === null || body === null) return;
    const clamped = shell.clientHeight;
    setClampHeight((known) => (known === 0 ? clamped : known));
    setNaturalHeight(body.scrollHeight);
  }, []);

  // Layout effect, not a plain one: the first measurement decides whether a
  // control renders, and doing it after paint would put a button on screen a
  // frame late, under a cursor already moving somewhere else.
  useLayoutEffect(measure, [measure, markdown]);

  // Fonts landing, a locale swap, or the rail narrowing all re-flow the body;
  // an observer keeps the offer honest without polling.
  useEffect(() => {
    const body = bodyRef.current;
    if (body === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [measure]);

  const overflowing = reportOverflows(naturalHeight, clampHeight);
  const clipped = overflowing && !expanded;

  return (
    <div className={className}>
      <div
        ref={shellRef}
        // `max-height` in px when open and rem when shut: both are lengths, so
        // the transition interpolates either way, and the open value tracks the
        // measured body rather than an over-guessed ceiling that would make the
        // animation finish early and then jump.
        style={{
          maxHeight:
            expanded && naturalHeight > 0
              ? `${naturalHeight}px`
              : `${REPORT_CLAMP_REM}rem`,
        }}
        className={cn(
          "overflow-hidden transition-[max-height] duration-300 ease-in-out motion-reduce:transition-none",
          clipped &&
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.25rem),transparent)]",
        )}
      >
        <div ref={bodyRef}>
          <Markdown>{markdown}</Markdown>
        </div>
      </div>

      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t("showLess") : t("readMore")}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
