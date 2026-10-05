import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditLandingPagePage } from "@/components/admin/landing-pages/edit-landing-page-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLandingPageEdit") };
}

export default async function LandingPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditLandingPagePage pageId={id} />;
}
