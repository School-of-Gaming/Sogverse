import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One parent's words, as the home page quotes them.
 *
 * The quote is set in the editorial serif, italic, because it is a person's
 * voice rather than ours; the attribution is ours and stays in the app face.
 * **Attribution is role and country only** ("Mum, Finland") — never a name or
 * a handle. The families consented to being quoted on those terms.
 *
 * Two sizes, one construct: `feature` is the single large quote directly under
 * the hero, `compact` is a quote among others in a row or beside a list.
 *
 * **`media` is the slot a photo arrives in later.** Nothing is drawn for it
 * today — no placeholder, no reserved box — so the quote stands on its own; a
 * caller that passes an image gets it beside the words (above them on a
 * phone) without restructuring the section that holds the quote.
 */
export function Testimonial({
  quote,
  attribution,
  size = "compact",
  media,
  className,
}: {
  /** The quote, already localised and carrying its own quotation marks. */
  quote: string;
  /** Role and country, e.g. "Mum, Finland". */
  attribution: string;
  size?: "feature" | "compact";
  media?: ReactNode;
  className?: string;
}) {
  const feature = size === "feature";

  return (
    <figure
      className={cn(
        "flex flex-col gap-6",
        media && "md:flex-row md:items-center md:gap-10",
        feature && !media && "items-center text-center",
        className,
      )}
    >
      {media && <div className="shrink-0 md:w-2/5">{media}</div>}
      <div className={cn("flex flex-col", feature ? "gap-5" : "gap-3")}>
        <blockquote
          className={cn(
            "font-serif italic text-foreground",
            feature ? "text-2xl leading-snug sm:text-3xl" : "text-xl leading-relaxed",
          )}
        >
          {quote}
        </blockquote>
        <figcaption className="text-sm font-medium text-muted-foreground">
          {attribution}
        </figcaption>
      </div>
    </figure>
  );
}
