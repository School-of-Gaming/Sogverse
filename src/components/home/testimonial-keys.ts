/**
 * The parent quotes the public pages show, as keys of
 * `home.testimonials.items`, grouped by where the home page places them.
 *
 * The home page holds nothing that lives nowhere else, so every quote it
 * shows is also on About, in full, under "What parents tell us". Both pages
 * read these groups rather than listing keys of their own, so a quote added to
 * or retired from the home page reaches About with it.
 */

/** The single large quote directly under the home hero. */
export const featureTestimonialKey = "highlightOfTheWeek" as const;

/** The quotes paired with the safety facts. */
export const safetyTestimonialKeys = ["funAndSupervised", "positiveExperience"] as const;

/** The row further down the home page. */
export const rowTestimonialKeys = ["sighWithHappiness", "largeGroups", "finnishImproved"] as const;

export type TestimonialKey =
  | typeof featureTestimonialKey
  | (typeof safetyTestimonialKeys)[number]
  | (typeof rowTestimonialKeys)[number];
