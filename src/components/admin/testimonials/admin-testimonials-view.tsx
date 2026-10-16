"use client";

import { useAdminTestimonials, useDeleteTestimonial } from "@/services/testimonials";
import { AdminTestimonialsPage } from "./admin-testimonials-page";

/** The live data shell for `/admin/testimonials`: one read and the list's one write, into the body beside it. */
export function AdminTestimonialsView() {
  const { data, status } = useAdminTestimonials();
  const deleteTestimonial = useDeleteTestimonial();

  return (
    <AdminTestimonialsPage
      testimonials={data ?? []}
      status={status}
      actions={{
        // Resolves once the list has been read again, so the dialog closes
        // onto a list without the row.
        remove: (id) => deleteTestimonial.mutateAsync(id),
      }}
    />
  );
}
