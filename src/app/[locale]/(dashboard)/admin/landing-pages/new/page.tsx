import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewLandingPagePage } from "@/components/admin/landing-pages/new-landing-page-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLandingPageNew") };
}

export default function NewLandingPageRoute() {
  return <NewLandingPagePage />;
}
