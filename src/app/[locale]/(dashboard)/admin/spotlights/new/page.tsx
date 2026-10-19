import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewSpotlightPage } from "@/components/admin/spotlights/new-spotlight-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminSpotlightNew") };
}

export default function NewSpotlightRoute() {
  return <NewSpotlightPage />;
}
