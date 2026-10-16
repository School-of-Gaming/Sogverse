import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import type { PublicTestimonial } from "@/services/testimonials";

/**
 * One testimonial — a parent's, a gamer's or a gedu's own words — as the
 * public pages quote it.
 *
 * The quote is set in the editorial serif, italic, because it is a person's
 * voice rather than ours; whom it is from is ours and stays in the app face.
 *
 * **The quotation marks are the page's, never the testimonial's.** The stored
 * quote carries none, and it is wrapped here in the reader's locale's own
 * marks (`testimonial.quoted`), so every locale quotes in its own style and
 * no writer has to know which. The version shown is the one the reader
 * fallback picks; when it is in another language than the page's, it is
 * marked with `lang`.
 *
 * Two sizes, one construct: `feature` is the single large quote directly under
 * the hero, `compact` is a quote among others in a row or beside a list.
 */
export function Testimonial({
  testimonial,
  size = "compact",
  className,
}: {
  testimonial: PublicTestimonial;
  size?: "feature" | "compact";
  className?: string;
}) {
  const t = useTranslations("testimonial");
  const locale = resolveLocale(useLocale());
  const version = resolveTranslation(testimonial.versions, locale);
  if (version === null) return null;

  const feature = size === "feature";
  // exact-locale: marking text shown in another language than the page's
  const lang = version.locale === locale ? undefined : version.locale;

  return (
    <figure
      lang={lang}
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
        {t("quoted", { quote: version.quote })}
      </blockquote>
      <figcaption className="text-sm font-medium text-muted-foreground">
        {version.from}
      </figcaption>
    </figure>
  );
}
