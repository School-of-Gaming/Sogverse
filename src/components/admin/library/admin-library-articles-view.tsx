"use client";

import { useAdminLibraryArticles } from "@/services/library";
import { AdminLibraryArticlesPage } from "./admin-library-articles-page";

/** The live data shell for `/admin/library`: one read, into the body beside it. */
export function AdminLibraryArticlesView() {
  const { data, isPending } = useAdminLibraryArticles();

  return <AdminLibraryArticlesPage articles={data ?? []} settled={!isPending} />;
}
