import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditTestimonialPage } from "@/components/admin/testimonials/edit-testimonial-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTestimonialEdit") };
}

export default async function TestimonialRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditTestimonialPage testimonialId={id} />;
}
