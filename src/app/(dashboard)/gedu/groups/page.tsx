import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduGroupsPageContent } from "@/components/gedu/GeduGroupsPageContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduGroups"), description: "View your assigned groups and students" };
}

export default function GeduGroupsPage() {
  return <GeduGroupsPageContent />;
}
