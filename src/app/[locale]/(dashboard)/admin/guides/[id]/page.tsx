import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditGuidePage } from "@/components/admin/guides/edit-guide-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGuideEdit") };
}

export default async function GuideRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditGuidePage guideId={id} />;
}
