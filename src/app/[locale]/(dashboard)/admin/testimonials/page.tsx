import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { NewTestimonialAction } from "@/components/admin/testimonials/admin-testimonials-page";
import { AdminTestimonialsView } from "@/components/admin/testimonials/admin-testimonials-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTestimonials") };
}

export default async function AdminTestimonialsRoute() {
  const t = await getTranslations("admin.testimonials");

  return (
    <AdminHub hub="marketing" description={t("subtitle")} action={<NewTestimonialAction />}>
      <AdminTestimonialsView />
    </AdminHub>
  );
}
