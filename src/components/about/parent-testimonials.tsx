import { useTranslations } from "next-intl";
import { TestimonialShowcase } from "@/components/home/testimonial-arrangements";
import type { HomeTestimonials } from "@/services/testimonials";
import { Heading } from "@sog/ui";

interface ParentTestimonialsProps {
  /** Anchor id for the section nav. */
  id?: string;
  /** The testimonials in the home spots, which this section shows exactly. */
  testimonials: HomeTestimonials;
}

/**
 * "What parents tell us" on `/about`: exactly the testimonials the home page
 * shows, so a signed-in reader — who never reaches the home page — can still
 * read them. About has no setup of its own: it shows the home spots, laid out
 * in the home page's three groups as the showcase arrangement every page
 * shares — the large quote, then the pair, then the row. A group with no
 * testimonial renders nothing.
 *
 * The `py-16` is load-bearing for the same reason as on the other About
 * sections: it keeps an anchor landing clear of the section pill.
 */
export function ParentTestimonials({ id, testimonials }: ParentTestimonialsProps) {
  const t = useTranslations("home.testimonials");

  return (
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Heading level={2} step="display" align="center">
          {t("heading")}
        </Heading>
      </div>
      <TestimonialShowcase
        afterHeading
        groups={{ feature: testimonials.feature, pair: testimonials.safety, row: testimonials.row }}
      />
    </section>
  );
}
