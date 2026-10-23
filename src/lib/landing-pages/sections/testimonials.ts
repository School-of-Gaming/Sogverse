import { z } from "zod";
import {
  landingBackgroundField,
  landingId,
  plainText,
  type LandingSectionDefinition,
} from "./shared";

/**
 * Testimonials from Marketing's store, placed by id and laid out in one of the
 * arrangements the home page and About already use.
 *
 * **The arrangement is chosen by its style, and each holds a fixed number of
 * testimonials**: `feature` the one large centred quote under the home hero,
 * `pair` two across as on About, `row` three across as Home's and About's row,
 * `showcase` About's whole arrangement — the feature, then the pair, then the
 * row. A section naming more or fewer than its arrangement holds is refused,
 * since a slot left empty or a quote with no slot would be a look nobody
 * chose. The SQL structure check (`landing_sections_problem`) states the same
 * counts, and a DB test holds the two halves to one answer.
 *
 * **The ids and the arrangement are structure, never words**: a testimonial is
 * the same testimonial in every language, and its own versions — whom it is
 * from and the quote — live in the store, where an edit shows on every live
 * page at once without a republish. A testimonial named twice is refused.
 * Whether a named id is a testimonial at all is the database's to check when
 * the structure is saved.
 *
 * **Its words are an optional eyebrow, heading and intro**, the header every
 * other section with a heading takes, and none is required: the quotes are
 * the section, so it never makes a version incomplete. The SQL half of the
 * required-text rule names the type with no required words too.
 */

export const LANDING_TESTIMONIAL_ARRANGEMENTS = ["feature", "pair", "row", "showcase"] as const;

export type LandingTestimonialArrangement = (typeof LANDING_TESTIMONIAL_ARRANGEMENTS)[number];

/** How many testimonials each arrangement shows: exactly this many, no more and no fewer. */
export const LANDING_TESTIMONIAL_SLOTS: {
  readonly [Arrangement in LandingTestimonialArrangement]: number;
} = {
  feature: 1,
  pair: 2,
  row: 3,
  showcase: 6,
};

function testimonialsNoun(count: number): string {
  return count === 1 ? "testimonial" : "testimonials";
}

/**
 * What is wrong with how many testimonials a section names for its
 * arrangement, or null: the sentence names both counts. The SQL half says the
 * same sentence.
 */
export function testimonialSlotProblem(section: {
  arrangement: LandingTestimonialArrangement;
  testimonialIds: readonly string[];
}): string | null {
  const slots = LANDING_TESTIMONIAL_SLOTS[section.arrangement];
  const count = section.testimonialIds.length;
  return count === slots
    ? null
    : `A ${section.arrangement} arrangement shows exactly ${slots} ${testimonialsNoun(slots)}; this section has ${count}`;
}

const section = z
  .object({
    id: landingId,
    type: z.literal("testimonials"),
    ...landingBackgroundField,
    arrangement: z.enum(LANDING_TESTIMONIAL_ARRANGEMENTS),
    /** In reading order; for a showcase, the feature, then the pair, then the row. */
    testimonialIds: z
      .array(landingId)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "A testimonials section names each testimonial once",
      ),
  })
  .strict();

const text = z
  .object({
    eyebrow: plainText,
    heading: plainText,
    intro: plainText,
  })
  .strict();

export const testimonialsSection = {
  type: "testimonials",
  label: "Testimonials",
  section,
  text,
  missingText: () => [],
  markdownFields: [],
  pictureShapes: [],
} as const satisfies LandingSectionDefinition<"testimonials", typeof section, typeof text>;
