import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewTestimonialPage } from "@/components/admin/testimonials/new-testimonial-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTestimonialNew") };
}

export default function NewTestimonialRoute() {
  return <NewTestimonialPage />;
}
