import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditSpotlightPage } from "@/components/admin/spotlights/edit-spotlight-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminSpotlightEdit") };
}

export default async function SpotlightRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditSpotlightPage spotlightId={id} />;
}
