/**
 * The testimonials' query keys, in a module of their own because two features
 * name them: the testimonials' own hooks, and the landing page writes that
 * change where a testimonial is used. The landing page hooks cannot import
 * them from `testimonials.queries.ts`, which already imports theirs, so the
 * keys sit where both sides can reach them without a cycle.
 */
export const testimonialKeys = {
  all: ["testimonials"] as const,
  admin: () => [...testimonialKeys.all, "admin"] as const,
  adminList: () => [...testimonialKeys.admin(), "list"] as const,
  adminDetail: (id: string) => [...testimonialKeys.admin(), "detail", id] as const,
};
