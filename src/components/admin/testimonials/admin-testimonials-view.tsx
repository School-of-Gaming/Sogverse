"use client";

import { useAdminTestimonials } from "@/services/testimonials";
import { AdminTestimonialsPage } from "./admin-testimonials-page";

/** The live data shell for `/admin/testimonials`: one read, into the body beside it. */
export function AdminTestimonialsView() {
  const { data, status } = useAdminTestimonials();

  return <AdminTestimonialsPage testimonials={data ?? []} status={status} />;
}
