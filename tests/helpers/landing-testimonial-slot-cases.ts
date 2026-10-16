import {
  LANDING_TESTIMONIAL_ARRANGEMENTS,
  LANDING_TESTIMONIAL_SLOTS,
  type LandingTestimonialArrangement,
} from "@/lib/landing-pages/sections";

/**
 * Cases for a testimonials section's slot count, which is checked twice — by
 * the TypeScript structure schema (`landingSections`) and by SQL
 * (`landing_sections_problem`). Every arrangement with every count from none
 * to one past the largest: exactly the arrangement's count is accepted, every
 * other refused with the sentence naming both. The unit test holds the
 * TypeScript half to each case and the DB test the SQL half, so the two
 * cannot drift.
 */

const id = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const SLOT_CASE_HERO = id(0x5001);
export const SLOT_CASE_SECTION = id(0x5002);

export interface TestimonialSlotCase {
  name: string;
  arrangement: LandingTestimonialArrangement;
  sections: { id: string; type: string; arrangement?: string; testimonialIds?: string[] }[];
  /** The sentence both halves refuse with, or null when the count fits. */
  problem: string | null;
}

export function testimonialSlotCases(): TestimonialSlotCase[] {
  const most = Math.max(...Object.values(LANDING_TESTIMONIAL_SLOTS));
  return LANDING_TESTIMONIAL_ARRANGEMENTS.flatMap((arrangement) => {
    const slots = LANDING_TESTIMONIAL_SLOTS[arrangement];
    return Array.from({ length: most + 2 }, (_, count) => ({
      name: `${arrangement} with ${count}`,
      arrangement,
      sections: [
        { id: SLOT_CASE_HERO, type: "hero" },
        {
          id: SLOT_CASE_SECTION,
          type: "testimonials",
          arrangement,
          testimonialIds: Array.from({ length: count }, (_, i) => id(0x6000 + i)),
        },
      ],
      problem:
        count === slots
          ? null
          : `A ${arrangement} arrangement shows exactly ${slots} ${slots === 1 ? "testimonial" : "testimonials"}; this section has ${count}`,
    }));
  });
}
