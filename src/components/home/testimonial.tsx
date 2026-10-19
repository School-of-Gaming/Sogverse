import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/**
 * One testimonial — a parent's, a gamer's or a gedu's own words — as the
 * public pages quote it. It takes the words as data and does not care where
 * they come from: the home page and About pass their own message strings.
 *
 * The quote is set in the editorial serif, italic, because it is a person's
 * voice rather than ours; whom it is from is ours and stays in the app face.
 *
 * **The quotation marks are the component's, never the quote's.** A quote is
 * passed without them and wrapped here in the reader's locale's own marks
 * (`testimonial.quoted`), so every locale quotes in its own style and no
 * writer has to know which.
 *
 * Two sizes, one construct: `feature` is the single large quote directly under
 * the hero, `compact` is a quote among others in a row or beside a list.
 */
export function Testimonial({
  quote,
  attribution,
  size = "compact",
  className,
}: {
  /** The words, localised and without quotation marks. */
  quote: string;
  /** Whom the quote is from, e.g. "Mum, Finland". */
  attribution: string;
  size?: "feature" | "compact";
  className?: string;
}) {
  const t = useTranslations("testimonial");
  const feature = size === "feature";

  return (
    <figure
      className={cn(
        "flex flex-col",
        feature ? "items-center gap-5 text-center" : "gap-3",
        className,
      )}
    >
      <blockquote
        className={cn(
          "font-serif italic text-foreground",
          feature ? "text-2xl leading-snug sm:text-3xl" : "text-xl leading-relaxed",
        )}
      >
        {t("quoted", { quote })}
      </blockquote>
      <figcaption className="text-sm font-medium text-muted-foreground">
        {attribution}
      </figcaption>
    </figure>
  );
}
