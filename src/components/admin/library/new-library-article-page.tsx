"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useCreateLibraryArticle } from "@/services/library";
import { LibraryArticleEditor } from "./library-article-editor";
import { LibraryArticlePageShell } from "./library-article-page-shell";

/**
 * `/admin/library/new` — the data shell around a new article's editor.
 *
 * Saving creates the working copy and moves to the article's own editor, which
 * is where it is published. `replace` rather than `push`, so Back from there
 * returns to the list rather than to a blank form for an article that now
 * exists.
 */
export function NewLibraryArticlePage() {
  const t = useTranslations("admin.library");
  const router = useRouter();
  const createArticle = useCreateLibraryArticle();

  return (
    <LibraryArticlePageShell title={t("newPage.title")}>
      <LibraryArticleEditor
        article={null}
        onCancel={() => router.push(ROUTES.admin.library)}
        actions={{
          save: async (input) => {
            const id = await createArticle.mutateAsync(input);
            router.replace(ROUTES.admin.libraryArticle(id));
          },
        }}
      />
    </LibraryArticlePageShell>
  );
}
