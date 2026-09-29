import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditLibraryArticlePage } from "@/components/admin/library/edit-library-article-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLibraryArticleEdit") };
}

export default async function LibraryArticleRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditLibraryArticlePage articleId={id} />;
}
