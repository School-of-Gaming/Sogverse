import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminLibraryArticlesView } from "@/components/admin/library/admin-library-articles-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLibrary") };
}

export default function AdminLibraryPage() {
  return <AdminLibraryArticlesView />;
}
