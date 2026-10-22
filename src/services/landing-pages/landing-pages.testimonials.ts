import type {
  LandingSection,
  LandingTestimonialArrangement,
} from "@/lib/landing-pages/sections";
import type {
  PublicTestimonial,
  TestimonialVersion,
} from "@/services/testimonials/testimonials.contracts";

/**
 * One testimonials section of a page, as the admin's status page and the MCP
 * read tools show it: where it sits, its arrangement, and each testimonial it
 * places in reading order with its current words from the store — enough to
 * tell the quotes apart. `versions` is empty for an id the store does not
 * answer, which the save-time check keeps from arising.
 */
export interface LandingTestimonialsSection {
  sectionId: string;
  /** From one, in page order, as every admin answer numbers sections. */
  sectionNumber: number;
  arrangement: LandingTestimonialArrangement;
  testimonials: { testimonialId: string; versions: TestimonialVersion[] }[];
}

/** Each testimonials section of a structure, with its testimonials' words. */
export function landingTestimonialsSections(
  sections: readonly LandingSection[],
  words: Readonly<Record<string, PublicTestimonial>>,
): LandingTestimonialsSection[] {
  return sections.flatMap((section, index) =>
    section.type === "testimonials"
      ? [
          {
            sectionId: section.id,
            sectionNumber: index + 1,
            arrangement: section.arrangement,
            testimonials: section.testimonialIds.map((testimonialId) => ({
              testimonialId,
              versions: Object.hasOwn(words, testimonialId) ? words[testimonialId].versions : [],
            })),
          },
        ]
      : [],
  );
}

/** Testimonials by id, as a page's renderer and its admin reads look them up. */
export function testimonialsById(
  testimonials: readonly PublicTestimonial[],
): Record<string, PublicTestimonial> {
  return Object.fromEntries(testimonials.map((testimonial) => [testimonial.id, testimonial]));
}
