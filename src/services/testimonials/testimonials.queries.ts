"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { TestimonialsService } from "./testimonials.service";
import type { TestimonialInput } from "./testimonials.contracts";
import { landingPageKeys } from "@/services/landing-pages/landing-pages.queries";
import { testimonialKeys } from "./testimonials.keys";

export { testimonialKeys };

/**
 * Every testimonial for the admin list, most recently saved first, with where
 * each is shown. Admin-only by RLS: a non-admin caller gets an empty list.
 */
export function useAdminTestimonials() {
  const service = new TestimonialsService(getClient());

  return useQuery({
    queryKey: testimonialKeys.adminList(),
    queryFn: () => service.listAdminTestimonials(),
  });
}

/** One testimonial. Nullable id so a caller can mount first. */
export function useAdminTestimonial(id: string | null | undefined) {
  const service = new TestimonialsService(getClient());

  return useQuery({
    queryKey: testimonialKeys.adminDetail(id ?? ""),
    queryFn: () => service.getAdminTestimonial(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Every testimonial write invalidates the whole `testimonials` tree: a save
 * or a removal changes the list and the detail alike. It invalidates the
 * landing pages' admin tree too, whose status pages show the words of the
 * testimonials each places. Returned rather than fired and forgotten, so a
 * caller awaiting `mutateAsync` never acts on a stale list.
 */
function useTestimonialInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: testimonialKeys.all }),
      queryClient.invalidateQueries({ queryKey: landingPageKeys.all }),
    ]);
  };
}

export function useCreateTestimonial() {
  const service = new TestimonialsService(getClient());
  const invalidate = useTestimonialInvalidation();

  return useMutation({
    mutationFn: (input: TestimonialInput) => service.createTestimonial(input),
    onSuccess: () => invalidate(),
  });
}

export function useSaveTestimonial() {
  const service = new TestimonialsService(getClient());
  const invalidate = useTestimonialInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TestimonialInput }) =>
      service.saveTestimonial(id, input),
    onSuccess: () => invalidate(),
  });
}
