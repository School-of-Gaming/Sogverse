import { useTranslations } from "next-intl";
import {
  TestimonialShowcase,
  type ShownTestimonial,
} from "@/components/home/testimonial-arrangements";
import {
  featureTestimonialKey,
  rowTestimonialKeys,
  safetyTestimonialKeys,
  type TestimonialKey,
} from "@/components/home/testimonial-keys";
import { Heading } from "@sog/ui";

interface ParentTestimonialsProps {
  /** Anchor id for the section nav. */
  id?: string;
}

/**
 * "What parents tell us" on `/about`: every parent quote the home page shows,
 * in full, so a signed-in reader — who never reaches the home page — can still
 * read them. The quotes are the home page's own strings and keys, laid out in
 * the home page's three groups as the showcase arrangement every page shares:
 * the large quote, then the pair, then the row.
 *
 * The `py-16` is load-bearing for the same reason as on the other About
 * sections: it keeps an anchor landing clear of the section pill.
 */
export function ParentTestimonials({ id }: ParentTestimonialsProps) {
  const t = useTranslations("home.testimonials");

  const shown = (key: TestimonialKey): ShownTestimonial => ({
    key,
    quote: t(`items.${key}.quote`),
    attribution: t(`items.${key}.attribution`),
  });

  return (
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Heading level={2} step="display" align="center">
          {t("heading")}
        </Heading>
      </div>
      <TestimonialShowcase
        afterHeading
        groups={{
          feature: [shown(featureTestimonialKey)],
          pair: safetyTestimonialKeys.map(shown),
          row: rowTestimonialKeys.map(shown),
        }}
      />
    </section>
  );
}
