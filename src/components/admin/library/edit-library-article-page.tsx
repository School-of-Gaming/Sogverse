"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdminLibraryArticle,
  usePublishLibraryArticle,
  usePublishedLibraryArticles,
  useSaveLibraryArticle,
  useUnpublishLibraryArticle,
} from "@/services/library";
import { LibraryArticleEditor } from "./library-article-editor";
import { LibraryArticlePageShell } from "./library-article-page-shell";

/**
 * `/admin/library/[id]` — one article's editor, where it is also published,
 * and from which its preview opens.
 *
 * Every write resolves only once the article has been read again (the
 * mutations await their invalidation), so the status and the publishing
 * controls already describe the new state when a button comes back. The
 * editor seeds its form once per article, so that read never touches what is
 * being typed.
 *
 * Nothing is rendered in the editor's place until the read answers: one row by
 * primary key, into a page whose heading and back link are already painted.
 */
export function EditLibraryArticlePage({ articleId }: { articleId: string }) {
  const t = useTranslations("admin.library");
  const {
    data: article,
    isError,
    isSuccess,
  } = useAdminLibraryArticle(articleId);
  const saveArticle = useSaveLibraryArticle();
  const publishArticle = usePublishLibraryArticle();
  const unpublishArticle = useUnpublishLibraryArticle();
  // Read only while the article is live: "View live" is the one thing that
  // needs it.
  const { data: published } = usePublishedLibraryArticles(
    article?.publication != null,
  );

  return (
    <LibraryArticlePageShell title={t("editPage.title")}>
      {article && (
        <LibraryArticleEditor
          article={article}
          published={published}
          actions={{
            save: async (input) => {
              await saveArticle.mutateAsync({ id: article.draft.id, input });
            },
            publish: () => publishArticle.mutateAsync(article.draft.id),
            unpublish: () => unpublishArticle.mutateAsync(article.draft.id),
          }}
        />
      )}

      {/* A failed refetch under an open editor keeps the article it had, so
          the line is only for a page that has nothing to show. */}
      {isError && !article && (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      )}

      {/* Only a read that answered with no row is a missing article; a read
          that failed says nothing about whether the article exists. */}
      {isSuccess && article === null && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </LibraryArticlePageShell>
  );
}
