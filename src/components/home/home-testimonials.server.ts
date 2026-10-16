import "server-only";
import { createAnonClient } from "@/lib/supabase/anon";
import type { HomeTestimonials } from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";

const NONE: HomeTestimonials = { feature: [], safety: [], row: [] };

/**
 * The testimonials in the home spots, as the home page and About render them —
 * read per request, like the rest of those pages, so an admin's edit to a
 * placed testimonial's words shows at once.
 *
 * Read as anon on purpose: the answer is the same for every reader, and the
 * public read hands back the placed testimonials alone.
 *
 * **A failed read renders the page without its quotes rather than failing the
 * page.** These are the site's front door, and a quote is the one part of
 * them that lives in the database; the failure is logged, so it is not
 * silent where it matters.
 */
export async function readHomeTestimonials(): Promise<HomeTestimonials> {
  try {
    return await new TestimonialsService(createAnonClient()).listHomeTestimonials();
  } catch (error) {
    console.error("[home] the home testimonials could not be read:", error);
    return NONE;
  }
}
