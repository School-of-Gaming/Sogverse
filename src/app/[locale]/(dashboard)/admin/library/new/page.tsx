import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewLibraryArticlePage } from "@/components/admin/library/new-library-article-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLibraryArticleNew") };
}

export default function NewLibraryArticleRoute() {
  return <NewLibraryArticlePage />;
}
