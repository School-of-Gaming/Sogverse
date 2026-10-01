import { useTranslations } from "next-intl";
import { Testimonial } from "@/components/home/testimonial";
import {
  featureTestimonialKey,
  rowTestimonialKeys,
  safetyTestimonialKeys,
  type TestimonialKey,
} from "@/components/home/testimonial-keys";

interface ParentTestimonialsProps {
  /** Anchor id for the section nav. */
  id?: string;
}

/**
 * "What parents tell us" on `/about`: every parent quote the home page shows,
 * in full, so a signed-in reader — who never reaches the home page — can still
 * read them. The quotes are the home page's own strings and keys, laid out in
 * the home page's three groups: the large quote, then the pair, then the row.
 *
 * The `py-16` is load-bearing for the same reason as on the other About
 * sections: it keeps an anchor landing clear of the section pill.
 */
export function ParentTestimonials({ id }: ParentTestimonialsProps) {
  const t = useTranslations("home.testimonials");

  const quote = (key: TestimonialKey) => (
    <Testimonial
      key={key}
      quote={t(`items.${key}.quote`)}
      attribution={t(`items.${key}.attribution`)}
    />
  );

  return (
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
      <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
        {t("heading")}
      </h2>
      <Testimonial
        size="feature"
        quote={t(`items.${featureTestimonialKey}.quote`)}
        attribution={t(`items.${featureTestimonialKey}.attribution`)}
        className="mx-auto mt-12 max-w-3xl lg:mt-16"
      />
      <div className="mx-auto mt-16 grid max-w-5xl gap-10 md:grid-cols-2">
        {safetyTestimonialKeys.map(quote)}
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-10 md:grid-cols-3">
        {rowTestimonialKeys.map(quote)}
      </div>
    </section>
  );
}
