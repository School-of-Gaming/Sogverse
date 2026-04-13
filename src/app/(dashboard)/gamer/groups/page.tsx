import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GamerGroupsPageContent } from "@/components/gamer/GamerGroupsPageContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("gamerGroups"), description: "View your enrolled groups and voice sessions" };
}

export default function GamerGroupsPage() {
  return <GamerGroupsPageContent />;
}
