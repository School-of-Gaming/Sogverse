import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminLandingPagesView } from "@/components/admin/landing-pages/admin-landing-pages-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLandingPages") };
}

export default function AdminLandingPagesRoute() {
  return <AdminLandingPagesView />;
}
