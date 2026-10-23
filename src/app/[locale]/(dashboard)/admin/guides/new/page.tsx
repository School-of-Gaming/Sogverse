import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewGuidePage } from "@/components/admin/guides/new-guide-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGuideNew") };
}

export default function NewGuideRoute() {
  return <NewGuidePage />;
}
